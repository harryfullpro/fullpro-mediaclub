import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/* =============================================================================
   bling-sync — espelha o catálogo INTEIRO do Bling em mc_photo_products

   Por que existe: o painel monta a fila de fotografia em cima de
   blingGetAllProducts() (admin.html), que para em 20 páginas × 100 = 2.000
   produtos e guarda só na memória da aba. O Drive tem ~5.500 pastas de SKU,
   então a fila nascia incompleta e sumia a cada F5. Aqui a varredura é
   completa e o resultado fica no banco.

   A REGRA QUE NÃO PODE SER QUEBRADA
   ---------------------------------
   O upsert do Bling só escreve os campos que vêm do Bling:

       sku · bling_id · nome · preco · estoque · imagem_bling · sincronizado_em

   Nunca mande no corpo desse upsert: prioridade, prioridade_por, prioridade_em,
   status, lote_id, excluido, nota, nota_anterior, refazer, tem_foto, fotos_qtd.
   O PostgREST monta o ON CONFLICT DO UPDATE só com as chaves presentes no JSON
   — mandar uma dessas colunas, mesmo com null, apaga o trabalho do operador na
   sincronização seguinte. Toda linha do lote precisa ter exatamente as mesmas
   chaves, senão o PostgREST recusa o lote inteiro.

   E A CONTRAPARTIDA QUE NÃO É ÓBVIA: `nome` é NOT NULL sem default no schema, e
   o Postgres valida a tupla PROPOSTA para inserção ANTES de resolver o
   ON CONFLICT. Ou seja: um upsert que omite `nome` estoura
   "null value in column nome violates not-null constraint" mesmo quando a linha
   já existe e só seria atualizada. Por isso a ação `drive` — que mexe apenas em
   colunas do Drive — também manda `nome` (relido do banco, valor idêntico ao que
   já estava lá). Tirar esse campo derruba a reconciliação inteira.

   O token do Bling não é tratado aqui de propósito
   -----------------------------------------------
   Quem renova é a função `bling-proxy`, que já guarda access/refresh em
   mc_integrations. O Bling ROTACIONA o refresh_token: se duas funções
   renovassem em paralelo, a segunda invalidaria a primeira e a integração
   cairia para todo mundo. Então esta função só chama
   `bling-proxy?action=products` por HTTP e deixa o token com o dono dele.

   Ações (POST, corpo JSON — o painel chama por sb.functions.invoke()):
     sincronizar { sessao, pagina_inicial?, criterio? }
     drive       { sessao, cursor? }
     status      { sessao }

   Autenticação: o painel não usa Supabase Auth (o cliente é anon para sempre),
   então a função exige o id de `fp_session` e confere contra mc_admin_users com
   a service role — mesmo padrão de magis5-proxy.ts.

   Secrets usadas: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (já existem).
============================================================================= */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const SB_URL = Deno.env.get('SUPABASE_URL') || '';
const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const TABELA = 'mc_photo_products';
const BLING_PROXY = Deno.env.get('BLING_PROXY_URL') || (SB_URL + '/functions/v1/bling-proxy');
const DRIVE_PROXY = Deno.env.get('DRIVE_PROXY_URL') || (SB_URL + '/functions/v1/drive-proxy');

/* 100 é o teto de `limite` do GET /produtos do Bling v3 — pedir mais não traz mais */
const LIMITE_PAGINA = 100;
/* teto de segurança por invocação: 500 × 100 = 50 mil produtos, muito acima do
   catálogo real. Serve só para uma resposta estranha do Bling não virar laço
   infinito. Se bater, volta `teto_atingido: true` no resumo. */
const TETO_PAGINAS = 500;
const TETO_PAGINAS_DRIVE = 200;
/* o PostgREST aguenta lotes bem maiores, mas 500 linhas mantém o corpo do POST
   em ~150 KB e o erro de um lote não leva a varredura toda junto */
