/**
 * publicar — o braço que efetivamente POSTA nas redes, para o planner.
 *
 * Ele é o par do `coletor-pecas`: o coletor lê o que já foi publicado, este
 * escreve. Fica separado de propósito — o coletor roda de hora em hora e pode
 * falhar sem consequência (tenta de novo na próxima); aqui uma falha mal
 * tratada publica DUAS VEZES no perfil da FullPro, na frente do público, e o
 * operador leva a culpa. Por isso quase todo o código abaixo é sobre não
 * repetir, não sobre postar.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O QUE PUBLICA DE VERDADE HOJE
 *
 *   instagram  → SIM, implementado (container → polling → media_publish).
 *   facebook   → não. Conector honesto: mede quais permissões faltam e diz.
 *   tiktok     → não. Falta a auditoria do Content Posting API.
 *   youtube    → não. A credencial guardada é CHAVE DE API, que não sobe vídeo.
 *
 * As três que não publicam NÃO fingem sucesso: marcam o destino como `erro`
 * com a frase do que falta. Isso é decisão de projeto — destino "pendente para
 * sempre" some da tela e vira surpresa; destino em erro com motivo aparece.
 *
 * ⚠ MEDIDO EM 01/09/2026, ANTES DE ESCREVER UMA LINHA: o token do Instagram
 * guardado em mc_integrations tem os escopos
 *   pages_show_list, business_management, instagram_basic,
 *   instagram_manage_insights, pages_read_engagement, public_profile
 * — ou seja, NÃO tem `instagram_content_publish`. Enquanto o dono não refizer
 * o OAuth acrescentando essa permissão, o Instagram também não publica, e esta
 * função diz isso na cara (checagem de escopo ANTES de tentar), em vez de
 * devolver o erro 200 opaco da Meta. Ver `escoposDoToken()`.
 * O caminho está pronto: no minuto em que o escopo aparecer, funciona.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AÇÕES  (em ?action= ou no corpo {action}, porque o painel chama por
 *         sb.functions.invoke(), que sempre manda POST com JSON)
 *
 *   health                        -> { ok, versao, redes: {...} }        [aberta]
 *   publicar  { publicacao_id }   -> processa TODOS os destinos da linha
 *   agora     { publicacao_id }   -> idem, ignorando `agendado_para`
 *   agora     { redes, tipo, ... }-> cria a linha e publica na hora (avulso)
 *   status    { publicacao_id }   -> estado de cada destino, em português
 *   fila                          -> processa o que venceu   [chamada do cron]
 *
 * Toda resposta traz `ok`. Em falha vem { ok:false, erro } com a frase já em
 * português e, quando o "não" veio da plataforma, `meta` com o erro cru
 * (código, subcódigo, fbtrace_id) — que é o que o suporte da Meta pede e o que
 * permite reconstituir a falha sem repetir a publicação.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUEM PODE CHAMAR — mesma trinca do coletor-pecas, pelo mesmo motivo
 *
 *   1. service role  — máquina, para quem tem a chave do projeto.
 *   2. token do cron — linha `cron_publicador` em mc_integrations. É bem menos
 *      poder que a service role key, que é o que estaria no comando do pg_cron
 *      se eu tivesse ido pelo caminho fácil. Trocar é um UPDATE de uma linha.
 *   3. JWT de operador — o botão "Publicar agora" do painel. Estar logado não
 *      basta: tem que estar em mc_admin_users.
 *
 * `verify_jwt` fica DESLIGADO no gateway de propósito: (a) o token do cron não
 * é JWT e seria recusado antes de chegar aqui, e (b) a chave publicável do
 * config.js é aceita como JWT válido pelo gateway — verify_jwt sozinho deixaria
 * qualquer pessoa da internet postar no perfil da FullPro. Quem separa é o
 * bloco `quemChamou()`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AS QUATRO REGRAS QUE SUSTENTAM O RESTO
 *
 * 1. O CONTAINER SÓ NASCE NA HORA DE PUBLICAR. O container do Instagram expira
 *    em 24h ("The container was not published within 24 hours and has expired."
 *    https://developers.facebook.com/docs/instagram-platform/content-publishing/).
 *    Criar no agendamento e publicar depois é a receita para o post de segunda
 *    morrer calado. Agendar aqui grava LINHA NO BANCO, nada mais.
 *
 * 2. CADA DESTINO É INDEPENDENTE. Uma linha por rede em mc_publicacoes_destino,
 *    com status, tentativas e erro próprios. TikTok travado não pode impedir o
 *    Instagram. "Publicar simultaneamente" é da interface e do nosso relógio —
 *    nenhuma API faz cross-network; por baixo é um upload por rede.
 *
 * 3. IDEMPOTÊNCIA. Destino com `id_externo` preenchido NUNCA é republicado, em
 *    nenhum caminho, nem com o operador clicando de novo. E a tomada do destino
 *    é um compare-and-set no Postgres (UPDATE ... WHERE status = <o que eu li>),
 *    então duas rodadas do cron sobrepostas não postam duas vezes.
 *
 * 4. NADA DE RETENTATIVA CEGA. Falha DEPOIS do upload pode ter publicado. Um
 *    destino preso em `enviando` sem container para retomar vira `erro` pedindo
 *    conferência humana — não sai postando de novo para "resolver".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTRATO DO INSTAGRAM (doc oficial, conferida em 01/09/2026)
 *
 *   POST /{ig-id}/media           cria o container
 *   GET  /{container-id}?fields=status_code   → EXPIRED | ERROR | FINISHED |
 *                                                IN_PROGRESS | PUBLISHED
 *   POST /{ig-id}/media_publish   com creation_id — "The ID of the IG Container
 *                                 to be published."
 *   https://developers.facebook.com/docs/instagram-platform/content-publishing/
 *   https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media/
 *   https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media_publish/
 *
 *   media_type, verbatim: "Indicates container is for a carousel, story or
 *   reel. Value can be: CAROUSEL, REELS, STORIES". Foto simples de feed vai SEM
 *   media_type (é o default IMAGE).
 *
 *   image_url, verbatim: "Path to the image. We cURL the image using the URL
 *   that you specify so the image must be on a public server." — daí a URL
 *   assinada do Storage: a Meta busca o arquivo do servidor dela, então não
 *   adianta mandar bytes nem caminho interno.
 *
 *   "JPEG is the only image format supported" — PNG/WebP são recusados. Esta
 *   função barra antes de gastar a chamada.
 *
 *   "Carousels are limited to 10 images, videos, or a mix of the two."
 *
 *   COTA — a doc se contradiz e as duas páginas são oficiais: o guia diz
 *   "Instagram accounts are limited to 100 API-published posts within a 24-hour
 *   moving period" e a referência de media_publish diz "An Instagram
 *   professional account can only publish 50 posts within a 24 hour moving
 *   period". Não cravo nenhum dos dois: leio
 *   GET /{ig-id}/content_publishing_limit?fields=config,quota_usage
 *   e uso o número que a própria conta devolve. Se essa leitura falhar, sigo
 *   em frente — cota desconhecida não é motivo para não publicar.
 *
 *   O Instagram NÃO agenda nativamente (só Página do Facebook tem
 *   scheduled_publish_time). Quem segura o horário é o pg_cron + a ação `fila`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O QUE FALTA NAS OUTRAS TRÊS (levantado na fase anterior, com a doc)
 *
 *   FACEBOOK — falta só permissão. Adicionar `pages_show_list`,
 *   `pages_read_engagement` e `pages_manage_posts` ao app e refazer o OAuth
 *   JUNTO com o `instagram_content_publish` (é o mesmo diálogo, o mesmo User
 *   Token; pedir em duas rodadas custa duas rederivações de Page token).
 *   Sem App Review, porque Standard Access basta para quem tem papel no app
 *   (https://developers.facebook.com/docs/graph-api/overview/access-levels/).
 *   Quando entrar, o caminho é POST /{page-id}/videos com `file_url` (feed) ou
 *   /{page-id}/video_reels em 3 fases (Reels), sempre em graph.facebook.com —
 *   `graph-video.facebook.com` foi descontinuado
 *   (https://developers.facebook.com/docs/video-api/overview/).
 *   É a primeira que fica de pé; o conector abaixo já mede o que falta.
 *
 *   TIKTOK — auditoria. Direct Post em conta pública volta HTTP 403
 *   `unaudited_client_can_only_post_to_private_accounts`: "Unaudited clients can
 *   only post to a private account. The publish attempt will be blocked when
 *   calling /publish/video/init/."
 *   (https://developers.tiktok.com/doc/content-posting-api-reference-direct-post/)
 *   Some o access_token em 24h e o refresh_token PODE ROTACIONAR a cada refresh
 *   (https://developers.tiktok.com/doc/oauth-user-access-token-management).
 *   Não agenda nativamente: não há campo de horário futuro em post_info.
 *
 *   YOUTUBE — a linha `youtube` de mc_integrations guarda uma CHAVE DE API
 *   (39 caracteres), que serve para LER. Subir vídeo exige OAuth com escopo
 *   youtube.upload (https://developers.google.com/youtube/v3/docs/videos/insert)
 *   e, sem a auditoria do projeto, todo upload fica travado em privado sem
 *   recurso (https://support.google.com/youtube/answer/7300965).
 *   Agenda nativamente com privacyStatus=private + publishAt, mas só depois da
 *   auditoria (https://developers.google.com/youtube/v3/docs/videos).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DUAS FALTAS DE ESQUEMA QUE EU CONTORNEI (e que valem uma migração)
 *
 *   a) mc_publicacoes_destino não tem coluna `meta jsonb`. O erro cru da
 *      plataforma e o id do container em processamento não têm onde morar. O
 *      código já ESCREVE em `meta` e cai para o modo sem-coluna sozinho quando
 *      o Postgres reclama (42703 / PGRST204) — no dia em que a coluna existir,
 *      passa a gravar sem trocar uma linha aqui. Enquanto não existe, o
 *      container em voo fica marcado em `erro` como `[container:123…]`, que é
 *      feio e é de propósito: assim dá para retomar depois de um timeout.
 *      Sugestão: ALTER TABLE mc_publicacoes_destino ADD COLUMN meta jsonb NOT NULL DEFAULT '{}'::jsonb;
 *
 *   b) mc_publicacoes guarda UMA mídia (midia_caminho/midia_url). Carrossel
 *      precisa de até 10. Aqui aceito lista por JSON, vírgula ou quebra de
 *      linha no mesmo campo, e `midias[]` no corpo do `agora`. Funciona, mas o
 *      certo é uma tabela mc_publicacoes_midia (ordem, caminho, mime).
 *
 * Secrets usados: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (já existem) e
 * IG_ACCESS_TOKEN (reserva, opcional). Nenhuma credencial sai daqui: nem em
 * resposta, nem em log, nem em mensagem de erro de rede.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const VERSAO = 'pub7';
const GRAPH = 'https://graph.facebook.com/v21.0';
const BUCKET = 'publicacoes';

/* Quanto tempo a invocação se dá para esperar o Instagram processar o vídeo.
   O teto do Deno é 150s (free) / 400s (pago); fico bem abaixo para sobrar
   margem de escrita no banco. Estourou o prazo? O container fica anotado e a
   próxima rodada do cron retoma — não vira erro. */
const TETO_MS = Number(Deno.env.get('PUBLICAR_TETO_MS') ?? 100_000);
const INTERVALO_POLL_MS = 3_000;
const VALIDADE_URL_S = 2 * 60 * 60;   /* a Meta baixa na hora; 2h é folga pura */
const MAX_CARROSSEL = 10;             /* limite documentado */
const MAX_TENTATIVAS_FILA = 3;        /* automático desiste; humano ainda pode */
const RETOMAR_APOS_MS = 90_000;       /* 'enviando' parado além disso = retomar */
const DESISTIR_APOS_MS = 30 * 60_000; /* 'enviando' sem container = conferir */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const IG_TOKEN_ENV = Deno.env.get('IG_ACCESS_TOKEN') ?? '';

let servicoCache: ReturnType<typeof createClient> | null = null;
function servico() {
  if (!servicoCache) servicoCache = createClient(SB_URL, SRK, { auth: { persistSession: false } });
  return servicoCache;
}

/* ────────────────────────────── utilidades ────────────────────────────── */

