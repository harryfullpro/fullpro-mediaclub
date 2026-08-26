import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/* =============================================================================
   drive-proxy — fotos de produto no Google Drive (leitura e escrita)

   A pasta do Drive e privada: quem fala com o Google e uma CONTA DE SERVICO,
   com o drive compartilhado com o e-mail dela. A credencial nunca chega ao
   navegador — o painel so fala com esta funcao.

   Estrutura em producao (nao inventada aqui, ja e o que existe no Drive):
     <pasta raiz>/
        FP-RET-Z750/               <- nome da pasta = SKU exato do produto
           FP-RET-Z750-1.jpg       <- a primeira em ordem natural vira a thumb
           FP-RET-Z750-2.jpg
        FP-CADEADO-CAPACETE/
           ...
   Sao ~5.500 pastas de SKU.

   Secrets necessarios:
     GOOGLE_SA_JSON              JSON completo da chave da conta de servico
     DRIVE_ROOT_FOLDER_ID        id da pasta raiz (o trecho depois de /folders/)
     SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY   (ja injetados pela plataforma)

   Acoes:
     GET  ?action=status                diagnostico da configuracao
     POST ?action=map    {skus:[...]}   quais SKUs tem foto (1 chamada por tela)
     GET  ?action=img&sku=X[&full=1]    bytes da 1a imagem do SKU (vai no src)
     GET  ?action=arquivo&id=X[&full=1] bytes de UMA imagem por id (galeria)
     GET  ?action=open&sku=X            redireciona para a pasta do SKU
     GET  ?action=fotos&sku=X           TODAS as imagens da pasta do SKU
     GET  ?action=varredura[&cursor=]   pastas da raiz, de 1000 em 1000
     POST ?action=upload {...}          sobe uma foto para a pasta do SKU
     POST ?action=limpar {sku?}         descarta o cache (tudo, ou de um SKU)

   A acao pode vir em ?action= ou no corpo {action}: o painel chama por fetch
   com query, mas sb.functions.invoke() so manda POST com JSON. A query ganha.
============================================================================= */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  // x-fp-sessao: alternativa ao ?sessao= — nao vai parar no log do gateway
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-fp-sessao',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SA_JSON = Deno.env.get('GOOGLE_SA_JSON') || '';
const RAIZ = (Deno.env.get('DRIVE_ROOT_FOLDER_ID') || '').trim();

const DRIVE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const PASTA_MIME = 'application/vnd.google-apps.folder';

/* Era drive.readonly. Subiu para o escopo de escrita porque a Fotografia em
   Lote sobe foto pela pasta do SKU.

   A promocao do escopo sozinha NAO da permissao: o escopo diz o maximo que o
   token pode pedir, quem decide e o compartilhamento. Enquanto a conta de
   servico for so Leitora do drive compartilhado, todo upload volta 403 do
   proprio Google ("Insufficient permissions" / "cannot add children"). Para
   funcionar ela precisa entrar como GERENCIADORA DE CONTEUDO do drive
   compartilhado. A leitura que ja roda hoje nao muda com esse escopo maior. */
const ESCOPO = 'https://www.googleapis.com/auth/drive';

/* Cache do cadastro no banco: 7 dias para SKU com foto, 6 horas para SKU sem
   pasta (pode ser que a pasta ainda vá ser criada). */
const VALIDADE_ACHOU_MS = 7 * 24 * 3600 * 1000;
const VALIDADE_VAZIO_MS = 6 * 3600 * 1000;
/* o thumbnailLink do Drive expira; 1 h e conservador */
const VALIDADE_LINK_MS  = 3600 * 1000;

/* O painel manda foto ja reduzida no navegador (~350 KB). O teto aqui e rede de
   seguranca contra chamada direta na funcao, nao o limite de verdade. */
const TETO_UPLOAD_BYTES = 2 * 1024 * 1024;

/* Teto do corpo cru, conferido ANTES do req.json(). Sem isso o teto de 2 MB so
   pegaria depois de a funcao ja ter materializado o corpo inteiro em memoria —
   um POST de 200 MB derrubaria o isolate antes de qualquer validacao.
   base64 infla ~33%, entao 4 MB cobre a foto de 2 MB com folga. */
const TETO_CORPO_BYTES = 4 * 1024 * 1024;

/* Extensao pelo mime, nao pelo nome do arquivo: o nome vem do celular do
   operador e nao da para confiar nele para montar o padrao <SKU>-<n>.<ext>. */
const EXT_POR_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/* ------------------------------------------------------------------ auth --- */

let tokenCache: { valor: string; expira: number } | null = null;