const LOTE_GRAVACAO = 500;
/* a edge function morre no limite de wall clock. Paramos antes e devolvemos
   `proxima_pagina`: resultado retomável vale mais que função que morre no meio. */
const ORCAMENTO_MS = 110000;
/* a ação `drive` ainda tem trabalho DEPOIS do laço (ler ~5.500 SKUs e gravar 11
   lotes). Se a varredura comesse o orçamento inteiro, a função morreria na
   gravação — que é justamente a parte que não pode ficar pela metade. */
const ORCAMENTO_VARREDURA_MS = 60000;
/* o Bling limita a 3 requisições por segundo; 350 ms entre páginas fica abaixo
   do teto mesmo contando o tempo do proxy */
const INTERVALO_BLING_MS = 350;
/* sem isso, um proxy travado consome o wall clock inteiro e a chamada morre sem
   devolver nem o parcial */
const TIMEOUT_PROXY_MS = 25000;

function resposta(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

const msg = (e: unknown) => String((e as Error)?.message || e);

/* ------------------------------------------------------------- PostgREST --- */

function cabecalhosPg(extra: Record<string, string> = {}) {
  return { apikey: SRK, Authorization: 'Bearer ' + SRK, ...extra };
}

/**
 * Conta linhas sem trazer nenhuma: HEAD + count=exact devolve o total no
 * Content-Range. O corte é por `limit=1` na query e NÃO pelo cabeçalho Range —
 * com Range o PostgREST responde 416 quando a faixa passa do resultado, e
 * tabela recém-criada (zero linhas) cairia justamente nesse caso: a tela de
 * status quebraria antes da primeira sincronização.
 */
async function contar(filtro: string): Promise<number> {
  const r = await fetch(
    `${SB_URL}/rest/v1/${TABELA}?select=sku&limit=1${filtro ? '&' + filtro : ''}`,
    { method: 'HEAD', headers: cabecalhosPg({ Prefer: 'count=exact' }) },
  );
  /* HEAD não tem corpo para explicar o erro: tabela ausente ou filtro inválido
     voltaria como total 0, e "0 produtos" é um número plausível na tela — o
     operador acharia que o banco esvaziou. Melhor falhar alto. */
  if (!r.ok) throw new Error(`contagem falhou (${r.status}) no filtro "${filtro || 'todos'}"`);
  const faixa = r.headers.get('content-range') || '';
  const total = Number(faixa.split('/')[1]);
  // sem o cabeçalho não há contagem nenhuma; devolver 0 aqui seria inventar número
  if (!Number.isFinite(total)) throw new Error('PostgREST não devolveu content-range na contagem');
  return total;
}

/** Lê a tabela inteira, paginando. O PostgREST corta em `max-rows` (1.000 hoje). */
async function lerLinhas(select: string): Promise<Record<string, any>[]> {
  const todos: Record<string, any>[] = [];
  const passo = 1000;
  const TETO_LINHAS = 200000;
  let offset = 0;
  while (true) {
    const r = await fetch(
      `${SB_URL}/rest/v1/${TABELA}?select=${encodeURIComponent(select)}`
      + `&order=sku.asc&limit=${passo}&offset=${offset}`,
      { headers: cabecalhosPg() },
    );
    if (!r.ok) throw new Error('falha ao ler ' + TABELA + ': ' + (await r.text()));
    const linhas = await r.json();
    if (!Array.isArray(linhas) || !linhas.length) break;
    for (const l of linhas) todos.push(l);
    /* avança pelo que VEIO, não pelo que foi pedido: se o max-rows do PostgREST
       for menor que `passo`, parar em "veio menos que pedi" cortaria a lista
       silenciosamente — e lista curta aqui vira produto marcado como sem foto */
    offset += linhas.length;
    if (todos.length > TETO_LINHAS) throw new Error('leitura de ' + TABELA + ' passou de ' + TETO_LINHAS + ' linhas');
  }
  return todos;
}

async function lerSkusGravados(): Promise<string[]> {
  return (await lerLinhas('sku')).map((l) => String(l.sku)).filter(Boolean);
}

/** Upsert em lote por SKU. `resolution=merge-duplicates` + on_conflict=sku. */
async function gravarLote(linhas: Record<string, unknown>[]) {
  if (!linhas.length) return;
  const r = await fetch(`${SB_URL}/rest/v1/${TABELA}?on_conflict=sku`, {
    method: 'POST',
    headers: cabecalhosPg({
      'Content-Type': 'application/json',
      // return=minimal evita o servidor devolver as 500 linhas de volta
      Prefer: 'resolution=merge-duplicates,return=minimal',
    }),
    body: JSON.stringify(linhas),
  });
  if (!r.ok) throw new Error(`upsert de ${linhas.length} linhas falhou (${r.status}): ` + (await r.text()));
}

/* ---------------------------------------------------------------- proxies --- */

type Bruto = { ok: boolean; status: number; texto: string };

async function buscarBruto(url: string): Promise<Bruto> {
  const r = await fetch(url, {
    // os proxies estão com verify_jwt: false, mas mandar a chave mantém a
    // chamada funcionando se um dia ligarem a verificação
    headers: { Authorization: 'Bearer ' + SRK, apikey: SRK },
    signal: AbortSignal.timeout(TIMEOUT_PROXY_MS),
  });
  return { ok: r.ok, status: r.status, texto: await r.text() };
}

/**
 * Chama um proxy repetindo em 429, 5xx e queda de rede. `limite` é o instante
 * em que a invocação precisa parar: esperar o backoff além disso só faria a
 * função morrer no meio da gravação.
 */
async function chamarProxy(url: string, rotulo: string, limite: number) {
  let ultimoErro = '';
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    if (tentativa) {
      const espera = 1500 * Math.pow(2, tentativa - 1);
      if (Date.now() + espera > limite) break;
      await esperar(espera);
    }
    const bruto = await buscarBruto(url).catch((e: any) => ({ falha: msg(e) }));
    // erro de transporte (timeout, DNS, conexão) também merece repetição
    if ('falha' in bruto) { ultimoErro = bruto.falha; continue; }
    if (bruto.status === 429 || bruto.status >= 500) { ultimoErro = `HTTP ${bruto.status}`; continue; }
    let dados: Record<string, any> = {};
    try { dados = bruto.texto ? JSON.parse(bruto.texto) : {}; } catch { dados = {}; }
    return { ok: bruto.ok, status: bruto.status, texto: bruto.texto, dados };
  }
  throw new Error(`${rotulo} não respondeu depois de 3 tentativas (${ultimoErro || 'sem detalhe'}).`);
}