function resposta(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function falha(erro: string, meta?: unknown, status = 200): Response {
  return resposta({ ok: false, erro, ...(meta ? { meta } : {}) }, status);
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const agoraISO = () => new Date().toISOString();

/* Erro que carrega o cru da plataforma em `cause`, para virar `meta` na
   resposta. Nunca coloque token, URL assinada ou header aqui dentro. */
function erroDeRede(nome: string): Error {
  return new Error(`não deu para falar com a rede (${nome})`);
}

function semAcento(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/* Últimos 6 caracteres, para log. Serve para casar duas linhas de log sem
   escrever id inteiro de container em lugar nenhum. */
const rabo = (s: string | null | undefined) => (s ? '…' + String(s).slice(-6) : '—');

/* ─────────────────────────── credencial por rede ──────────────────────── */

type Cred = {
  token: string;
  refresh: string | null;
  origem: 'painel' | 'secret' | 'nenhuma';
  meta: Record<string, unknown>;
  expira: string | null;
  em: number;
};

const credCache = new Map<string, Cred>();

/* Banco primeiro, secret depois — a ordem do integr-cred.md. Cache de 60s
   porque uma publicação com 4 destinos bate aqui 4 vezes. */
async function credencial(provider: string, reserva = ''): Promise<Cred> {
  const guardado = credCache.get(provider);
  if (guardado && Date.now() - guardado.em < 60_000) return guardado;

  let linha: Record<string, any> | null = null;
  try {
    const { data } = await servico()
      .from('mc_integrations')
      .select('access_token, refresh_token, expires_at, meta')
      .eq('provider', provider)
      .maybeSingle();
    linha = data ?? null;
  } catch (e) {
    console.error('[publicar] leitura de mc_integrations falhou', provider, e instanceof Error ? e.message : e);
  }

  const c: Cred = linha?.access_token
    ? {
        token: linha.access_token, refresh: linha.refresh_token ?? null, origem: 'painel',
        meta: linha.meta ?? {}, expira: linha.expires_at ?? null, em: Date.now(),
      }
    : {
        token: reserva, refresh: null, origem: reserva ? 'secret' : 'nenhuma',
        meta: {}, expira: null, em: Date.now(),
      };
  credCache.set(provider, c);
  return c;
}

/* ────────────────────────────── Graph API ─────────────────────────────── */

/* A Graph responde 200 com {error:{...}} em muitos casos. Nada aqui decide
   sucesso pelo status HTTP: quem manda é a ausência de `error` no corpo. */
async function graph(caminho: string, params: Record<string, string>, token: string) {
  const url = new URL(`${GRAPH}/${caminho}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('access_token', token);

  let r: Response;
  try {
    r = await fetch(url.toString());
  } catch (e) {
    /* O TypeError do Deno traz a URL INTEIRA na mensagem — com access_token
       dentro — e isso acabaria no log da função. Por isso é reescrito. */
    throw erroDeRede(e instanceof Error ? e.name : 'falha de rede');
  }
  const j = await r.json().catch(() => ({}));
  if (j?.error) throw new Error(j.error.message ?? 'erro da Meta', { cause: j.error });
  return j;
}

/* POST manda o token no CORPO, não na query: além de ser o que a Meta pede
   para publicação, mantém a credencial fora de qualquer URL que possa vazar
   em mensagem de erro ou em log de proxy. */
async function graphPost(caminho: string, params: Record<string, string>, token: string) {
  const corpo = new URLSearchParams(params);
  corpo.set('access_token', token);

  let r: Response;
  try {
    r = await fetch(`${GRAPH}/${caminho}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: corpo.toString(),
    });
  } catch (e) {
    throw erroDeRede(e instanceof Error ? e.name : 'falha de rede');
  }
  const j = await r.json().catch(() => ({}));
  if (j?.error) throw new Error(j.error.message ?? 'erro da Meta', { cause: j.error });
  return j;
}

/* Escopos que o token realmente tem. É o que transforma o erro 200 opaco da
   Meta ("(#200) Permissions error") numa frase que diz o que fazer. Prefere o
   que ficou gravado ao conectar; `vivo` força debug_token. */
let escoposCache: { lista: string[]; em: number } | null = null;
async function escoposDoToken(cred: Cred, vivo = false): Promise<string[]> {
  const gravados = Array.isArray((cred.meta as any)?.escopos) ? (cred.meta as any).escopos as string[] : [];
  if (!vivo && gravados.length) return gravados;
  if (escoposCache && !vivo && Date.now() - escoposCache.em < 300_000) return escoposCache.lista;
  try {
    const d = await graph('debug_token', { input_token: cred.token }, cred.token);
    const lista: string[] = Array.isArray(d?.data?.scopes) ? d.data.scopes : gravados;
    escoposCache = { lista, em: Date.now() };
    return lista;
  } catch {
    return gravados;
  }
}

/* Token DE PÁGINA. Resolvido no servidor e guardado só na memória da
   instância — nunca entra em resposta, é o vazamento que a instagram-proxy
   fechou e que não pode voltar por aqui. */
let pageTokenCache: { ig_id: string; token: string; em: number } | null = null;
async function tokenDaPagina(igId: string, usuario: string): Promise<string> {
  if (pageTokenCache?.ig_id === igId && Date.now() - pageTokenCache.em < 600_000) return pageTokenCache.token;

  const j = await graph('me/accounts', { fields: 'id,name,access_token,instagram_business_account' }, usuario);
  for (const pagina of j?.data ?? []) {
    if (pagina?.instagram_business_account?.id === igId && pagina?.access_token) {
      pageTokenCache = { ig_id: igId, token: pagina.access_token, em: Date.now() };
      return pagina.access_token;
    }
  }
  throw new Error(`nenhuma página vinculada à conta ${igId} — reconecte o Instagram em Integrações`);
}

/* ─────────────────────────────── a mídia ──────────────────────────────── */

/* Uma mídia pronta para ser entregue à rede: URL que a plataforma consegue
   baixar sozinha, mais o que dá para saber do arquivo. */
type Midia = { url: string; ehVideo: boolean; mime: string | null; caminho: string | null };

function ehVideoPor(mime: string | null, ref: string): boolean {
  if (mime) return mime.startsWith('video/');
  return /\.(mp4|mov|m4v|webm|avi|mkv)(\?|$)/i.test(ref);
}

function ehJpegPor(mime: string | null, ref: string): boolean {
  if (mime) return mime === 'image/jpeg' || mime === 'image/jpg';
  return /\.(jpe?g)(\?|$)/i.test(ref);
}

/* Um campo, várias formas de listar: JSON, vírgula ou quebra de linha. É a
   ginástica que a falta da tabela mc_publicacoes_midia custa (ver cabeçalho). */
function listar(valor: unknown): string[] {
  if (Array.isArray(valor)) return valor.map((v) => String(v).trim()).filter(Boolean);
  const s = String(valor ?? '').trim();
  if (!s) return [];
  if (s.startsWith('[')) {
    try {
      const j = JSON.parse(s);
      if (Array.isArray(j)) return j.map((v) => String(v).trim()).filter(Boolean);
    } catch { /* não era JSON, segue para a separação simples */ }
  }
  return s.split(/[\n,]+/).map((v) => v.trim()).filter(Boolean);
}

/* URL assinada do Storage. Vale para bucket público e privado, expira em 2h e
   NÃO é persistida em lugar nenhum — a Meta baixa o arquivo em segundos.
   Se o bucket virar privado amanhã, isto continua funcionando. */
async function urlDoCaminho(caminho: string): Promise<string> {
  const { data, error } = await servico().storage.from(BUCKET).createSignedUrl(caminho, VALIDADE_URL_S);
  if (data?.signedUrl) return data.signedUrl;
  const pub = servico().storage.from(BUCKET).getPublicUrl(caminho);
  if (pub?.data?.publicUrl) return pub.data.publicUrl;
  throw new Error(`não deu para gerar o link do arquivo "${caminho}" no bucket ${BUCKET}`
    + (error?.message ? ' — ' + error.message : ''));
}

async function midiasDaPublicacao(p: Record<string, any>, extra?: unknown): Promise<Midia[]> {
  const mime = p.midia_mime ?? null;
  /* CUIDADO: midia_url e midia_caminho costumam apontar para o MESMO arquivo
     (o painel grava os dois). Somar as duas listas transformaria foto simples
     em carrossel de dois itens iguais. Então não se soma: vence a lista mais
     longa, e em empate vence a mais explícita (extra > url > caminho). */
  const brutas = [listar(extra), listar(p.midia_url), listar(p.midia_caminho)]
    .reduce((a, b) => (b.length > a.length ? b : a), [] as string[]);
  const vistas = new Set<string>();
  const saida: Midia[] = [];
  for (const item of brutas) {
    if (vistas.has(item)) continue;
    vistas.add(item);
    const ehUrl = /^https:\/\//i.test(item);
    if (!ehUrl && /^http:\/\//i.test(item)) {
      throw new Error('o link da mídia precisa ser https — as redes recusam http.');
    }
    const url = ehUrl ? item : await urlDoCaminho(item);
    saida.push({
      url,
      ehVideo: ehVideoPor(mime, item),
      mime,
      caminho: ehUrl ? null : item,
    });
    if (saida.length >= MAX_CARROSSEL) break;
  }
  return saida;
}

/* Confere se o arquivo está mesmo de pé antes de mandar a rede buscá-lo. Falha
   aqui é AVISO, não veto: há CDN que recusa HEAD e mesmo assim serve GET.
   Redirecionamento é anotado porque o TikTok proíbe explicitamente
   ("should not redirect to another URL") e a Meta engasga em alguns casos. */
async function conferirMidia(url: string): Promise<string | null> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8_000);
    const r = await fetch(url, { method: 'HEAD', redirect: 'manual', signal: ctl.signal });
    clearTimeout(t);
    if (r.status >= 300 && r.status < 400) return 'o link da mídia redireciona; algumas redes recusam link com redirecionamento';
    if (r.status === 404 || r.status === 403) return `o arquivo não está acessível (HTTP ${r.status})`;
    return null;
  } catch {
    return null;
  }
}

/* ─────────────────── gravação do destino (com meta opcional) ──────────── */

/* mc_publicacoes_destino ainda não tem `meta jsonb`. Em vez de escolher entre
   perder o erro cru e quebrar, tento COM meta e caio para SEM na primeira
   reclamação do Postgres — e lembro. No dia em que a coluna existir, começa a
   gravar sozinho. */
let temColunaMeta: boolean | null = null;

function reclamouDeColuna(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === '42703' || error.code === 'PGRST204'
    || /column .*meta.* does not exist|could not find the 'meta' column/i.test(error.message ?? '');
}

async function gravarDestino(id: string, campos: Record<string, unknown>, meta?: Record<string, unknown>) {
  const base = { ...campos, atualizado_em: agoraISO() };

  if (meta && temColunaMeta !== false) {
    const { error } = await servico().from('mc_publicacoes_destino').update({ ...base, meta }).eq('id', id);
    if (!error) { temColunaMeta = true; return; }
    /* Falhou por outro motivo? Ainda assim tenta o UPDATE sem `meta` logo
       abaixo: perder o erro cru é ruim, perder a mudança de STATUS é pior —
       destino que fica preso em `enviando` some da tela do operador. */
    if (!reclamouDeColuna(error)) console.error('[publicar] gravar destino (com meta)', rabo(id), error.message);
    else temColunaMeta = false;
  }

  const { error } = await servico().from('mc_publicacoes_destino').update(base).eq('id', id);
  if (error) console.error('[publicar] gravar destino', rabo(id), error.message);
}

/* O container em voo precisa sobreviver ao fim da invocação para a rodada
   seguinte retomar. Sem coluna `meta`, mora marcado dentro de `erro`. */
const MARCA = /\[container:(\d+)\]/;
const marcarContainer = (id: string) => `[container:${id}]`;
function containerAnotado(d: Record<string, any>): string | null {
  const emMeta = d?.meta?.container_id;
  if (emMeta) return String(emMeta);
  const m = MARCA.exec(String(d?.erro ?? ''));
  return m ? m[1] : null;
}

/* ──────────────────────── tradução de erro da Meta ────────────────────── */

/* O operador não lê código de erro do Meta. Cada frase abaixo diz o que ele (ou
   o Harry) tem de FAZER — e nenhuma pede que o operador faça login, porque quem
   refaz o OAuth é o dono. */