function b64url(dados: ArrayBuffer | string): string {
  const bytes = typeof dados === 'string'
    ? new TextEncoder().encode(dados)
    : new Uint8Array(dados);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemParaBytes(pem: string): Uint8Array {
  const limpo = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const bin = atob(limpo);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function contaServico(): { client_email: string; private_key: string } | null {
  if (!SA_JSON.trim()) return null;
  try {
    const j = JSON.parse(SA_JSON);
    if (!j.client_email || !j.private_key) return null;
    // o JSON costuma vir com \n escapado quando colado num campo de texto
    return { client_email: j.client_email, private_key: String(j.private_key).replace(/\\n/g, '\n') };
  } catch (_e) { return null; }
}

async function accessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expira - 60000) return tokenCache.valor;

  const sa = contaServico();
  if (!sa) throw new Error('GOOGLE_SA_JSON ausente ou invalido');

  const agora = Math.floor(Date.now() / 1000);
  const cabecalho = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const corpo = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: ESCOPO,
    aud: 'https://oauth2.googleapis.com/token',
    iat: agora,
    exp: agora + 3600,
  }));

  const chave = await crypto.subtle.importKey(
    'pkcs8',
    pemParaBytes(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const assinatura = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    chave,
    new TextEncoder().encode(cabecalho + '.' + corpo),
  );
  const jwt = cabecalho + '.' + corpo + '.' + b64url(assinatura);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error('Google recusou a credencial: ' + (data.error_description || data.error || 'sem detalhe'));
  }
  tokenCache = { valor: data.access_token, expira: Date.now() + (data.expires_in || 3600) * 1000 };
  return tokenCache.valor;
}

