import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/* =============================================================================
   coletor-pecas — traz do Instagram, do YouTube e do TikTok TUDO que foi
   publicado, e grava uma linha por peça em mc_pecas.

   POR QUE ISTO EXISTE
   -------------------
   O painel media metas contando link preenchido em mc_projects.posts, e datava
   a peça pela `production_date` — a data da GRAVAÇÃO. Vídeo gravado em julho e
   publicado em agosto contava em julho. Aqui a data vem da plataforma.

   E POR QUE PRECISA SER AGENDADO
   ------------------------------
   Story do Instagram vive 24 horas. `/{ig}/stories` só devolve o que está no ar
   AGORA. Sem alguém chamando isto de hora em hora, story publicado numa
   sexta-feira à noite simplesmente não existe na segunda — não há como buscar
   depois. É esta função, e não o navegador de alguém, que garante a contagem.
   O agendamento é pg_cron + pg_net (ver a migração `coletor_agendado`).

   O QUE CADA PLATAFORMA CONSEGUE DIZER — medido contra as contas reais, e não
   suposto a partir da documentação:

     Instagram  /media    -> media_product_type = REELS | FEED | AD
                             media_type         = VIDEO | IMAGE | CAROUSEL_ALBUM
                             Na conta da FullPro, as 25 mídias mais recentes
                             deram 21 REELS e 4 CAROUSEL_ALBUM. Carrossel e
                             vídeo curto saem daqui, separados, sem digitação.
     Instagram  /stories  -> devolveu 4 stories das últimas 24h. Funciona.
     YouTube    contentDetails.duration -> a duração que o painel nunca teve.
     TikTok     -> devolve no máximo os 20 vídeos mais recentes.

   O QUE NENHUMA API DIZ: se uma peça é REPOST. Nem o Instagram nem o TikTok
   marcam recompartilhamento. Por isso `eh_repost` fica false aqui e é marcado
   à mão no painel, num toque, sobre a lista que esta função já trouxe — bem
   mais barato do que registrar do zero.

   Secrets: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (já existem),
            IG_ACCESS_TOKEN e YOUTUBE_API_KEY (precisam ser criados; hoje eles
            vivem no config.js, que o navegador baixa — mover para cá também
            tira os dois de um arquivo público).
            YOUTUBE_CHANNEL_ID é opcional (padrão: o canal da FullPro).
============================================================================= */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const IG_TOKEN = Deno.env.get('IG_ACCESS_TOKEN') || '';
const YT_KEY = Deno.env.get('YOUTUBE_API_KEY') || '';
const YT_CANAL = Deno.env.get('YOUTUBE_CHANNEL_ID') || 'UC3IfjxanbihK-WKcwE9RRAQ';

const GRAPH = 'https://graph.facebook.com/v21.0';
const YT = 'https://www.googleapis.com/youtube/v3';