function traduzirMeta(e: unknown): { frase: string; cru: Record<string, unknown> | null } {
  const err = e instanceof Error ? e : new Error('falha inesperada');
  const cru = (err.cause && typeof err.cause === 'object') ? err.cause as Record<string, unknown> : null;
  const codigo = Number(cru?.code ?? 0);
  const sub = Number(cru?.error_subcode ?? 0);
  const msg = String(cru?.message ?? err.message ?? '');

  if (codigo === 190) {
    return { frase: 'A conexão com a Meta expirou. Avise o Harry — precisa reconectar o Instagram em Integrações.', cru };
  }
  if (codigo === 200 || codigo === 10 || codigo === 3) {
    return {
      frase: 'Sem permissão para publicar nesta conta. Pode ser a permissão instagram_content_publish faltando no app '
        + 'ou o cargo do Harry na Página da FullPro (é preciso CREATE_CONTENT).', cru,
    };
  }
  if (codigo === 4 || codigo === 17 || codigo === 32 || codigo === 613 || sub === 2207051) {
    return { frase: 'Limite de publicações do Instagram atingido nas últimas 24 horas. Reagende para mais tarde.', cru };
  }
  if (codigo === 9007 || sub === 2207042) {
    return { frase: 'O Instagram recusou: a conta atingiu o limite de posts por API nas últimas 24 horas.', cru };
  }
  if (sub === 2207032 || sub === 2207020) {
    return { frase: 'O Instagram não conseguiu baixar o arquivo. Confira se o link da mídia está acessível e sem redirecionamento.', cru };
  }
  if (sub === 2207026 || sub === 2207023 || sub === 2207003) {
    return { frase: 'O Instagram recusou o formato do arquivo (proporção, duração ou codec fora do aceito).', cru };
  }
  if (/permission/i.test(msg)) {
    return { frase: 'A Meta recusou por permissão: ' + msg, cru };
  }
  return { frase: msg || 'a Meta recusou a publicação', cru };
}

/* ───────────────────────────── conectores ─────────────────────────────── */

type Resultado = {
  estado: 'publicado' | 'erro' | 'enviando';
  id_externo?: string | null;
  link?: string | null;
  erro?: string | null;
  meta?: Record<string, unknown> | null;
};

type Contexto = {
  pub: Record<string, any>;
  dest: Record<string, any>;
  midias: Midia[];
  prazo: number;          /* timestamp em ms para desistir de esperar */
  container?: string | null;
};

/* ── INSTAGRAM — a única que publica de verdade hoje ── */

function formatoInstagram(pub: Record<string, any>, m: Midia[]): 'STORIES' | 'REELS' | 'CAROUSEL' | 'IMAGE' {
  const t = semAcento(String(pub.tipo ?? ''));
  /* Story vem antes da contagem: não existe carrossel de story. Se vierem
     vários arquivos marcados como story, vale o primeiro. */
  if (/stor/.test(t)) return 'STORIES';
  /* Carrossel de um item só não existe: com um arquivo, quem manda é o
     arquivo, mesmo que o tipo diga carrossel. */
  if (m.length > 1) return 'CAROUSEL';
  if (/reel|short|video/.test(t) && m[0]?.ehVideo) return 'REELS';
  /* Sem tipo confiável, o ARQUIVO decide — é o dado que não mente. */
  return m[0]?.ehVideo ? 'REELS' : 'IMAGE';
}

async function esperarContainer(id: string, token: string, prazo: number): Promise<'pronto' | 'processando'> {
  while (Date.now() < prazo) {
    const j = await graph(id, { fields: 'status_code,status' }, token);
    const sc = String(j?.status_code ?? '');
    if (sc === 'FINISHED' || sc === 'PUBLISHED') return 'pronto';
    if (sc === 'ERROR') {
      throw new Error(String(j?.status ?? 'o Instagram recusou o arquivo no processamento'),
        { cause: { code: 'CONTAINER_ERROR', status: j?.status ?? null } });
    }
    if (sc === 'EXPIRED') {
      throw new Error('o container passou de 24h sem ser publicado e expirou',
        { cause: { code: 'CONTAINER_EXPIRED' } });
    }
    await dormir(INTERVALO_POLL_MS);
  }
  return 'processando';
}

async function redeInstagram(ctx: Contexto): Promise<Resultado> {
  const cred = await credencial('instagram', IG_TOKEN_ENV);
  if (!cred.token) {
    return { estado: 'erro', erro: 'O Instagram não está conectado. Um administrador conecta em Integrações.' };
  }

  /* Escopo ANTES de qualquer chamada cara. Sem isto, o operador receberia
     "(#200) Permissions error" e ninguém saberia o que fazer. */
  const escopos = await escoposDoToken(cred);
  if (escopos.length && !escopos.includes('instagram_content_publish')) {
    return {
      estado: 'erro',
      erro: 'Falta a permissão instagram_content_publish no token da Meta. O Harry precisa refazer a conexão '
        + 'do Instagram marcando essa permissão (aproveite e marque também pages_manage_posts, para liberar o Facebook).',
      meta: { escopos_atuais: escopos, falta: ['instagram_content_publish'] },
    };
  }

  const igId = String((cred.meta as any)?.ig_id ?? '');
  if (!igId) {
    return { estado: 'erro', erro: 'Sem o id da conta do Instagram — reconecte em Integrações para gravá-lo.' };
  }
  const token = await tokenDaPagina(igId, cred.token);

  /* Cota pela própria conta, não por constante: a doc oficial diz 100 num
     lugar e 50 no outro. Se não der para ler, sigo. */
  try {
    const q = await graph(`${igId}/content_publishing_limit`, { fields: 'config,quota_usage' }, token);
    const linha = q?.data?.[0];
    const usado = Number(linha?.quota_usage ?? NaN);
    const total = Number(linha?.config?.quota_total ?? NaN);
    if (Number.isFinite(usado) && Number.isFinite(total) && total > 0 && usado >= total) {
      return {
        estado: 'erro',
        erro: `Limite do Instagram atingido: ${usado} de ${total} publicações por API nas últimas 24 horas. Reagende.`,
        meta: { quota_usage: usado, quota_total: total },
      };
    }
  } catch { /* cota desconhecida não impede de publicar */ }

  const legenda = String(ctx.pub.legenda ?? ctx.pub.titulo ?? '').slice(0, 2200);
  const formato = formatoInstagram(ctx.pub, ctx.midias);

  /* Validações locais: transformam recusa remota opaca em aviso claro, e
     economizam a cota da conta. */
  if (!ctx.midias.length) return { estado: 'erro', erro: 'A publicação está sem arquivo de mídia.' };
  if (formato === 'CAROUSEL' && ctx.midias.length > MAX_CARROSSEL) {
    return { estado: 'erro', erro: `Carrossel aceita no máximo ${MAX_CARROSSEL} itens; esta publicação tem ${ctx.midias.length}.` };
  }
  if (formato === 'REELS' && !ctx.midias[0].ehVideo) {
    return { estado: 'erro', erro: 'Reel precisa de vídeo, e o arquivo desta publicação é imagem.' };
  }
  for (const m of ctx.midias) {
    if (!m.ehVideo && !ehJpegPor(m.mime, m.caminho ?? m.url)) {
      return {
        estado: 'erro',
        erro: 'O Instagram só aceita imagem em JPEG por API. Converta o arquivo (PNG e WebP são recusados).',
        meta: { mime: m.mime, arquivo: m.caminho },
      };
    }
  }

  let container = ctx.container ?? null;

  /* Só cria container se ainda não houver um em voo. É isto que permite
     retomar depois de um timeout sem publicar duas vezes. */
  if (!container) {
    const aviso = await conferirMidia(ctx.midias[0].url);
    if (aviso) console.warn('[publicar] instagram', rabo(ctx.dest.id), aviso);

    if (formato === 'CAROUSEL') {
      /* Filhos primeiro, cada um com is_carousel_item=true; depois o pai. */
      const filhos: string[] = [];
      for (const m of ctx.midias) {
        const p: Record<string, string> = { is_carousel_item: 'true' };
        if (m.ehVideo) { p.media_type = 'VIDEO'; p.video_url = m.url; }
        else { p.image_url = m.url; }
        const c = await graphPost(`${igId}/media`, p, token);
        if (!c?.id) throw new Error('o Instagram não devolveu o container do item do carrossel');
        filhos.push(String(c.id));
      }
      for (const f of filhos) {
        const e = await esperarContainer(f, token, ctx.prazo);
        if (e === 'processando') {
          return {
            estado: 'enviando',
            erro: 'O Instagram ainda está processando os itens do carrossel. O robô retoma na próxima rodada.',
            meta: { filhos },
          };
        }
      }
      const pai = await graphPost(`${igId}/media`, {
        media_type: 'CAROUSEL', children: filhos.join(','), caption: legenda,
      }, token);
      container = String(pai?.id ?? '');
    } else {
      const p: Record<string, string> = {};
      if (formato === 'STORIES') {
        p.media_type = 'STORIES';
        if (ctx.midias[0].ehVideo) p.video_url = ctx.midias[0].url; else p.image_url = ctx.midias[0].url;
        /* Story não leva legenda: o campo é ignorado pela borda. */
      } else if (formato === 'REELS') {
        p.media_type = 'REELS';
        p.video_url = ctx.midias[0].url;
        p.caption = legenda;
        p.share_to_feed = 'true';
      } else {
        p.image_url = ctx.midias[0].url;
        p.caption = legenda;
      }
      const c = await graphPost(`${igId}/media`, p, token);
      container = String(c?.id ?? '');
    }

    if (!container) throw new Error('o Instagram não devolveu o id do container');
    /* Anota ANTES de esperar: se a invocação morrer no polling, a próxima
       rodada retoma este container em vez de criar outro. */
    await gravarDestino(ctx.dest.id, { status: 'enviando', erro: 'Enviado ao Instagram, processando. ' + marcarContainer(container) },
      { container_id: container, formato });
  }

  const estado = await esperarContainer(container, token, ctx.prazo);
  if (estado === 'processando') {
    return {
      estado: 'enviando',
      erro: 'O Instagram ainda está processando o vídeo. O robô retoma na próxima rodada. ' + marcarContainer(container),
      meta: { container_id: container, formato },
    };
  }

  const pub = await graphPost(`${igId}/media_publish`, { creation_id: container }, token);
  const idMedia = String(pub?.id ?? '');
  if (!idMedia) throw new Error('o Instagram aceitou a publicação mas não devolveu o id da mídia');

  /* Permalink é conveniência: se falhar, o post já está no ar e não se
     desfaz nada por causa de um link. */
  let link: string | null = null;
  try {
    const j = await graph(idMedia, { fields: 'permalink' }, token);
    link = j?.permalink ?? null;
  } catch { /* segue sem link */ }

  console.log('[publicar] instagram publicado', rabo(idMedia), formato);
  return { estado: 'publicado', id_externo: idMedia, link, meta: { formato, container_id: container } };
}

/* ── FACEBOOK — publica na Página: Reel, vídeo de feed, foto e carrossel ── */

const PERM_FACEBOOK = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'];

/* A Página e o token DELA. Mesma regra do Instagram: token de página é
   resolvido no servidor, vive só na memória da instância e nunca entra em
   resposta nem em log. */
let paginaCache: { id: string; nome: string; token: string; em: number } | null = null;

async function paginaFacebook(usuario: string, preferida: string) {
  if (paginaCache && Date.now() - paginaCache.em < 600_000
      && (!preferida || paginaCache.id === preferida)) return paginaCache;

  const j = await graph('me/accounts',
    { fields: 'id,name,access_token,instagram_business_account', limit: '100' }, usuario);
  const paginas: Record<string, any>[] = Array.isArray(j?.data) ? j.data : [];
  if (!paginas.length) {
    throw new Error('o token da Meta não enxerga nenhuma Página do Facebook — confira se a conta é '
      + 'administradora da Página e se pages_show_list está no token', { cause: { code: 'SEM_PAGINA' } });
  }

  const igCred = await credencial('instagram', IG_TOKEN_ENV);
  const igId = String((igCred.meta as any)?.ig_id ?? '');

  /* Ordem de escolha: a que o admin fixou > a Página do nosso Instagram > a
     única que existe. Nunca "a primeira da lista": com duas Páginas no token,
     isso publicaria na errada sem avisar ninguém. */
  const escolhida =
    (preferida && paginas.find((p) => String(p.id) === preferida))
    || (igId && paginas.find((p) => String(p?.instagram_business_account?.id ?? '') === igId))
    || (paginas.length === 1 ? paginas[0] : null);

  if (!escolhida) {
    throw new Error('há mais de uma Página neste token e nenhuma está marcada como a da FullPro. '
      + 'Grave o id em mc_integrations (provider "facebook", meta.page_id). Páginas vistas: '
      + paginas.map((p) => `${p.name} (${p.id})`).join(', '), { cause: { code: 'PAGINA_AMBIGUA' } });
  }
  if (!escolhida.access_token) {
    throw new Error(`a Página "${escolhida.name}" veio sem token — o dono do token precisa ter papel nela`,
      { cause: { code: 'SEM_TOKEN_PAGINA' } });
  }

  paginaCache = {
    id: String(escolhida.id), nome: String(escolhida.name ?? ''),
    token: String(escolhida.access_token), em: Date.now(),
  };
  return paginaCache;
}

