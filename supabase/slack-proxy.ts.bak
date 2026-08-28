/**
 * slack-proxy — ponte entre o painel e a API do Slack.
 *
 * Por que existe: o módulo Separação monta a lista de produtos do dia e precisa
 * entregá-la a uma pessoa (na prática o Felype). Webhook de entrada não serve —
 * ele é preso a UM canal escolhido na hora de criar, e o que se quer aqui é
 * mensagem direta para quem o operador escolher na tela.
 *
 * Mandar DM exige um bot token (xoxb-...), que dá acesso de leitura ao quadro de
 * membros e de escrita em nome do app. Ele NÃO pode viver no navegador (o
 * config.js é público). Fica só aqui, na secret SLACK_BOT_TOKEN, e a função
 * exige a sessão do operador (id de mc_admin_users) em todo chamado.
 *
 * App do Slack — escopos de BOT que precisam estar marcados em OAuth & Permissions
 * (o dono cria o app; sem eles a chamada volta com error: "missing_scope"):
 *   users:read   listar os membros do workspace (ação `usuarios`)
 *   im:write     abrir a conversa direta com a pessoa (conversations.open)
 *   chat:write   postar a mensagem (chat.postMessage)
 * Depois de instalar o app no workspace, copiar o "Bot User OAuth Token" para a
 * secret SLACK_BOT_TOKEN desta função. Trocar escopo depois exige REINSTALAR o
 * app — o token antigo continua valendo com os escopos velhos.
 *
 * Ações — em ?action= ou no corpo {action}, porque o painel chama por
 * sb.functions.invoke(), que sempre manda POST com JSON:
 *   health                            -> { ok, configurado: bool }
 *   usuarios                          -> { ok, usuarios: [{id, nome, nome_real, avatar}], total, truncado }
 *   enviar { destino, texto, blocos } -> { ok, canal, ts }
 *
 * TODA resposta traz `ok`. Em falha vem { ok: false, erro } com a frase já em
 * português; quando o "não" veio do Slack, `slack` traz o código cru
 * ("missing_scope", "user_not_found") para achar o problema no log.
 *
 * A API do Slack responde HTTP 200 mesmo quando dá errado, com
 * { ok: false, error: "..." } no corpo. Por isso NADA aqui decide sucesso pelo
 * status HTTP: quem manda é o campo `ok` do JSON.
 */

const BASE = 'https://slack.com/api';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

/* users.list é paginado e limitado (Tier 2). O workspace da FullPro é pequeno,
   mas o laço precisa de um teto: sem ele um next_cursor que não zera prende a
   função até o timeout. 20 páginas × 200 = 4.000 membros, folga suficiente. */
const PAGINA = 200;
const MAX_PAGINAS = 20;

/* espera no máximo isso ao levar 429; acima disso é melhor devolver o erro
   traduzido do que segurar a tela do operador */
const ESPERA_MAX_MS = 8000;