function json(dados: unknown, status = 200) {
  return new Response(JSON.stringify(dados), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/* ISO 8601 do YouTube (PT8M8S) para segundos. */
function duracaoSeg(iso: string): number | null {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '');
  if (!m) return null;
  return (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
}

/* A REGRA DE CLASSIFICAÇÃO DO YOUTUBE, num lugar só.
   O título manda no "pure sound" porque foi o que o dono pediu e porque a
   equipe já escreve assim ("MT07 COM ESCAPE ESPORTIVO | PURE SOUND | 4K").
   A duração manda no resto.
   Medido no canal: há um "Pure Sound Triumph Speed 1200" de 20 minutos. Ele é
   pure_sound pelo título e o painel mostra a duração ao lado — quem definiu a
   meta decide se conta. Esconder isso numa regra silenciosa seria pior. */
function tipoYouTube(titulo: string, seg: number | null): string {
  if (/pure\s*sound/i.test(titulo || '')) return 'pure_sound';
  if (seg != null && seg <= 180) return 'short';               // Shorts
  if (seg != null && seg >= 600 && seg <= 900) return 'longo_10_15';
  return 'longo';
}

/* ---------- Instagram ---------- */
async function instagram(erros: string[]) {
  const pecas: any[] = [];
  if (!IG_TOKEN) { erros.push('instagram: falta o secret IG_ACCESS_TOKEN'); return pecas; }

  /* O token do usuário não lê mídia: quem lê é o token da PÁGINA que tem a
     conta Instagram business ligada. É o mesmo caminho que o painel já faz. */
  const rc = await fetch(`${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${IG_TOKEN}`);
  const contas = await rc.json();
  if (contas.error) { erros.push('instagram: ' + contas.error.message); return pecas; }
  const pagina = (contas.data || []).find((p: any) => p.instagram_business_account);
  if (!pagina) { erros.push('instagram: nenhuma página com conta business ligada'); return pecas; }
  const tok = pagina.access_token;
  const igId = pagina.instagram_business_account.id;

  const guardar = (m: any, tipo: string, plataforma = 'instagram') => {
    pecas.push({
      fonte: 'instagram', externo_id: m.id, tipo, plataforma,
      titulo: (m.caption || '').slice(0, 300) || null,
      link: m.permalink || null,
      publicado_em: m.timestamp,
      duracao_seg: null,
      metricas: { likes: m.like_count ?? null, comments: m.comments_count ?? null },
      bruto: { media_type: m.media_type, media_product_type: m.media_product_type },
    });
  };

  const rm = await fetch(`${GRAPH}/${igId}/media?fields=id,permalink,caption,timestamp,media_type,media_product_type,like_count,comments_count&limit=50&access_token=${tok}`);
  const midias = await rm.json();
  if (midias.error) erros.push('instagram/media: ' + midias.error.message);
  for (const m of (midias.data || [])) {
    /* CAROUSEL_ALBUM antes de REELS: um carrossel nunca é REELS, mas a ordem
       deixa a intenção explícita para quem ler depois. */
    if (m.media_type === 'CAROUSEL_ALBUM') guardar(m, 'carrossel');
    else if (m.media_product_type === 'REELS') guardar(m, 'short');
    else guardar(m, 'outro');
  }

  /* Só as últimas 24h existem aqui. É por isso que esta função é agendada. */
  const rs = await fetch(`${GRAPH}/${igId}/stories?fields=id,permalink,timestamp,media_type,media_product_type&access_token=${tok}`);
  const stories = await rs.json();
  if (stories.error) erros.push('instagram/stories: ' + stories.error.message);
  for (const m of (stories.data || [])) guardar(m, 'story');

  return pecas;
}

/* ---------- YouTube ---------- */
async function youtube(erros: string[]) {
  const pecas: any[] = [];
  if (!YT_KEY) { erros.push('youtube: falta o secret YOUTUBE_API_KEY'); return pecas; }

  /* A playlist de uploads do canal é `UU` + o id do canal sem o `UC`. Vem
     assim da própria API; não é truque. */
  const uploads = 'UU' + YT_CANAL.replace(/^UC/, '');
  const rp = await fetch(`${YT}/playlistItems?part=contentDetails&playlistId=${uploads}&maxResults=50&key=${YT_KEY}`);
  const lista = await rp.json();
  if (lista.error) { erros.push('youtube: ' + (lista.error.message || '')); return pecas; }
  const ids = (lista.items || []).map((i: any) => i.contentDetails?.videoId).filter(Boolean);
  if (!ids.length) return pecas;

  /* Um pedido só para os 50: `videos` aceita ids em lote e é isso que mantém a
     cota baixa o suficiente para rodar de hora em hora. */
  const rv = await fetch(`${YT}/videos?part=snippet,contentDetails,statistics&id=${ids.join(',')}&key=${YT_KEY}`);
  const vids = await rv.json();
  if (vids.error) { erros.push('youtube/videos: ' + (vids.error.message || '')); return pecas; }

  for (const v of (vids.items || [])) {
    const seg = duracaoSeg(v.contentDetails?.duration);
    const titulo = v.snippet?.title || '';
    pecas.push({
      fonte: 'youtube', externo_id: v.id, tipo: tipoYouTube(titulo, seg),
      plataforma: 'youtube', titulo: titulo.slice(0, 300),
      link: 'https://www.youtube.com/watch?v=' + v.id,
      publicado_em: v.snippet?.publishedAt,
      duracao_seg: seg,
      metricas: {
        views: Number(v.statistics?.viewCount) || 0,
        likes: Number(v.statistics?.likeCount) || 0,
        comments: Number(v.statistics?.commentCount) || 0,
      },
      bruto: { duration: v.contentDetails?.duration, channelId: v.snippet?.channelId },
    });
  }
  return pecas;
}

/* ---------- TikTok ---------- */
async function tiktok(sb: any, erros: string[]) {
  const pecas: any[] = [];
  const { data: integ } = await sb.from('mc_integrations').select('access_token, expires_at')
    .eq('provider', 'tiktok').maybeSingle();
  if (!integ?.access_token) { erros.push('tiktok: sem token gravado'); return pecas; }
  if (integ.expires_at && new Date(integ.expires_at) < new Date()) {
    erros.push('tiktok: token vencido em ' + String(integ.expires_at).slice(0, 10) + ' — reconectar em Integrações');
    return pecas;
  }
  const r = await fetch('https://open.tiktokapis.com/v2/video/list/?fields=id,title,create_time,share_url,view_count,like_count,comment_count', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + integ.access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ max_count: 20 }),
  });
  const d = await r.json();
  if (d.error && d.error.code !== 'ok') { erros.push('tiktok: ' + (d.error.message || d.error.code)); return pecas; }
  for (const v of (d.data?.videos || [])) {
    pecas.push({
      fonte: 'tiktok', externo_id: String(v.id), tipo: 'short', plataforma: 'tiktok',
      titulo: (v.title || '').slice(0, 300), link: v.share_url || null,
      publicado_em: new Date((v.create_time || 0) * 1000).toISOString(),
      duracao_seg: null,
      metricas: { views: v.view_count ?? 0, likes: v.like_count ?? 0, comments: v.comment_count ?? 0 },
      bruto: {},
    });
  }
  return pecas;
}

