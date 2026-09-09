/**
 * candidatura-email — manda a resposta da análise de candidatura a patrocínio.
 *
 * POR QUE GMAIL E NÃO UM SERVIÇO NOVO
 * O dono perguntou se dava para reusar o que o site já tem, e dava. Medido em
 * 09/09/2026 no fullpro.com.br: o plugin `fluent-smtp` 2.3.1 manda por
 * `smtp.gmail.com:465` com o remetente `contato@fullpro.parts` — 227 e-mails
 * entregues, o último no mesmo dia. E o SPF do `fullpro.parts` já é
 * `v=spf1 include:_spf.google.com include:_spf.tray.com.br ~all`, ou seja o
 * Google JÁ está autorizado a enviar por esse domínio.
 * Consequência: zero registro de DNS novo, zero conta nova, zero verificação de
 * domínio. Só uma senha de app — e DEDICADA a esta função, não a mesma do site,
 * para revogar uma sem derrubar a outra.
 *
 * SEGURANÇA — as duas coisas que a revisão adversarial mudou aqui
 *  1. O anel é `mc_eh_admin()`, NÃO `mc_eh_operador()`. Medido: eh_operador é só
 *     `exists(select 1 from mc_admin_users where auth_uid = auth.uid())` e
 *     responde true para as 7 contas do painel, em 6 papéis. Disparar e-mail em
 *     nome da empresa e ler PII de candidato é dos 2 Administradores.
 *  2. A pergunta vai ao banco com o token de QUEM CHAMOU. Rodar essa função com
 *     a service role responderia sobre o servidor, isto é, responderia sempre
 *     sim. Erro na checagem é RECUSA, nunca liberação.
 * Só depois disso a service role entra, para ler a linha e gravar o resultado.
 *
 * POR QUE FALHA DE NEGÓCIO VOLTA 200
 * O painel chama por `sb.functions.invoke`, e o supabase-js v2 colapsa qualquer
 * resposta não-2xx num FunctionsHttpError genérico ("Edge Function returned a
 * non-2xx status code") e JOGA O CORPO FORA. Se o motivo real da falha voltasse
 * como 502, ele nunca chegaria à tela — o operador veria "erro" sem saber qual.
 * Então: problema de ENVIO volta 200 com { ok:false, erro, codigo }, que o
 * painel consegue ler e mostrar. Só o que é de PERMISSÃO volta não-2xx (401/403),
 * porque ali a única informação útil é "você não pode".
 *
 * Segredos (o dono cria; sem eles a função responde 503 e não finge sucesso):
 *   GMAIL_USER          yonan@fullpro.parts   <- QUEM AUTENTICA (dona da senha de app)
 *   GMAIL_FROM          contato@fullpro.parts <- QUEM APARECE (tem que estar em
 *                       "Enviar e-mail como" da conta acima, senão o Gmail
 *                       reescreve o remetente calado)
 *   GMAIL_APP_PASSWORD  16 minúsculas SEM espaço. O Google mostra em blocos de 4
 *                       e este campo aceita os espaços sem reclamar — no site
 *                       isso já custou duas rodadas de depuração.
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY  (já injetadas)
 *
 * FRAGILIDADE CONHECIDA, não contornável aqui: trocar a senha da CONTA do Google
 * revoga TODAS as senhas de app dela. No dia em que isso acontecer, esta função
 * para junto com o e-mail do site. O caminho durável é o SMTP relay do Workspace
 * (smtp-relay.gmail.com:587, "Allowed senders = only addresses in my domains"),
 * que não depende de senha de app de pessoa física.
 *
 *   POST { id: uuid, decisao?: 'aprovada'|'recusada', reenviar?: boolean }
 *     200 { ok:true,  id, decisao, enviado_em, reenvios }
 *     200 { ok:false, erro, codigo }   <- falha de envio, com o motivo legível
 *     401 sem sessão · 403 não é administrador · 400 corpo inválido
 *     503 sem credencial de e-mail configurada
 *
 * Deploy (o caminho importa: o CLI procura functions/<nome>/index.ts):
 *   supabase secrets set GMAIL_USER=contato@fullpro.parts --project-ref xgaaocnuqgcwttrljqep
 *   supabase secrets set GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx --project-ref xgaaocnuqgcwttrljqep
 *   supabase functions deploy candidatura-email --project-ref xgaaocnuqgcwttrljqep
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? '';
const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

/* ATENÇÃO: usuário que AUTENTICA e endereço que APARECE são coisas diferentes,
   e confundir os dois é o erro clássico aqui.

   Medido no site (docs e memória de 27/08/2026): quem autentica no Gmail é
   `yonan@fullpro.parts` — foi a única conta da organização que conseguiu gerar
   senha de app; o Google devolvia 535-5.7.8 para gabriel@, harry@ e contato@.
   O `contato@fullpro.parts` é um endereço cadastrado em "Enviar e-mail como"
   DENTRO da conta do yonan, e é por isso que ele pode aparecer no From.

   Se o From não estiver em "Enviar e-mail como" daquela conta, o Gmail
   REESCREVE o remetente silenciosamente para a conta autenticada — o candidato
   receberia a resposta vindo de um endereço pessoal. */