/* O vídeo continua sendo processado depois que a Graph responde. Publicar sem
   esperar devolve link que dá 404 por alguns minutos. */
async function esperarVideoFacebook(id: string, token: string, prazo: number): Promise<'pronto' | 'processando'> {
  while (Date.now() < prazo) {
    let s: Record<string, any> = {};
    try {
      const j = await graph(id, { fields: 'status' }, token);
      s = j?.status ?? {};
    } catch (e) {
      /* Vídeo recém-criado às vezes ainda não responde a leitura. Só insiste
         se der tempo; erro de permissão cai fora no throw abaixo. */
      const c = (e as any)?.cause?.code;
      if (c !== 100 && c !== 803) throw e;
    }
    const fase = String(s.video_status ?? '');
    if (fase === 'ready' || fase === 'published') return 'pronto';
    if (fase === 'error') {
      throw new Error(String(s?.processing_phase?.error?.message ?? 'o Facebook recusou o vídeo no processamento'),
        { cause: { code: 'VIDEO_ERROR', status: s } });
    }
    /* Fase de upload travada é o caso da retomada: o container existe mas os
       bytes nunca chegaram. Esperar não resolve, e o operador precisa saber. */
    if (String(s?.uploading_phase?.status ?? '') === 'error') {
      throw new Error('o Facebook não conseguiu baixar o arquivo do Reel. Confira se o link da mídia está de pé.',
        { cause: { code: 'UPLOAD_ERROR', status: s } });
    }
    await dormir(INTERVALO_POLL_MS);
  }
  return 'processando';
}

/* Reel é upload em TRÊS fases, e a do meio não é a Graph: é o rupload, que
   aceita o arquivo por URL no cabeçalho `file_url` — assim os bytes não passam
   por esta função. graph-video.facebook.com está descontinuado; não voltar a ele.
   https://developers.facebook.com/docs/video-api/guides/reels-publishing/ */
async function reelFacebook(pagina: { id: string; token: string }, url: string, descricao: string): Promise<string> {
  const inicio = await graphPost(`${pagina.id}/video_reels`, { upload_phase: 'start' }, pagina.token);
  const videoId = String(inicio?.video_id ?? '');
  const uploadUrl = String(inicio?.upload_url ?? '');
  if (!videoId || !uploadUrl) throw new Error('o Facebook não devolveu o endereço de upload do Reel');

  let r: Response;
  try {
    r = await fetch(uploadUrl, {
      method: 'POST',
      headers: { Authorization: `OAuth ${pagina.token}`, file_url: url },
    });
  } catch {
    throw erroDeRede('rupload do Facebook');
  }
  const bruto = await r.text();
  let corpo: Record<string, any> = {};
  try { corpo = JSON.parse(bruto); } catch { /* o rupload nem sempre devolve JSON */ }
  if (corpo?.error) throw new Error(corpo.error.message ?? 'o rupload recusou o arquivo', { cause: corpo.error });
  if (!r.ok && corpo?.success !== true) {
    throw new Error(`o rupload do Facebook respondeu ${r.status} ao buscar o arquivo do Reel`,
      { cause: { code: 'RUPLOAD', status: r.status } });
  }

  /* PUBLISHED aqui, e não agendamento nativo: quem decide a hora é o nosso
     cron, para as quatro redes seguirem a mesma fila. O Facebook aceitaria
     scheduled_publish_time (10 min a 29 dias no Reel), mas aí metade das
     publicações teria horário no Facebook e metade no painel. */
  await graphPost(`${pagina.id}/video_reels`, {
    upload_phase: 'finish', video_id: videoId, video_state: 'PUBLISHED',
    description: descricao,
  }, pagina.token);

  return videoId;
}

function formatoFacebook(pub: Record<string, any>, m: Midia[]): 'REEL' | 'VIDEO' | 'FOTO' | 'ALBUM' | 'TEXTO' {
  const t = semAcento(String(pub.tipo ?? ''));
  if (!m.length) return 'TEXTO';
  if (m.length > 1) return m.some((x) => x.ehVideo) ? 'VIDEO' : 'ALBUM';
  if (!m[0].ehVideo) return 'FOTO';
  /* Story e clipe curto viram Reel; vídeo longo vai para o feed, que é onde
     ele cabe (o Reel do Facebook tem teto de 90s). */
  return /reel|short|stor|clip|curto/.test(t) ? 'REEL' : 'VIDEO';
}

async function redeFacebook(ctx: Contexto): Promise<Resultado> {
  /* Credencial própria se houver; senão a mesma da Meta, que é um User Token e
     serve para as duas — foi assim que o Harry conectou. */
  const fbCred = await credencial('facebook');
  const base = fbCred.token ? fbCred : await credencial('instagram', IG_TOKEN_ENV);
  if (!base.token) {
    return { estado: 'erro', erro: 'O Facebook não está conectado. Um administrador conecta em Integrações.' };
  }

  /* Escopo antes de qualquer chamada cara — sem isto a Meta devolve
     "(#200) Permissions error" e ninguém sabe o que fazer com isso. */
  const escopos = await escoposDoToken(base);
  const faltando = PERM_FACEBOOK.filter((p) => !escopos.includes(p));
  if (escopos.length && faltando.length) {
    return {
      estado: 'erro',
      erro: `Faltam as permissões ${faltando.join(', ')} no token da Meta. O Harry precisa marcá-las e gerar um `
        + 'token novo — permissão marcada no app não muda token já emitido.',
      meta: { escopos_atuais: escopos, falta: faltando },
    };
  }

  const pagina = await paginaFacebook(base.token, String((fbCred.meta as any)?.page_id ?? ''));
  const legenda = String(ctx.pub.legenda ?? ctx.pub.titulo ?? '').slice(0, 5000);
  const formato = formatoFacebook(ctx.pub, ctx.midias);

  if (formato === 'TEXTO' && !legenda) {
    return { estado: 'erro', erro: 'A publicação está sem arquivo e sem texto — não há o que postar.' };
  }

  /* ── vídeo: tem container, então retoma em vez de mandar de novo ── */
  if (formato === 'REEL' || formato === 'VIDEO') {
    let videoId = ctx.container ?? null;

    if (!videoId) {
      const aviso = await conferirMidia(ctx.midias[0].url);
      if (aviso) console.warn('[publicar] facebook', rabo(ctx.dest.id), aviso);

      if (formato === 'REEL') {
        videoId = await reelFacebook(pagina, ctx.midias[0].url, legenda);
      } else {
        const v = await graphPost(`${pagina.id}/videos`, {
          file_url: ctx.midias[0].url,
          description: legenda,
          ...(ctx.pub.titulo ? { title: String(ctx.pub.titulo).slice(0, 255) } : {}),
        }, pagina.token);
        videoId = String(v?.id ?? '');
      }
      if (!videoId) throw new Error('o Facebook não devolveu o id do vídeo');

      /* Anota ANTES de esperar: se a invocação morrer no polling, a rodada
         seguinte retoma este vídeo em vez de subir o arquivo outra vez. */
      await gravarDestino(ctx.dest.id,
        { status: 'enviando', erro: 'Enviado ao Facebook, processando. ' + marcarContainer(videoId) },
        { container_id: videoId, formato });
    }

    const estado = await esperarVideoFacebook(videoId, pagina.token, ctx.prazo);
    if (estado === 'processando') {
      return {
        estado: 'enviando',
        erro: 'O Facebook ainda está processando o vídeo. O robô retoma na próxima rodada. ' + marcarContainer(videoId),
        meta: { container_id: videoId, formato, pagina: pagina.nome },
      };
    }

    let link: string | null = null;
    try {
      const j = await graph(videoId, { fields: 'permalink_url' }, pagina.token);
      const p = String(j?.permalink_url ?? '');
      link = p ? (p.startsWith('http') ? p : `https://www.facebook.com${p}`) : null;
    } catch { /* o vídeo já está no ar; link é conveniência */ }

    console.log('[publicar] facebook publicado', rabo(videoId), formato);
    return { estado: 'publicado', id_externo: videoId, link, meta: { formato, pagina: pagina.nome } };
  }

  /* ── foto única ── */
  if (formato === 'FOTO') {
    const f = await graphPost(`${pagina.id}/photos`, {
      url: ctx.midias[0].url, caption: legenda, published: 'true',
    }, pagina.token);
    /* post_id é o post no feed; id é só a foto. O operador quer o post. */
    const idPost = String(f?.post_id ?? f?.id ?? '');
    if (!idPost) throw new Error('o Facebook aceitou a foto mas não devolveu o id do post');
    console.log('[publicar] facebook publicado', rabo(idPost), 'FOTO');
    return {
      estado: 'publicado', id_externo: idPost,
      link: `https://www.facebook.com/${idPost.replace('_', '/posts/')}`,
      meta: { formato, pagina: pagina.nome },
    };
  }

  /* ── álbum: cada foto sobe despublicada e o post do feed as junta ── */
  if (formato === 'ALBUM') {
    const ids: string[] = [];
    for (const m of ctx.midias) {
      const f = await graphPost(`${pagina.id}/photos`, { url: m.url, published: 'false' }, pagina.token);
      if (f?.id) ids.push(String(f.id));
    }
    if (!ids.length) throw new Error('nenhuma das fotos foi aceita pelo Facebook');
    const params: Record<string, string> = { message: legenda };
    ids.forEach((id, i) => { params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id }); });
    const post = await graphPost(`${pagina.id}/feed`, params, pagina.token);
    const idPost = String(post?.id ?? '');
    if (!idPost) throw new Error('o Facebook não devolveu o id do post do álbum');
    console.log('[publicar] facebook publicado', rabo(idPost), 'ALBUM', ids.length);
    return {
      estado: 'publicado', id_externo: idPost,
      link: `https://www.facebook.com/${idPost.replace('_', '/posts/')}`,
      meta: { formato, fotos: ids.length, pagina: pagina.nome },
    };
  }

  /* ── só texto ── */
  const post = await graphPost(`${pagina.id}/feed`, { message: legenda }, pagina.token);
  const idPost = String(post?.id ?? '');
  if (!idPost) throw new Error('o Facebook não devolveu o id do post');
  console.log('[publicar] facebook publicado', rabo(idPost), 'TEXTO');
  return {
    estado: 'publicado', id_externo: idPost,
    link: `https://www.facebook.com/${idPost.replace('_', '/posts/')}`,
    meta: { formato, pagina: pagina.nome },
  };
}

/* ── TIKTOK — Content Posting API, empurrando os bytes ── */

const TK_API = 'https://open.tiktokapis.com/v2';
const TK_TOKEN_URL_P = 'https://open.tiktokapis.com/v2/oauth/token/';

/* Pedaço do upload. O TikTok exige entre 5 MB e 64 MB por pedaço, e o último
   pode passar de 64 MB desde que não chegue a 128. Fico em 32 MB: cabe na
   memória da função com folga e dá pedaço grande o bastante para vídeo de
   minutos não virar dezenas de requisições. */
const TK_PEDACO = 32 * 1024 * 1024;

type CredTk = { token: string; provider: string; escopos: string[] };

/* Sandbox primeiro, produção depois. Enquanto a produção está em análise, é o
   Sandbox que publica — ele tem chave própria e conta alvo fullprobr. */
