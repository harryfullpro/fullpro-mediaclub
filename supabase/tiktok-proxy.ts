/**
 * tiktok-proxy — ponte entre o painel e as APIs do TikTok.
 *
 * ESTA VERSÃO CONSERTA DOIS PROBLEMAS SÉRIOS DA ANTERIOR (01/09/2026):
 *
 * 1. NÃO PEDIA NADA A NINGUÉM. `verify_jwt` desligado e zero checagem no corpo:
 *    qualquer pessoa da internet chamava. Medido em 01/09, sem um cabeçalho:
 *      curl ".../tiktok-proxy?action=user-info"  ->  200 com as nossas métricas
 *    Pior, `?action=disconnect` apagava a integração — destrutivo e anônimo.
 *    Agora tudo (menos `health`) exige JWT de operador, e o que mexe em
 *    credencial exige administrador. Mesmo padrão da instagram-proxy.
 *
 * 2. O CLIENT SECRET ESTAVA EM TEXTO NO CÓDIGO. Agora vem de
 *    mc_integrations.meta (client_key / client_secret), com os secrets de
 *    ambiente como reserva. É o que permite esta fonte finalmente morar no
 *    repositório — a anterior não podia ser commitada.
 *
 * DOIS AMBIENTES, DUAS LINHAS
 *   'tiktok'          — app de PRODUÇÃO. É o token que o coletor-pecas usa para
 *                       ler métricas. NÃO mexer: reconectar aqui derruba o
 *                       coletor.
 *   'tiktok_sandbox'  — app SANDBOX (FullPro Dev). É por onde publicamos
 *                       enquanto a produção está em análise. Chave e secret
 *                       próprios, conta alvo fullprobr.
 *   Separado de propósito, pelo mesmo motivo que 'youtube' e 'youtube_oauth':
 *   uma linha só faria reconectar um apagar o outro em silêncio.
 *
 * O access_token do TikTok dura 24h. Quem renova é getValidToken(), e ela só
 * roda quando alguém chama — o coletor NÃO passa por aqui. Por isso existe o
 * cron `tiktok-renovar` nos minutos 6 e 36, um minuto antes de cada rodada do
 * coletor. Se mudar o horário do coletor, mude o dele junto.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const VERSAO = 'tk3';
const TK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const TK_AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TK_API = 'https://open.tiktokapis.com/v2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tk-token',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const KEY_ENV = Deno.env.get('TK_CLIENT_KEY') ?? '';
const SECRET_ENV = Deno.env.get('TK_CLIENT_SECRET') ?? '';

let servicoCache: ReturnType<typeof createClient> | null = null;
function servico() {
  if (!servicoCache) servicoCache = createClient(SB_URL, SRK, { auth: { persistSession: false } });
  return servicoCache;
}

function resposta(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
function falha(erro: string, meta?: unknown, status = 200): Response {
  return resposta({ ok: false, erro, ...(meta ? { meta } : {}) }, status);
}

/* Mesma regra do painel: cargo sem acento, minúsculo, começando com "admin". */
function ehAdmin(op: { role?: string } | null): boolean {
  const r = (op?.role ?? '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  return r.startsWith('admin');
}

/* Dois passos, e os dois importam: getUser barra a chave publicável do
   config.js (que o gateway aceitaria como JWT), e mc_admin_users barra quem
   está logado mas não é operador. */
async function operadorOuNulo(req: Request): Promise<{ id: string; role: string } | null> {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!jwt || !SB_URL || !SRK) return null;
  try {
    const admin = servico();
    const { data: { user }, error } = await admin.auth.getUser(jwt);
    if (error || !user) return null;
    const { data: op } = await admin.from('mc_admin_users').select('id, role').eq('auth_uid', user.id).maybeSingle();
    return (op as { id: string; role: string } | null) ?? null;
  } catch { return null; }
}

type Linha = {
  access_token: string | null; refresh_token: string | null;
  expires_at: string | null; meta: Record<string, any>;
};

async function linhaDe(provider: string): Promise<Linha | null> {
  const { data } = await servico().from('mc_integrations')
    .select('access_token, refresh_token, expires_at, meta').eq('provider', provider).maybeSingle();
  if (!data) return null;
  return { access_token: data.access_token, refresh_token: data.refresh_token,
           expires_at: data.expires_at, meta: (data.meta ?? {}) as Record<string, any> };
}

/* Chave e secret do APP (não do usuário). Banco primeiro, secret de ambiente
   depois — a mesma ordem do integr-cred.md. */
function appDe(l: Linha | null): { key: string; secret: string } {
  return { key: String(l?.meta?.client_key ?? KEY_ENV ?? ''), secret: String(l?.meta?.client_secret ?? SECRET_ENV ?? '') };
}

async function tkRefresh(app: { key: string; secret: string }, refresh: string) {
  const r = await fetch(TK_TOKEN_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_key: app.key, client_secret: app.secret,
                                grant_type: 'refresh_token', refresh_token: refresh }),
  });
  return await r.json();
}