const GMAIL_USER = Deno.env.get('GMAIL_USER') ?? '';        // quem autentica
const GMAIL_PASS = Deno.env.get('GMAIL_APP_PASSWORD') ?? ''; // 16 minúsculas, SEM espaço
const GMAIL_FROM = Deno.env.get('GMAIL_FROM') ?? GMAIL_USER; // quem aparece

const REMETENTE_NOME = 'FullPro Marketing';

/* Teto de reenvio. A revisão apontou que `reenviar: true` furava a trava do
   duplicado sem limite nenhum — laço de e-mail para a mesma pessoa é o pior
   jeito de estrear um programa de patrocínio. */
const MAX_REENVIOS = 2;

const TETO_MS = 20000;

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}
function recusa(mensagem: string, status: number): Response {
  return json({ ok: false, erro: mensagem }, status);
}
/* Falha de envio: 200 de propósito, para o motivo chegar à tela. Ver o cabeçalho. */
function falhaDeEnvio(mensagem: string, codigo: string): Response {
  return json({ ok: false, erro: mensagem, codigo }, 200);
}

const escHtml = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* O texto puro também precisa de limpeza, e por um motivo diferente do HTML: o
   CHECK do banco em `instagram` só limita tamanho, não proíbe quebra de linha.
   Um @ com \n plantaria linhas falsas dentro do corpo do e-mail — e em cabeçalho
   seria injeção de header. Some com CR, LF e tab. */
const escTexto = (v: unknown) => String(v ?? '').replace(/[\r\n\t]+/g, ' ').trim();

/* ------------------------------------------------------------------ portão ---
   Devolve o uid de quem passou, não só "pode". É esse uid que vai para
   email_por: sem ele a linha diria QUANDO a resposta saiu e nunca POR QUEM. */
type Portao = { barrado: Response } | { uid: string };

async function administradorOuRecusa(req: Request): Promise<Portao> {
  try {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!jwt) return { barrado: recusa('sessão do painel ausente — entre de novo.', 401) };
    if (!SB_URL || !ANON || !SRK) {
      return { barrado: recusa('função mal configurada: faltam as variáveis do Supabase.', 500) };
    }

    const comoUsuario = createClient(SB_URL, ANON, {
      auth: { persistSession: false },
      global: { headers: { Authorization: 'Bearer ' + jwt } },
    });

    const { data: { user }, error: erroUser } = await comoUsuario.auth.getUser(jwt);
    if (erroUser || !user) {
      return { barrado: recusa('sessão inválida ou expirada — entre de novo no painel.', 401) };
    }

    const { data: ehAdmin, error: erroRpc } = await comoUsuario.rpc('mc_eh_admin');
    if (erroRpc) {
      console.error('[candidatura-email] mc_eh_admin falhou:', erroRpc.message);
      return { barrado: recusa('não foi possível confirmar sua permissão agora. Tente de novo.', 403) };
    }
    if (ehAdmin !== true) {
      return { barrado: recusa('só administrador pode enviar a resposta da candidatura.', 403) };
    }
    return { uid: user.id };
  } catch (e) {
    /* Sem este catch, uma exceção aqui escaparia do handler e viraria 500 sem
       corpo — indistinguível de "não pode" na tela. */
    console.error('[candidatura-email] portão explodiu:', (e as Error)?.message);
    return { barrado: recusa('falha ao verificar sua permissão. Tente de novo.', 403) };
  }
}