/* ------------------------------------------------------------------ Bling --- */

type PaginaBling = { itens: Record<string, unknown>[] };

/** Uma página de /produtos via bling-proxy. */
async function paginaBling(pagina: number, criterio: string, limite: number): Promise<PaginaBling> {
  const url = `${BLING_PROXY}?action=products&pagina=${pagina}&limite=${LIMITE_PAGINA}`
    + `&criterio=${encodeURIComponent(criterio)}`;

  const r = await chamarProxy(url, `bling-proxy (página ${pagina})`, limite);

  if (r.status === 401 || r.dados?.error === 'not_connected') {
    throw new Error('Bling não conectado — reconecte a integração no painel antes de sincronizar.');
  }
  if (!r.ok) {
    throw new Error(`bling-proxy respondeu ${r.status} na página ${pagina}: ${r.texto.slice(0, 300)}`);
  }
  /* o proxy devolve o corpo cru do Bling: { data: [...] }. Resposta 200 sem
     `data` é sintoma de erro do Bling embrulhado em sucesso — tratar como lista
     vazia encerraria a varredura como se o catálogo tivesse acabado. */
  if (!Array.isArray(r.dados?.data)) {
    throw new Error(`bling-proxy devolveu 200 sem lista na página ${pagina}: ${r.texto.slice(0, 300)}`);
  }
  return { itens: r.dados.data as Record<string, unknown>[] };
}

