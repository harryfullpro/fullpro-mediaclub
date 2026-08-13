import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/* =============================================================================
   drive-proxy — thumbnails de produto vindas do Google Drive

   A pasta do Drive e privada: quem le e uma CONTA DE SERVICO, com a pasta
   compartilhada com o e-mail dela em modo leitor. A credencial nunca chega ao
   navegador — o painel so fala com esta funcao.

   Estrutura esperada no Drive:
     <pasta raiz>/
        FP-RET-Z750/          <- nome da pasta = SKU exato do produto
           foto1.jpg          <- a primeira em ordem de nome vira a thumbnail
           foto2.jpg
        FP-CADEADO-CAPACETE/
           ...

   Secrets necessarios:
     GOOGLE_SA_JSON         JSON completo da chave da conta de servico
     DRIVE_ROOT_FOLDER_ID   id da pasta raiz (o trecho depois de /folders/ na URL)

   Acoes:
     GET  ?action=status              diagnostico da configuracao
     POST ?action=map    {skus:[...]} quais SKUs tem foto (1 chamada para a tela toda)
     GET  ?action=img&sku=X[&full=1]  bytes da imagem (usado direto no src)
     GET  ?action=open&sku=X          redireciona para a pasta do SKU no Drive
     POST ?action=limpar {sku?}       descarta o cache (tudo, ou de um SKU)
============================================================================= */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SA_JSON = Deno.env.get('GOOGLE_SA_JSON') || '';
const RAIZ = (Deno.env.get('DRIVE_ROOT_FOLDER_ID') || '').trim();

const DRIVE = 'https://www.googleapis.com/drive/v3';
const ESCOPO = 'https://www.googleapis.com/auth/drive.readonly';

/* Cache do cadastro no banco: 7 dias para SKU com foto, 6 horas para SKU sem
   pasta (pode ser que a pasta ainda vá ser criada). */
const VALIDADE_ACHOU_MS = 7 * 24 * 3600 * 1000;
const VALIDADE_VAZIO_MS = 6 * 3600 * 1000;

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
  await fetch(`${SB_URL}/rest/v1/mc_drive_thumbs`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY,
      Authorization: 'Bearer ' + SB_KEY,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({ ...linha, checado_em: new Date().toISOString() }),
  });
}

function cacheValido(linha: any): boolean {
  if (!linha) return false;
  const idade = Date.now() - Date.parse(linha.checado_em);
  return idade < (linha.nao_encontrado ? VALIDADE_VAZIO_MS : VALIDADE_ACHOU_MS);
}

/* -------------------------------------------------------------- resolver --- */

function escaparConsulta(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
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

/* ------------------------------------------------------------------ http --- */

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'status';

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
        const filhos = await driveGet('/files', {
          q: `'${RAIZ}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
          fields: 'files(id)',
          pageSize: '1000',
        });
        return json({
          configurado: true,
          email_conta: sa.client_email,
          pasta: info.name,
          pastas_de_sku: filhos.files?.length ?? 0,
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
      const corpo = await req.json().catch(() => ({}));
      const skus: string[] = Array.isArray(corpo.skus) ? corpo.skus.filter(Boolean).map(String) : [];
      if (!skus.length) return json({ configurado: true, itens: {} });

      const unicos = [...new Set(skus.map((s) => s.trim()).filter(Boolean))].slice(0, 200);
      const cache = await cacheLer(unicos);

      const faltando = unicos.filter((s) => !cacheValido(cache[s]));
      // 4 por vez: o Drive limita requisicoes por segundo e a tela nao precisa
      // de tudo instantaneamente.
      for (let i = 0; i < faltando.length; i += 4) {
        const lote = faltando.slice(i, i + 4);
        const res = await Promise.all(lote.map(async (s) => {
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
      // thumbnailLink do proprio Drive: bem mais leve que baixar o original
      const meta = await driveGet(`/files/${l.file_id}`, { fields: 'thumbnailLink,mimeType' });
      let resp: Response | null = null;

      if (meta.thumbnailLink) {
        const tamanho = full ? '=s1600' : '=s320';
        const link = meta.thumbnailLink.replace(/=s\d+(-c)?$/, '') + tamanho;
        resp = await fetch(link, { headers: { Authorization: 'Bearer ' + tok } });
        if (!resp.ok) resp = null;
      }
      if (!resp) {
        // sem thumbnail (arquivo recem-enviado, por exemplo): serve o original
        resp = await fetch(`${DRIVE}/files/${l.file_id}?alt=media&supportsAllDrives=true`, {
          headers: { Authorization: 'Bearer ' + tok },
        });
      }
      if (!resp.ok) return new Response(null, { status: 404, headers: CORS });

      return new Response(resp.body, {
        status: 200,
        headers: {
          ...CORS,
          'Content-Type': resp.headers.get('content-type') || meta.mimeType || 'image/jpeg',
          // a foto de um SKU muda raramente; 1 dia no navegador economiza muito
          'Cache-Control': 'public, max-age=86400',
        },
      });
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

    /* --- descartar cache (apos subir fotos novas) --------------------- */
    if (action === 'limpar') {
      const corpo = await req.json().catch(() => ({}));
      const alvo = corpo.sku ? `?sku=eq.${encodeURIComponent(corpo.sku)}` : '?sku=neq.__nenhum__';
      await fetch(`${SB_URL}/rest/v1/mc_drive_thumbs${alvo}`, {
        method: 'DELETE',
        headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY },
      });
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