/* ---------- clips (fonte interna, não é API) ---------- */
async function clips(sb: any, erros: string[]) {
  const pecas: any[] = [];
  const { data, error } = await sb.from('mc_clips')
    .select('id, sku, product_name, ml_link, recorded_at, created_at, status')
    .not('recorded_at', 'is', null);
  if (error) { erros.push('clips: ' + error.message); return pecas; }
  for (const c of (data || [])) {
    pecas.push({
      fonte: 'clip', externo_id: c.id, tipo: 'clip', plataforma: 'mercado_livre',
      titulo: c.product_name || c.sku, link: c.ml_link || null,
      publicado_em: c.recorded_at || c.created_at,
      duracao_seg: null, metricas: {}, bruto: { status: c.status },
      sku: c.sku || null,
    });
  }
  return pecas;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const sb = createClient(SB_URL, SRK, { auth: { persistSession: false } });

  /* Duas portas: o cron entra com a chave de serviço; o botão "Atualizar
     agora" do painel entra com a sessão de quem clicou. Ninguém mais entra. */
  const auth = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  let permitido = auth === SRK;
  if (!permitido && auth) {
    const { data } = await sb.auth.getUser(auth);
    permitido = !!data?.user;
  }
  if (!permitido) return json({ erro: 'Não autorizado.' }, 401);

  const erros: string[] = [];
  const lotes = await Promise.all([
    instagram(erros).catch((e) => { erros.push('instagram: ' + e.message); return []; }),
    youtube(erros).catch((e) => { erros.push('youtube: ' + e.message); return []; }),
    tiktok(sb, erros).catch((e) => { erros.push('tiktok: ' + e.message); return []; }),
    clips(sb, erros).catch((e) => { erros.push('clips: ' + e.message); return []; }),
  ]);
  const pecas = lotes.flat().filter((p) => p.externo_id && p.publicado_em);

  let gravadas = 0;
  /* `ignoreDuplicates: false` = atualiza a linha que já existe. É assim que a
     contagem de views de um vídeo antigo continua subindo sem duplicar a peça.
     NÃO se manda `eh_repost` no upsert: essa marca é do operador, e o coletor
     rodando de hora em hora a apagaria toda hora. */
  for (let i = 0; i < pecas.length; i += 200) {
    const lote = pecas.slice(i, i + 200).map((p) => ({ ...p, atualizado_em: new Date().toISOString() }));
    const { error } = await sb.from('mc_pecas')
      .upsert(lote, { onConflict: 'fonte,externo_id', ignoreDuplicates: false });
    if (error) erros.push('gravar: ' + error.message);
    else gravadas += lote.length;
  }

  const porTipo: Record<string, number> = {};
  pecas.forEach((p) => { porTipo[p.tipo] = (porTipo[p.tipo] || 0) + 1; });

  return json({ ok: erros.length === 0, encontradas: pecas.length, gravadas, por_tipo: porTipo, erros });
});