/** Só os campos que vêm do Bling. Ver a regra no cabeçalho do arquivo. */
function linhaDoBling(p: Record<string, any>, sku: string, agora: string) {
  const preco = Number(p?.preco);
  const estoque = Number(p?.estoque?.saldoVirtualTotal);
  const imagem = String(p?.imagemURL || '').trim();
  return {
    sku,
    bling_id: p?.id == null ? null : String(p.id),
    /* `nome` é NOT NULL no schema. Produto sem nome no Bling existe (cadastro
       pela metade) e derrubaria o lote inteiro de 500 linhas — o SKU serve de
       rótulo até alguém arrumar o cadastro. */
    nome: String(p?.nome || '').trim() || sku,
    preco: Number.isFinite(preco) ? preco : null,
    // pode vir null de verdade (produto sem controle de estoque) — gravamos null
    estoque: Number.isFinite(estoque) ? estoque : null,
    imagem_bling: imagem || null,
    sincronizado_em: agora,
  };
}

/* ------------------------------------------------------------------ Drive --- */

type Pasta = { id?: string; name?: string };

/**
 * Uma página da varredura do drive-proxy.
 *
 * O contrato é o da própria função (drive-proxy.ts, ação `varredura`):
 * devolve `{ configurado, pastas:[{id,name}], nextPageToken, fim }` e usa a
 * chave `error` (não `erro`) nas falhas. O campo do cursor é `nextPageToken`,
 * o nome que o Google usa — ler outro nome aqui faria a varredura terminar na
 * primeira página achando que acabou, e uma varredura "completa" com 1.000 das
 * 5.500 pastas apagaria a foto de 4.500 produtos.
 */
async function paginaDrive(
  cursor: string,
  sessao: string,
  limite: number,
): Promise<{ pastas: Pasta[]; proximo: string; fim: boolean }> {
  const url = `${DRIVE_PROXY}?action=varredura&sessao=${encodeURIComponent(sessao)}`
    + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');

  const r = await chamarProxy(url, 'drive-proxy (varredura)', limite);

  /* 200 com configurado:false é o jeito do drive-proxy dizer que está sem
     GOOGLE_SA_JSON ou DRIVE_ROOT_FOLDER_ID. Sucesso HTTP com lista vazia: se
     passasse batido, viraria "nenhuma pasta existe" e limparia o catálogo. */
  if (r.dados?.configurado === false) {
    throw new Error('drive-proxy sem GOOGLE_SA_JSON ou DRIVE_ROOT_FOLDER_ID — configure o Drive antes de reconciliar as fotos.');
  }
  if (!r.ok || r.dados?.error || r.dados?.erro) {
    const detalhe = String(r.dados?.error || r.dados?.erro || r.texto.slice(0, 300));
    throw new Error(`drive-proxy falhou na varredura (${r.status}): ${detalhe}`);
  }
  if (!Array.isArray(r.dados?.pastas)) {
    throw new Error(`drive-proxy devolveu 200 sem lista de pastas: ${r.texto.slice(0, 300)}`);
  }

  const proximo = String(r.dados?.nextPageToken || '');
  return {
    pastas: r.dados.pastas as Pasta[],
    proximo,
    fim: r.dados?.fim === true || !proximo,
  };
}

/* ------------------------------------------------------------------ sessão --- */