async function driveGet(caminho: string, params: Record<string, string>) {
  const tok = await accessToken();
  const qs = new URLSearchParams({ ...params, supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' });
  const res = await fetch(`${DRIVE}${caminho}?${qs}`, { headers: { Authorization: 'Bearer ' + tok } });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || ('Drive respondeu ' + res.status));
  return data;
}

/** POST de metadado (criar pasta). O drive e COMPARTILHADO: sem
    supportsAllDrives o Google responde 404 na raiz. */
async function drivePost(caminho: string, params: Record<string, string>, corpo: unknown) {
  const tok = await accessToken();
  const qs = new URLSearchParams({ ...params, supportsAllDrives: 'true' });
  const res = await fetch(`${DRIVE}${caminho}?${qs}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  // erro de gateway do Google volta em HTML: o .catch evita trocar o status
  // real por um SyntaxError de JSON
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || ('Drive respondeu ' + res.status));
  return data;
}

/* Pastas ja confirmadas como filhas diretas da raiz. Vive enquanto o isolate
   viver; o id de uma pasta do Drive nao muda. */
const pastasDaRaiz = new Set<string>();

/** `arquivo` e publico (vai no src de uma <img>, que nao manda cabecalho). Sem
    esta checagem o endpoint serviria QUALQUER imagem que a conta de servico
    enxerga — e desde o escopo `drive` ela enxerga o drive compartilhado
    inteiro, nao so a raiz das fotos. So passa arquivo cuja pasta e filha
    direta da raiz configurada. */
/* id do arquivo -> mime + thumbnailLink, preenchido pela acao `fotos`.
   Sem isto cada imagem da galeria custava DUAS idas ao Google: uma para os
   metadados (so para descobrir o thumbnailLink) e outra para os bytes. A
   listagem da pasta ja traz os dois campos de graca na mesma chamada, entao
   `arquivo` passa a precisar de uma ida so.
   O thumbnailLink do Drive dura cerca de 1 h; guardamos por 50 min. */
const metaCache = new Map<string, { mime: string; thumb: string; em: number }>();
const VALIDADE_META_MS = 50 * 60 * 1000;

function metaGuardar(id: string, mime: string, thumb: string) {
  if (!id || !thumb) return;
  // teto simples: a galeria abre uma pasta por vez, nao precisa crescer sem fim
  if (metaCache.size > 4000) metaCache.clear();
  metaCache.set(id, { mime: mime || 'image/jpeg', thumb, em: Date.now() });
}
function metaLer(id: string) {
  const m = metaCache.get(id);
  if (!m) return null;
  if (Date.now() - m.em > VALIDADE_META_MS) { metaCache.delete(id); return null; }
  return m;
}

async function dentroDaRaiz(paiId: string): Promise<boolean> {
  if (!paiId) return false;
  if (paiId === RAIZ || pastasDaRaiz.has(paiId)) return true;
  try {
    const pai = await driveGet(`/files/${encodeURIComponent(paiId)}`, { fields: 'id,parents' });
    const avo = Array.isArray(pai?.parents) ? String(pai.parents[0] || '') : '';
    if (avo === RAIZ) { pastasDaRaiz.add(paiId); return true; }
  } catch (_e) { /* pasta ilegivel = tratada como fora da raiz */ }
  return false;
}

/* ---------------------------------------------------------------- sessao --- */

/* O painel NAO usa Supabase Auth: o login e um select em mc_admin_users e o
   cliente Supabase segue anon para sempre. Checar role='authenticated'
   rejeitaria todo mundo, e o verify_jwt sozinho nao filtra nada — a anon key
   esta publica no config.js. O que da para exigir e o UUID de fp_session, que
   so quem logou tem, conferido aqui com a service role. Mesmo padrao do
   magis5-proxy.

   ONDE NAO SE EXIGE, DE PROPOSITO: status, map, img, arquivo, open e fotos.
   Sao leitura e o painel ja chama varias delas sem cabecalho nenhum — o src de
   uma <img> nao tem como mandar corpo nem header. Pedir sessao ali derrubaria
   telas que estao em producao agora. Sessao so nas acoes que escrevem no Drive
   ou varrem o drive inteiro: upload, varredura e limpar.

   Preco de deixar `arquivo` publico: ele so serve arquivo que mora numa pasta
   filha direta da raiz (ver dentroDaRaiz). Sem esse limite, o escopo `drive`
   transformaria a acao em leitor de qualquer imagem do drive compartilhado.

   Aceita a sessao em tres lugares, nesta ordem: cabecalho x-fp-sessao, corpo
   do POST e ?sessao=. A query so existe porque a varredura e GET (o bling-sync
   chama assim) — quando der para escolher, prefira o cabecalho: query entra no
   log do gateway. */
async function motivoSessaoInvalida(sessao: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(sessao)) {
    return 'sessão do painel ausente — entre de novo no painel';
  }
  try {
    const q = await fetch(
      SB_URL + '/rest/v1/mc_admin_users?select=id&id=eq.' + encodeURIComponent(sessao),
      { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } },
    );
    const linhas = await q.json();
    if (!Array.isArray(linhas) || !linhas.length) return 'sessão do painel não confere';
    return null;
  } catch (e) {
    return 'não deu para validar a sessão: ' + String((e as Error)?.message || e);
  }
}

/* ----------------------------------------------------------------- cache --- */

async function cacheLer(skus: string[]) {
  if (!skus.length) return {};
  const lista = skus.map((s) => '"' + s.replace(/"/g, '') + '"').join(',');
  const r = await fetch(
    `${SB_URL}/rest/v1/mc_drive_thumbs?sku=in.(${encodeURIComponent(lista)})&select=*`,
    { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } },
  );
  const linhas = await r.json();
  const mapa: Record<string, any> = {};
  if (Array.isArray(linhas)) linhas.forEach((l) => { mapa[l.sku] = l; });
  return mapa;
}

async function cacheGravar(linha: Record<string, unknown>) {
  const r = await fetch(`${SB_URL}/rest/v1/mc_drive_thumbs`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY,
      Authorization: 'Bearer ' + SB_KEY,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({ ...linha, checado_em: new Date().toISOString() }),
  });
  // cache e acessorio: falhar aqui nao derruba a leitura, mas engolir calado
  // deixaria a funcao lenta para sempre sem ninguem saber por que
  if (!r.ok) console.warn('[drive-proxy] cache nao gravou (' + r.status + '): ' + (await r.text()).slice(0, 200));
}

/** sku vazio = apaga tudo. Devolve se o DELETE passou. */
async function cacheApagar(sku?: string): Promise<boolean> {
  const alvo = sku ? `?sku=eq.${encodeURIComponent(sku)}` : '?sku=neq.__nenhum__';
  const r = await fetch(`${SB_URL}/rest/v1/mc_drive_thumbs${alvo}`, {
    method: 'DELETE',
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY },
  });
  if (!r.ok) console.warn('[drive-proxy] cache nao limpou (' + r.status + '): ' + (await r.text()).slice(0, 200));
  return r.ok;
}

function cacheValido(linha: any): boolean {
  if (!linha) return false;
  const idade = Date.now() - Date.parse(linha.checado_em);
  return idade < (linha.nao_encontrado ? VALIDADE_VAZIO_MS : VALIDADE_ACHOU_MS);
}

/* -------------------------------------------------------------- resolver --- */

/** O que se sabe de um SKU depois de olhar o Drive. `erro` = a consulta falhou,
    entao o resultado NAO pode ir para o cache como "nao tem foto". */
type Achado = {
  sku: string;
  nao_encontrado: boolean;
  folder_id?: string | null;
  file_id?: string | null;
  file_name?: string | null;
  erro?: boolean;
};

function escaparConsulta(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function escaparRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Acha a pasta do SKU e a primeira imagem dentro dela. */
async function resolverNoDrive(sku: string) {
  const nome = escaparConsulta(sku.trim());

  const pastas = await driveGet('/files', {
    q: `'${RAIZ}' in parents and name = '${nome}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id,name)',
    pageSize: '1',
  });
  const pasta = pastas.files?.[0];
  if (!pasta) return { nao_encontrado: true, folder_id: null, file_id: null, file_name: null };

  const arquivos = await driveGet('/files', {
    q: `'${pasta.id}' in parents and mimeType contains 'image/' and trashed = false`,
    fields: 'files(id,name)',
    orderBy: 'name_natural',
    pageSize: '1',
  });
  const arq = arquivos.files?.[0];
  if (!arq) return { nao_encontrado: true, folder_id: pasta.id, file_id: null, file_name: null };

  return { nao_encontrado: false, folder_id: pasta.id, file_id: arq.id, file_name: arq.name };
}

