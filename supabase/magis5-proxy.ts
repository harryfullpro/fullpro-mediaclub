/**
 * magis5-proxy — ponte entre o painel e a API do Magis5.
 *
 * Por que existe: a chave do Magis5 (X-MAGIS5-APIKEY) dá acesso de escrita ao
 * hub inteiro — pedidos, produtos, composição de kit. Ela NÃO pode viver no
 * navegador (o config.js é público). Fica só aqui, em MAGIS5_API_KEY, e a
 * função exige a sessão do operador (id de mc_admin_users) em todo chamado.
 *
 * Ações — em ?action= ou no corpo {action}, porque o painel chama por
 * sb.functions.invoke(), que sempre manda POST com JSON:
 *   health                     -> { configurado: bool }
 *   produto     { sku }        -> produto + productsComposition
 *   composicao  { sku, itens } -> PATCH da composição do kit
 *
 * A API do Magis5 não tem busca de produto por nome: só GET /v1/products/{sku}
 * (SKU principal ou alternativo) e a listagem paginada sem filtro de texto.
 * Por isso quem escolhe o produto é o Bling, no painel, e o SKU é a ponte.
 */

const BASE = 'https://app.magis5.com.br/v1';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function resposta(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/* --------------------------------------------------------------- operador ---
   MIGRACAO DE CREDENCIAL (28/08/2026)

   O esquema antigo era: o painel manda o UUID de mc_admin_users guardado em
   fp_session, e aqui se confere que ele existe. O problema nao e adivinhacao —
   o UUID e aleatorio — e sim que ele NUNCA EXPIRA e ja foi publico: antes da
   mc-login existir, mc_admin_users era legivel inteira sem login. Quem coletou
   naquela janela tem credencial permanente ate hoje.

   O esquema novo usa o JWT do Supabase Auth, que expira e rotaciona. Atencao:
   verify_jwt sozinho NAO resolve — a chave publicavel do config.js passa por
   ele. Por isso a checagem e aqui dentro, em dois passos:
     1. /auth/v1/user  — o token e de uma pessoa de verdade?
     2. mc_admin_users.auth_uid — essa pessoa e operador?

   POR ENQUANTO OS DOIS CAMINHOS VALEM, de proposito: derrubar o UUID no mesmo
   deploy em que o JWT estreia seria trocar as duas pontas as cegas. O console
   registra qual caminho cada chamada usou; quando o log mostrar so `jwt`,
   apagar o bloco marcado LEGADO abaixo. */
async function operadorOuNulo(
  req: Request,
  corpo: Record<string, unknown>,
  url: URL,
): Promise<{ id: string; via: string } | null> {
  const SB_URL = Deno.env.get('SUPABASE_URL') || '';
  const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!SB_URL || !SRK) return null;

  const buscarOperador = async (filtro: string) => {
    const q = await fetch(
      SB_URL + '/rest/v1/mc_admin_users?select=id,role&' + filtro,
      { headers: { apikey: SRK, Authorization: 'Bearer ' + SRK } },
    );
    const linhas = await q.json();
    return Array.isArray(linhas) && linhas.length ? linhas[0] : null;
  };

  /* --- caminho novo: JWT do Supabase Auth --- */
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (jwt) {
    try {
      const u = await fetch(SB_URL + '/auth/v1/user', {
        headers: { apikey: SRK, Authorization: 'Bearer ' + jwt },
      });
      if (u.ok) {
        const user = await u.json();
        if (user?.id) {
          const op = await buscarOperador('auth_uid=eq.' + encodeURIComponent(user.id));
          if (op) return { id: op.id, via: 'jwt' };
        }
      }
    } catch { /* cai no legado */ }
  }

  /* --- LEGADO: UUID de fp_session. Apagar quando o log so mostrar `jwt`. --- */
  const sessao = String(corpo?.sessao || url.searchParams.get('sessao') || '');
  if (/^[0-9a-f-]{36}$/i.test(sessao)) {
    try {
      const op = await buscarOperador('id=eq.' + encodeURIComponent(sessao));
      if (op) return { id: op.id, via: 'uuid-legado' };
    } catch { /* cai no null */ }
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const chave = Deno.env.get('MAGIS5_API_KEY') || '';
  const url = new URL(req.url);

  // o corpo e lido uma vez: um Request nao pode ser consumido duas vezes
  let corpo: Record<string, unknown> = {};
  if (req.method === 'POST') corpo = await req.json().catch(() => ({}));
  const acao = url.searchParams.get('action') || String(corpo?.action || '');

  const operador = await operadorOuNulo(req, corpo, url);
  if (!operador) {
    return resposta({ erro: 'sessão do painel ausente ou inválida — entre de novo no painel' }, 401);
  }
  console.log('[magis5-proxy] acao=' + acao + ' via=' + operador.via);

  if (acao === 'health') return resposta({ configurado: !!chave });

  if (!chave) {
    return resposta({
      erro: 'MAGIS5_API_KEY não configurada nas secrets da função magis5-proxy.',
    }, 503);
  }

  async function magis5(caminho: string, init: RequestInit = {}) {
    const r = await fetch(BASE + caminho, {
      ...init,
      headers: {
        'X-MAGIS5-APIKEY': chave,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(init.headers || {}),
      },
    });
    const texto = await r.text();
    let dados: unknown;
    try { dados = texto ? JSON.parse(texto) : null; } catch { dados = { raw: texto }; }
    return { status: r.status, ok: r.ok, dados };
  }

  try {
    /* ---------- leitura: produto + composição do kit ---------- */
    if (acao === 'produto') {
      const sku = url.searchParams.get('sku') || String(corpo?.sku || '');
      if (!sku) return resposta({ erro: 'informe o sku' }, 400);
      const r = await magis5('/products/' + encodeURIComponent(sku));
      return resposta({
        status: r.status,
        ok: r.ok,
        produto: r.ok ? r.dados : null,
        erro: r.ok ? null : r.dados,
      });
    }

    /* ---------- escrita: substitui a composição do kit ----------
       O Magis5 recebe a lista inteira, não um item isolado. Quem chama tem que
       mandar os itens que já existiam + o novo — por isso a recusa de lista
       vazia: um PATCH com [] apagaria a composição de um kit real. */
    if (acao === 'composicao' && req.method === 'POST') {
      const sku = String(corpo?.sku || '');
      const itens = Array.isArray(corpo?.itens) ? corpo.itens : null;
      if (!sku || !itens) return resposta({ erro: 'informe sku e itens' }, 400);
      if (!itens.length) {
        return resposta({ erro: 'lista vazia recusada: apagaria a composição do kit' }, 400);
      }
      const limpos = itens.map((i: Record<string, unknown>) => ({
        id: String(i.id ?? ''),
        quantity: Number(i.quantity ?? 1),
        unitValue: Number(i.unitValue ?? 0),
        percentagePriceValue: Number(i.percentagePriceValue ?? 0),
      }));
      if (limpos.some((i) => !i.id)) {
        return resposta({ erro: 'todo item precisa de id do produto no Magis5' }, 400);
      }
      const r = await magis5('/products/' + encodeURIComponent(sku), {
        method: 'PATCH',
        body: JSON.stringify({ products_composition: limpos }),
      });
      return resposta({ status: r.status, ok: r.ok, enviado: limpos, resposta: r.dados });
    }

    return resposta({ erro: 'ação desconhecida: ' + acao }, 400);
  } catch (e) {
    return resposta({ erro: String((e as Error)?.message || e) }, 500);
  }
});