/* ------------------------------------------------------------------ textos --- */
function montarEmail(decisao: 'aprovada' | 'recusada', nome: string, arroba: string) {
  const primeiro = escTexto(nome).split(/\s+/)[0] || 'tudo bem';
  const p = escHtml(primeiro);
  const a = escHtml(escTexto(arroba));
  const aTxt = escTexto(arroba);

  const moldura = (miolo: string) => `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f4f5;padding:24px;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e4e7;border-radius:10px">
<tr><td style="padding:24px 28px 8px"><div style="font-size:13px;letter-spacing:1px;color:#cc1d1d;font-weight:bold">FULLPRO MEDIA CLUB</div></td></tr>
<tr><td style="padding:0 28px 24px;font-size:15px;line-height:1.6;color:#27272a">${miolo}</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #e4e4e7;font-size:12px;color:#71717a">
FullPro — peças e acessórios para moto · <a href="https://fullpro.com.br" style="color:#71717a">fullpro.com.br</a>
</td></tr></table></td></tr></table></body></html>`;

  if (decisao === 'aprovada') {
    return {
      assunto: 'Sua candidatura ao patrocínio FullPro foi aprovada',
      html: moldura(`<p>Oi, ${p}.</p>
<p>Sua candidatura ao programa de patrocínio da FullPro (<strong>${a}</strong>) foi
<strong>aprovada</strong> pelo departamento de Marketing.</p>
<p>O próximo passo é a conversa no WhatsApp que você cadastrou, para combinarmos
formato, entregas e contrato. Nós chamamos você.</p>
<p>Não precisa responder este e-mail.</p>`),
      texto: `Oi, ${primeiro}.

Sua candidatura ao programa de patrocinio da FullPro (${aTxt}) foi APROVADA pelo departamento de Marketing.

O proximo passo e a conversa no WhatsApp que voce cadastrou, para combinarmos formato, entregas e contrato. Nos chamamos voce.

Nao precisa responder este e-mail.

FullPro - pecas e acessorios para moto
https://fullpro.com.br`,
    };
  }

  return {
    assunto: 'Sobre sua candidatura ao patrocínio FullPro',
    html: moldura(`<p>Oi, ${p}.</p>
<p>O departamento de Marketing da FullPro analisou sua candidatura
(<strong>${a}</strong>) e, por agora, <strong>não vamos seguir com a parceria</strong>.</p>
<p>Isso não é definitivo: o time olha candidaturas a cada 15 dias, e você pode se
candidatar de novo mais adiante.</p>
<p>Obrigado pelo tempo que você gastou preenchendo — e boas rodadas.</p>`),
    texto: `Oi, ${primeiro}.

O departamento de Marketing da FullPro analisou sua candidatura (${aTxt}) e, por agora, nao vamos seguir com a parceria.

Isso nao e definitivo: o time olha candidaturas a cada 15 dias, e voce pode se candidatar de novo mais adiante.

Obrigado pelo tempo que voce gastou preenchendo - e boas rodadas.

FullPro - pecas e acessorios para moto
https://fullpro.com.br`,
  };
}

