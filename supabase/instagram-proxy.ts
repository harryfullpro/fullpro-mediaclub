/**
 * instagram-proxy — ponte entre o painel e a Graph API do Instagram.
 *
 * Por que existe: o IG_ACCESS_TOKEN vivia no config.js, que é servido em
 * https://mediaclub.fullpro.com.br/config.js e está commitado num repositório
 * PÚBLICO. Token da Meta é credencial de portador: quem tem, age como a conta,
 * sem senha, até expirar. Bots varrem o GitHub atrás de `EAA…` o dia inteiro.
 *
 * Havia um segundo vazamento, mais sutil: o painel chamava `me/accounts`, recebia
 * o `access_token` DE PÁGINA de volta e usava esse token direto do navegador para
 * mídias e insights. Ou seja, mesmo escondendo o token de usuário, o de página
 * continuaria exposto. Aqui o token de página é resolvido no servidor, guardado
 * em memória entre invocações quentes, e REMOVIDO de qualquer resposta.
 *
 * DE ONDE VEM O TOKEN (28/08/2026)
 *   1. mc_integrations, provider 'instagram' — é o que o painel grava quando um
 *      administrador reconecta em Integrações. RLS ligada e sem policy: só a
 *      service role enxerga.
 *   2. Secret IG_ACCESS_TOKEN — reserva, mantém de pé o que já funcionava antes
 *      da primeira reconexão pelo painel.
 * Nessa ordem, nunca o config.js. Ver supabase/integr-cred.md.
 *
 * O token da Meta expira em ~60 dias e é o coletor-pecas que segura a meta de
 * stories, que não dá para recuperar depois (story vive 24h). Reconexão que
 * depende de lembrar a senha do Supabase é reconexão que não acontece — daí a
 * tabela, e daí as ações 'status', 'salvar' e 'desconectar' aqui embaixo.
 * IG_USER_ID não é segredo (é um id numérico público) e segue no config.js.
 *
 * Ações — em ?action= ou no corpo {action}, porque o painel chama por
 * sb.functions.invoke(), que sempre manda POST com JSON:
 *   health                                  -> { ok, configurado: bool }   [aberta]
 *   status                                  -> { ok, conectado, origem, conta, ... }
 *   verificar                               -> idem, mas confere na Meta agora
 *   salvar    { token }                     -> { ok, ... }   [só administrador]
 *   desconectar                             -> { ok, ... }   [só administrador]
 *   contas                                  -> { ok, contas: [{id, nome, ig_id}] }
 *   midias    { ig_id, limit? }             -> { ok, midias: [...] }
 *   insights  { media_id, metric, ig_id }   -> { ok, valor: number }
 *   marcacoes { ig_id, limit? }             -> { ok, midias: [...] }
 *   mencoes   { ig_id, limit? }             -> { ok, midias: [...] }
 *   descoberta{ ig_user_id, handle, inner } -> { ok, midias: [...], perfil }
 *
 * TODA resposta traz `ok`. Em falha vem { ok: false, erro } com a frase já em
 * português; quando o "não" veio da Meta, `meta` traz o código cru para achar o
 * problema no log.
 *
 * QUEM PODE CHAMAR
 * `verify_jwt` sozinho NÃO protege: a chave publicável do config.js é aceita como
 * credencial válida, então qualquer pessoa passaria. É a mesma armadilha que o
 * comentário da magis5-proxy descreve. Por isso ele fica DESLIGADO aqui e a
 * checagem é feita no corpo da função, que sabe distinguir os casos.
 *
 * A magis5-proxy resolve exigindo o UUID de fp_session. Aqui é diferente, de
 * propósito: aquele UUID é permanente, não expira, mora no localStorage e ficou
 * legível sem login enquanto mc_admin_users tinha política aberta — quem coletou
 * na época continua com ele. Como o painel hoje autentica de verdade pelo
 * Supabase Auth (ver mc-login), dá para exigir o JWT do usuário e conferir se ele
 * é operador. Credencial que expira e rotaciona, em vez de um id eterno.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const BASE = 'https://graph.facebook.com/v21.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TOKEN_ENV = Deno.env.get('IG_ACCESS_TOKEN') ?? '';
const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

let servicoCache: ReturnType<typeof createClient> | null = null;
function servico() {
  if (!servicoCache) servicoCache = createClient(SB_URL, SRK, { auth: { persistSession: false } });
  return servicoCache;
}

type Cred = {
  token: string;
  origem: 'painel' | 'secret' | 'nenhuma';
  meta: Record<string, unknown>;
  expira: string | null;
  atualizado: string | null;
  em: number;
};

/* Banco primeiro, secret depois. O cache de 60s existe porque uma chamada de
   métricas do painel vira várias invocações seguidas — não faz sentido bater na
   tabela em cada uma. Salvar e desconectar zeram o cache na hora. */
