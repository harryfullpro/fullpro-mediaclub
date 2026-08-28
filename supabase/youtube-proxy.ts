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

  const r = await fetch(url.toString());
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  let corpo: Record<string, unknown> = {};
  try { corpo = await req.json(); } catch { /* GET ou corpo vazio */ }

  const url = new URL(req.url);
  const action = String(corpo.action ?? url.searchParams.get('action') ?? 'health');

  if (action === 'health') {
    /* `versao` é o que deixa conferir, de fora e sem sessão, QUAL código está
       no ar. Sem isso, depois de um deploy só dá para acreditar. */
    return resposta({ ok: true, versao: 'yt1', configurado: (await credencial()).chave.length > 0 });
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

  if (action === 'salvar' || action === 'desconectar') {
    if (!ehAdmin(operador)) {
      return falha('só administrador pode trocar a conexão do YouTube.', null, 403);
    }
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
