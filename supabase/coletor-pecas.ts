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

   CREDENCIAIS (28/08/2026): resolvidas em mc_integrations primeiro — é o que o
            painel grava quando um administrador reconecta em Integrações — e
            nos secrets IG_ACCESS_TOKEN / YOUTUBE_API_KEY como reserva. Nunca no
            config.js, que o navegador baixa. Ver supabase/integr-cred.md.
   Secrets: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (já existem).
            YOUTUBE_CHANNEL_ID é opcional (padrão: o canal da FullPro).
============================================================================= */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const IG_TOKEN_ENV = Deno.env.get('IG_ACCESS_TOKEN') || '';
const YT_KEY_ENV = Deno.env.get('YOUTUBE_API_KEY') || '';
const YT_CANAL = Deno.env.get('YOUTUBE_CHANNEL_ID') || 'UC3IfjxanbihK-WKcwE9RRAQ';

const GRAPH = 'https://graph.facebook.com/v21.0';
const YT = 'https://www.googleapis.com/youtube/v3';

function json(dados: unknown, status = 200) {
  return new Response(JSON.stringify(dados), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/* De onde vem a credencial: mc_integrations primeiro (é o que o painel grava
   quando um administrador reconecta em Integrações), secret depois — reserva
   para não derrubar o que já funcionava. Nunca o config.js, que o navegador
   baixa. Ver supabase/integr-cred.md.
   Sem isto, reconectar no painel não mudaria nada AQUI, que é justamente o
   lugar que não pode parar: story vive 24h e não dá para buscar depois. */
async function credencial(sb: any, provider: string, reserva: string): Promise<string> {
  try {
    const { data } = await sb.from('mc_integrations')
      .select('access_token').eq('provider', provider).maybeSingle();
    if (data?.access_token) return data.access_token as string;
  } catch (e) {
    console.error('[coletor-pecas] mc_integrations/' + provider, e instanceof Error ? e.message : e);
  }
  return reserva;
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

/* Paginação da Graph API. `paging.next` já vem com o token dentro, então é só
   seguir. O teto de páginas não é medo de loop: é conta de cota — a conta tem
   153 mídias, ou 4 páginas de 50. Vinte páginas é folga de 6x e ainda avisa
   quando bater, em vez de cortar em silêncio. */
async function graphTudo(url0: string, maxPag: number, rotulo: string, erros: string[]) {
  const itens: any[] = [];
  let url = url0, pag = 0;
  while (url && pag < maxPag) {
    const r = await fetch(url);
    const j = await r.json().catch(() => ({}));
    if (j?.error) { erros.push(rotulo + ': ' + j.error.message); break; }
    for (const it of (j.data || [])) itens.push(it);
    url = j.paging?.next || '';
    pag++;
  }
  if (url) erros.push(rotulo + ': parei em ' + maxPag + ' páginas — há mais para trás');
  return itens;
}

/* ── O story é recompartilhamento? ────────────────────────────────────────
   NENHUMA API diz isso: nem o Instagram nem o TikTok marcam repost, e a borda
   /stories devolve só id, tipo, permalink e horário. O sinal que existe é a
   IMAGEM, porque quem desenha o recompartilhamento é o próprio Instagram: post
   recompartilhado aparece como uma imagem MENOR centrada sobre fundo liso, com
   faixas de baixo detalhe em cima e embaixo. Story de câmera preenche o quadro
   de ponta a ponta.

   O LIMITE, dito aqui para não ser descoberto depois: story promocional PRÓPRIO
   — produto centrado em fundo liso — tem exatamente esse desenho. A medida
   distingue "imagem centrada em fundo liso" de "quadro cheio", e não "repost"
   de "próprio". Por isso o resultado vai para auto_repost (palpite), NUNCA
   direto para eh_repost (o que vale): quem tem classificado_em manda.

   Guarda as MEDIDAS junto do palpite de propósito. O limiar aqui é o meu
   melhor chute; com os números dos stories reais dá para acertá-lo depois em
   vez de continuar chutando. */
const AM_L = 32, AM_A = 64;   /* grade de amostragem: 32 colunas x 64 linhas */

/* O decodificador entra por import DINÂMICO, dentro de try, e uma vez só.
   `jpeg-js` é JS puro e deve rodar no edge runtime — mas "deve" não é medida, e
   import no topo do arquivo que falha derruba a FUNÇÃO INTEIRA. A coleta é
   obrigação (story vive 24h); medir a imagem é bônus. Se o import quebrar,
   quebra o bônus. */
let _jpeg: any = null;
let _jpegRuim = false;
async function decodificador() {
  if (_jpeg || _jpegRuim) return _jpeg;
  try {
    const mod = await import('npm:jpeg-js@0.4.4');
    _jpeg = (mod as any).default ?? mod;
  } catch {
    _jpegRuim = true;
  }
  return _jpeg;
}

async function analisarStory(bin: Uint8Array) {
  const jpeg = await decodificador();
  if (!jpeg) throw new Error('sem decodificador de imagem nesta função');
  const img = jpeg.decode(bin, { useTArray: true });
  const W = img.width, H = img.height, d = img.data;
  if (!W || !H) throw new Error('imagem vazia');

  const luma = (x: number, y: number) => {
    const i = (y * W + x) * 4;
    return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  };

  const varLinha: number[] = [];
  for (let r = 0; r < AM_A; r++) {
    const y = Math.min(H - 1, Math.floor((r + 0.5) * H / AM_A));
    const v: number[] = [];
    let soma = 0;
    for (let c = 0; c < AM_L; c++) {
      const x = Math.min(W - 1, Math.floor((c + 0.5) * W / AM_L));
      const l = luma(x, y); v.push(l); soma += l;
    }
    const m = soma / v.length;
    varLinha.push(v.reduce((acc, x) => acc + (x - m) * (x - m), 0) / v.length);
  }

  const LISO = 60;      /* variância de linha abaixo disso = linha lisa */
  let topo = 0; while (topo < AM_A && varLinha[topo] < LISO) topo++;
  let base = 0; while (base < AM_A && varLinha[AM_A - 1 - base] < LISO) base++;
  const meio = varLinha.slice(topo, AM_A - base);
  const varMeio = meio.length ? Math.round(meio.reduce((a, b) => a + b, 0) / meio.length) : 0;
  const topoPct = Math.round(100 * topo / AM_A);
  const basePct = Math.round(100 * base / AM_A);

  /* As duas pontas lisas E o miolo com textura. Uma ponta só não serve: story
     de câmera com céu em cima dá faixa lisa no topo e nada embaixo. */
  const parece = topoPct >= 8 && basePct >= 8 && varMeio > 200;
  const motivo = parece
    ? 'faixa lisa de ' + topoPct + '% em cima e ' + basePct + '% embaixo, com miolo texturizado'
      + ' — é como o Instagram desenha post recompartilhado (mas promo própria em fundo liso é igual)'
    : (topoPct < 8 && basePct < 8
        ? 'imagem preenche o quadro de ponta a ponta (' + topoPct + '%/' + basePct + '%) — cara de story de câmera'
        : 'só uma ponta lisa (' + topoPct + '%/' + basePct + '%) — não é o desenho do recompartilhamento');

  return { parece, motivo, medidas: { topo_pct: topoPct, base_pct: basePct, var_meio: varMeio } };
}

/* A miniatura do story, copiada para o nosso bucket.
   POR QUE COPIAR: `media_url` e `permalink` de story morrem com o story, em 24
   horas. O dono aceitou que a classificação repost/próprio seja visual — e para
   ser visual a imagem tem que existir na hora de olhar, não na hora de coletar.
   Guardar a URL da Meta seria guardar um link quebrado.
   `jaTem` evita rebaixar a mesma imagem de hora em hora: story vive 24h, então
   sem isso seriam ~24 downloads do mesmo arquivo. */
async function thumbDoStory(sb: any, m: any, jaTem: Map<string, Record<string, unknown>>, erros: string[]) {
  if (jaTem.has(m.id)) return null;
  const url = m.thumbnail_url || m.media_url;
  if (!url) return null;
  const caminho = m.id + '.jpg';
  try {
    const r = await fetch(url);
    if (!r.ok) { erros.push('story ' + m.id + ': imagem não baixou (' + r.status + ')'); return null; }
    const bin = new Uint8Array(await r.arrayBuffer());
    const { error } = await sb.storage.from('stories')
      .upload(caminho, bin, { contentType: 'image/jpeg', upsert: true });
    if (error) { erros.push('story ' + m.id + ': ' + error.message); return null; }

    /* A análise vem de graça: os bytes já estão na mão. Se ela falhar, o story
       ainda foi guardado — palpite é bônus, coleta é obrigação. */
    let analise = null;
    try {
      analise = await analisarStory(bin);
    } catch (e) {
      erros.push('story ' + m.id + ': não deu para medir a imagem ('
        + (e instanceof Error ? e.message : 'falhou') + ')');
    }
    return { caminho, analise };
  } catch (e) {
    erros.push('story ' + m.id + ': ' + (e instanceof Error ? e.message : 'falhou'));
    return null;
  }
}

/* ---------- Instagram ---------- */
async function instagram(sb: any, IG_TOKEN: string, erros: string[], analisados: any[]) {
  const pecas: any[] = [];
  if (!IG_TOKEN) { erros.push('instagram: sem token — conecte em Integrações'); return pecas; }

  /* O token do usuário não lê mídia: quem lê é o token da PÁGINA que tem a
     conta Instagram business ligada. É o mesmo caminho que o painel já faz. */
  const rc = await fetch(`${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${IG_TOKEN}`);
  const contas = await rc.json();
  if (contas.error) { erros.push('instagram: ' + contas.error.message); return pecas; }
  const pagina = (contas.data || []).find((p: any) => p.instagram_business_account);
  if (!pagina) { erros.push('instagram: nenhuma página com conta business ligada'); return pecas; }
  const tok = pagina.access_token;
  const igId = pagina.instagram_business_account.id;

  const guardar = (m: any, tipo: string, extra?: Record<string, unknown>) => {
    pecas.push({
      fonte: 'instagram', externo_id: m.id, tipo, plataforma: 'instagram',
      titulo: (m.caption || '').slice(0, 300) || null,
      link: m.permalink || null,
      publicado_em: m.timestamp,
      duracao_seg: null,
      metricas: { likes: m.like_count ?? null, comments: m.comments_count ?? null },
      bruto: Object.assign({ media_type: m.media_type, media_product_type: m.media_product_type }, extra || {}),
    });
  };

  /* TUDO, não as 50 mais recentes. O dono pediu "todos os vídeos registrados",
     e o corte em 50 deixava fora o que veio antes — inclusive meses fechados,
     que é o que dá para comparar. */
  const midias = await graphTudo(
    `${GRAPH}/${igId}/media?fields=id,permalink,caption,timestamp,media_type,media_product_type,like_count,comments_count&limit=50&access_token=${tok}`,
    20, 'instagram/media', erros);
  for (const m of midias) {
    /* CAROUSEL_ALBUM antes de REELS: um carrossel nunca é REELS, mas a ordem
       deixa a intenção explícita para quem ler depois. */
    if (m.media_type === 'CAROUSEL_ALBUM') guardar(m, 'carrossel');
    else if (m.media_product_type === 'REELS') guardar(m, 'short');
    else guardar(m, 'outro');
  }

  /* Stories: só as últimas 24h existem aqui, e é por isso que esta função é
     agendada de hora em hora. Repost ou próprio, TODOS entram — a classificação
     é visual e vem depois, no painel. */
  /* MAPA, não conjunto, e a diferença é um bug que apagava dado.

     Quando o story já tem miniatura, thumbDoStory devolve null para não baixar
     de novo — e o `guardar` abaixo montava `bruto` com `{}`. Como o upsert
     SUBSTITUI o jsonb inteiro, isso APAGAVA thumb e medidas a cada rodada. Foi
     por isso que 3 stories de 31/08 e 01/09 ficaram com o arquivo no bucket e
     bruto.thumb nulo: a imagem existia, a evidência da análise não.

     Guardando o valor anterior, a rodada seguinte o repassa em vez de zerar. */
  const jaTem = new Map<string, Record<string, unknown>>();
  try {
    const { data: comThumb } = await sb.from('mc_pecas')
      .select('externo_id, bruto').eq('fonte', 'instagram').eq('tipo', 'story');
    for (const r of (comThumb || [])) {
      if (r?.bruto?.thumb) jaTem.set(r.externo_id, { thumb: r.bruto.thumb, medidas: r.bruto.medidas });
    }
  } catch (e) {
    /* Não saber quais já têm miniatura só custa download repetido — não pode
       derrubar a coleta dos stories, que é a parte que não dá para refazer. */
    erros.push('instagram/stories: não deu para ler as miniaturas já guardadas');
  }

  /* media_url/thumbnail_url na borda /stories: se a Meta recusar os campos, a
     chamada inteira volta com erro — então há um plano B sem eles, para não
     perder o story só porque a miniatura não veio. */
  const campos = 'id,permalink,timestamp,media_type,media_product_type,media_url,thumbnail_url';
  /* Erros em lista LOCAL: `erros` é compartilhado com o YouTube e o TikTok, que
     rodam em paralelo — mexer em índice dele apagaria erro de outro coletor. */
  const errosA: string[] = [];
  let stories = await graphTudo(`${GRAPH}/${igId}/stories?fields=${campos}&access_token=${tok}`, 5, 'instagram/stories', errosA);
  if (stories.length) {
    erros.push(...errosA);
  } else {
    const errosB: string[] = [];
    stories = await graphTudo(`${GRAPH}/${igId}/stories?fields=id,permalink,timestamp,media_type,media_product_type&access_token=${tok}`,
      5, 'instagram/stories', errosB);
    /* Se o plano B trouxe story, o "não" do plano A era só sobre os campos de
       imagem e virou ruído. Se nem o B trouxe, os dois erros importam. */
    if (!stories.length) erros.push(...errosA, ...errosB);
  }

  /* As análises saem em lista separada: elas viram UPDATE depois do upsert, e
     não campo do upsert. Se fossem campo, o story que já tem miniatura (e que
     por isso não é rebaixado nem remedido) teria auto_repost apagado a cada
     hora — PostgREST preenche com NULL a coluna que não vem no lote. */
  for (const m of stories) {
    const res = await thumbDoStory(sb, m, jaTem, erros);
    const antes = jaTem.get(m.id);
    /* Novo: grava o que acabou de medir. Já tinha: REPASSA o que já estava, em
       vez de mandar {} e deixar o upsert apagar. Sem miniatura nenhuma: {}
       mesmo, que é o estado verdadeiro. */
    const extra = res && res.caminho
      ? { thumb: res.caminho, medidas: res.analise?.medidas }
      : (antes
          ? (antes.medidas === undefined || antes.medidas === null
              ? { thumb: antes.thumb }
              : { thumb: antes.thumb, medidas: antes.medidas })
          : {});
    guardar(m, 'story', extra);
    if (res && res.analise) {
      analisados.push({ externo_id: m.id, parece: res.analise.parece, motivo: res.analise.motivo });
    }
  }

  return pecas;
}

/* ---------- YouTube ---------- */
async function youtube(YT_KEY: string, erros: string[]) {
  const pecas: any[] = [];
  if (!YT_KEY) { erros.push('youtube: sem chave — conecte em Integrações'); return pecas; }

  /* A playlist de uploads do canal é `UU` + o id do canal sem o `UC`. Vem
     assim da própria API; não é truque. */
  const uploads = 'UU' + YT_CANAL.replace(/^UC/, '');

  /* O canal inteiro, não a primeira página. playlistItems custa 1 unidade por
     página de 50 — com 67 vídeos são 2 páginas, 2 unidades. Barato o suficiente
     para rodar de hora em hora e ainda sobrar cota (o teto é 10.000/dia). */
  const ids: string[] = [];
  let token = '', pag = 0;
  do {
    const u = `${YT}/playlistItems?part=contentDetails&playlistId=${uploads}&maxResults=50&key=${YT_KEY}`
      + (token ? '&pageToken=' + token : '');
    const j = await (await fetch(u)).json().catch(() => ({}));
    if (j?.error) { erros.push('youtube: ' + (j.error.message || '')); break; }
    for (const i of (j.items || [])) if (i.contentDetails?.videoId) ids.push(i.contentDetails.videoId);
    token = j.nextPageToken || '';
    pag++;
  } while (token && pag < 20);
  if (token) erros.push('youtube: parei em 20 páginas de uploads');
  if (!ids.length) return pecas;

  /* `videos` aceita 50 ids por pedido e cobra a mesma unidade que cobraria por
     um id sozinho — daí o lote. */
  const itens: any[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const lote = ids.slice(i, i + 50);
    const rv = await fetch(`${YT}/videos?part=snippet,contentDetails,statistics&id=${lote.join(',')}&key=${YT_KEY}`);
    const vids = await rv.json().catch(() => ({}));
    if (vids?.error) { erros.push('youtube/videos: ' + (vids.error.message || '')); break; }
    for (const v of (vids.items || [])) itens.push(v);
  }

  for (const v of itens) {
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
  /* 20 é o máximo por pedido; o resto vem seguindo o cursor. Sem isto o TikTok
     só entregava os 20 últimos e vídeo de mês fechado nunca aparecia. */
  const videos: any[] = [];
  let cursor: number | undefined;
  let volta = 0;
  while (volta < 10) {
    const corpo: Record<string, unknown> = { max_count: 20 };
    if (cursor) corpo.cursor = cursor;
    const r = await fetch('https://open.tiktokapis.com/v2/video/list/?fields=id,title,create_time,share_url,view_count,like_count,comment_count', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + integ.access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const d = await r.json().catch(() => ({}));
    if (d?.error && d.error.code !== 'ok') { erros.push('tiktok: ' + (d.error.message || d.error.code)); break; }
    for (const v of (d?.data?.videos || [])) videos.push(v);
    if (!d?.data?.has_more) break;
    cursor = d.data.cursor;
    volta++;
  }
  if (volta >= 10) erros.push('tiktok: parei em 10 páginas');

  for (const v of videos) {
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

  /* TRÊS portas, e nenhuma delas é aberta.
       1. service role  — máquina, para quem tiver a chave do projeto.
       2. token do cron — o pg_cron chamando de hora em hora. O token é gerado
          pelo próprio banco (mc_integrations, provider 'cron_coletor') e só
          serve para esta função: é bem menos poder que a service role key, que
          é o que estaria no comando do cron se eu tivesse ido pelo caminho
          fácil. Trocar é um UPDATE de uma linha.
       3. JWT de operador — o botão "Atualizar" do painel. "Estar logado" NÃO
          basta: esta função gasta cota da Meta e do Google com a credencial da
          empresa, então tem que ser gente da equipe (mc_admin_users). Antes
          qualquer usuário do Auth passava, e havia 1 usuário sem operador
          correspondente.
     verify_jwt fica DESLIGADO no gateway de propósito: o token do cron não é um
     JWT e seria recusado antes de chegar aqui. Quem separa é este bloco. */
  const auth = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  let quem: string | null = null;

  if (auth && auth === SRK) {
    quem = 'service_role';
  } else if (auth) {
    const { data: tk } = await sb.from('mc_integrations')
      .select('access_token').eq('provider', 'cron_coletor').maybeSingle();
    if (tk?.access_token && auth === tk.access_token) {
      quem = 'cron';
    } else {
      const { data: u } = await sb.auth.getUser(auth);
      if (u?.user) {
        const { data: op } = await sb.from('mc_admin_users')
          .select('id').eq('auth_uid', u.user.id).maybeSingle();
        if (op) quem = 'operador';
      }
    }
  }
  if (!quem) return json({ erro: 'Não autorizado.' }, 401);

  const erros: string[] = [];
  const analisados: any[] = [];
  const [igToken, ytChave] = await Promise.all([
    credencial(sb, 'instagram', IG_TOKEN_ENV),
    credencial(sb, 'youtube', YT_KEY_ENV),
  ]);
  const lotes = await Promise.all([
    instagram(sb, igToken, erros, analisados).catch((e) => { erros.push('instagram: ' + e.message); return []; }),
    youtube(ytChave, erros).catch((e) => { erros.push('youtube: ' + e.message); return []; }),
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

  /* O palpite vai em UPDATE, um por story analisado, e só onde NINGUÉM olhou:
     `classificado_em is null`. Assim o coletor pode melhorar o palpite de hora
     em hora sem desfazer a correção de quem olhou a imagem. */
  let palpites = 0;
  for (const a of analisados) {
    const { error } = await sb.from('mc_pecas')
      .update({ auto_repost: a.parece, auto_motivo: a.motivo, auto_em: new Date().toISOString() })
      .eq('fonte', 'instagram').eq('externo_id', a.externo_id)
      .is('classificado_em', null);
    if (error) erros.push('palpite ' + a.externo_id + ': ' + error.message);
    else palpites++;
  }

  const porTipo: Record<string, number> = {};
  pecas.forEach((p) => { porTipo[p.tipo] = (porTipo[p.tipo] || 0) + 1; });

  return json({ ok: erros.length === 0, chamado_por: quem, encontradas: pecas.length, gravadas,
                stories_analisados: palpites, por_tipo: porTipo, erros });
});