let credCache: Cred | null = null;
async function credencial(): Promise<Cred> {
  if (credCache && Date.now() - credCache.em < 60_000) return credCache;

  let linha: Record<string, any> | null = null;
  try {
    const { data } = await servico()
      .from('mc_integrations')
      .select('access_token, expires_at, meta, updated_at')
      .eq('provider', 'instagram')
      .maybeSingle();
    linha = data ?? null;
  } catch (e) {
    /* Banco fora do ar não pode derrubar o que a secret já resolvia. */
    console.error('[instagram-proxy] leitura de mc_integrations falhou', e instanceof Error ? e.message : e);
  }

  credCache = linha?.access_token
    ? { token: linha.access_token, origem: 'painel', meta: linha.meta ?? {},
        expira: linha.expires_at ?? null, atualizado: linha.updated_at ?? null, em: Date.now() }
    : { token: TOKEN_ENV, origem: TOKEN_ENV ? 'secret' : 'nenhuma', meta: {},
        expira: null, atualizado: null, em: Date.now() };
  return credCache;
}

/* Quem é a conta, quando o token não veio do painel (veio da secret) e por
   isso não há nada gravado sobre ela. Uma chamada por instância quente. */
let contaCache: { ig_id: string; conta: string | null; pagina: string | null } | null = null;
async function descobrirConta(token: string, forcar = false) {
  if (contaCache && !forcar) return contaCache;
  const j = await graph('me/accounts', {
    fields: 'id,name,instagram_business_account{id,username}',
  }, token);
  const p = (j?.data ?? []).find((x: Record<string, any>) => x?.instagram_business_account?.id);
  if (!p) throw new Error('nenhuma página com conta profissional do Instagram ligada a este token');
  contaCache = {
    ig_id: p.instagram_business_account.id,
    conta: p.instagram_business_account.username ?? null,
    pagina: p.name ?? null,
  };
  return contaCache;
}

/* O que a tela pode ver. NUNCA o token — nem inteiro, nem em prefixo.
   `vivo` força uma ida à Meta: é o que separa "tem credencial guardada" de
   "a credencial ainda vale", que era a mentira da tela antiga. */
async function estado(vivo = false) {
  const c = await credencial();
  const m = c.meta as Record<string, any>;
  const base = {
    conectado: c.token.length > 0,
    origem: c.origem,
    conta: m.ig_username ?? null,
    pagina: m.pagina_nome ?? null,
    ig_id: m.ig_id ?? null,
    expira_em: c.expira,
    atualizado_em: c.atualizado,
    vale: null as boolean | null,
    erro_conta: null as string | null,
  };
  if (!c.token) return base;

  /* Sem ig_id gravado (token vindo da secret) o painel não consegue pedir
     mídias. Descobrir aqui evita uma segunda ação só para isso. */
  if (!base.ig_id || vivo) {
    try {
      const d = await descobrirConta(c.token, vivo);
      base.ig_id = d.ig_id;
      base.conta = base.conta ?? d.conta;
      base.pagina = base.pagina ?? d.pagina;
      base.vale = true;
    } catch (e) {
      base.vale = false;
      base.erro_conta = e instanceof Error ? e.message : 'a Meta não respondeu';
    }
  }
  return base;
}