async function validarSessao(sessao: string): Promise<string> {
  /* O painel não usa Supabase Auth: checar role='authenticated' rejeitaria todo
     mundo e confiar só no verify_jwt liberaria qualquer um com a anon key, que
     é pública no config.js. O que dá para exigir é o UUID de fp_session. */
  if (!/^[0-9a-f-]{36}$/i.test(sessao)) return 'sessão do painel ausente — entre de novo no painel';
  try {
    const r = await fetch(
      SB_URL + '/rest/v1/mc_admin_users?select=id&id=eq.' + encodeURIComponent(sessao),
      { headers: cabecalhosPg() },
    );
    if (!r.ok) return 'não deu para validar a sessão: PostgREST respondeu ' + r.status;
    const linhas = await r.json().catch(() => null);
    if (!Array.isArray(linhas) || !linhas.length) return 'sessão do painel não confere';
    return '';
  } catch (e) {
    /* sem este try a exceção sobe fora do handler, e a resposta 500 do runtime
       vai SEM os cabeçalhos de CORS: o painel mostraria erro de CORS no lugar
       da mensagem de verdade */
    return 'não deu para validar a sessão: ' + msg(e);
  }
}

/* -------------------------------------------------------------------- ações --- */

async function acaoSincronizar(corpo: Record<string, any>) {
  const t0 = Date.now();
  const limite = t0 + ORCAMENTO_MS;
  const agora = new Date().toISOString();
  const paginaInicial = Math.max(1, Number(corpo?.pagina_inicial) || 1);
  /* criterio 2 = só produtos ativos, o mesmo que o painel já usa hoje. Fica
     configurável para uma varredura eventual de inativos, mas o padrão não muda
     o que o operador vê. */
  const criterio = String(corpo?.criterio || '2');

  const jaGravados = new Set(await lerSkusGravados());
  const vistos = new Set<string>();

  let pagina = paginaInicial;
  let paginas = 0, lidos = 0, gravados = 0, semSku = 0, duplicados = 0, novos = 0;
  let completo = false, tetoAtingido = false;
  let erroParcial: string | null = null;
  let buffer: Record<string, unknown>[] = [];

  const descarregar = async () => {
    if (!buffer.length) return;
    await gravarLote(buffer);
    gravados += buffer.length;
    buffer = [];
  };

  while (true) {
    if (paginas >= TETO_PAGINAS) { tetoAtingido = true; break; }
    if (Date.now() > limite) break;
    if (paginas) await esperar(INTERVALO_BLING_MS);

    const r = await paginaBling(pagina, criterio, limite)
      .catch((e: any) => ({ falha: msg(e) }));
    if ('falha' in r) {
      // falhou logo na primeira página: não há parcial nenhum, o operador
      // precisa ver o motivo (Bling desconectado, proxy fora do ar)
      if (!paginas) throw new Error(r.falha);
      /* já lemos páginas boas: jogar fora tudo por causa de uma página seria
         pior que devolver o parcial e deixar o painel retomar */
      erroParcial = r.falha;
      break;
    }
    const itens = r.itens;
    paginas++;
    lidos += itens.length;

    for (const p of itens) {
      // sem SKU não dá para casar com a pasta do Drive nem com o resto do painel
      const sku = String((p as any)?.codigo || '').trim();
      if (!sku) { semSku++; continue; }
      /* SKU repetido no mesmo lote faria o Postgres reclamar ("ON CONFLICT DO
         UPDATE command cannot affect row a second time") — fica o primeiro */
      if (vistos.has(sku)) { duplicados++; continue; }
      vistos.add(sku);
      if (!jaGravados.has(sku)) novos++;
      buffer.push(linhaDoBling(p as Record<string, any>, sku, agora));
    }

    if (buffer.length >= LOTE_GRAVACAO) await descarregar();
    if (itens.length < LIMITE_PAGINA) { completo = true; break; }
    pagina++;
  }

  await descarregar();

  const aviso = erroParcial
    ? `parou na página ${pagina} por erro do Bling (${erroParcial}) — o que veio antes está gravado, continue por proxima_pagina`
    : tetoAtingido
      ? `parou no teto de ${TETO_PAGINAS} páginas nesta chamada — chame de novo com pagina_inicial=${pagina}`
      : (completo ? null : 'varredura parcial pelo limite de tempo — continue por proxima_pagina');

  return {
    ok: true,
    paginas, lidos, gravados, sem_sku: semSku, duplicados, novos,
    ms: Date.now() - t0,
    completo,
    teto_atingido: tetoAtingido,
    pagina_inicial: paginaInicial,
    // o painel repete a chamada com este valor até vir null
    proxima_pagina: completo ? null : pagina,
    erro_parcial: erroParcial,
    aviso,
  };
}

