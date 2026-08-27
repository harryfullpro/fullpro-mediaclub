import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/* =============================================================================
   mc-login — a ponte entre a senha antiga e o Supabase Auth.

   ANTES: o navegador fazia `select * from mc_admin_users where username = ? and
   password_hash = sha256(senha)` com a chave publishable. Consequencia medida
   de fora, sem login: a tabela inteira era legivel, com o `password_hash` de
   todo mundo (SHA-256 sem sal, quebravel offline), e as politicas `using(true)`
   ainda permitiam INSERT — dava para criar um administrador.

   AGORA: o navegador nunca toca em mc_admin_users para entrar. Manda usuario e
   senha para ca; esta funcao roda com a chave de servico e:

   1. acha o operador pelo usuario;
   2. se ele ainda nao tem conta no Auth, confere o hash ANTIGO e, dando certo,
      cria a conta com a mesma senha que a pessoa acabou de digitar;
   3. devolve so o e-mail interno.

   Quem autentica de fato e o navegador, chamando signInWithPassword com esse
   e-mail. A funcao nunca devolve token nem sessao: se devolvesse, ela viraria
   um segundo caminho de autenticacao para manter em pe.

   A migracao e PREGUICOSA de proposito. Os hashes guardados sao SHA-256 sem
   sal e o Auth usa bcrypt — nao da para converter um no outro. O unico momento
   em que a senha em claro existe e quando a pessoa digita, entao e nesse
   momento que a conta nasce. Ninguem precisa trocar de senha, e a partir da
   segunda entrada esta funcao nem e chamada.

   Secrets: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (ja injetadas).
     POST { usuario, senha } -> { email } | { erro }
============================================================================= */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/* O e-mail e um endereco tecnico, nao um contato: o painel entra por USUARIO, e
   o Auth exige um e-mail. Subdominio do dono, para nao ocupar endereco de
   terceiro, e sem caixa postal — recuperacao de senha aqui e o administrador
   trocando pela tela de Usuarios. */
const DOMINIO = 'painel.fullpro.com.br';

async function sha256(txt: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* Comparacao de tempo constante: comparar hash com === vaza, pelo tempo de
   resposta, quantos caracteres bateram. */
function igual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function json(dados: unknown, status = 200) {
  return new Response(JSON.stringify(dados), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/* Uma mensagem so para "nao existe" e "senha errada": mensagens diferentes
   contam a quem pergunta quais usuarios existem. */
const RECUSA = { erro: 'Usuário ou senha inválidos.' };

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405);

  let corpo: { usuario?: string; senha?: string };
  try { corpo = await req.json(); } catch { return json({ erro: 'Requisição inválida.' }, 400); }

  const usuario = String(corpo.usuario || '').trim().toLowerCase();
  const senha = String(corpo.senha || '');
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'sem-ip';

  const sb = createClient(SB_URL, SRK, { auth: { persistSession: false } });

  /* O contador vive no BANCO, e nao na memoria do isolate. A primeira versao
     contava em memoria e, medido, 14 tentativas seguidas passaram todas: cada
     requisicao cai num isolate diferente e o contador nasce zerado em cada um.

     Duas chaves: por IP (uma origem varrendo varios usuarios) e por usuario
     (varias origens contra a mesma conta). A do usuario e mais folgada, para
     um ataque distribuido nao conseguir trancar a conta de quem trabalha. */
  const passa = async (chave: string, teto: number) => {
    const { data, error } = await sb.rpc('mc_login_tentativa', { p_chave: chave, p_teto: teto });
    if (error) return true;          // contador fora do ar nao pode barrar quem trabalha
    return data !== false;
  };
  if (!await passa('ip:' + ip, 12)) return json({ erro: 'Muitas tentativas. Espere alguns minutos.' }, 429);
  if (usuario && !await passa('user:' + usuario, 30)) {
    return json({ erro: 'Muitas tentativas nesta conta. Espere alguns minutos.' }, 429);
  }

  if (!usuario || !senha) return json(RECUSA, 401);

  const { data: op, error } = await sb
    .from('mc_admin_users')
    .select('id, username, password_hash, auth_uid')
    .eq('username', usuario)
    .maybeSingle();

  if (error) return json({ erro: 'Erro ao consultar o cadastro.' }, 500);
  if (!op) return json(RECUSA, 401);

  const email = usuario + '@' + DOMINIO;

  /* Ja migrado: nada a fazer aqui. Quem confere a senha e o Auth, no navegador. */
  if (op.auth_uid) return json({ email });

  /* Ainda na senha antiga: e este o unico ponto do sistema que ainda olha o
     password_hash — e ele roda no servidor, nao no navegador. */
  if (!op.password_hash) return json(RECUSA, 401);
  const hash = await sha256(senha);
  if (!igual(hash, String(op.password_hash))) return json(RECUSA, 401);

  /* Senha confere: cria a conta com a MESMA senha e desliga o hash antigo.
     `email_confirm: true` porque nao ha caixa postal para confirmar. */
  const { data: criado, error: erroCriar } = await sb.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { username: usuario, operador_id: op.id },
  });

  let uid = criado?.user?.id || null;

  /* Conta ja existia no Auth sem estar ligada (migracao interrompida no meio,
     por exemplo): acha pelo e-mail e realinha a senha, em vez de falhar. */
  if (!uid && erroCriar) {
    const { data: lista } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
    const achado = (lista?.users || []).find((u) => (u.email || '').toLowerCase() === email);
    if (!achado) return json({ erro: 'Não foi possível preparar o acesso: ' + erroCriar.message }, 500);
    await sb.auth.admin.updateUserById(achado.id, { password: senha, email_confirm: true });
    uid = achado.id;
  }
  if (!uid) return json({ erro: 'Não foi possível preparar o acesso.' }, 500);

  const { error: erroLigar } = await sb
    .from('mc_admin_users')
    .update({ auth_uid: uid, password_hash: null })
    .eq('id', op.id);
  if (erroLigar) return json({ erro: 'Não foi possível concluir a migração: ' + erroLigar.message }, 500);

  return json({ email, migrado: true });
});