async function credTiktok(): Promise<CredTk | null> {
  for (const provider of ['tiktok_sandbox', 'tiktok']) {
    const { data } = await servico()
      .from('mc_integrations')
      .select('access_token, refresh_token, expires_at, meta')
      .eq('provider', provider)
      .maybeSingle();
    if (!data?.access_token) continue;
    const meta = (data.meta ?? {}) as Record<string, any>;
    const escopos: string[] = Array.isArray(meta.escopos) ? meta.escopos : [];
    /* Só serve se souber publicar. Uma linha com escopo só de leitura é a
       conexão do coletor, não a de publicação. */
    if (escopos.indexOf('video.publish') < 0 && escopos.indexOf('video.upload') < 0) continue;

    /* O token dura 24h. Renova aqui se estiver perto de vencer — não dá para
       contar com o cron ter passado nos últimos minutos. */
    let token = String(data.access_token);
    const venc = data.expires_at ? Date.parse(data.expires_at) : 0;
    if (venc && Date.now() > venc - 120_000 && data.refresh_token && meta.client_key && meta.client_secret) {
      try {
        const r = await fetch(TK_TOKEN_URL_P, {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_key: String(meta.client_key), client_secret: String(meta.client_secret),
            grant_type: 'refresh_token', refresh_token: String(data.refresh_token),
          }).toString(),
        });
        const j = await r.json();
        if (j?.access_token) {
          token = j.access_token;
          await servico().from('mc_integrations').update({
            access_token: j.access_token,
            refresh_token: j.refresh_token || data.refresh_token,
            expires_at: new Date(Date.now() + (Number(j.expires_in) || 86400) * 1000).toISOString(),
            updated_at: agoraISO(),
          }).eq('provider', provider);
        }
      } catch { /* segue com o token velho; a chamada dirá se ainda vale */ }
    }
    return { token, provider, escopos };
  }
  return null;
}

async function tkPost(caminho: string, corpo: unknown, token: string) {
  let r: Response;
  try {
    r = await fetch(`${TK_API}${caminho}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(corpo ?? {}),
    });
  } catch { throw erroDeRede('TikTok'); }
  const j = await r.json().catch(() => ({}));
  /* O TikTok responde 200 com error.code = 'ok' quando deu certo. Quem manda é
     o código dentro do corpo, não o status HTTP. */
  const cod = j?.error?.code;
  if (cod && cod !== 'ok') {
    throw new Error(j.error.message || cod, { cause: { code: cod, log_id: j.error.log_id ?? null } });
  }
  return j;
}

/* Frases para os erros que o dono vai ver de verdade. O resto sai cru. */
function tkFrase(cod: string, msg: string): string {
  if (cod === 'unaudited_client_can_only_post_to_private_accounts') {
    return 'O TikTok recusou: cliente sem auditoria só publica em conta privada. '
      + 'É a trava do Direct Post — o caminho do rascunho (video.upload) não passa por ela.';
  }
  if (cod === 'privacy_level_option_mismatch') {
    return 'A privacidade escolhida não está entre as que a conta permite agora. O robô usa o que o creator_info devolve.';
  }
  if (cod === 'spam_risk_too_many_posts') return 'O TikTok bloqueou por excesso de publicações nas últimas 24h. Reagende.';
  if (cod === 'spam_risk_user_banned_from_posting') return 'A conta está impedida de publicar pelo TikTok.';
  if (cod === 'reached_active_user_cap') return 'Limite de usuários publicando por este app em 24h. É teto de cliente não auditado.';
  if (cod === 'url_ownership_unverified') return 'O domínio do arquivo não está verificado no portal do TikTok.';
  if (cod === 'access_token_invalid' || cod === 'scope_not_authorized') {
    return 'A autorização do TikTok não vale mais ou não tem o escopo de publicação. Um administrador reconecta em Integrações.';
  }
  return 'O TikTok recusou: ' + (msg || cod);
}

async function redeTiktok(ctx: Contexto): Promise<Resultado> {
  const cred = await credTiktok();
  if (!cred) {
    return {
      estado: 'erro',
      erro: 'O TikTok não está autorizado para publicar. Um administrador conecta em Integrações → TikTok, '
        + 'com os escopos video.upload e video.publish.',
      meta: { falta: ['autorizar o TikTok com escopo de publicação'] },
    };
  }
  if (!ctx.midias.length) return { estado: 'erro', erro: 'A publicação está sem arquivo.' };
  const midia = ctx.midias[0];
  if (!midia.ehVideo) return { estado: 'erro', erro: 'O TikTok só recebe vídeo por aqui, e o arquivo desta publicação é imagem.' };

  const jaTinha = (ctx.dest?.meta ?? {}) as Record<string, any>;
  let publishId: string | null = jaTinha.publish_id ?? null;
  const podeDireto = cred.escopos.indexOf('video.publish') >= 0;

  /* ── 1. abre a publicação (ou retoma a que ficou em voo) ── */
  if (!publishId) {
    const tamanho = midia.caminho ? await tamanhoNoBucket(midia.caminho) : null;
    if (!tamanho) {
      return { estado: 'erro', erro: 'Não deu para saber o tamanho do arquivo, e o TikTok exige o tamanho antes do envio.' };
    }

    const pedaco = Math.min(TK_PEDACO, tamanho);
    const pedacos = Math.max(1, Math.floor(tamanho / pedaco));
    const legenda = String(ctx.pub.legenda ?? ctx.pub.titulo ?? '').slice(0, 2200);

    let corpo: Record<string, unknown>;
    let caminho: string;

    if (podeDireto) {
      /* creator_info É OBRIGATÓRIO antes do Direct Post — o TikTok recusa sem
         ele. E serve para outra coisa: as opções de privacidade que ele devolve
         são as ÚNICAS aceitas. Mandar um valor fora dessa lista dá
         privacy_level_option_mismatch, e é onde a maioria das integrações
         quebra. Por isso o nível sai daqui, não de constante. */
      const info = await tkPost('/post/publish/creator_info/query/', {}, cred.token);
      const opcoes: string[] = info?.data?.privacy_level_options ?? [];
      const nivel = opcoes.indexOf('PUBLIC_TO_EVERYONE') >= 0 ? 'PUBLIC_TO_EVERYONE'
                  : (opcoes[0] ?? 'SELF_ONLY');

      corpo = {
        post_info: {
          title: legenda,
          privacy_level: nivel,
          disable_comment: false, disable_duet: false, disable_stitch: false,
        },
        source_info: { source: 'FILE_UPLOAD', video_size: tamanho, chunk_size: pedaco, total_chunk_count: pedacos },
      };
      caminho = '/post/publish/video/init/';
      await gravarDestino(ctx.dest.id, { status: 'enviando', erro: 'Abrindo envio no TikTok.' },
        { modo: 'direct_post', privacidade_pedida: nivel, opcoes_da_conta: opcoes, bytes: tamanho });
    } else {
      /* Rascunho: cai na caixa de entrada do app e o operador finaliza no
         celular. NÃO passa pela auditoria — é o caminho que funciona antes
         dela. Aqui não vai post_info: o título é escolhido lá. */
      corpo = { source_info: { source: 'FILE_UPLOAD', video_size: tamanho, chunk_size: pedaco, total_chunk_count: pedacos } };
      caminho = '/post/publish/inbox/video/init/';
      await gravarDestino(ctx.dest.id, { status: 'enviando', erro: 'Abrindo envio no TikTok (rascunho).' },
        { modo: 'rascunho', bytes: tamanho });
    }

    let init: Record<string, any>;
    try {
      init = await tkPost(caminho, corpo, cred.token);
    } catch (e) {
      const cru = (e as any)?.cause ?? {};
      return { estado: 'erro', erro: tkFrase(String(cru.code ?? ''), e instanceof Error ? e.message : ''), meta: cru };
    }

    publishId = String(init?.data?.publish_id ?? '');
    const uploadUrl = String(init?.data?.upload_url ?? '');
    if (!publishId || !uploadUrl) throw new Error('o TikTok não devolveu o endereço de envio');

    /* ── 2. os bytes, em pedaços ── */
    for (let i = 0; i < pedacos; i++) {
      const ini = i * pedaco;
      const fim = (i === pedacos - 1) ? tamanho - 1 : ini + pedaco - 1;

      const parte = await fetch(midia.url, { headers: { Range: `bytes=${ini}-${fim}` } });
      if (!parte.ok) return { estado: 'erro', erro: `Não deu para ler o arquivo (HTTP ${parte.status}).` };
      const bytes = new Uint8Array(await parte.arrayBuffer());

      const env = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': midia.mime || 'video/mp4',
          'Content-Length': String(bytes.byteLength),
          'Content-Range': `bytes ${ini}-${fim}/${tamanho}`,
        },
        body: bytes,
      });
      if (env.status !== 201 && env.status !== 200 && env.status !== 206 && env.status !== 308) {
        const t = await env.text().catch(() => '');
        return { estado: 'erro', erro: `O TikTok recusou o pedaço ${i + 1}/${pedacos} (HTTP ${env.status}). ${t.slice(0, 200)}` };
      }

      /* Vídeo grande não cabe numa invocação. O publish_id já está gravado, e a
         próxima rodada retoma pela consulta de status — o TikTok mantém o
         envio aberto. */
      if (Date.now() > ctx.prazo - 20_000 && i < pedacos - 1) {
        await gravarDestino(ctx.dest.id, { status: 'enviando', erro: 'Enviando ao TikTok, continua na próxima rodada.' },
          { ...jaTinha, publish_id: publishId, bytes: tamanho, pedacos_enviados: i + 1 });
        return { estado: 'enviando', erro: 'O envio ao TikTok continua na próxima rodada.', meta: { publish_id: publishId } };
      }
    }

    await gravarDestino(ctx.dest.id, { status: 'enviando', erro: 'Enviado ao TikTok, processando.' },
      { ...jaTinha, publish_id: publishId, modo: podeDireto ? 'direct_post' : 'rascunho' });
  }

  /* ── 3. o que o TikTok fez com o vídeo ── */
  let situacao = '';
  let idPublico: string | null = null;
  let motivo = '';
  while (Date.now() < ctx.prazo) {
    const st = await tkPost('/post/publish/status/fetch/', { publish_id: publishId }, cred.token);
    situacao = String(st?.data?.status ?? '');
    const ids: string[] = st?.data?.publicaly_available_post_id ?? st?.data?.publicly_available_post_id ?? [];
    if (ids.length) idPublico = String(ids[0]);
    if (situacao === 'PUBLISH_COMPLETE' || situacao === 'SEND_TO_USER_INBOX') break;
    if (situacao === 'FAILED') { motivo = String(st?.data?.fail_reason ?? ''); break; }
    await dormir(INTERVALO_POLL_MS);
  }

  if (situacao === 'FAILED') {
    return { estado: 'erro', erro: tkFrase(motivo, ''), meta: { publish_id: publishId, fail_reason: motivo } };
  }
  if (!situacao || (situacao !== 'PUBLISH_COMPLETE' && situacao !== 'SEND_TO_USER_INBOX')) {
    return {
      estado: 'enviando',
      erro: 'O TikTok ainda está processando o vídeo. O robô confere na próxima rodada.',
      meta: { publish_id: publishId, situacao },
    };
  }

  const rascunho = situacao === 'SEND_TO_USER_INBOX';
  console.log('[publicar] tiktok', rabo(publishId), situacao, cred.provider);
  return {
    estado: 'publicado',
    id_externo: idPublico ?? publishId,
    link: idPublico ? `https://www.tiktok.com/@fullprobr/video/${idPublico}` : null,
    meta: {
      situacao, modo: rascunho ? 'rascunho' : 'direct_post', ambiente: cred.provider,
      /* Rascunho NÃO é publicação: está na caixa de entrada esperando alguém
         finalizar no celular. O painel precisa dizer isso, senão o operador
         acha que saiu e o vídeo nunca vai ao ar. */
      aviso: rascunho
        ? 'O vídeo foi para a CAIXA DE ENTRADA do app do TikTok. Alguém precisa abrir o app e finalizar a publicação.'
        : null,
    },
  };
}

/* ── YOUTUBE — sobe o arquivo, agenda no nativo e põe capa ── */

const YT_API = 'https://www.googleapis.com/youtube/v3';
const YT_UPLOAD = 'https://www.googleapis.com/upload/youtube/v3';
const OAUTH_TOKEN_G = 'https://oauth2.googleapis.com/token';

type CredYt = { client_id: string; client_secret: string; refresh: string; access: string | null; expira: string | null; meta: Record<string, any> };

/* O OAuth mora em 'youtube_oauth', não em 'youtube'. A linha 'youtube' guarda a
   CHAVE DE API, que só lê — e cujo upsert zera refresh_token. Ver youtube-proxy. */
async function credYoutube(): Promise<CredYt | null> {
  const { data } = await servico()
    .from('mc_integrations')
    .select('access_token, refresh_token, expires_at, meta')
    .eq('provider', 'youtube_oauth')
    .maybeSingle();
  const m = (data?.meta ?? {}) as Record<string, any>;
  if (!data?.refresh_token || !m.client_id || !m.client_secret) return null;
  return {
    client_id: String(m.client_id), client_secret: String(m.client_secret),
    refresh: String(data.refresh_token), access: data.access_token ?? null,
    expira: data.expires_at ?? null, meta: m,
  };
}

/* Access token do Google dura 1h. Renova só quando falta menos de 2 min, para
   não gastar chamada à toa numa fila com vários destinos. */
async function acessoYoutube(c: CredYt): Promise<string> {
  if (c.access && c.expira && new Date(c.expira).getTime() > Date.now() + 120_000) return c.access;

  let r: Response;
  try {
    r = await fetch(OAUTH_TOKEN_G, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: c.client_id, client_secret: c.client_secret,
        refresh_token: c.refresh, grant_type: 'refresh_token',
      }).toString(),
    });
  } catch { throw erroDeRede('Google (renovação de token)'); }

  const j = await r.json().catch(() => ({}));
  if (j?.error) {
    if (j.error === 'invalid_grant') {
      throw new Error('A autorização do YouTube caiu. Um administrador precisa refazer em Integrações → Autorizar upload.',
        { cause: { code: 'YT_INVALID_GRANT' } });
    }
    throw new Error('o Google recusou a renovação: ' + (j.error_description ?? j.error), { cause: j });
  }
  const acesso = String(j.access_token ?? '');
  if (!acesso) throw new Error('o Google não devolveu token de acesso');

  await servico().from('mc_integrations').update({
    access_token: acesso,
    expires_at: new Date(Date.now() + (Number(j.expires_in) || 3600) * 1000).toISOString(),
    updated_at: agoraISO(),
  }).eq('provider', 'youtube_oauth');
  return acesso;
}