async function acaoDrive(corpo: Record<string, any>, sessao: string) {
  const t0 = Date.now();
  const limiteVarredura = t0 + ORCAMENTO_VARREDURA_MS;
  const agora = new Date().toISOString();

  /* nome da pasta = SKU exato, mas o Drive guarda o que digitaram: espaço nas
     pontas é comum e derrubaria o casamento */
  const mapa = new Map<string, string>();
  const cursorInicial = String(corpo?.cursor || '');
  let cursor = cursorInicial;
  let paginasDrive = 0, pastas = 0, completo = false;
  let erroParcial: string | null = null;

  while (true) {
    if (paginasDrive >= TETO_PAGINAS_DRIVE) break;
    if (Date.now() > limiteVarredura) break;
    const r = await paginaDrive(cursor, sessao, limiteVarredura)
      .catch((e: any) => ({ falha: msg(e) }));
    if ('falha' in r) {
      // sem nenhuma página lida o erro é a resposta: Drive fora do ar, raiz
      // errada ou conta de serviço sem acesso
      if (!paginasDrive) throw new Error(r.falha);
      erroParcial = r.falha;
      break;
    }
    paginasDrive++;
    pastas += r.pastas.length;
    for (const p of r.pastas) {
      const nome = String(p?.name || '').trim();
      if (nome && !mapa.has(nome)) mapa.set(nome, String(p?.id || ''));
    }
    cursor = r.proximo;
    if (r.fim) { completo = true; break; }
  }

  /* Quando é seguro gravar tem_foto=FALSE (a "reconciliação"): só quando ESTA
     chamada viu o drive inteiro. Três armadilhas, todas com o mesmo estrago —
     apagar a foto de milhares de produtos que ninguém tocou:

     1. varredura parcial (tempo/teto/erro): o mapa não tem as pastas que ainda
        não foram lidas;
     2. varredura RETOMADA por cursor: o mapa só tem as pastas desta chamada, as
        das chamadas anteriores ficaram na invocação passada — "completo" aqui
        não quer dizer "vi tudo";
     3. varredura completa que voltou ZERO pasta: raiz errada, acesso removido
        da conta de serviço ou lixeira — o Google devolve lista vazia com 200,
        e "nenhuma pasta existe" é indistinguível de "perdi o acesso".

     Fora desses casos a função grava só os positivos e devolve o cursor. */
  const reconciliar = completo && !cursorInicial && mapa.size > 0;

  const produtos = await lerLinhas('sku,nome');
  let casados = 0;
  let lote: Record<string, unknown>[] = [];
  const descarregar = async () => { await gravarLote(lote); lote = []; };

  for (const linha of produtos) {
    const sku = String(linha?.sku || '');
    if (!sku) continue;
    const temPasta = mapa.has(sku);
    if (temPasta) casados++;
    if (!reconciliar && !temPasta) continue;
    lote.push({
      sku,
      // NOT NULL sem default: o Postgres valida a tupla proposta antes do
      // ON CONFLICT, então omitir `nome` derruba o upsert. Ver o cabeçalho.
      nome: String(linha?.nome || '').trim() || sku,
      tem_foto: temPasta,
      drive_folder_id: temPasta ? (mapa.get(sku) || null) : null,
      drive_checado_em: agora,
    });
    if (lote.length >= LOTE_GRAVACAO) await descarregar();
  }
  await descarregar();

  const aviso = erroParcial
    ? `varredura do Drive interrompida por erro (${erroParcial}) — só os produtos com pasta encontrada foram marcados. Continue por proximo_cursor.`
    : reconciliar ? null
      : completo && !mapa.size
        ? 'a varredura terminou sem NENHUMA pasta: nada foi marcado como sem foto. Confira DRIVE_ROOT_FOLDER_ID e o compartilhamento com a conta de serviço.'
        : completo
          ? 'varredura retomada por cursor: as pastas das chamadas anteriores não estão nesta memória, então só os positivos foram gravados. Para reconciliar quem perdeu a pasta, rode uma varredura inteira sem cursor.'
          : 'varredura do Drive incompleta: só os produtos com pasta encontrada foram marcados. Continue por proximo_cursor.';

  return {
    ok: true,
    pastas,
    casados,
    sem_pasta: produtos.length - casados,
    // pasta no Drive sem produto correspondente: SKU fora de linha ou erro de digitação
    pastas_sem_produto: mapa.size - casados,
    produtos: produtos.length,
    paginas_drive: paginasDrive,
    completo,
    // diz se `tem_foto=false` foi aplicado ou se só os positivos foram gravados
    reconciliado: reconciliar,
    proximo_cursor: completo ? null : (cursor || null),
    erro_parcial: erroParcial,
    ms: Date.now() - t0,
    aviso,
  };
}

