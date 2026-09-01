/**
 * youtube-proxy — ponte entre o painel e a YouTube Data API v3.
 *
 * Por que existe: a YOUTUBE_API_KEY vivia no config.js, servido em
 * https://mediaclub.fullpro.com.br/config.js — qualquer pessoa baixa e passa a
 * gastar a cota do projeto (10.000 unidades/dia, compartilhadas). E, sobretudo,
 * porque uma chave que só o dono consegue trocar no console do Google não é uma
 * chave que ele consegue trocar. Aqui ele reconecta pelo painel.
 *
 * DE ONDE VEM A CHAVE
 *   1. mc_integrations, provider 'youtube' — o que o painel grava quando um
 *      administrador conecta em Integrações. RLS ligada e sem policy: só a
 *      service role enxerga.
 *   2. Secret YOUTUBE_API_KEY — reserva, para não derrubar o que já funcionava.
 * Nessa ordem, nunca o config.js. Ver supabase/integr-cred.md.
 *
 * ATENÇÃO À RESTRIÇÃO DA CHAVE. Chamada daqui é chamada de SERVIDOR: não existe
 * Referer. Chave restrita por "sites da Web (referenciadores HTTP)" responde 403
 * `requests from referer <empty> are blocked`. A ação 'salvar' testa isso na
 * hora e diz a frase certa, em vez de gravar uma chave que só falha depois.
 *
 * Ações — em ?action= ou no corpo {action}:
 *   health                 -> { ok, configurado }                      [aberta]
 *   status                 -> { ok, conectado, origem, canal, ... }    [operador]
 *   salvar    { chave }    -> { ok, ... }                              [admin]
 *   desconectar            -> { ok, ... }                              [admin]
 *   stats     { ids: [] }  -> { ok, stats: { id: {views,likes,comments} } }
 *   oauth_status           -> { ok, app_configurado, autorizado, canal }
 *   oauth_app   { client_id, client_secret }        -> { ok, ... }     [admin]
 *   oauth_url   { redirect_uri }                    -> { ok, url }     [admin]
 *   oauth_code  { code, redirect_uri }              -> { ok, ... }     [admin]
 *   oauth_desconectar                               -> { ok, ... }     [admin]
 *
 * TODA resposta traz `ok`. Em falha vem { ok:false, erro } com a frase já em
 * português. A chave NUNCA sai daqui — nem em resposta, nem em log, nem em
 * prefixo.
 *
 * QUEM PODE CHAMAR
 * `verify_jwt` fica DESLIGADO e a checagem é feita no corpo, como na
 * instagram-proxy: a chave publicável do config.js passa no verify_jwt do
 * gateway, então ele sozinho não separa operador de qualquer um. Aqui o JWT é
 * validado com auth.getUser e conferido contra mc_admin_users.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const YT = 'https://www.googleapis.com/youtube/v3';
const CANAL_PADRAO = Deno.env.get('YOUTUBE_CHANNEL_ID') || 'UC3IfjxanbihK-WKcwE9RRAQ';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const CHAVE_ENV = Deno.env.get('YOUTUBE_API_KEY') ?? '';
const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

function resposta(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function falha(erro: string, meta?: unknown, status = 200): Response {
  return resposta({ ok: false, erro, ...(meta ? { meta } : {}) }, status);
}

let servicoCache: ReturnType<typeof createClient> | null = null;
function servico() {
  if (!servicoCache) servicoCache = createClient(SB_URL, SRK, { auth: { persistSession: false } });
  return servicoCache;
}

type Cred = {
  chave: string;
  origem: 'painel' | 'secret' | 'nenhuma';
  meta: Record<string, any>;
  atualizado: string | null;
  em: number;
};

/* Banco primeiro, secret depois. Cache de 60s porque atualizar as métricas de
   um projeto vira várias invocações seguidas. Salvar e desconectar zeram. */
let credCache: Cred | null = null;
async function credencial(): Promise<Cred> {
  if (credCache && Date.now() - credCache.em < 60_000) return credCache;

  let linha: Record<string, any> | null = null;
  try {
    const { data } = await servico()
      .from('mc_integrations')
      .select('access_token, meta, updated_at')
      .eq('provider', 'youtube')
      .maybeSingle();
    linha = data ?? null;
  } catch (e) {
    /* Banco fora do ar não pode derrubar o que a secret já resolvia. */
    console.error('[youtube-proxy] leitura de mc_integrations falhou', e instanceof Error ? e.message : e);
  }

  credCache = linha?.access_token
    ? { chave: linha.access_token, origem: 'painel', meta: linha.meta ?? {},
        atualizado: linha.updated_at ?? null, em: Date.now() }
    : { chave: CHAVE_ENV, origem: CHAVE_ENV ? 'secret' : 'nenhuma', meta: {},
        atualizado: null, em: Date.now() };
  return credCache;
}