/** Usa o cache quando possivel; so vai ao Drive quando precisa. */
async function resolver(sku: string, ignorarCache = false) {
  const chave = sku.trim();
  if (!chave) return { nao_encontrado: true };

  if (!ignorarCache) {
    const c = await cacheLer([chave]);
    if (cacheValido(c[chave])) return c[chave];
  }
  const achado = await resolverNoDrive(chave);
  await cacheGravar({ sku: chave, ...achado });
  return { sku: chave, ...achado };
}

/** So a pasta do SKU (sem tocar na primeira foto). null quando nao existe. */
async function acharPasta(sku: string): Promise<{ id: string; name: string } | null> {
  const nome = escaparConsulta(sku.trim());
  const r = await driveGet('/files', {
    q: `'${RAIZ}' in parents and name = '${nome}' and mimeType = '${PASTA_MIME}' and trashed = false`,
    fields: 'files(id,name)',
    pageSize: '1',
  });
  return r.files?.[0] || null;
}

/** Todos os arquivos de uma pasta, paginando. `q` extra fica por conta de quem chama. */
async function listarPasta(pastaId: string, filtroExtra: string, campos: string) {
  const itens: any[] = [];
  let pagina: string | undefined = undefined;
  let voltas = 0;
  do {
    const params: Record<string, string> = {
      q: `'${pastaId}' in parents and trashed = false` + (filtroExtra ? ' and ' + filtroExtra : ''),
      fields: `nextPageToken,files(${campos})`,
      orderBy: 'name_natural',
      pageSize: '200',
    };
    if (pagina) params.pageToken = pagina;
    const r = await driveGet('/files', params);
    if (Array.isArray(r.files)) itens.push(...r.files);
    pagina = r.nextPageToken;
    // teto de seguranca: 2.000 arquivos numa pasta de SKU ja e anomalia
  } while (pagina && ++voltas < 10);
  return itens;
}

/* --------------------------------------------------------------- upload --- */

/** atob devolve string binaria; converter byte a byte. Nada de spread em
    String.fromCharCode: com 350 KB isso vira um array de argumentos gigante e
    estoura a pilha. */
function base64ParaBytes(b64: string): Uint8Array | null {
  // aceita tanto o base64 puro quanto uma data: URL inteira do FileReader
  const virgula = b64.indexOf(',');
  const limpo = (b64.startsWith('data:') && virgula > -1 ? b64.slice(virgula + 1) : b64).replace(/\s+/g, '');
  try {
    const bin = atob(limpo);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch (_e) {
    return null;   // base64 quebrado no caminho: quem chama devolve 400
  }
}

function juntarBytes(partes: Uint8Array[]): Uint8Array {
  const total = partes.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) { out.set(p, pos); pos += p.length; }
  return out;
}

/** Proximo numero da sequencia <SKU>-<n>. Le TODOS os arquivos da pasta, nao so
    as imagens: se existir um FP-X-3.pdf, reaproveitar o 3 confundiria o padrao.
    Extensao livre no fim para nao pular numero por causa de um .heic solto. */
function proximaSequencia(sku: string, arquivos: { name?: string }[]): number {
  const padrao = new RegExp('^' + escaparRegex(sku) + '-(\\d+)\\.[A-Za-z0-9]+$', 'i');
  let maior = 0;
  for (const a of arquivos) {
    const m = padrao.exec(String(a?.name || ''));
    if (!m) continue;              // fora do padrao: nao entra na conta
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n > maior) maior = n;
  }
  return maior + 1;                // pasta vazia (ou so com nome fora do padrao) comeca em 1
}

