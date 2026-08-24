/**
 * magis5-proxy — ponte entre o painel e a API do Magis5.
 *
 * Por que existe: a chave do Magis5 (X-MAGIS5-APIKEY) dá acesso de escrita ao
 * hub inteiro — pedidos, produtos, composição de kit. Ela NÃO pode viver no
 * navegador (o config.js é público). Fica só aqui, em MAGIS5_API_KEY, e a
 * função exige usuário autenticado (verify_jwt = true + checagem de papel).
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const chave = Deno.env.get('MAGIS5_API_KEY') || '';
  const url = new URL(req.url);

  // o corpo e lido uma vez: um Request nao pode ser consumido duas vezes
  let corpo: Record<string, unknown> = {};
  if (req.method === 'POST') corpo = await req.json().catch(() => ({}));
  const acao = url.searchParams.get('action') || String(corpo?.action || '');

  /* verify_jwt aceita tambem a anon key (que e um JWT com role=anon) e ela e
     publica no config.js. Como aqui se escreve no ERP, exigimos sessao de
     usuario de verdade. A assinatura ja foi validada pelo gateway; so o papel
     precisa ser lido. */
  const cabecalho = req.headers.get('Authorization') || '';
  const token = cabecalho.replace(/^Bearer\s+/i, '');
  let papel = '';
  try { papel = JSON.parse(atob(token.split('.')[1] || '')).role || ''; } catch { papel = ''; }
  if (papel !== 'authenticated') {
    return resposta({ erro: 'precisa de usuário autenticado no painel' }, 401);
  }

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