async function acaoStatus() {
  const t0 = Date.now();
  const [total, comFoto, semFoto, excluidos, pendentes] = await Promise.all([
    contar(''),
    contar('tem_foto=is.true'),
    contar('tem_foto=is.false'),
    contar('excluido=is.true'),
    /* "pendente de prioridade" é o que o operador precisa resolver na Produção:
       ainda sem foto, não excluído e sem nível definido. Produto que já tem foto
       não mostra prioridade, então não conta como pendência. */
    contar('prioridade=is.null&excluido=is.false&tem_foto=is.false'),
  ]);

  const r = await fetch(
    `${SB_URL}/rest/v1/${TABELA}?select=sincronizado_em&order=sincronizado_em.desc.nullslast&limit=1`,
    { headers: cabecalhosPg() },
  );
  if (!r.ok) throw new Error('falha ao ler a última sincronização (' + r.status + '): ' + (await r.text()));
  const linhas = await r.json().catch(() => null);
  const ultima = Array.isArray(linhas) && linhas[0] ? linhas[0].sincronizado_em : null;

  return {
    ok: true,
    total,
    com_foto: comFoto,
    sem_foto: semFoto,
    pendentes_prioridade: pendentes,
    excluidos,
    ultima_sincronizacao: ultima,
    ms: Date.now() - t0,
  };
}

/* --------------------------------------------------------------------------- */

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  if (!SB_URL || !SRK) {
    return resposta({ erro: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes na função' }, 503);
  }

  const url = new URL(req.url);
  // um Request só pode ser lido uma vez
  let corpo: Record<string, any> = {};
  if (req.method === 'POST') corpo = await req.json().catch(() => ({}));
  const acao = String(corpo?.action || url.searchParams.get('action') || '');
  const sessao = String(corpo?.sessao || url.searchParams.get('sessao') || '');

  const erroSessao = await validarSessao(sessao);
  if (erroSessao) return resposta({ erro: erroSessao }, 401);

  try {
    if (acao === 'sincronizar') return resposta(await acaoSincronizar(corpo));
    if (acao === 'drive') return resposta(await acaoDrive(corpo, sessao));
    if (acao === 'status') return resposta(await acaoStatus());
    return resposta({ erro: 'ação desconhecida: ' + acao }, 400);
  } catch (e) {
    return resposta({ erro: msg(e) }, 500);
  }
});