/* ------------------------------------------------------------------ handler -- */
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return recusa('método não permitido.', 405);

  try {
    const portao = await administradorOuRecusa(req);
    if ('barrado' in portao) return portao.barrado;
    const quemEnviou = portao.uid;

    let corpo: Record<string, unknown>;
    try { corpo = await req.json(); } catch { return recusa('corpo inválido.', 400); }

    const id = String(corpo.id ?? '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return recusa('id de candidatura inválido.', 400);
    }
    const reenviar = corpo.reenviar === true;

    if (!GMAIL_USER || !GMAIL_PASS) {
      /* 503 e não 200: isto é configuração faltando, não falha de envio. E a
         mensagem diz o que fazer, para ninguém procurar no lugar errado. */
      return json({
        ok: false,
        erro: 'o envio de e-mail ainda não está configurado: faltam os segredos GMAIL_USER e GMAIL_APP_PASSWORD na função.',
        codigo: 'sem_credencial',
      }, 503);
    }

    const comoServidor = createClient(SB_URL, SRK, { auth: { persistSession: false } });

    const { data: cand, error: erroLer } = await comoServidor
      .from('mc_influencer_candidaturas')
      .select('id, nome, email, instagram, status, email_enviado_em, email_decisao, email_reenvios')
      .eq('id', id)
      .maybeSingle();

    if (erroLer) {
      console.error('[candidatura-email] leitura falhou', id, erroLer.message);
      return falhaDeEnvio('não foi possível ler a candidatura no banco.', 'leitura');
    }
    if (!cand) return recusa('candidatura não encontrada.', 404);

    /* A decisão sai do STATUS, não do que o chamador mandou: o status é o que o
       operador realmente gravou na tela. O campo do corpo só serve de conferência
       — se divergir, o banco manda. */
    const doStatus = cand.status === 'approved' ? 'aprovada'
                   : cand.status === 'rejected' ? 'recusada'
                   : null;
    if (!doStatus) {
      return falhaDeEnvio(
        'a candidatura ainda não foi decidida. Aprove ou recuse antes de enviar a resposta.',
        'sem_decisao',
      );
    }

    const reenviosFeitos = Number(cand.email_reenvios ?? 0);

    if (cand.email_enviado_em && !reenviar) {
      return falhaDeEnvio(
        'esta candidatura já recebeu resposta por e-mail em '
        + new Date(String(cand.email_enviado_em)).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        + (cand.email_decisao ? ' (resposta enviada: ' + cand.email_decisao + ')' : '')
        + '. Para mandar de novo, use reenviar.',
        'ja_enviado',
      );
    }
    if (cand.email_enviado_em && reenviar && reenviosFeitos >= MAX_REENVIOS) {
      return falhaDeEnvio(
        'esta candidatura já foi reenviada ' + reenviosFeitos + ' vezes, que é o teto. '
        + 'Se a pessoa não recebeu, fale por WhatsApp em vez de insistir no e-mail.',
        'teto_de_reenvio',
      );
    }

    const { assunto, html, texto } = montarEmail(doStatus, cand.nome ?? '', cand.instagram ?? '');

    let cliente: SMTPClient | null = null;
    try {
      cliente = new SMTPClient({
        connection: {
          hostname: 'smtp.gmail.com',
          port: 465,
          tls: true,
          auth: { username: GMAIL_USER, password: GMAIL_PASS },
        },
      });

      await Promise.race([
        cliente.send({
          from: `${REMETENTE_NOME} <${GMAIL_FROM}>`,
          to: String(cand.email),
          subject: assunto,
          content: texto,
          html,
        }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('tempo esgotado ao falar com o Gmail')), TETO_MS)),
      ]);

      const reenviosAgora = cand.email_enviado_em ? reenviosFeitos + 1 : reenviosFeitos;

      await comoServidor.from('mc_influencer_candidaturas').update({
        email_enviado_em: new Date().toISOString(),
        email_erro: null,
        email_decisao: doStatus,
        email_por: quemEnviou,
        email_reenvios: reenviosAgora,
      }).eq('id', id);

      return json({
        ok: true, id, decisao: doStatus, enviado: true,
        reenvios: reenviosAgora,
        restam: MAX_REENVIOS - reenviosAgora,
      });
    } catch (e) {
      /* O texto do erro vai para a coluna, que é o que a tela lê. Não registro em
         log a mensagem crua do provedor: ela às vezes ecoa o destinatário, e
         e-mail de candidato em log é vazamento silencioso. No log fica só o id. */
      const motivo = (e as Error)?.message ?? 'erro desconhecido ao enviar';
      console.error('[candidatura-email] envio falhou para a candidatura', id);
      await comoServidor.from('mc_influencer_candidaturas').update({
        email_erro: motivo.slice(0, 400),
        email_enviado_em: null,
      }).eq('id', id);
      return falhaDeEnvio('o Gmail recusou o envio: ' + motivo, 'smtp');
    } finally {
      try { await cliente?.close(); } catch { /* fechar é higiene, não resultado */ }
    }
  } catch (e) {
    console.error('[candidatura-email] exceção não tratada:', (e as Error)?.message);
    return falhaDeEnvio('falha inesperada ao enviar. Tente de novo.', 'inesperado');
  }
});