/* Mesma regra do painel (isUserAdmin): cargo sem acento, em minúsculas,
   começando com "admin". "Assistente Admin." não passa, e é proposital. */
function ehAdmin(op: { role?: string } | null): boolean {
  const r = (op?.role ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return r.startsWith('admin');
}

function resposta(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function falha(erro: string, meta?: unknown, status = 200): Response {
  return resposta({ ok: false, erro, ...(meta ? { meta } : {}) }, status);
}

/* A Graph API responde 200 com {error:{...}} em vários casos. Nada aqui decide
   sucesso pelo status HTTP — quem manda é a ausência de `error` no corpo. */
async function graph(caminho: string, params: Record<string, string>, token: string) {
  const url = new URL(`${BASE}/${caminho}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('access_token', token);

  /* O token vai na query string, que é como a Graph exige. Se o PRÓPRIO fetch
     falhar (DNS, TLS, timeout, reset), o Deno lança um TypeError cuja mensagem
     inclui a URL inteira — com access_token= dentro. Essa mensagem acabaria no
     log da função. Por isso o erro de rede é reescrito aqui, sem a URL.
     E é justo no 'salvar' que isso mais importa: validar credencial recém-colada
     é a chamada com maior chance de dar erro. */
  let r: Response;
  try {
    r = await fetch(url.toString());
  } catch (e) {
    throw new Error('não deu para falar com a Meta (' + (e instanceof Error ? e.name : 'falha de rede') + ')');
  }
  const j = await r.json().catch(() => ({}));
  if (j?.error) {
    throw new Error(j.error.message ?? 'erro da Meta', { cause: j.error.code ?? null });
  }
  return j;
}

/* Cache do token de página. Vive só na memória da instância: some quando a
   função esfria, e aí é resolvido de novo. Nunca sai daqui. */
let pageTokenCache: { ig_id: string; token: string } | null = null;

async function tokenDaPagina(igId: string, usuario: string): Promise<string> {
  if (pageTokenCache?.ig_id === igId) return pageTokenCache.token;

  const j = await graph('me/accounts', {
    fields: 'id,name,access_token,instagram_business_account',
  }, usuario);

  for (const pagina of j?.data ?? []) {
    if (pagina?.instagram_business_account?.id === igId && pagina?.access_token) {
      pageTokenCache = { ig_id: igId, token: pagina.access_token };
      return pagina.access_token;
    }
  }
  throw new Error(`nenhuma página vinculada à conta ${igId}`);
}

/* Confere se quem chamou é operador de verdade.
   Dois passos, e os dois importam:
     1. auth.getUser(jwt) — devolve null se o "token" for a chave publicável, um
        JWT expirado ou lixo. É aqui que a chave pública é barrada.
     2. mc_admin_users.auth_uid — estar logado não basta; tem que ser operador.
   A consulta usa a service role porque a política de mc_admin_users, desde
   28/08/2026, só deixa operador ler a própria tabela. */
async function operadorOuNulo(req: Request): Promise<{ id: string; role: string } | null> {
  const cabecalho = req.headers.get('Authorization') ?? '';
  const jwt = cabecalho.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return null;

  const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!SB_URL || !SRK) return null;

  try {
    const admin = createClient(SB_URL, SRK, { auth: { persistSession: false } });

    const { data: { user }, error } = await admin.auth.getUser(jwt);
    if (error || !user) return null;

    const { data: op } = await admin
      .from('mc_admin_users')
      .select('id, role')
      .eq('auth_uid', user.id)
      .maybeSingle();

    return op ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  let corpo: Record<string, unknown> = {};
  try { corpo = await req.json(); } catch { /* GET / corpo vazio */ }

  const url = new URL(req.url);
  const action = String(corpo.action ?? url.searchParams.get('action') ?? 'health');

  /* health não expõe nada além de "tem token configurado?" — fica aberto de
     propósito, é o que responde antes de haver sessão. */
  if (action === 'health') {
    /* `versao` é o que deixa conferir, de fora e sem sessão, QUAL código está
       no ar. Sem isso, depois de um deploy só dá para acreditar. */
    return resposta({ ok: true, versao: 'ig5', configurado: (await credencial()).token.length > 0 });
  }

  const operador = await operadorOuNulo(req);
  if (!operador) {
    return falha('sessão de operador ausente ou inválida — entre de novo no painel', null, 401);
  }

  /* status vem antes da exigência de token: a tela de Integrações precisa
     justamente do caso "não tem token" para desenhar o botão de conectar. */
  if (action === 'status' || action === 'verificar') {
    return resposta({ ok: true, ...(await estado(action === 'verificar')) });
  }

  if (action === 'salvar' || action === 'desconectar') {
    if (!ehAdmin(operador)) {
      return falha('só administrador pode trocar a conexão do Instagram.', null, 403);
    }
  }

  if (action === 'salvar') {
    const token = String(corpo.token ?? '').trim();
    if (!token) return falha('cole o token antes de salvar.');

    /* Valida ANTES de gravar. Token errado colado por engano não pode derrubar
       o que já estava funcionando — a linha só é escrita se a Meta aceitar. */
    let contas: Record<string, any>;
    try {
      contas = await graph('me/accounts', {
        fields: 'id,name,instagram_business_account{id,username}',
      }, token);
    } catch (e) {
      const erro = e instanceof Error ? e.message : 'token recusado';
      return falha('a Meta recusou esse token: ' + erro, e instanceof Error ? e.cause : null);
    }

    const pagina = (contas?.data ?? []).find((p: Record<string, any>) => p?.instagram_business_account?.id);
    if (!pagina) {
      return falha('o token vale, mas nenhuma página ligada a ele tem conta profissional do Instagram. '
        + 'Gere o token com a página da FullPro selecionada.');
    }

    /* Quando expira. Não impede de salvar se a Meta não responder: o token
       serve hoje, que é o que a validação acima provou. */
    let expira: string | null = null;
    let escopos: string[] = [];
    try {
      const d = await graph('debug_token', { input_token: token }, token);
      const dd = d?.data ?? {};
      if (dd.expires_at) expira = new Date(dd.expires_at * 1000).toISOString();
      if (Array.isArray(dd.scopes)) escopos = dd.scopes;
    } catch { /* validade desconhecida não é motivo para recusar */ }

    const igc = pagina.instagram_business_account;
    const { error } = await servico().from('mc_integrations').upsert({
      provider: 'instagram',
      access_token: token,
      refresh_token: null,
      expires_at: expira,
      meta: {
        ig_id: igc.id,
        ig_username: igc.username ?? null,
        pagina_id: pagina.id,
        pagina_nome: pagina.name ?? null,
        escopos,
        salvo_por: operador.id,
        salvo_em: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'provider' });

    if (error) return falha('não deu para gravar a conexão: ' + error.message);

    credCache = null;
    contaCache = null;
    pageTokenCache = null;   /* o token de página velho é de outro usuário */
    return resposta({ ok: true, ...(await estado()) });
  }

  if (action === 'desconectar') {
    const { error } = await servico().from('mc_integrations').delete().eq('provider', 'instagram');
    if (error) return falha('não deu para desconectar: ' + error.message);
    credCache = null;
    contaCache = null;
    pageTokenCache = null;
    return resposta({ ok: true, ...(await estado()) });
  }

  const cred = await credencial();
  const TOKEN = cred.token;
  if (!TOKEN) {
    return falha('o Instagram não está conectado. Um administrador conecta em Integrações.');
  }

  try {
    switch (action) {
      /* Só id, nome e o id da conta IG. O access_token de cada página é
         deliberadamente descartado — é o vazamento que esta função fecha. */
      case 'contas': {
        const j = await graph('me/accounts', {
          fields: 'id,name,access_token,instagram_business_account',
        }, TOKEN);
        const contas = (j?.data ?? []).map((p: Record<string, any>) => ({
          id: p.id,
          nome: p.name,
          ig_id: p.instagram_business_account?.id ?? null,
        }));
        return resposta({ ok: true, contas });
      }

      case 'midias':
      case 'marcacoes':
      case 'mencoes': {
        const igId = String(corpo.ig_id ?? '');
        if (!igId) return falha('ig_id é obrigatório.');

        const limite = String(corpo.limit ?? 50);
        const token = await tokenDaPagina(igId, TOKEN);

        const borda = action === 'midias' ? 'media'
                    : action === 'marcacoes' ? 'recently_tagged_media'
                    : 'mentioned_media';

        /* thumbnail_url/media_url só existem na borda `media`; pedir nas outras
           faz a Meta recusar a chamada inteira. */
        const campos = action === 'midias'
          ? 'id,shortcode,permalink,like_count,comments_count,media_type,thumbnail_url,media_url'
          : 'id,shortcode,permalink,like_count,comments_count';

        const j = await graph(`${igId}/${borda}`, { fields: campos, limit: limite }, token);
        return resposta({ ok: true, midias: j?.data ?? [] });
      }

      case 'insights': {
        const mediaId = String(corpo.media_id ?? '');
        const metric = String(corpo.metric ?? 'reach');
        const igId = String(corpo.ig_id ?? '');
        if (!mediaId) return falha('media_id é obrigatório.');
        if (!igId) return falha('ig_id é obrigatório (define o token de página).');

        const token = await tokenDaPagina(igId, TOKEN);
        const j = await graph(`${mediaId}/insights`, { metric }, token);

        const primeiro = j?.data?.[0];
        const valor = primeiro?.values?.[0]?.value ?? primeiro?.total_value?.value ?? 0;
        return resposta({ ok: true, valor });
      }

      /* business_discovery lê contas de terceiros (influenciadores) e usa o
         token de USUÁRIO, não o de página. */
      case 'descoberta': {
        /* O id é o da NOSSA conta business — é ela que faz a descoberta. Se o
           painel não mandar, usa o que ficou gravado ao conectar: com isso o
           navegador não precisa mais carregar IG_USER_ID do config.js. */
        const igUserId = String(corpo.ig_user_id ?? (cred.meta as Record<string, any>).ig_id ?? '');
        const handle = String(corpo.handle ?? '');
        if (!igUserId) return falha('sem id da conta do Instagram — reconecte em Integrações.');
        if (!handle) return falha('handle é obrigatório.');

        const inner = String(
          corpo.inner ?? 'media.limit(50){like_count,comments_count,media_type,timestamp,caption}',
        );
        const j = await graph(igUserId, {
          fields: `business_discovery.username(${handle}){${inner}}`,
        }, TOKEN);

        /* `perfil` junto das mídias: o Influencer Hub precisa de
           followers_count e media_count para calcular engajamento e classificar
           a conta em nano/micro/macro. Devolver só as mídias, como era, deixaria
           metade daquela tela sem dado. */
        const bd = j?.business_discovery ?? null;
        return resposta({ ok: true, midias: bd?.media?.data ?? [], perfil: bd });
      }

      default:
        return falha(`ação desconhecida: ${action}`);
    }
  } catch (e) {
    const erro = e instanceof Error ? e.message : 'falha inesperada';
    const meta = e instanceof Error ? e.cause : null;
    console.error('[instagram-proxy]', action, erro, meta);
    return falha(erro, meta);
  }
});
