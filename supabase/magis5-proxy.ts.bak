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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const chave = Deno.env.get('MAGIS5_API_KEY') || '';
  const url = new URL(req.url);

  // o corpo e lido uma vez: um Request nao pode ser consumido duas vezes
  let corpo: Record<string, unknown> = {};
  if (req.method === 'POST') corpo = await req.json().catch(() => ({}));
  const acao = url.searchParams.get('action') || String(corpo?.action || '');

  /* O painel NAO usa Supabase Auth: o login e contra mc_admin_users e o cliente
     segue como anon. Entao checar role=authenticated rejeitaria todo mundo, e
     confiar so no verify_jwt liberaria qualquer um com a anon key (publica no
     config.js) a escrever no ERP.

     O que da para exigir e a sessao do operador: o painel manda o id salvo em
     fp_session e aqui ele e conferido contra mc_admin_users com a service role.
     Nao e criptografia — e um UUID que so quem logou tem. */
  const sessao = String(corpo?.sessao || url.searchParams.get('sessao') || '');
  const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const SB_URL = Deno.env.get('SUPABASE_URL') || '';
  if (!/^[0-9a-f-]{36}$/i.test(sessao)) {
    return resposta({ erro: 'sessão do painel ausente — entre de novo no painel' }, 401);
  }
  try {
    const q = await fetch(
      SB_URL + '/rest/v1/mc_admin_users?select=id,role&id=eq.' + encodeURIComponent(sessao),
      { headers: { apikey: SRK, Authorization: 'Bearer ' + SRK } },
    );
    const linhas = await q.json();
    if (!Array.isArray(linhas) || !linhas.length) {
      return resposta({ erro: 'sessão do painel não confere' }, 401);
    }
  } catch (e) {
    return resposta({ erro: 'não deu para validar a sessão: ' + String((e as Error)?.message || e) }, 500);
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