/* Tamanho exato em bytes, que o protocolo resumable exige ANTES de mandar os
   bytes (X-Upload-Content-Length). O Storage guarda isso em metadata.size. */
async function tamanhoNoBucket(caminho: string): Promise<number | null> {
  const barra = caminho.lastIndexOf('/');
  const pasta = barra > 0 ? caminho.slice(0, barra) : '';
  const nome = barra > 0 ? caminho.slice(barra + 1) : caminho;
  const { data } = await servico().storage.from(BUCKET).list(pasta, { limit: 100, search: nome });
  const achado = (data ?? []).find((o: any) => o.name === nome);
  const n = Number(achado?.metadata?.size ?? NaN);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/* Quantos bytes o Google já recebeu nesta sessão. Resposta 308 traz Range;
   sem Range, nada chegou ainda. 200/201 = o vídeo já subiu inteiro. */
async function jaRecebido(uri: string, total: number, token: string): Promise<number | 'pronto'> {
  const r = await fetch(uri, {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + token, 'Content-Length': '0', 'Content-Range': `bytes */${total}` },
  });
  if (r.status === 200 || r.status === 201) return 'pronto';
  if (r.status === 404) throw new Error('a sessão de upload expirou', { cause: { code: 'YT_SESSAO_EXPIRADA' } });
  const range = r.headers.get('Range');
  if (!range) return 0;
  const m = /bytes=0-(\d+)/.exec(range);
  return m ? Number(m[1]) + 1 : 0;
}

/* A descrição do YouTube tem teto de 5000 BYTES, não caracteres — acento vale 2
   e emoji vale 4. Cortar por .slice() deixa passar texto que a API recusa, e
   pior: pode partir um caractere no meio. */
function cortarBytes(texto: string, teto: number): string {
  const bytes = new TextEncoder().encode(texto);
  if (bytes.length <= teto) return texto;
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, teto)).replace(/\uFFFD$/, '');
}

/* As tags somam 500 caracteres NO TOTAL, e as vírgulas entre elas contam. Corto
   tag inteira, nunca pela metade: meia tag é pior que uma tag a menos. */
function tagsQueCabem(tags: string[], teto = 500): string[] {
  const saida: string[] = [];
  let usado = 0;
  for (const bruta of tags) {
    const t = String(bruta ?? '').replace(/[<>,]/g, '').trim();
    if (!t) continue;
    /* Tag com espaço é tratada como se estivesse entre aspas, e as aspas contam. */
    const custo = t.length + (t.includes(' ') ? 2 : 0) + (saida.length ? 1 : 0);
    if (usado + custo > teto) break;
    saida.push(t);
    usado += custo;
  }
  return saida;
}

type OpcoesYt = {
  titulo: string; descricao: string; categoria: string; tags: string[];
  avisar: boolean; paraCriancas: boolean; temIa: boolean;
};

function formatoYoutube(pub: Record<string, any>): OpcoesYt {
  const o = (pub.opcoes?.youtube ?? {}) as Record<string, any>;
  const legenda = String(pub.legenda ?? '');

  /* Título: o que o operador escreveu no campo do YouTube manda; sem ele, a
     primeira linha da legenda. Teto de 100 caracteres e proibido < e >. */
  let titulo = String(o.titulo ?? pub.titulo ?? '').replace(/[<>]/g, '').trim();
  if (!titulo) titulo = legenda.split('\n')[0].trim();
  if (!titulo) titulo = 'Vídeo FullPro';

  return {
    titulo: titulo.slice(0, 100),
    descricao: cortarBytes(legenda.replace(/[<>]/g, ''), 5000),
    /* 2 = Autos & Vehicles. Os ids foram conferidos contra videoCategories.list
       com regionCode=BR em 01/09/2026, não chutados. */
    categoria: String(o.categoria ?? '2'),
    tags: tagsQueCabem(Array.isArray(o.tags) ? o.tags : []),
    /* AVISAR INSCRITOS: o default do YouTube é TRUE. Aqui o default é FALSE, de
       propósito — quem publica pelo painel publica em volume, e notificar todo
       mundo a cada vídeo é o tipo de estrago que não se desfaz. Quem quiser
       avisar marca a caixinha. */
    avisar: o.avisar_inscritos === true,
    paraCriancas: o.para_criancas === true,
    temIa: o.tem_ia === true,
  };
}

async function redeYoutube(ctx: Contexto): Promise<Resultado> {
  const cred = await credYoutube();
  if (!cred) {
    return {
      estado: 'erro',
      erro: 'O YouTube ainda não foi autorizado para upload. Um administrador autoriza em Integrações → Autorizar upload. '
        + 'A chave de API que está conectada só lê métricas; ela não sobe vídeo.',
      meta: { falta: ['OAuth com escopo youtube.upload'] },
    };
  }
  if (!ctx.midias.length) return { estado: 'erro', erro: 'A publicação está sem arquivo de vídeo.' };
  const midia = ctx.midias[0];
  if (!midia.ehVideo) return { estado: 'erro', erro: 'O YouTube só recebe vídeo por aqui, e o arquivo desta publicação é imagem.' };

  const token = await acessoYoutube(cred);
  const jaTinha = (ctx.dest?.meta ?? {}) as Record<string, any>;
  let videoId: string | null = jaTinha.video_id ?? null;
  let uri: string | null = jaTinha.upload_uri ?? null;
  let total: number | null = Number(jaTinha.bytes) || null;

  /* ── 1. abre a sessão (ou retoma a que ficou em voo) ── */
  if (!videoId) {
    if (!total) {
      total = midia.caminho ? await tamanhoNoBucket(midia.caminho) : null;
      if (!total) {
        /* Sem caminho no bucket (mídia por URL externa), o tamanho vem do HEAD. */
        try {
          const h = await fetch(midia.url, { method: 'HEAD' });
          total = Number(h.headers.get('content-length')) || null;
        } catch { /* segue */ }
      }
    }
    if (!total) {
      return { estado: 'erro', erro: 'Não deu para saber o tamanho do arquivo, e o YouTube exige o tamanho antes do envio.' };
    }

    if (!uri) {
      /* AGENDAMENTO NATIVO. Ao contrário do Facebook, aqui eu uso o do YouTube:
         subir um vídeo grande leva minutos, e "publicar às 18h" não pode virar
         "começar a subir às 18h". publishAt SÓ vale com privacyStatus private —
         é regra do Google, não escolha nossa. Data no passado publica na hora. */
      const quando = ctx.pub.agendado_para ? new Date(ctx.pub.agendado_para).getTime() : 0;
      const agenda = quando > Date.now() + 60_000 ? new Date(quando).toISOString() : null;
      const f = formatoYoutube(ctx.pub);

      const corpo = {
        snippet: {
          title: f.titulo,
          description: f.descricao,
          categoryId: f.categoria,
          /* Lista vazia é 400 Bad Request; ou manda com conteúdo, ou não manda. */
          ...(f.tags.length ? { tags: f.tags } : {}),
        },
        status: {
          privacyStatus: agenda ? 'private' : 'public',
          ...(agenda ? { publishAt: agenda } : {}),
          selfDeclaredMadeForKids: f.paraCriancas,
          ...(f.temIa ? { containsSyntheticMedia: true } : {}),
        },
      };

      let r: Response;
      try {
        r = await fetch(`${YT_UPLOAD}/videos?uploadType=resumable&part=snippet,status&notifySubscribers=${f.avisar}`, {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json; charset=UTF-8',
            'X-Upload-Content-Length': String(total),
            'X-Upload-Content-Type': midia.mime || 'video/mp4',
          },
          body: JSON.stringify(corpo),
        });
      } catch { throw erroDeRede('YouTube (abertura do envio)'); }

      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        const motivo = j?.error?.errors?.[0]?.reason ?? '';
        if (motivo === 'quotaExceeded' || motivo === 'uploadLimitExceeded') {
          return { estado: 'erro', erro: 'O limite diário de envios do YouTube foi atingido (100 por dia). Reagende.', meta: { motivo } };
        }
        if (motivo === 'youtubeSignupRequired') {
          return { estado: 'erro', erro: 'A conta autorizada não tem canal do YouTube. Autorize com a conta que administra o canal FullPro.', meta: { motivo } };
        }
        return { estado: 'erro', erro: 'O YouTube recusou a abertura do envio: ' + (j?.error?.message ?? r.status), meta: j?.error ?? null };
      }

      uri = r.headers.get('Location');
      if (!uri) throw new Error('o YouTube não devolveu o endereço da sessão de envio');
      /* Grava ANTES de mandar os bytes: sem isto, um timeout no meio do envio
         faria a rodada seguinte subir o arquivo INTEIRO outra vez. */
      await gravarDestino(ctx.dest.id, { status: 'enviando', erro: 'Enviando ao YouTube.' },
        { upload_uri: uri, bytes: total, formato: 'video' });
    }

    /* ── 2. manda os bytes, retomando de onde parou ── */
    const feito = await jaRecebido(uri, total, token);
    if (feito !== 'pronto') {
      const inicio = feito as number;
      let origem: Response;
      try {
        origem = await fetch(midia.url, inicio > 0 ? { headers: { Range: `bytes=${inicio}-` } } : undefined);
      } catch { throw erroDeRede('leitura do arquivo'); }
      if (!origem.ok || !origem.body) {
        return { estado: 'erro', erro: `Não deu para ler o arquivo do vídeo (HTTP ${origem.status}).` };
      }

      let env: Response;
      try {
        env = await fetch(uri, {
          method: 'PUT',
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Length': String(total - inicio),
            ...(inicio > 0 ? { 'Content-Range': `bytes ${inicio}-${total - 1}/${total}` } : {}),
          },
          body: origem.body,
        });
      } catch {
        /* Rede caiu no meio: a sessão continua válida e a marca está gravada.
           A próxima rodada pergunta ao Google quanto chegou e continua dali. */
        return {
          estado: 'enviando',
          erro: 'O envio ao YouTube foi interrompido. O robô retoma de onde parou na próxima rodada.',
          meta: { upload_uri: uri, bytes: total },
        };
      }

      if (env.status === 308) {
        return {
          estado: 'enviando',
          erro: 'O YouTube ainda está recebendo o vídeo. O robô retoma na próxima rodada.',
          meta: { upload_uri: uri, bytes: total },
        };
      }
      if (!env.ok) {
        const j = await env.json().catch(() => ({}));
        return { estado: 'erro', erro: 'O YouTube recusou o arquivo: ' + (j?.error?.message ?? env.status), meta: j?.error ?? null };
      }
      const j = await env.json().catch(() => ({}));
      videoId = String(j?.id ?? '');
    }

    if (!videoId) {
      /* Chegou 'pronto' na consulta mas sem corpo com id: pergunta ao Google. */
      return {
        estado: 'enviando',
        erro: 'O YouTube recebeu o vídeo e ainda está fechando o envio. O robô confere na próxima rodada.',
        meta: { upload_uri: uri, bytes: total },
      };
    }
    await gravarDestino(ctx.dest.id, { status: 'enviando', erro: 'Enviado ao YouTube, processando.' },
      { upload_uri: uri, bytes: total, video_id: videoId });
  }

  /* ── 3. capa (thumbnails.set é SEMPRE uma segunda chamada) ── */
  let capa: string | null = null;
  const thumbRef = ctx.pub.thumb_caminho || ctx.pub.thumb_url || null;
  if (thumbRef && !jaTinha.capa_ok) {
    try {
      const urlThumb = /^https:\/\//i.test(String(thumbRef)) ? String(thumbRef) : await urlDoCaminho(String(thumbRef));
      const img = await fetch(urlThumb);
      if (img.ok) {
        const bytes = new Uint8Array(await img.arrayBuffer());
        const rt = await fetch(`${YT_UPLOAD}/thumbnails/set?videoId=${videoId}`, {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': ctx.pub.thumb_mime || 'image/jpeg',
            'Content-Length': String(bytes.byteLength),
          },
          body: bytes,
        });
        if (rt.ok) capa = 'posta';
        else {
          const jt = await rt.json().catch(() => ({}));
          const motivo = jt?.error?.errors?.[0]?.reason ?? '';
          /* Capa personalizada exige canal VERIFICADO por telefone. Não é
             motivo para dar o vídeo como falho: ele já está no ar. */
          capa = motivo === 'forbidden'
            ? 'recusada: o canal precisa estar verificado por telefone em youtube.com/verify'
            : 'recusada: ' + (jt?.error?.message ?? rt.status);
          console.warn('[publicar] youtube capa', rabo(videoId), capa);
        }
      }
    } catch (e) {
      capa = 'não enviada (' + (e instanceof Error ? e.message : 'falha') + ')';
    }
  }

  /* ── 4. o que o Google realmente fez com o vídeo ──
     É AQUI que se descobre a trava de projeto não auditado: pedimos 'public' e
     ele volta 'private'.

     NÃO dá para perguntar com o token do upload: `youtube.upload` autoriza
     ESCREVER e não LER. A tentativa devolve 403 e a resposta vinha `null`,
     que foi o que me obrigou a conferir no navegador em 01/09 — e o dono
     ficou sem saber se o vídeo saiu público pela API ou porque alguém clicou.
     Nunca mais: duas leituras independentes, nenhuma delas com o token do
     upload.

       a) oEmbed — não precisa de credencial nenhuma e não gasta cota.
          Responde 401 para vídeo privado e 200 para vídeo visível. É o teste
          de "o público consegue ver?", que é a pergunta que importa.
       b) chave de API (linha 'youtube', que LÊ) — devolve o privacyStatus
          exato: public, unlisted ou private. Custa 1 unidade. */
  let privacidade: string | null = null;
  let visivelPublicamente: boolean | null = null;
  let travado = false;

  try {
    const oe = await fetch('https://www.youtube.com/oembed?format=json&url='
      + encodeURIComponent(`https://youtu.be/${videoId}`));
    visivelPublicamente = oe.status === 200;
  } catch { /* sem rede para o oEmbed: fica null, e null é honesto */ }

  try {
    const chave = (await credencial('youtube')).token;
    if (chave) {
      const rv = await fetch(`${YT_API}/videos?part=status&id=${videoId}&key=${chave}`);
      const jv = await rv.json().catch(() => ({}));
      const itens = jv?.items ?? [];
      /* Chave de API não enxerga vídeo privado: lista vazia É a resposta, mas
         só quando o oEmbed concorda. Discordância vira null em vez de chute. */
      if (itens.length) privacidade = itens[0]?.status?.privacyStatus ?? null;
      else if (visivelPublicamente === false) privacidade = 'private';
    }
  } catch { /* leitura é conveniência; o vídeo já está no ar */ }

  const queriaPublico = !(ctx.pub.agendado_para && new Date(ctx.pub.agendado_para).getTime() > Date.now() + 60_000);
  travado = queriaPublico && (privacidade === 'private' || visivelPublicamente === false);

  const link = `https://youtu.be/${videoId}`;
  console.log('[publicar] youtube publicado', rabo(videoId), privacidade ?? '?', capa ?? 'sem capa');

  if (travado) {
    return {
      estado: 'publicado', id_externo: videoId, link,
      meta: {
        privacidade, visivel_publicamente: visivelPublicamente, capa, travado_como_privado: true,
        aviso: 'O vídeo subiu mas o YouTube o deixou PRIVADO. É a trava de projeto de API não auditado: '
          + 'não há recurso, e o vídeo precisa ser reenviado por cliente auditado ou pelo próprio YouTube. '
          + 'Para liberar, o projeto precisa passar na auditoria de conformidade (yt_api_form).',
      },
    };
  }

  return { estado: 'publicado', id_externo: videoId, link, meta: { privacidade, visivel_publicamente: visivelPublicamente, capa } };
}