/* Devolve access token válido, renovando se estiver perto de vencer.
   GRAVA refresh_expires_in de propósito: é o número que responde, com duas ou
   três medições, se a rotação reinicia os 365 dias ou se o relógio original
   continua correndo — a doc do TikTok dá os dois sinais e não decide. */
async function tokenValido(provider: string): Promise<{ token: string | null; erro?: string }> {
  const l = await linhaDe(provider);
  if (!l?.access_token) return { token: null, erro: 'não conectado' };
  const exp = l.expires_at ? Date.parse(l.expires_at) : 0;
  if (exp && Date.now() < exp - 120_000) return { token: l.access_token };
  if (!l.refresh_token) return { token: l.access_token };

  const app = appDe(l);
  if (!app.key || !app.secret) return { token: l.access_token, erro: 'sem client_key/secret para renovar' };

  const d = await tkRefresh(app, l.refresh_token);
  if (!d?.access_token) return { token: l.access_token, erro: d?.error_description ?? d?.error ?? 'renovação recusada' };

  await servico().from('mc_integrations').update({
    access_token: d.access_token,
    refresh_token: d.refresh_token || l.refresh_token,
    expires_at: new Date(Date.now() + (Number(d.expires_in) || 86400) * 1000).toISOString(),
    meta: { ...l.meta, refresh_expires_in: d.refresh_expires_in ?? null, renovado_em: new Date().toISOString() },
    updated_at: new Date().toISOString(),
  }).eq('provider', provider);
  return { token: d.access_token };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const url = new URL(req.url);
  let corpo: Record<string, unknown> = {};
  try { corpo = await req.json(); } catch { /* GET ou vazio */ }
  const action = String(corpo.action ?? url.searchParams.get('action') ?? 'health');
  /* Qual app: 'tiktok' (produção, leitura) ou 'tiktok_sandbox' (publicação). */
  const provider = String(corpo.provider ?? url.searchParams.get('provider') ?? 'tiktok');
  if (provider !== 'tiktok' && provider !== 'tiktok_sandbox') return falha('ambiente inválido.');

  if (action === 'health') {
    const l = await linhaDe(provider);
    return resposta({ ok: true, versao: VERSAO, conectado: Boolean(l?.access_token), app_configurado: Boolean(appDe(l).key) });
  }

  /* Duas portas, como no coletor e no publicador: gente (JWT de operador) e
     máquina (token do cron, gerado pelo banco). O cron não tem JWT e precisa
     chamar `renovar` de 30 em 30 minutos para o token de 24h não morrer. */
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  let ehCron = false;
  if (bearer && action === 'renovar') {
    const { data } = await servico().from('mc_integrations')
      .select('access_token').eq('provider', 'cron_coletor').maybeSingle();
    ehCron = Boolean(data?.access_token) && bearer === data!.access_token;
  }

  const operador = ehCron ? null : await operadorOuNulo(req);
  if (!ehCron && !operador) {
    return falha('sessão de operador ausente ou inválida — entre de novo no painel', null, 401);
  }

  const SO_ADMIN = ['app_salvar', 'oauth_url', 'oauth_code', 'disconnect', 'token', 'refresh'];
  if (SO_ADMIN.indexOf(action) >= 0 && !ehAdmin(operador)) {
    return falha('só administrador pode trocar a conexão do TikTok.', null, 403);
  }

  try {
    if (action === 'status') {
      const l = await linhaDe(provider);
      const app = appDe(l);
      return resposta({ ok: true, connected: Boolean(l?.access_token), app_configurado: Boolean(app.key && app.secret),
                        expires_at: l?.expires_at ?? null, escopos: l?.meta?.escopos ?? null,
                        conta: l?.meta?.conta ?? null });
    }

    /* Guarda chave e secret do app. O secret nunca volta em resposta. */
    if (action === 'app_salvar') {
      const key = String(corpo.client_key ?? '').trim();
      const secret = String(corpo.client_secret ?? '').trim();
      if (!key || !secret) return falha('cole a client key e o client secret.');
      const l = await linhaDe(provider);
      const { error } = await servico().from('mc_integrations').upsert({
        provider,
        access_token: l?.access_token ?? null,
        refresh_token: l?.refresh_token ?? null,
        expires_at: l?.expires_at ?? null,
        meta: { ...(l?.meta ?? {}), client_key: key, client_secret: secret,
                salvo_por: operador!.id, salvo_em: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'provider' });
      if (error) return falha('não deu para gravar: ' + error.message);
      return resposta({ ok: true, app_configurado: true });
    }

    if (action === 'oauth_url') {
      const l = await linhaDe(provider);
      const app = appDe(l);
      if (!app.key) return falha('configure primeiro a client key e o secret.');
      const redirect = String(corpo.redirect_uri ?? '').trim();
      if (!/^https:\/\//.test(redirect)) return falha('redirect_uri inválido.');
      const estado = crypto.randomUUID();
      const u = new URL(TK_AUTH_URL);
      u.searchParams.set('client_key', app.key);
      u.searchParams.set('response_type', 'code');
      u.searchParams.set('scope', String(corpo.escopos ?? 'user.info.basic,user.info.stats,video.list,video.upload,video.publish'));
      u.searchParams.set('redirect_uri', redirect);
      u.searchParams.set('state', estado);
      return resposta({ ok: true, url: u.toString(), state: estado });
    }

    if (action === 'oauth_code' || action === 'token') {
      const l = await linhaDe(provider);
      const app = appDe(l);
      if (!app.key || !app.secret) return falha('configure primeiro a client key e o secret.');
      const code = String(corpo.code ?? '').trim();
      const redirect = String(corpo.redirect_uri ?? '').trim();
      if (!code || !redirect) return falha('faltou o código ou o endereço de retorno.');

      const r = await fetch(TK_TOKEN_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_key: app.key, client_secret: app.secret, code,
                                    grant_type: 'authorization_code', redirect_uri: redirect }),
      });
      const d = await r.json();
      if (!d?.access_token) return falha('o TikTok recusou: ' + (d?.error_description ?? d?.error ?? 'sem detalhe'), d ?? null);

      await servico().from('mc_integrations').upsert({
        provider,
        access_token: d.access_token,
        refresh_token: d.refresh_token ?? null,
        expires_at: new Date(Date.now() + (Number(d.expires_in) || 86400) * 1000).toISOString(),
        meta: { ...(l?.meta ?? {}), escopos: String(d.scope ?? '').split(',').filter(Boolean),
                open_id: d.open_id ?? null, refresh_expires_in: d.refresh_expires_in ?? null,
                autorizado_por: operador!.id, autorizado_em: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'provider' });
      return resposta({ ok: true, escopos: String(d.scope ?? '').split(',').filter(Boolean) });
    }

    /* Cutucada do cron: renova se estiver na hora e não devolve nada sensível. */
    if (action === 'renovar') {
      const r = await tokenValido(provider);
      return resposta({ ok: Boolean(r.token), renovado: !r.erro, erro: r.erro ?? null });
    }

    if (action === 'disconnect') {
      const l = await linhaDe(provider);
      /* Só a autorização cai; a chave do app fica, para reconectar sem colar
         tudo de novo. Apagar a linha inteira derrubaria o app junto. */
      const { error } = await servico().from('mc_integrations').update({
        access_token: null, refresh_token: null, expires_at: null,
        meta: { client_key: l?.meta?.client_key ?? null, client_secret: l?.meta?.client_secret ?? null },
        updated_at: new Date().toISOString(),
      }).eq('provider', provider);
      if (error) return falha('não deu para desconectar: ' + error.message);
      return resposta({ ok: true, connected: false });
    }

    /* ── leituras ── */
    const t = await tokenValido(provider);
    const cabecalho = req.headers.get('x-tk-token');
    /* O cabeçalho ganha do banco quando vem preenchido: é como o módulo de
       influenciadores lê a conta DE OUTRA PESSOA. Na versão anterior o banco
       ganhava sempre, e a "métrica do influenciador" era a nossa. */
    const acesso = (cabecalho && cabecalho !== 'null' && cabecalho !== 'undefined') ? cabecalho : t.token;
    if (!acesso) return falha('o TikTok não está conectado.', { erro_token: t.erro ?? null }, 401);

    if (action === 'videos') {
      const b = corpo as Record<string, any>;
      const r = await fetch(`${TK_API}/video/list/?fields=id,title,video_description,duration,cover_image_url,share_url,view_count,like_count,comment_count,share_count,create_time`, {
        method: 'POST', headers: { Authorization: `Bearer ${acesso}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cursor: b.cursor || 0, max_count: b.max_count || 20 }),
      });
      return resposta(await r.json());
    }
    if (action === 'video-query') {
      const ids = Array.isArray((corpo as any).video_ids) ? (corpo as any).video_ids : null;
      if (!ids) return falha('faltou a lista video_ids.');
      const r = await fetch(`${TK_API}/video/query/?fields=id,title,video_description,duration,cover_image_url,share_url,view_count,like_count,comment_count,share_count,create_time`, {
        method: 'POST', headers: { Authorization: `Bearer ${acesso}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: { video_ids: ids } }),
      });
      return resposta(await r.json());
    }
    if (action === 'user-info') {
      const r = await fetch(`${TK_API}/user/info/?fields=follower_count,following_count,likes_count,video_count`,
        { headers: { Authorization: `Bearer ${acesso}` } });
      return resposta(await r.json());
    }

    return falha(`ação desconhecida: ${action}`);
  } catch (e) {
    const erro = e instanceof Error ? e.message : 'falha inesperada';
    console.error('[tiktok-proxy]', action, erro);
    return falha(erro);
  }
});
