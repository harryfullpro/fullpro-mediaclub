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
 * Secrets (Project Settings → Edge Functions → Secrets):
 *   IG_ACCESS_TOKEN   Long-Lived User Token da Meta. Renove antes dos ~60 dias.
 * IG_USER_ID não é segredo (é um id numérico público) e segue no config.js.
 *
 * Ações — em ?action= ou no corpo {action}, porque o painel chama por
 * sb.functions.invoke(), que sempre manda POST com JSON:
 *   health                                  -> { ok, configurado: bool }
 *   contas                                  -> { ok, contas: [{id, nome, ig_id}] }
 *   midias    { ig_id, limit? }             -> { ok, midias: [...] }
 *   insights  { media_id, metric, ig_id }   -> { ok, valor: number }
 *   marcacoes { ig_id, limit? }             -> { ok, midias: [...] }
 *   mencoes   { ig_id, limit? }             -> { ok, midias: [...] }
 *   descoberta{ ig_user_id, handle, inner } -> { ok, midias: [...] }
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

const TOKEN = Deno.env.get('IG_ACCESS_TOKEN') ?? '';

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

  const r = await fetch(url.toString());
  const j = await r.json().catch(() => ({}));
  if (j?.error) {
    throw new Error(j.error.message ?? 'erro da Meta', { cause: j.error.code ?? null });
  }
  return j;
}

/* Cache do token de página. Vive só na memória da instância: some quando a
   função esfria, e aí é resolvido de novo. Nunca sai daqui. */
let pageTokenCache: { ig_id: string; token: string } | null = null;

async function tokenDaPagina(igId: string): Promise<string> {
  if (pageTokenCache?.ig_id === igId) return pageTokenCache.token;

  const j = await graph('me/accounts', {
    fields: 'id,name,access_token,instagram_business_account',
  }, TOKEN);

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

  /* health não expõe nada além de "tem token configurado?" e é o que o painel usa
     para desenhar o estado da tela — fica aberto de propósito. */
  if (action === 'health') {
    return resposta({ ok: true, configurado: TOKEN.length > 0 });
  }

  const operador = await operadorOuNulo(req);
  if (!operador) {
    return falha('sessão de operador ausente ou inválida — entre de novo no painel', null, 401);
  }

  if (!TOKEN) {
    return falha('IG_ACCESS_TOKEN não está configurado nas secrets desta função.');
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
        const token = await tokenDaPagina(igId);

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

        const token = await tokenDaPagina(igId);
        const j = await graph(`${mediaId}/insights`, { metric }, token);

        const primeiro = j?.data?.[0];
        const valor = primeiro?.values?.[0]?.value ?? primeiro?.total_value?.value ?? 0;
        return resposta({ ok: true, valor });
      }

      /* business_discovery lê contas de terceiros (influenciadores) e usa o
         token de USUÁRIO, não o de página. */
      case 'descoberta': {
        const igUserId = String(corpo.ig_user_id ?? '');
        const handle = String(corpo.handle ?? '');
        if (!igUserId || !handle) return falha('ig_user_id e handle são obrigatórios.');

        const inner = String(
          corpo.inner ?? 'media.limit(50){like_count,comments_count,media_type,timestamp,caption}',
        );
        const j = await graph(igUserId, {
          fields: `business_discovery.username(${handle}){${inner}}`,
        }, TOKEN);

        return resposta({ ok: true, midias: j?.business_discovery?.media?.data ?? [] });
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