const CONECTORES: Record<string, (c: Contexto) => Promise<Resultado>> = {
  instagram: redeInstagram,
  facebook: redeFacebook,
  tiktok: redeTiktok,
  youtube: redeYoutube,
};

/* ─────────────────────── processamento de um destino ──────────────────── */

/* Toma o destino com compare-and-set: o UPDATE só pega a linha se o status
   ainda for o que eu li. Duas rodadas do cron sobrepostas — ou o operador
   clicando enquanto o cron roda — não postam duas vezes. */
async function tomarDestino(dest: Record<string, any>, retomando: boolean): Promise<boolean> {
  let q = servico().from('mc_publicacoes_destino')
    .update({ status: 'enviando', tentativas: (dest.tentativas ?? 0) + 1, atualizado_em: agoraISO() })
    .eq('id', dest.id)
    .eq('status', dest.status);

  /* Retomar um 'enviando' não pode usar o status como trava (ele já é
     'enviando'); a trava vira o carimbo de tempo, que este UPDATE renova. */
  if (retomando) q = q.lt('atualizado_em', new Date(Date.now() - RETOMAR_APOS_MS).toISOString());

  const { data, error } = await q.select('id');
  if (error) { console.error('[publicar] tomar destino', rabo(dest.id), error.message); return false; }
  return Array.isArray(data) && data.length > 0;
}

async function processarDestino(pub: Record<string, any>, dest: Record<string, any>, prazo: number) {
  const rede = String(dest.rede);
  const nome = `${rede}/${rabo(dest.id)}`;

  /* REGRA 3 — id_externo preenchido é publicação que já saiu. Não republica em
     hipótese nenhuma; só conserta o status se estiver torto. */
  if (dest.id_externo) {
    if (dest.status !== 'publicado') {
      await gravarDestino(dest.id, { status: 'publicado', erro: null, publicado_em: dest.publicado_em ?? agoraISO() });
    }
    return { rede, estado: 'publicado', pulado: 'já tinha id externo' };
  }
  if (dest.status === 'cancelado') return { rede, estado: 'cancelado' };

  const conector = CONECTORES[rede];
  if (!conector) {
    await gravarDestino(dest.id, { status: 'erro', erro: `Rede desconhecida: ${rede}.` });
    return { rede, estado: 'erro', erro: `Rede desconhecida: ${rede}.` };
  }

  const container = containerAnotado(dest);
  const retomando = dest.status === 'enviando';

  /* Preso em 'enviando' há muito tempo e sem container para retomar: pode ter
     publicado. Não retenta — pede olho humano. REGRA 4. */
  if (retomando && !container) {
    const parado = Date.now() - new Date(dest.atualizado_em ?? 0).getTime();
    if (parado > DESISTIR_APOS_MS) {
      await gravarDestino(dest.id, {
        status: 'erro',
        erro: 'O envio ficou preso e não dá para saber se o post saiu. Confira o perfil antes de publicar de novo — '
          + 'o robô não repete sozinho para não postar em dobro.',
      });
      return { rede, estado: 'erro', erro: 'envio preso; conferir manualmente' };
    }
    return { rede, estado: 'enviando', pulado: 'em andamento em outra rodada' };
  }

  if (!(await tomarDestino(dest, retomando))) {
    return { rede, estado: dest.status, pulado: 'outra rodada já pegou este destino' };
  }

  try {
    const midias = await midiasDaPublicacao(pub);
    const r = await conector({ pub, dest, midias, prazo, container });

    if (r.estado === 'publicado') {
      await gravarDestino(dest.id, {
        status: 'publicado', erro: null, id_externo: r.id_externo ?? null,
        link: r.link ?? null, publicado_em: agoraISO(),
      }, r.meta ?? undefined);
      return { rede, estado: 'publicado', id_externo: r.id_externo ?? null, link: r.link ?? null };
    }

    if (r.estado === 'enviando') {
      await gravarDestino(dest.id, { status: 'enviando', erro: r.erro ?? null }, r.meta ?? undefined);
      return { rede, estado: 'enviando', erro: r.erro ?? null };
    }

    await gravarDestino(dest.id, { status: 'erro', erro: r.erro ?? 'falha sem descrição' }, r.meta ?? undefined);
    return { rede, estado: 'erro', erro: r.erro ?? 'falha sem descrição', meta: r.meta ?? null };
  } catch (e) {
    const { frase, cru } = traduzirMeta(e);
    console.error('[publicar]', nome, frase, cru ? JSON.stringify(cru).slice(0, 400) : '');
    /* Se havia container em voo, a marca continua no texto: a próxima rodada
       retoma dali em vez de criar outro.

       CUIDADO com o container que nasceu DENTRO desta tentativa. `container` foi
       lido antes de chamar o conector e continua nulo — mas o conector gravou a
       marca na linha antes de começar a esperar. Sem reler, a marca se perde
       exatamente aqui, e o "publicar agora" seguinte sobe o arquivo OUTRA VEZ.
       Post em dobro é o que o resto deste arquivo inteiro existe para evitar. */
    let marca = container;
    if (!marca) {
      const { data } = await servico().from('mc_publicacoes_destino')
        .select('erro, meta').eq('id', dest.id).maybeSingle();
      if (data) marca = containerAnotado(data);
    }
    const sufixo = marca ? ' ' + marcarContainer(marca) : '';
    await gravarDestino(dest.id, { status: 'erro', erro: frase + sufixo }, cru ? { erro_cru: cru } : undefined);
    return { rede, estado: 'erro', erro: frase, meta: cru };
  }
}

/* ───────────────────── processamento de uma publicação ────────────────── */

function statusDaPublicacao(destinos: Record<string, any>[]): string {
  if (!destinos.length) return 'rascunho';
  const est = destinos.map((d) => d.status);
  if (est.every((s) => s === 'cancelado')) return 'cancelada';
  if (est.some((s) => s === 'fila' || s === 'enviando')) return 'enviando';
  if (est.some((s) => s === 'publicado')) return est.some((s) => s === 'erro') ? 'erro' : 'publicada';
  return 'erro';
}

async function processarPublicacao(id: string, prazo: number, opcoes: { automatico: boolean }) {
  const sb = servico();
  const { data: pub, error } = await sb.from('mc_publicacoes').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error('não deu para ler a publicação: ' + error.message);
  if (!pub) throw new Error('publicação não encontrada.');
  if (pub.status === 'cancelada') throw new Error('esta publicação está cancelada.');

  const { data: destinos, error: e2 } = await sb.from('mc_publicacoes_destino')
    .select('*').eq('publicacao_id', id).order('rede');
  if (e2) throw new Error('não deu para ler os destinos: ' + e2.message);
  if (!destinos?.length) throw new Error('esta publicação não tem nenhuma rede marcada.');

  await sb.from('mc_publicacoes').update({ status: 'enviando', atualizado_em: agoraISO() }).eq('id', id);

  const feitos: Record<string, unknown>[] = [];
  for (const d of destinos) {
    /* REGRA 2 — um destino por vez, e a falha de um não interrompe o laço.
       O `catch` aqui é a última rede: processarDestino já trata o que sabe. */
    if (opcoes.automatico && (d.tentativas ?? 0) >= MAX_TENTATIVAS_FILA && d.status !== 'enviando') {
      feitos.push({ rede: d.rede, estado: d.status, pulado: `parou após ${MAX_TENTATIVAS_FILA} tentativas; retomar pelo painel` });
      continue;
    }
    if (opcoes.automatico && d.status === 'erro') {
      /* Erro não volta sozinho para a fila: quem decide retentar é gente. */
      feitos.push({ rede: d.rede, estado: 'erro', pulado: 'em erro; retentar pelo painel' });
      continue;
    }
    if (Date.now() > prazo) {
      feitos.push({ rede: d.rede, estado: d.status, pulado: 'sem tempo nesta rodada; segue na próxima' });
      continue;
    }
    try {
      feitos.push(await processarDestino(pub, d, prazo));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'falha inesperada';
      console.error('[publicar] destino', rabo(d.id), msg);
      await gravarDestino(d.id, { status: 'erro', erro: msg });
      feitos.push({ rede: d.rede, estado: 'erro', erro: msg });
    }
  }

  const { data: finais } = await sb.from('mc_publicacoes_destino')
    .select('status').eq('publicacao_id', id);
  const novo = statusDaPublicacao(finais ?? []);
  await sb.from('mc_publicacoes').update({ status: novo, atualizado_em: agoraISO() }).eq('id', id);

  return { publicacao_id: id, status: novo, destinos: feitos };
}