function resposta(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/* Mensagens do Slack são em inglês e chegam como slug ("missing_scope"). Quem lê
   é o operador do estúdio, então cada uma vira uma frase que diz o que fazer. */
function traduzErro(erro: string, dados: Record<string, unknown> = {}): string {
  switch (erro) {
    case 'not_authed':
      return 'o Slack não recebeu o token — SLACK_BOT_TOKEN está vazia na função slack-proxy.';
    case 'invalid_auth':
      return 'token do Slack inválido. Confira o "Bot User OAuth Token" (xoxb-...) na secret SLACK_BOT_TOKEN.';
    case 'token_revoked':
      return 'o token do Slack foi revogado. Reinstale o app no workspace e atualize SLACK_BOT_TOKEN.';
    case 'account_inactive':
      return 'o app do Slack foi desinstalado ou a conta está desativada. Reinstale o app no workspace.';
    case 'missing_scope': {
      const falta = String(dados.needed || '');
      const tem = String(dados.provided || '');
      return 'falta permissão no app do Slack' + (falta ? ' (precisa de: ' + falta + ')' : '') +
        (tem ? '; hoje ele tem: ' + tem : '') +
        '. Adicione o escopo em OAuth & Permissions e REINSTALE o app.';
    }
    case 'not_in_channel':
      return 'o app não está no canal de destino. Convide o app para o canal (/invite @app) ou mande por DM.';
    case 'channel_not_found':
      return 'conversa não encontrada — o destinatário pode ter saído do workspace.';
    case 'user_not_found':
    case 'users_not_found':
      return 'pessoa não encontrada no Slack. Atualize a lista de destinatários e escolha de novo.';
    case 'cannot_dm_bot':
      return 'não dá para mandar mensagem direta para um bot. Escolha uma pessoa.';
    case 'is_archived':
      return 'a conversa está arquivada.';
    case 'msg_too_long':
      return 'a mensagem passou do limite do Slack. Reduza a lista de separação.';
    case 'no_text':
      return 'mensagem vazia: informe texto ou blocos.';
    case 'invalid_blocks':
    case 'invalid_blocks_format':
      return 'os blocos da mensagem estão fora do formato do Block Kit.';
    case 'restricted_action':
      return 'as regras do workspace bloquearam esse envio.';
    case 'team_access_not_granted':
      return 'o app não tem acesso a este workspace.';
    case 'ratelimited':
    case 'rate_limited':
      return 'o Slack pediu para esperar (limite de chamadas). Tente de novo em alguns segundos.';
    case 'fatal_error':
    case 'internal_error':
      return 'erro interno do Slack. Tente de novo.';
    case 'resposta_invalida':
      return 'o Slack respondeu fora do formato esperado (instabilidade ou proxy no meio). Tente de novo.';
    default:
      return 'o Slack recusou: ' + (erro || 'erro desconhecido');
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const token = (Deno.env.get('SLACK_BOT_TOKEN') || '').trim();
  const url = new URL(req.url);

  // o corpo e lido uma vez: um Request nao pode ser consumido duas vezes
  let corpo: Record<string, unknown> = {};
  if (req.method === 'POST') corpo = await req.json().catch(() => ({}));
  const acao = url.searchParams.get('action') || String(corpo?.action || '');

  /* O painel NAO usa Supabase Auth: o login e contra mc_admin_users e o cliente
     segue como anon. Entao checar role=authenticated rejeitaria todo mundo, e
     confiar so no verify_jwt liberaria qualquer um com a anon key (publica no
     config.js) a mandar mensagem no Slack da empresa em nome do app.

     O que da para exigir e a sessao do operador: o painel manda o id salvo em
     fp_session e aqui ele e conferido contra mc_admin_users com a service role.
     Nao e criptografia — e um UUID que so quem logou tem. */
  const sessao = String(corpo?.sessao || url.searchParams.get('sessao') || '');
  const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const SB_URL = Deno.env.get('SUPABASE_URL') || '';
  if (!/^[0-9a-f-]{36}$/i.test(sessao)) {
    return resposta({ ok: false, erro: 'sessão do painel ausente — entre de novo no painel' }, 401);
  }
  try {
    const q = await fetch(
      SB_URL + '/rest/v1/mc_admin_users?select=id,role&id=eq.' + encodeURIComponent(sessao),
      { headers: { apikey: SRK, Authorization: 'Bearer ' + SRK } },
    );
    const linhas = await q.json();
    if (!Array.isArray(linhas) || !linhas.length) {
      return resposta({ ok: false, erro: 'sessão do painel não confere' }, 401);
    }
  } catch (e) {
    return resposta({ ok: false, erro: 'não deu para validar a sessão: ' + String((e as Error)?.message || e) }, 500);
  }

  // health nao vaza o token: so diz se ele existe, para a tela mostrar o aviso certo
  if (acao === 'health') return resposta({ ok: true, configurado: !!token });

  if (!token) {
    return resposta({
      ok: false,
      erro: 'SLACK_BOT_TOKEN não configurada nas secrets da função slack-proxy.',
    }, 503);
  }

  /* Toda chamada volta por aqui com o par (ok do JSON, status HTTP) separado.
     `esperar` é o Retry-After do 429, em ms, para quem chamou decidir. */
  async function slack(
    metodo: string,
    dados: Record<string, unknown> | null = null,
    query: Record<string, string> | null = null,
  ) {
    const endereco = BASE + '/' + metodo + (query ? '?' + new URLSearchParams(query).toString() : '');
    const r = await fetch(endereco, {
      method: dados ? 'POST' : 'GET',
      headers: {
        Authorization: 'Bearer ' + token,
        'Accept': 'application/json',
        ...(dados ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
      },
      ...(dados ? { body: JSON.stringify(dados) } : {}),
    });
    const texto = await r.text();
    let json: Record<string, unknown>;
    try {
      /* JSON.parse devolve null para o corpo "null" e string para o corpo "texto":
         sem esta checagem um deles chegaria como `dados` e o acesso a .members
         (ou a .channel) estouraria com TypeError em vez de virar erro tratado. */
      const cru: unknown = texto ? JSON.parse(texto) : {};
      json = (cru && typeof cru === 'object') ? cru as Record<string, unknown>
                                             : { ok: false, error: 'resposta_invalida' };
    } catch { json = { ok: false, error: 'resposta_invalida', raw: texto }; }
    const segundos = Number(r.headers.get('retry-after') || 0);
    /* Em 429 e em queda do lado deles o corpo às vezes vem em texto puro, sem o
       campo `error` — sem isto a tela mostraria "resposta_invalida". */
    let erro = String(json?.error || '');
    if (!erro && json?.ok !== true) {
      erro = r.status === 429 ? 'ratelimited' : (r.status >= 500 ? 'internal_error' : 'resposta_invalida');
    }
    return {
      status: r.status,
      ok: json?.ok === true,
      erro,
      dados: json,
      esperar: r.status === 429 ? Math.max(1000, segundos * 1000) : 0,
    };
  }

  try {
    /* ---------- lista de destinatários ----------
       Devolve só o mínimo que o seletor do painel precisa. Nada de e-mail ou
       telefone: é dado pessoal que a tela não usa. */
    if (acao === 'usuarios') {
      const achados: Array<Record<string, unknown>> = [];
      let cursor = '';
      let repetiu = false;

      for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
        const q: Record<string, string> = { limit: String(PAGINA) };
        if (cursor) q.cursor = cursor;
        let r = await slack('users.list', null, q);

        /* users.list estoura o limite com facilidade. Uma espera só, curta, resolve
           o caso normal; insistir mais seria segurar a tela do operador. */
        if (r.esperar && !repetiu && r.esperar <= ESPERA_MAX_MS) {
          repetiu = true;
          await new Promise((ok) => setTimeout(ok, r.esperar));
          r = await slack('users.list', null, q);
        }
        if (!r.ok) {
          return resposta({ ok: false, erro: traduzErro(r.erro, r.dados), slack: r.erro }, 200);
        }

        const membros = Array.isArray(r.dados.members) ? r.dados.members as Array<Record<string, unknown>> : [];
        for (const m of membros) {
          // fora: bots, o próprio Slackbot, usuários de app e contas desativadas
          if (m.is_bot || m.deleted || m.is_app_user || m.id === 'USLACKBOT') continue;
          const perfil = (m.profile || {}) as Record<string, unknown>;
          const nomeReal = String(perfil.real_name || m.real_name || '');
          const exibicao = String(perfil.display_name || '').trim();
          achados.push({
            id: String(m.id || ''),
            nome: exibicao || nomeReal || String(m.name || ''),
            nome_real: nomeReal,
            avatar: String(perfil.image_72 || perfil.image_48 || perfil.image_192 || ''),
          });
        }

        const meta = (r.dados.response_metadata || {}) as Record<string, unknown>;
        cursor = String(meta.next_cursor || '');
        if (!cursor) break;
      }

      achados.sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
      /* cursor ainda cheio depois do teto = lista cortada. Devolver `ok: true` sem
         avisar faria a tela jurar que a pessoa não existe no workspace. */
      return resposta({ ok: true, usuarios: achados, total: achados.length, truncado: !!cursor });
    }

    /* ---------- envio da lista de separação por DM ---------- */
    if (acao === 'enviar' && req.method === 'POST') {
      /* O id do Slack é sempre maiúsculo. Normalizar aqui evita que um id colado
         em minúsculo passe pela validação e morra como `user_not_found` no Slack,
         com uma mensagem que manda o operador procurar no lugar errado. */
      const destino = String(corpo?.destino || '').trim().toUpperCase();
      const texto = String(corpo?.texto || '').trim();
      /* Lista de blocos VAZIA com texto preenchido é envio legítimo — o painel
         manda `blocos: []` quando não há nada para formatar. Recusar aqui
         quebraria o caso mais simples; tratamos como "sem blocos". */
      const listaBlocos = Array.isArray(corpo?.blocos) ? corpo.blocos as unknown[] : null;
      const blocos = listaBlocos && listaBlocos.length ? listaBlocos : null;

      /* id de pessoa no Slack começa com U (ou W, em Enterprise Grid). Barrar aqui
         evita mandar um e-mail ou um id de canal para conversations.open, que
         responderia com um erro genérico difícil de explicar na tela. */
      if (!/^[UW][A-Z0-9]{4,}$/i.test(destino)) {
        return resposta({ ok: false, erro: 'destino inválido: use o id da pessoa no Slack (começa com U)' }, 400);
      }
      if (!texto && !blocos) return resposta({ ok: false, erro: 'informe texto ou blocos' }, 400);
      if (blocos && blocos.length > 50) {
        return resposta({ ok: false, erro: 'o Slack aceita no máximo 50 blocos por mensagem' }, 400);
      }

      /* conversations.open é o passo que falta em quase toda integração de DM: o
         chat.postMessage precisa de um CANAL, e o canal da conversa direta só
         existe depois disso. Já aberta, devolve a mesma — pode chamar sempre. */
      const abertura = await slack('conversations.open', { users: destino });
      if (!abertura.ok) {
        return resposta({ ok: false, erro: traduzErro(abertura.erro, abertura.dados), slack: abertura.erro }, 200);
      }
      const canal = String(((abertura.dados.channel || {}) as Record<string, unknown>).id || '');
      if (!canal) {
        return resposta({ ok: false, erro: 'o Slack abriu a conversa mas não devolveu o canal' }, 200);
      }

      /* Mesmo com blocos, o `text` continua obrigatório na prática: é ele que
         aparece na notificação do celular e no leitor de tela. Sem nada ali a
         pessoa recebe um alerta em branco. */
      const carga: Record<string, unknown> = {
        channel: canal,
        text: texto || 'Lista de separação — FullPro Media Club',
      };
      if (blocos) carga.blocks = blocos;

      const envio = await slack('chat.postMessage', carga);
      if (!envio.ok) {
        return resposta({ ok: false, canal, erro: traduzErro(envio.erro, envio.dados), slack: envio.erro }, 200);
      }
      return resposta({ ok: true, canal, ts: String(envio.dados.ts || '') });
    }

    return resposta({ ok: false, erro: 'ação desconhecida: ' + acao }, 400);
  } catch (e) {
    return resposta({ ok: false, erro: String((e as Error)?.message || e) }, 500);
  }
});