/* O que a tela pode ver. Nunca a chave. */
async function estado() {
  const c = await credencial();
  return {
    conectado: c.chave.length > 0,
    origem: c.origem,
    canal: c.meta.canal_titulo ?? null,
    canal_id: c.meta.canal_id ?? null,
    atualizado_em: c.atualizado,
  };
}

/* Mesma regra do painel (isUserAdmin): cargo sem acento, minúsculo,
   começando com "admin". "Assistente Admin." não passa, de propósito. */
function ehAdmin(op: { role?: string } | null): boolean {
  const r = (op?.role ?? '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  return r.startsWith('admin');
}

/* A API responde 200 com corpo vazio em vários casos e 403/400 com {error}.
   A mensagem do Google é o que interessa: ela distingue "chave inválida" de
   "chave bloqueada por referenciador", que são problemas diferentes. */
async function api(caminho: string, params: Record<string, string>, chave: string) {
  const url = new URL(`${YT}/${caminho}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('key', chave);

  /* A chave vai em ?key=, que é o único jeito que a API aceita. Se o fetch em
     si falhar, o TypeError do Deno traz a URL inteira na mensagem — e ela iria
     para o log. Erro de rede é reescrito aqui, sem URL. */
  let r: Response;
  try {
    r = await fetch(url.toString());
  } catch (e) {
    throw new Error('não deu para falar com o YouTube (' + (e instanceof Error ? e.name : 'falha de rede') + ')');
  }
  const j = await r.json().catch(() => ({}));
  if (j?.error) {
    const det = j.error.errors?.[0] ?? {};
    throw new Error(j.error.message ?? 'erro do YouTube', { cause: det.reason ?? j.error.code ?? null });
  }
  return j;
}

async function operadorOuNulo(req: Request): Promise<{ id: string; role: string } | null> {
  const cabecalho = req.headers.get('Authorization') ?? '';
  const jwt = cabecalho.replace(/^Bearer\s+/i, '').trim();
  if (!jwt || !SB_URL || !SRK) return null;

  try {
    const admin = servico();
    const { data: { user }, error } = await admin.auth.getUser(jwt);
    if (error || !user) return null;

    const { data: op } = await admin
      .from('mc_admin_users')
      .select('id, role')
      .eq('auth_uid', user.id)
      .maybeSingle();

    return (op as { id: string; role: string } | null) ?? null;
  } catch {
    return null;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   OAUTH DE UPLOAD  [01/09/2026]

   A chave de API acima SÓ LÊ. Subir vídeo exige OAuth com escopo
   youtube.upload — são credenciais diferentes, não uma versão melhor da outra.

   POR QUE UMA LINHA SEPARADA ('youtube_oauth') E NÃO A MESMA DO 'youtube':
   a ação 'salvar' faz upsert com `refresh_token: null` fixo. Se o OAuth
   morasse na mesma linha, a primeira vez que alguém reconectasse a CHAVE pelo
   modal apagaria o refresh token do upload — em silêncio, com a tela ainda
   dizendo "conectado". E 'desconectar' apaga a linha inteira: desligar as
   métricas derrubaria a publicação junto. Duas credenciais, dois ciclos de
   vida, duas linhas.
   ══════════════════════════════════════════════════════════════════════════ */

const OAUTH_AUTH  = 'https://accounts.google.com/o/oauth2/v2/auth';
const OAUTH_TOKEN = 'https://oauth2.googleapis.com/token';
const ESCOPO_UPLOAD = 'https://www.googleapis.com/auth/youtube.upload';

type CredOauth = {
  client_id: string;
  client_secret: string;
  refresh: string | null;
  access: string | null;
  expira: string | null;
  meta: Record<string, any>;
};

async function credOauth(): Promise<CredOauth | null> {
  const { data } = await servico()
    .from('mc_integrations')
    .select('access_token, refresh_token, expires_at, meta')
    .eq('provider', 'youtube_oauth')
    .maybeSingle();
  if (!data) return null;
  const m = (data.meta ?? {}) as Record<string, any>;
  if (!m.client_id || !m.client_secret) return null;
  return {
    client_id: String(m.client_id),
    client_secret: String(m.client_secret),
    refresh: data.refresh_token ?? null,
    access: data.access_token ?? null,
    expira: data.expires_at ?? null,
    meta: m,
  };
}

/* O que a tela pode ver do OAuth. Nunca client_secret, nunca token. */
async function estadoOauth() {
  const c = await credOauth();
  return {
    app_configurado: Boolean(c),
    autorizado: Boolean(c?.refresh),
    canal: c?.meta?.canal_titulo ?? null,
    canal_id: c?.meta?.canal_id ?? null,
    autorizado_em: c?.meta?.autorizado_em ?? null,
    escopos: c?.meta?.escopos ?? null,
  };
}

/* Troca do refresh token por um access token novo. O access do Google dura
   1 hora; o refresh não expira sozinho fora do modo de teste — e este app
   está "Em produção", conferido no console em 01/09/2026. */
async function acessoDoRefresh(c: CredOauth): Promise<string> {
  if (c.access && c.expira && new Date(c.expira).getTime() > Date.now() + 120_000) return c.access;
  if (!c.refresh) throw new Error('o YouTube ainda não foi autorizado para upload.');

  let r: Response;
  try {
    r = await fetch(OAUTH_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: c.client_id, client_secret: c.client_secret,
        refresh_token: c.refresh, grant_type: 'refresh_token',
      }).toString(),
    });
  } catch (e) {
    throw new Error('não deu para falar com o Google (' + (e instanceof Error ? e.name : 'rede') + ')');
  }
  const j = await r.json().catch(() => ({}));
  if (j?.error) {
    /* invalid_grant é o erro que o dono precisa entender: o consentimento caiu
       (revogado, senha trocada, app voltou para teste) e só refazer resolve. */
    if (j.error === 'invalid_grant') {
      throw new Error('a autorização do YouTube caiu e precisa ser refeita em Integrações → Autorizar upload.');
    }
    throw new Error('o Google recusou a renovação: ' + (j.error_description ?? j.error));
  }
  const acesso = String(j.access_token ?? '');
  if (!acesso) throw new Error('o Google não devolveu o token de acesso.');

  await servico().from('mc_integrations').update({
    access_token: acesso,
    expires_at: new Date(Date.now() + (Number(j.expires_in) || 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('provider', 'youtube_oauth');

  return acesso;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  let corpo: Record<string, unknown> = {};
  try { corpo = await req.json(); } catch { /* GET ou corpo vazio */ }

  const url = new URL(req.url);
  const action = String(corpo.action ?? url.searchParams.get('action') ?? 'health');

  if (action === 'health') {
    /* `versao` é o que deixa conferir, de fora e sem sessão, QUAL código está
       no ar. Sem isso, depois de um deploy só dá para acreditar. */
    return resposta({ ok: true, versao: 'yt3', configurado: (await credencial()).chave.length > 0 });
  }

  const operador = await operadorOuNulo(req);
  if (!operador) {
    return falha('sessão de operador ausente ou inválida — entre de novo no painel', null, 401);
  }

  /* 'verificar' existe para a tela poder perguntar a mesma coisa que o
     Instagram pergunta. Aqui não há validade para conferir: a chave não expira
     sozinha, então verificar é gastar 1 unidade de cota para ver se ela ainda
     responde. */
  if (action === 'status' || action === 'verificar') {
    const e = await estado();
    if (action !== 'verificar' || !e.conectado) return resposta({ ok: true, ...e, vale: null });
    try {
      const c = await credencial();
      const j = await api('channels', { part: 'snippet', id: e.canal_id ?? CANAL_PADRAO }, c.chave);
      const item = (j?.items ?? [])[0];
      return resposta({ ok: true, ...e, vale: !!item, canal: item?.snippet?.title ?? e.canal });
    } catch (err) {
      return resposta({ ok: true, ...e, vale: false, erro_conta: err instanceof Error ? err.message : 'o Google não respondeu' });
    }
  }

  const ACOES_ADMIN = ['salvar', 'desconectar', 'oauth_app', 'oauth_url', 'oauth_code', 'oauth_desconectar'];
  if (ACOES_ADMIN.indexOf(action) >= 0) {
    if (!ehAdmin(operador)) {
      return falha('só administrador pode trocar a conexão do YouTube.', null, 403);
    }
  }

  /* ── OAuth de upload ─────────────────────────────────────────────────── */

  if (action === 'oauth_status') {
    return resposta({ ok: true, ...(await estadoOauth()) });
  }

  /* Guarda o app do Google. O client_id é público por natureza (aparece na
     barra de endereços na hora do consentimento); o secret não, e por isso
     mora aqui e não no navegador. */
  if (action === 'oauth_app') {
    const id = String(corpo.client_id ?? '').trim();
    const segredo = String(corpo.client_secret ?? '').trim();
    if (!id || !segredo) return falha('cole o Client ID e o Client Secret.');
    if (!/\.apps\.googleusercontent\.com$/.test(id)) {
      return falha('esse Client ID não parece do Google — o certo termina em .apps.googleusercontent.com.');
    }

    const atual = await credOauth();
    const { error } = await servico().from('mc_integrations').upsert({
      provider: 'youtube_oauth',
      access_token: null,
      refresh_token: atual?.refresh ?? null,   /* trocar o app não derruba autorização existente */
      expires_at: null,
      meta: { ...(atual?.meta ?? {}), client_id: id, client_secret: segredo,
              salvo_por: operador.id, salvo_em: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'provider' });
    if (error) return falha('não deu para gravar: ' + error.message);
    return resposta({ ok: true, ...(await estadoOauth()) });
  }

  /* A URL do consentimento é montada AQUI e não no navegador, porque quem
     conhece o client_id é o servidor. access_type=offline + prompt=consent
     são obrigatórios: sem os dois o Google devolve access token e NENHUM
     refresh token, e a autorização morre em uma hora. */
  if (action === 'oauth_url') {
    const c = await credOauth();
    if (!c) return falha('configure primeiro o Client ID e o Client Secret.');
    const redirect = String(corpo.redirect_uri ?? '').trim();
    if (!/^https:\/\//.test(redirect)) return falha('redirect_uri inválido.');

    const estadoCsrf = crypto.randomUUID();
    const u = new URL(OAUTH_AUTH);
    u.searchParams.set('client_id', c.client_id);
    u.searchParams.set('redirect_uri', redirect);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', ESCOPO_UPLOAD);
    u.searchParams.set('access_type', 'offline');
    u.searchParams.set('prompt', 'consent');
    u.searchParams.set('include_granted_scopes', 'true');
    u.searchParams.set('state', estadoCsrf);
    return resposta({ ok: true, url: u.toString(), state: estado });
  }

  if (action === 'oauth_code') {
    const c = await credOauth();
    if (!c) return falha('configure primeiro o Client ID e o Client Secret.');
    const code = String(corpo.code ?? '').trim();
    const redirect = String(corpo.redirect_uri ?? '').trim();
    if (!code) return falha('o Google não devolveu o código de autorização.');

    let r: Response;
    try {
      r = await fetch(OAUTH_TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: c.client_id, client_secret: c.client_secret,
          code, grant_type: 'authorization_code', redirect_uri: redirect,
        }).toString(),
      });
    } catch (e) {
      return falha('não deu para falar com o Google (' + (e instanceof Error ? e.name : 'rede') + ').');
    }
    const j = await r.json().catch(() => ({}));
    if (j?.error) {
      if (j.error === 'redirect_uri_mismatch') {
        return falha('o endereço de retorno não bate com o cadastrado no Google. '
          + 'Em Credenciais → o cliente OAuth, o URI autorizado precisa ser exatamente ' + redirect);
      }
      return falha('o Google recusou o código: ' + (j.error_description ?? j.error));
    }
    const refresh = String(j.refresh_token ?? '');
    if (!refresh) {
      return falha('o Google autorizou mas não devolveu refresh token. Isso acontece quando a conta já tinha '
        + 'autorizado antes: revogue o acesso em myaccount.google.com/permissions e autorize de novo.');
    }

    /* Descobre o canal com o token novo, para a tela mostrar em qual conta a
       autorização caiu — errar de canal é o tipo de erro que só aparece depois
       do primeiro vídeo publicado no lugar errado. */
    let canalId: string | null = null;
    let canalTitulo: string | null = null;
    try {
      const rc = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
        { headers: { Authorization: 'Bearer ' + j.access_token } });
      const jc = await rc.json().catch(() => ({}));
      const item = (jc?.items ?? [])[0];
      if (item) { canalId = item.id ?? null; canalTitulo = item.snippet?.title ?? null; }
    } catch { /* o escopo upload pode não ler canal; não é motivo para falhar */ }

    const { error } = await servico().from('mc_integrations').update({
      access_token: j.access_token ?? null,
      refresh_token: refresh,
      expires_at: new Date(Date.now() + (Number(j.expires_in) || 3600) * 1000).toISOString(),
      meta: { ...c.meta, canal_id: canalId, canal_titulo: canalTitulo,
              escopos: String(j.scope ?? '').split(' ').filter(Boolean),
              autorizado_por: operador.id, autorizado_em: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    }).eq('provider', 'youtube_oauth');
    if (error) return falha('autorizou, mas não deu para gravar: ' + error.message);

    return resposta({ ok: true, ...(await estadoOauth()) });
  }

  /* Só a autorização cai; o app (client id/secret) fica, para reautorizar sem
     ter de colar tudo de novo. */
  if (action === 'oauth_desconectar') {
    const c = await credOauth();
    if (!c) return resposta({ ok: true, ...(await estadoOauth()) });
    const { error } = await servico().from('mc_integrations').update({
      access_token: null, refresh_token: null, expires_at: null,
      meta: { client_id: c.meta.client_id, client_secret: c.meta.client_secret },
      updated_at: new Date().toISOString(),
    }).eq('provider', 'youtube_oauth');
    if (error) return falha('não deu para desconectar: ' + error.message);
    return resposta({ ok: true, ...(await estadoOauth()) });
  }

  if (action === 'salvar') {
    const chave = String(corpo.chave ?? '').trim();
    if (!chave) return falha('cole a chave antes de salvar.');

    const canalId = String(corpo.canal_id ?? CANAL_PADRAO).trim();

    /* Testa DAQUI, não do navegador: é daqui que ela vai ser usada. Uma chave
       restrita por referenciador HTTP passa no navegador e falha aqui, e é
       melhor descobrir agora do que quando o coletor rodar de madrugada.
       channels?part=snippet custa 1 unidade de cota. */
    let canal: Record<string, any>;
    try {
      canal = await api('channels', { part: 'snippet', id: canalId }, chave);
    } catch (e) {
      const erro = e instanceof Error ? e.message : 'chave recusada';
      const motivo = e instanceof Error ? String(e.cause ?? '') : '';
      if (/referer|referrer/i.test(erro) || motivo === 'forbidden') {
        return falha('essa chave está restrita a sites (referenciador HTTP) e o painel a usa pelo servidor, '
          + 'onde não existe referenciador. No console do Google, em Restrições da chave, escolha "Nenhuma" '
          + 'ou restrinja por endereço IP — e mantenha a restrição de API só para a YouTube Data API v3.', motivo);
      }
      return falha('o Google recusou essa chave: ' + erro, motivo);
    }

    const item = (canal?.items ?? [])[0];
    if (!item) {
      return falha('a chave funciona, mas o canal ' + canalId + ' não foi encontrado. Confira o ID do canal.');
    }

    const { error } = await servico().from('mc_integrations').upsert({
      provider: 'youtube',
      access_token: chave,
      refresh_token: null,
      expires_at: null,   /* chave de API não expira sozinha; morre por rotação */
      meta: {
        canal_id: canalId,
        canal_titulo: item.snippet?.title ?? null,
        salvo_por: operador.id,
        salvo_em: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'provider' });

    if (error) return falha('não deu para gravar a conexão: ' + error.message);

    credCache = null;
    return resposta({ ok: true, ...(await estado()) });
  }

  if (action === 'desconectar') {
    const { error } = await servico().from('mc_integrations').delete().eq('provider', 'youtube');
    if (error) return falha('não deu para desconectar: ' + error.message);
    credCache = null;
    return resposta({ ok: true, ...(await estado()) });
  }

  const cred = await credencial();
  if (!cred.chave) {
    return falha('o YouTube não está conectado. Um administrador conecta em Integrações.');
  }

  try {
    switch (action) {
      /* Um pedido só para vários vídeos: videos?id=a,b,c custa a mesma unidade
         de cota que um id sozinho. O painel manda a lista de uma vez. */
      case 'stats': {
        const ids = (Array.isArray(corpo.ids) ? corpo.ids : [corpo.id])
          .map((x) => String(x ?? '').trim())
          .filter(Boolean)
          .slice(0, 50);
        if (!ids.length) return falha('nenhum id de vídeo.');

        const j = await api('videos', { part: 'statistics', id: ids.join(',') }, cred.chave);
        const stats: Record<string, { views: number; likes: number; comments: number }> = {};
        for (const it of j?.items ?? []) {
          const s = it.statistics ?? {};
          stats[it.id] = {
            views: parseInt(s.viewCount) || 0,
            likes: parseInt(s.likeCount) || 0,
            comments: parseInt(s.commentCount) || 0,
          };
        }
        return resposta({ ok: true, stats });
      }

      default:
        return falha(`ação desconhecida: ${action}`);
    }
  } catch (e) {
    const erro = e instanceof Error ? e.message : 'falha inesperada';
    const meta = e instanceof Error ? e.cause : null;
    console.error('[youtube-proxy]', action, erro, meta);
    return falha(erro, meta);
  }
});