async function subirParaPasta(pastaId: string, nomeFinal: string, mime: string, bytes: Uint8Array) {
  const tok = await accessToken();
  const limite = 'fp' + crypto.randomUUID().replace(/-/g, '');
  const enc = new TextEncoder();

  const corpo = juntarBytes([
    enc.encode(
      `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify({ name: nomeFinal, parents: [pastaId] }) +
      `\r\n--${limite}\r\nContent-Type: ${mime}\r\n\r\n`,
    ),
    bytes,
    enc.encode(`\r\n--${limite}--\r\n`),
  ]);

  // supportsAllDrives tambem no upload: sem ele o Google nao acha a pasta pai
  const qs = new URLSearchParams({
    uploadType: 'multipart',
    supportsAllDrives: 'true',
    fields: 'id,name',
  });
  const res = await fetch(`${DRIVE_UPLOAD}?${qs}`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + tok,
      'Content-Type': `multipart/related; boundary=${limite}`,
    },
    body: corpo,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || ('Drive respondeu ' + res.status + ' no upload'));
  }
  // 200 sem id nao e sucesso: devolver ok:true aqui faria o painel gravar em
  // mc_photo_files uma foto que ninguem consegue mais achar no Drive
  if (!data?.id) throw new Error('o Drive respondeu 200 mas sem id do arquivo — upload nao confirmado');
  return data as { id: string; name: string };
}

/* ------------------------------------------------------------------ http --- */

/** Endereco publico DESTA funcao, para montar as URLs de `thumb`/`cheia`.

    Nao dá para usar `new URL(req.url).origin + pathname`: dentro do edge
    runtime o pedido chega pelo host interno e o caminho vem sem o prefixo
    /functions/v1 — a URL montada assim volta 404 no navegador. SUPABASE_URL e
    o unico endereco garantido, e e o mesmo que o bling-sync usa para chamar
    aqui. O nome sai do caminho para a funcao continuar certa se for renomeada. */
function baseDaFuncao(url: URL): string {
  const nome = url.pathname.split('/').filter(Boolean).pop() || 'drive-proxy';
  if (!SB_URL) return url.origin + url.pathname;
  return SB_URL.replace(/\/+$/, '') + '/functions/v1/' + nome;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const url = new URL(req.url);

  // o corpo so pode ser lido uma vez; le aqui e as acoes POST usam esta copia
  let corpo: Record<string, any> = {};
  if (req.method === 'POST') {
    const anunciado = Number(req.headers.get('content-length') || 0);
    if (anunciado > TETO_CORPO_BYTES) {
      return json({ error: 'corpo de ' + Math.round(anunciado / 1024) + ' KB: o teto é 4 MB' }, 413);
    }
    corpo = await req.json().catch(() => ({}));
  }

  const action = url.searchParams.get('action') || String(corpo?.action || '') || 'status';

  /** Sessao: cabecalho, corpo (POST) ou query (GET), nessa ordem. */
  const exigirSessao = () =>
    motivoSessaoInvalida(String(
      req.headers.get('x-fp-sessao') || corpo?.sessao || url.searchParams.get('sessao') || '',
    ));

  try {
    /* --- diagnostico: e o que a aba Integracoes mostra --------------- */
    if (action === 'status') {
      const sa = contaServico();
      if (!sa) {
        return json({
          configurado: false,
          motivo: 'Falta o secret GOOGLE_SA_JSON na função drive-proxy.',
        });
      }
      if (!RAIZ) {
        return json({
          configurado: false,
          email_conta: sa.client_email,
          motivo: 'Falta o secret DRIVE_ROOT_FOLDER_ID na função drive-proxy.',
        });
      }
      try {
        const info = await driveGet(`/files/${RAIZ}`, { fields: 'id,name,mimeType' });

        // Contar as pastas exige paginar tudo (5 mil+ = ~8 s). Nao contar nao
        // da o numero; contar sempre trava a aba ao abrir. Entao o status
        // normal so confirma o acesso e a contagem vem sob demanda
        // (?contar=1), disparada pelo botao Verificar.
        if (url.searchParams.get('contar') !== '1') {
          return json({ configurado: true, email_conta: sa.client_email, pasta: info.name });
        }

        let total = 0, pagina: string | undefined = undefined, voltas = 0;
        do {
          const params: Record<string, string> = {
            q: `'${RAIZ}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'nextPageToken,files(id)',
            pageSize: '1000',
          };
          if (pagina) params.pageToken = pagina;
          const filhos = await driveGet('/files', params);
          total += filhos.files?.length ?? 0;
          pagina = filhos.nextPageToken;
        } while (pagina && ++voltas < 20);
        return json({
          configurado: true,
          email_conta: sa.client_email,
          pasta: info.name,
          pastas_de_sku: total,
        });
      } catch (e) {
        return json({
          configurado: false,
          email_conta: sa.client_email,
          motivo: 'A conta de serviço não consegue ler a pasta. Compartilhe a pasta com o e-mail acima (permissão de Leitor). Detalhe: ' + String(e),
        });
      }
    }

    /* --- mapa de varios SKUs de uma vez ------------------------------ */
    if (action === 'map') {
      if (!contaServico() || !RAIZ) return json({ configurado: false, itens: {} });
      const skus: string[] = Array.isArray(corpo.skus) ? corpo.skus.filter(Boolean).map(String) : [];
      if (!skus.length) return json({ configurado: true, itens: {} });

      const unicos = [...new Set(skus.map((s) => s.trim()).filter(Boolean))].slice(0, 200);
      const cache = await cacheLer(unicos);

      const faltando = unicos.filter((s) => !cacheValido(cache[s]));
      // 4 por vez: o Drive limita requisicoes por segundo e a tela nao precisa
      // de tudo instantaneamente.
      for (let i = 0; i < faltando.length; i += 4) {
        const lote = faltando.slice(i, i + 4);
        /* O tipo vem escrito porque o ramo do catch nao tem folder_id/file_id:
           sem ele o TypeScript ve uma uniao e o `deno check` reprova as tres
           leituras logo abaixo. */
        const res = await Promise.all(lote.map(async (s): Promise<Achado> => {
          try { return { sku: s, ...(await resolverNoDrive(s)) }; }
          catch (_e) { return { sku: s, nao_encontrado: true, erro: true }; }
        }));
        for (const r of res) {
          if (!r.erro) await cacheGravar({ sku: r.sku, folder_id: r.folder_id, file_id: r.file_id, file_name: r.file_name, nao_encontrado: r.nao_encontrado });
          cache[r.sku] = r;
        }
      }

      const itens: Record<string, { tem: boolean; folder_id?: string }> = {};
      unicos.forEach((s) => {
        const l = cache[s];
        itens[s] = l && !l.nao_encontrado && l.file_id
          ? { tem: true, folder_id: l.folder_id }
          : { tem: false };
      });
      return json({ configurado: true, itens });
    }

    /* --- bytes da imagem: vai direto no src da <img> ------------------ */
    if (action === 'img') {
      const sku = url.searchParams.get('sku') || '';
      const full = url.searchParams.get('full') === '1';
      if (!sku) return json({ error: 'informe o sku' }, 400);
      if (!contaServico() || !RAIZ) return new Response(null, { status: 404, headers: CORS });

      const l: any = await resolver(sku);
      if (!l || l.nao_encontrado || !l.file_id) return new Response(null, { status: 404, headers: CORS });

      const tok = await accessToken();

      // Pedir os metadados do arquivo a cada imagem custava uma segunda ida ao
      // Google (~1,2 s no total). O thumbnailLink fica guardado por 1 h; se
      // expirar antes, o fallback abaixo cobre.
      let thumbLink: string | null = null;
      const linkFresco = l.thumb_link && l.thumb_link_em &&
        (Date.now() - Date.parse(l.thumb_link_em)) < VALIDADE_LINK_MS;

      if (linkFresco) {
        thumbLink = l.thumb_link;
      } else {
        const meta = await driveGet(`/files/${l.file_id}`, { fields: 'thumbnailLink,mimeType' });
        thumbLink = meta.thumbnailLink || null;
        if (thumbLink) {
          await cacheGravar({
            sku: l.sku || sku.trim(),
            folder_id: l.folder_id, file_id: l.file_id, file_name: l.file_name,
            nao_encontrado: false,
            thumb_link: thumbLink,
            thumb_link_em: new Date().toISOString(),
          });
        }
      }

      let resp: Response | null = null;
      if (thumbLink) {
        const tamanho = full ? '=s1600' : '=s320';
        const link = thumbLink.replace(/=s\d+(-c)?$/, '') + tamanho;
        resp = await fetch(link, { headers: { Authorization: 'Bearer ' + tok } });
        if (!resp.ok) resp = null;
      }
      if (!resp) {
        // link expirado ou arquivo sem thumbnail: serve o original
        resp = await fetch(`${DRIVE}/files/${l.file_id}?alt=media&supportsAllDrives=true`, {
          headers: { Authorization: 'Bearer ' + tok },
        });
      }
      if (!resp.ok) return new Response(null, { status: 404, headers: CORS });

      return new Response(resp.body, {
        status: 200,
        headers: {
          ...CORS,
          'Content-Type': resp.headers.get('content-type') || 'image/jpeg',
          // a foto de um SKU muda raramente; 1 dia no navegador economiza muito
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }

    /* --- bytes de UMA imagem por id ----------------------------------
       Existe porque `img` serve so a primeira foto do SKU e a Galeria abre
       todas. O thumbnailLink que o Drive devolve em `fotos` NAO serve de src
       direto: arquivo privado exige requisicao credenciada, e a credencial e
       justamente o que nao pode ir para o navegador.
       Duas guardas, porque a acao e publica: so mimeType de imagem E so
       arquivo que mora numa pasta filha direta da raiz. Sem a segunda, o
       endpoint viraria leitor de qualquer imagem que a conta de servico
       enxerga no drive compartilhado inteiro. */
    if (action === 'arquivo') {
      const id = url.searchParams.get('id') || '';
      const full = url.searchParams.get('full') === '1';
      if (!id) return json({ error: 'informe o id do arquivo' }, 400);
      if (!contaServico() || !RAIZ) return new Response(null, { status: 404, headers: CORS });

      /* Caminho rapido: a acao `fotos` acabou de listar a pasta e guardou
         mime + thumbnailLink deste id. Quem esta no cache ja passou pela
         checagem de pasta la, entao nao ha o que reconferir. */
      let meta: any = metaLer(id);
      if (!meta) {
        try {
          meta = await driveGet(`/files/${encodeURIComponent(id)}`, { fields: 'id,mimeType,thumbnailLink,parents' });
        } catch (_e) {
          return new Response(null, { status: 404, headers: CORS });
        }
        if (!String(meta?.mimeType || '').startsWith('image/')) {
          return new Response(null, { status: 404, headers: CORS });
        }
        const pai = Array.isArray(meta?.parents) ? String(meta.parents[0] || '') : '';
        if (!await dentroDaRaiz(pai)) {
          return new Response(null, { status: 404, headers: CORS });
        }
        metaGuardar(id, meta.mimeType, meta.thumbnailLink);
      }

      const tok = await accessToken();
      let resp: Response | null = null;
      const linkBase = meta.thumb || meta.thumbnailLink;
      if (linkBase) {
        const link = String(linkBase).replace(/=s\d+(-c)?$/, '') + (full ? '=s1600' : '=s320');
        resp = await fetch(link, { headers: { Authorization: 'Bearer ' + tok } });
        if (!resp.ok) { metaCache.delete(id); resp = null; }
      }
      if (!resp) {
        resp = await fetch(`${DRIVE}/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`, {
          headers: { Authorization: 'Bearer ' + tok },
        });
      }
      if (!resp.ok) return new Response(null, { status: 404, headers: CORS });

      return new Response(resp.body, {
        status: 200,
        headers: {
          ...CORS,
          'Content-Type': resp.headers.get('content-type') || meta.mime || meta.mimeType || 'image/jpeg',
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }

    /* --- todas as fotos da pasta do SKU -------------------------------
       Leitura, sem sessao: e a mesma informacao que `img` ja entrega, so que
       da lista inteira. `thumb`/`cheia` ja vem como URL desta funcao para
       cair direto no src da <img> da Galeria. */
    if (action === 'fotos') {
      const sku = (url.searchParams.get('sku') || '').trim();
      if (!sku) return json({ error: 'informe o sku' }, 400);
      if (!contaServico() || !RAIZ) return json({ configurado: false, sku, fotos: [] });

      const pasta = await acharPasta(sku);
      if (!pasta) return json({ configurado: true, sku, sem_pasta: true, total: 0, fotos: [] });

      const arquivos = await listarPasta(pasta.id, "mimeType contains 'image/'", 'id,name,mimeType,thumbnailLink');
      // a pasta acabou de ser lida: aproveita para liberar o `arquivo` destes
      // ids sem a ida extra ao Drive para conferir o pai
      pastasDaRaiz.add(pasta.id);
      // guarda o thumbnailLink de cada foto: `arquivo` nao vai mais precisar
      // pedir os metadados de novo, uma ida ao Google a menos por imagem
      for (const a of arquivos as any[]) metaGuardar(a.id, a.mimeType, a.thumbnailLink);
      const base = baseDaFuncao(url);
      /* `direto` e o thumbnailLink cru do Google. Se ele abrir sem credencial,
         o navegador busca a foto no CDN do Google e esta funcao sai do caminho:
         hoje cada imagem faz navegador -> Supabase -> Google -> volta.
         O cliente usa `direto` e cai em `thumb`/`cheia` se falhar. */
      const comTamanho = (link: string, tam: string) =>
        link ? String(link).replace(/=s\d+(-c)?$/, '') + tam : '';
      const fotos = arquivos.map((a: any) => ({
        id: a.id,
        name: a.name,
        mimeType: a.mimeType,
        thumb: `${base}?action=arquivo&id=${encodeURIComponent(a.id)}`,
        cheia: `${base}?action=arquivo&id=${encodeURIComponent(a.id)}&full=1`,
        direto: comTamanho(a.thumbnailLink, '=s320'),
        direto_cheia: comTamanho(a.thumbnailLink, '=s1600'),
      }));
      return json({ configurado: true, sku, folder_id: pasta.id, total: fotos.length, fotos });
    }

    /* --- varredura: quais SKUs tem pasta, sem 1 chamada por SKU -------
       5.500 chamadas de `map` levariam minutos. Aqui sao ~6 paginas de 1000.
       Exige sessao: devolve o inventario do drive inteiro. */
    if (action === 'varredura') {
      const motivo = await exigirSessao();
      // `erro` junto de `error`: quem consome esta acao e o bling-sync, que le
      // `erro` — sem isso o operador ve o JSON cru no lugar da frase
      if (motivo) return json({ error: motivo, erro: motivo }, 401);
      if (!contaServico() || !RAIZ) return json({ configurado: false, pastas: [], fim: true });

      const params: Record<string, string> = {
        q: `'${RAIZ}' in parents and mimeType = '${PASTA_MIME}' and trashed = false`,
        fields: 'nextPageToken,files(id,name)',
        orderBy: 'name_natural',
        pageSize: '1000',
      };
      const cursor = url.searchParams.get('cursor') || String(corpo?.cursor || '');
      if (cursor) params.pageToken = cursor;

      const r = await driveGet('/files', params);
      const pastas = (Array.isArray(r.files) ? r.files : []).map((f: any) => ({ id: f.id, name: f.name }));
      /* `proximo` NAO e redundante: o bling-sync le `dados.proximo` para saber
         se continua. Devolvendo so `nextPageToken` ele para na 1a pagina
         achando que terminou e grava tem_foto=false em cima dos ~4.500 SKUs
         que nem chegou a ler. Os dois nomes saem daqui de proposito. */
      return json({
        configurado: true,
        pastas,
        nextPageToken: r.nextPageToken || null,
        proximo: r.nextPageToken || '',
        fim: !r.nextPageToken,
      });
    }

    /* --- upload de foto para a pasta do SKU --------------------------- */
    if (action === 'upload') {
      if (req.method !== 'POST') return json({ error: 'upload é POST' }, 405);
      const motivo = await exigirSessao();
      if (motivo) return json({ error: motivo }, 401);
      if (!contaServico() || !RAIZ) {
        return json({ error: 'drive-proxy sem GOOGLE_SA_JSON ou DRIVE_ROOT_FOLDER_ID' }, 503);
      }

      const sku = String(corpo?.sku || '').trim();
      const arq = (corpo?.arquivo || {}) as { nome?: string; mime?: string; base64?: string };
      if (!sku) return json({ error: 'informe o sku' }, 400);
      if (!arq.base64) return json({ error: 'informe arquivo.base64' }, 400);

      const mime = String(arq.mime || '').toLowerCase().split(';')[0].trim();
      const ext = EXT_POR_MIME[mime];
      if (!mime.startsWith('image/') || !ext) {
        return json({ error: 'só entra imagem JPG, PNG ou WEBP (recebido: ' + (mime || 'sem mime') + ')' }, 415);
      }

      /* Recusar pelo tamanho do TEXTO antes de decodificar: atob aloca outra
         copia inteira, entao conferir so depois seria pagar a memoria para
         depois dizer que nao cabia. 4 chars de base64 = 3 bytes. */
      const textoB64 = String(arq.base64);
      if (textoB64.length > Math.ceil(TETO_UPLOAD_BYTES / 3) * 4 + 1024) {
        return json({
          error: 'arquivo de ~' + Math.round(textoB64.length * 3 / 4 / 1024) + ' KB: o teto é 2 MB. Reduza antes de enviar.',
        }, 413);
      }

      const bytes = base64ParaBytes(textoB64);
      if (!bytes) return json({ error: 'base64 inválido' }, 400);
      if (!bytes.length) return json({ error: 'arquivo vazio' }, 400);
      if (bytes.length > TETO_UPLOAD_BYTES) {
        return json({
          error: 'arquivo de ' + Math.round(bytes.length / 1024) + ' KB: o teto é 2 MB. Reduza antes de enviar.',
        }, 413);
      }

      let pasta: { id: string; name: string } | null = null;
      let pastaNova = false;
      try {
        // pasta do SKU: cria quando o produto ainda nao tem foto nenhuma.
        // acharPasta fica DENTRO do try para o 403 da conta de servico sair
        // traduzido tambem quando o Google recusa ja na busca.
        pasta = await acharPasta(sku);
        if (!pasta) {
          const criada = await drivePost('/files', { fields: 'id,name' }, {
            name: sku,
            mimeType: PASTA_MIME,
            parents: [RAIZ],
          });
          pasta = { id: criada.id, name: criada.name };
          pastaNova = true;
        }

        const existentes = pastaNova ? [] : await listarPasta(pasta.id, '', 'id,name');
        const sequencia = proximaSequencia(sku, existentes);
        const nomeFinal = `${sku}-${sequencia}.${ext}`;

        const subido = await subirParaPasta(pasta.id, nomeFinal, mime, bytes);
        pastasDaRaiz.add(pasta.id);   // libera a galeria a servir os bytes sem ida extra

        // a miniatura do SKU acabou de mudar (ou passou a existir): o cache de
        // 7 dias mostraria a foto velha, ou "sem foto", ate expirar
        const cacheLimpo = await cacheApagar(sku);

        return json({
          ok: true,
          sku,
          folder_id: pasta.id,
          pasta_criada: pastaNova,
          file_id: subido.id,
          file_name: subido.name || nomeFinal,
          sequencia,
          // o painel grava isto em mc_photo_files.tamanho_bytes
          tamanho_bytes: bytes.length,
          /* false = a foto SUBIU, so o cache de miniatura ficou velho. Nao e
             motivo para o painel repetir o upload (duplicaria a foto). */
          cache_limpo: cacheLimpo,
        });
      } catch (e) {
        /* Enquanto a conta de servico for so Leitora do drive compartilhado o
           Google recusa qualquer escrita. Sem esta traducao o operador ve
           "Insufficient permissions" em ingles e abre chamado achando que e bug
           do painel. */
        const detalhe = String((e as Error)?.message || e);
        if (/permission|403|cannot add children|insufficient/i.test(detalhe)) {
          return json({
            error: 'o Google recusou a gravação: a conta de serviço ainda não é '
              + 'gerenciadora de conteúdo do drive compartilhado das fotos. Detalhe: ' + detalhe,
          }, 403);
        }
        throw e;
      }
    }

    /* --- abrir a pasta do SKU no Drive -------------------------------- */
    if (action === 'open') {
      const sku = url.searchParams.get('sku') || '';
      const l: any = await resolver(sku);
      if (!l || !l.folder_id) return json({ error: 'pasta não encontrada para o SKU ' + sku }, 404);
      return new Response(null, {
        status: 302,
        headers: { ...CORS, Location: 'https://drive.google.com/drive/folders/' + l.folder_id },
      });
    }

    /* --- descartar cache (apos subir fotos novas) ---------------------
       Exige sessao: limpar tudo obriga ~5.500 idas ao Drive para remontar. */
    if (action === 'limpar') {
      const motivo = await exigirSessao();
      if (motivo) return json({ error: motivo }, 401);
      await cacheApagar(corpo.sku ? String(corpo.sku) : undefined);
      return json({ ok: true, limpo: corpo.sku || 'tudo' });
    }

    return json({ error: 'ação desconhecida: ' + action }, 400);
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