/* ──────────────────────────── quem chamou ─────────────────────────────── */

async function quemChamou(req: Request): Promise<{ tipo: 'service_role' | 'cron' | 'operador'; id?: string; role?: string } | null> {
  const auth = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!auth) return null;
  if (!SB_URL || !SRK) return null;

  if (auth === SRK) return { tipo: 'service_role' };

  const sb = servico();
  try {
    const { data: tk } = await sb.from('mc_integrations')
      .select('access_token').eq('provider', 'cron_publicador').maybeSingle();
    if (tk?.access_token && auth === tk.access_token) return { tipo: 'cron' };

    const { data: u } = await sb.auth.getUser(auth);
    if (!u?.user) return null;
    const { data: op } = await sb.from('mc_admin_users')
      .select('id, role').eq('auth_uid', u.user.id).maybeSingle();
    if (!op) return null;
    return { tipo: 'operador', id: op.id, role: op.role };
  } catch {
    return null;
  }
}

/* ──────────────────────────── estado das redes ────────────────────────── */

/* Barato de propósito: `health` é aberta, então NÃO bate na Meta — lê só o que
   já está gravado. Health que faz chamada externa vira alavanca de ataque e
   gasta cota da empresa de graça. */
async function panorama() {
  const ig = await credencial('instagram', IG_TOKEN_ENV);
  const fb = await credencial('facebook');
  const tt = await credencial('tiktok');
  const ttSandbox = await credencial('tiktok_sandbox');
  const yt = await credencial('youtube');
  const ytOauth = await credencial('youtube_oauth');
  const escoposIg: string[] = Array.isArray((ig.meta as any)?.escopos) ? (ig.meta as any).escopos : [];

  const podeIg = Boolean(ig.token) && (!escoposIg.length || escoposIg.includes('instagram_content_publish'));
  const faltaFb = PERM_FACEBOOK.filter((p) => !escoposIg.includes(p) && !((fb.meta as any)?.escopos ?? []).includes(p));

  return {
    instagram: {
      conectado: Boolean(ig.token),
      conta: (ig.meta as any)?.ig_username ?? null,
      pode_publicar: podeIg,
      falta: podeIg ? [] : (ig.token ? ['instagram_content_publish'] : ['conectar o Instagram em Integrações']),
    },
    facebook: {
      conectado: Boolean(fb.token || ig.token),
      pagina: (fb.meta as any)?.pagina_nome ?? (ig.meta as any)?.pagina_nome ?? null,
      pode_publicar: Boolean(fb.token || ig.token) && !faltaFb.length,
      falta: faltaFb,
    },
    tiktok: (function () {
      /* Duas linhas: 'tiktok' e a producao (o token que o coletor le) e
         'tiktok_sandbox' e o app Sandbox, por onde publicamos enquanto a
         producao esta em analise. */
      const esc = (p: Cred) => (Array.isArray((p.meta as any)?.escopos) ? (p.meta as any).escopos as string[] : []);
      const daProd = esc(tt), daSand = esc(ttSandbox);
      const publica = (l: string[]) => l.indexOf('video.publish') >= 0 || l.indexOf('video.upload') >= 0;
      const usando = publica(daSand) ? 'sandbox' : (publica(daProd) ? 'producao' : null);
      const escopos = usando === 'sandbox' ? daSand : daProd;
      return {
        conectado: Boolean(tt.token || ttSandbox.token),
        token_vencido: tt.expira ? new Date(tt.expira).getTime() < Date.now() : null,
        pode_publicar: Boolean(usando),
        ambiente: usando,
        /* Direct Post exige video.publish E auditoria; o rascunho so exige o
           escopo. O painel precisa distinguir: rascunho nao e publicacao, e
           sim video esperando alguem finalizar no celular. */
        modo: escopos.indexOf('video.publish') >= 0 ? 'direct_post' : (escopos.indexOf('video.upload') >= 0 ? 'rascunho' : null),
        falta: usando ? [] : ['autorizar o TikTok com escopo video.upload/video.publish'],
      };
    })(),
    youtube: (function () {
      /* Duas linhas diferentes: 'youtube' guarda a CHAVE (só lê) e
         'youtube_oauth' guarda a autorização de upload. Misturar as duas foi o
         que quase apagou o refresh token — ver o comentário na youtube-proxy. */
      const oauth = (ytOauth?.meta as any) ?? {};
      const autorizado = Boolean(ytOauth?.refresh);
      return {
        conectado: Boolean(yt.token),
        canal: oauth.canal_titulo ?? (yt.meta as any)?.canal_titulo ?? null,
        pode_publicar: autorizado,
        falta: autorizado ? [] : (oauth.client_id
          ? ['autorizar em Integrações → Autorizar upload']
          : ['configurar o app do Google e autorizar em Integrações']),
        /* MEDIDO EM 01/09/2026, e derruba a previsão que estava escrita aqui: o
           primeiro vídeo subiu às 15:30 e saiu PÚBLICO. A trava de "projeto de
           API não auditado nasce travado em privado" está documentada pelo
           Google (developers.google.com/youtube/v3/docs/videos, atualizada em
           27/08/2026) e NÃO se aplicou a este projeto. Ou seja: não é preciso
           passar pela auditoria de conformidade para publicar. */
        observacao: null,
      };
    })(),
  };
}

/* ──────────────────────────────── porta ───────────────────────────────── */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const inicio = Date.now();
  const prazo = inicio + TETO_MS;

  let corpo: Record<string, unknown> = {};
  try { corpo = await req.json(); } catch { /* GET ou corpo vazio */ }

  const url = new URL(req.url);
  const action = String(corpo.action ?? url.searchParams.get('action') ?? 'health');

  /* `versao` é o que deixa conferir, de fora e sem sessão, QUAL código está no
     ar. Sem isso, depois de um deploy só dá para acreditar. */
  if (action === 'health') {
    return resposta({ ok: true, versao: VERSAO, redes: await panorama() });
  }

  const quem = await quemChamou(req);
  if (!quem) {
    return falha('sessão de operador ausente ou inválida — entre de novo no painel', null, 401);
  }

  try {
    switch (action) {
      /* ── processa todos os destinos de uma linha ── */
      case 'publicar':
      case 'agora': {
        const id = String(corpo.publicacao_id ?? '').trim();

        if (id) {
          if (action === 'publicar') {
            /* `publicar` respeita o relógio: adiantar é o que o `agora` faz. */
            const { data: p } = await servico().from('mc_publicacoes')
              .select('agendado_para, status').eq('id', id).maybeSingle();
            if (!p) return falha('publicação não encontrada.');
            const quando = p.agendado_para ? new Date(p.agendado_para).getTime() : 0;
            if (quando > Date.now() + 60_000) {
              return falha(`esta publicação está agendada para ${new Date(quando).toLocaleString('pt-BR')}. `
                + 'Use "publicar agora" se quiser adiantar.');
            }
          }
          const r = await processarPublicacao(id, prazo, { automatico: false });
          return resposta({ ok: true, chamado_por: quem.tipo, ...r });
        }

        if (action !== 'agora') return falha('publicacao_id é obrigatório.');

        /* `agora` avulso: cria a linha e publica na hora. Continua passando
           pelo banco de propósito — publicação sem registro é publicação que
           ninguém consegue auditar depois. */
        const redes = listar(corpo.redes ?? corpo.plataformas);
        if (!redes.length) return falha('escolha ao menos uma rede.');
        const invalidas = redes.filter((r) => !CONECTORES[r]);
        if (invalidas.length) return falha(`rede desconhecida: ${invalidas.join(', ')}.`);

        const midiaCaminho = String(corpo.midia_caminho ?? '').trim() || null;
        const midiaUrl = String(corpo.midia_url ?? '').trim() || null;
        const listaMidias = listar(corpo.midias);
        if (!midiaCaminho && !midiaUrl && !listaMidias.length) {
          return falha('informe a mídia (midia_caminho, midia_url ou midias[]).');
        }

        const { data: nova, error: e1 } = await servico().from('mc_publicacoes').insert({
          titulo: String(corpo.titulo ?? '').trim() || null,
          legenda: String(corpo.legenda ?? '').trim() || null,
          tipo: String(corpo.tipo ?? '').trim() || null,
          midia_caminho: midiaCaminho ?? (listaMidias.length ? JSON.stringify(listaMidias) : null),
          midia_url: midiaUrl,
          midia_mime: String(corpo.midia_mime ?? '').trim() || null,
          agendado_para: agoraISO(),
          status: 'enviando',
          project_id: corpo.project_id ? String(corpo.project_id) : null,
          criado_por: quem.id ?? null,
        }).select('id').single();
        if (e1) return falha('não deu para criar a publicação: ' + e1.message);

        const { error: e2 } = await servico().from('mc_publicacoes_destino')
          .insert(redes.map((r) => ({ publicacao_id: nova.id, rede: r, status: 'fila' })));
        if (e2) return falha('não deu para criar os destinos: ' + e2.message);

        const r = await processarPublicacao(String(nova.id), prazo, { automatico: false });
        return resposta({ ok: true, chamado_por: quem.tipo, criada: true, ...r });
      }

      /* ── estado de cada destino, em português ── */
      case 'status': {
        const id = String(corpo.publicacao_id ?? '').trim();
        if (!id) return falha('publicacao_id é obrigatório.');

        const { data: pub } = await servico().from('mc_publicacoes').select('*').eq('id', id).maybeSingle();
        if (!pub) return falha('publicação não encontrada.');
        const { data: destinos } = await servico().from('mc_publicacoes_destino')
          .select('rede, status, tentativas, erro, id_externo, link, publicado_em, atualizado_em')
          .eq('publicacao_id', id).order('rede');

        const legivel: Record<string, string> = {
          fila: 'na fila', enviando: 'enviando', publicado: 'no ar', erro: 'com erro', cancelado: 'cancelado',
        };
        return resposta({
          ok: true,
          publicacao: {
            id: pub.id, titulo: pub.titulo, tipo: pub.tipo,
            status: pub.status, agendado_para: pub.agendado_para,
          },
          destinos: (destinos ?? []).map((d) => ({
            ...d,
            /* A marca de container é ferramenta interna; some da tela. */
            erro: d.erro ? String(d.erro).replace(MARCA, '').trim() || null : null,
            resumo: legivel[d.status] ?? d.status,
          })),
        });
      }

      /* ── a chamada do pg_cron: pega o que venceu ── */
      case 'fila': {
        const limite = Math.min(Number(corpo.limite ?? 5), 20);
        const { data: vencidas, error } = await servico().from('mc_publicacoes')
          .select('id, agendado_para, status')
          .in('status', ['agendada', 'enviando'])
          .not('agendado_para', 'is', null)
          .lte('agendado_para', agoraISO())
          .order('agendado_para', { ascending: true })
          .limit(limite);
        if (error) return falha('não deu para ler a fila: ' + error.message);

        const feitas: unknown[] = [];
        for (const p of vencidas ?? []) {
          /* Para antes de estourar o tempo da invocação: o que sobrar continua
             vencido e sai na próxima rodada. Melhor sobrar que ser morto no
             meio de um media_publish. */
          if (Date.now() > prazo - 15_000) break;
          try {
            feitas.push(await processarPublicacao(String(p.id), prazo, { automatico: true }));
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'falha inesperada';
            console.error('[publicar] fila', rabo(String(p.id)), msg);
            feitas.push({ publicacao_id: p.id, status: 'erro', erro: msg });
          }
        }
        return resposta({
          ok: true, chamado_por: quem.tipo,
          vencidas: (vencidas ?? []).length, processadas: feitas.length,
          segundos: Math.round((Date.now() - inicio) / 1000), resultados: feitas,
        });
      }

      default:
        return falha(`ação desconhecida: ${action}`);
    }
  } catch (e) {
    const { frase, cru } = traduzirMeta(e);
    console.error('[publicar]', action, frase, cru ? JSON.stringify(cru).slice(0, 400) : '');
    return falha(frase, cru);
  }
});
