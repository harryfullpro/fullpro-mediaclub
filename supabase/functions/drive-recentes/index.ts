import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/* =============================================================================
   drive-recentes — as pastas de SKU criadas mais recentemente no Drive, com a
   PRIMEIRA foto de cada uma.

   Serve o carrossel do Dashboard de fotos: o que o estúdio acabou de produzir.
   "Recente" é a data de criação da PASTA (createdTime), e a foto é a primeira
   em ordem natural — a mesma que a listagem usa como miniatura.

   Por que uma função separada e não uma ação nova no drive-proxy: o proxy tem
   ~700 linhas e mexer nele para acrescentar uma leitura significa reimplantar
   tudo. Aqui a superfície é uma consulta. O preço é a duplicação do JWT da
   conta de serviço (as ~60 linhas de `accessToken`), consciente.

   Os BYTES das imagens continuam saindo do drive-proxy (?action=arquivo): ele
   já tem a guarda de "só arquivo de pasta filha da raiz" e o cache de 1 dia no
   navegador. Esta função devolve só as URLs.

   Secrets: GOOGLE_SA_JSON, DRIVE_ROOT_FOLDER_ID (os mesmos do drive-proxy).
     GET ?action=recentes[&n=20]
============================================================================= */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SA_JSON = Deno.env.get('GOOGLE_SA_JSON') || '';
const RAIZ = (Deno.env.get('DRIVE_ROOT_FOLDER_ID') || '').trim();

const DRIVE = 'https://www.googleapis.com/drive/v3';
const PASTA_MIME = 'application/vnd.google-apps.folder';
const ESCOPO = 'https://www.googleapis.com/auth/drive.readonly';

/* Dez minutos: o carrossel não precisa de tempo real e cada resposta custa 1
   listagem de pastas + 1 por pasta. Sem isto, cada operador que abrisse o
   Dashboard pagaria 21 idas ao Google. */
const VALIDADE_MS = 10 * 60 * 1000;
let cache: { em: number; dados: unknown } | null = null;

let tokenCache: { valor: string; expira: number } | null = null;

function b64url(dados: ArrayBuffer | string): string {
  const bytes = typeof dados === 'string' ? new TextEncoder().encode(dados) : new Uint8Array(dados);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemParaBytes(pem: string): Uint8Array {
  const limpo = pem.replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '').replace(/\s+/g, '');
  const bin = atob(limpo);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function contaServico(): { client_email: string; private_key: string } | null {
  if (!SA_JSON.trim()) return null;
  try {
    const j = JSON.parse(SA_JSON);
    if (!j.client_email || !j.private_key) return null;
    return { client_email: j.client_email, private_key: String(j.private_key).replace(/\\n/g, '\n') };
  } catch (_e) { return null; }
}

async function accessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expira - 60000) return tokenCache.valor;
  const sa = contaServico();
  if (!sa) throw new Error('GOOGLE_SA_JSON ausente ou invalido');
  const agora = Math.floor(Date.now() / 1000);
  const cabecalho = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const corpo = b64url(JSON.stringify({
    iss: sa.client_email, scope: ESCOPO,
    aud: 'https://oauth2.googleapis.com/token', iat: agora, exp: agora + 3600,
  }));
  const chave = await crypto.subtle.importKey('pkcs8', pemParaBytes(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const assinatura = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', chave,
    new TextEncoder().encode(cabecalho + '.' + corpo));
  const jwt = cabecalho + '.' + corpo + '.' + b64url(assinatura);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error('Google recusou a credencial: ' + (data.error_description || data.error || 'sem detalhe'));
  }
  tokenCache = { valor: data.access_token, expira: Date.now() + (data.expires_in || 3600) * 1000 };
  return tokenCache.valor;
}

async function driveGet(caminho: string, params: Record<string, string>) {
  const tok = await accessToken();
  const qs = new URLSearchParams({ ...params, supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' });
  const res = await fetch(`${DRIVE}${caminho}?${qs}`, { headers: { Authorization: 'Bearer ' + tok } });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || ('Drive respondeu ' + res.status));
  return data;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = new URL(req.url);

  try {
    if (!contaServico() || !RAIZ) return json({ configurado: false, fotos: [] });

    if (cache && Date.now() - cache.em < VALIDADE_MS) {
      return json({ ...(cache.dados as Record<string, unknown>), cache: true });
    }

    const quantas = Math.min(40, Math.max(1, Number(url.searchParams.get('n') || 20)));

    /* orderBy createdTime desc: a pasta nova e a que o estudio acabou de
       fotografar. Nome nao serve — o SKU nao tem ordem cronologica. */
    const pastas = await driveGet('/files', {
      q: `'${RAIZ}' in parents and mimeType = '${PASTA_MIME}' and trashed = false`,
      fields: 'files(id,name,createdTime)',
      orderBy: 'createdTime desc',
      pageSize: String(quantas),
    });
    const lista: any[] = Array.isArray(pastas.files) ? pastas.files : [];

    /* Os bytes saem do drive-proxy, que ja tem a guarda de pasta e o cache de
       1 dia no navegador. Aqui vao so as URLs. */
    const base = (SB_URL || url.origin).replace(/\/+$/, '') + '/functions/v1/drive-proxy';

    const fotos: any[] = [];
    /* Quatro por vez: o Drive limita requisicoes por segundo e 20 pastas em
       paralelo levam 429. */
    for (let i = 0; i < lista.length; i += 4) {
      const lote = lista.slice(i, i + 4);
      const res = await Promise.all(lote.map(async (p) => {
        try {
          const arq = await driveGet('/files', {
            q: `'${p.id}' in parents and mimeType contains 'image/' and trashed = false`,
            fields: 'files(id,name)',
            orderBy: 'name_natural',
            pageSize: '1',
          });
          const a = arq.files?.[0];
          if (!a) return null;          // pasta criada e ainda sem foto
          return {
            sku: p.name,
            criado_em: p.createdTime,
            file_id: a.id,
            file_name: a.name,
            thumb: `${base}?action=arquivo&id=${encodeURIComponent(a.id)}`,
            cheia: `${base}?action=arquivo&id=${encodeURIComponent(a.id)}&full=1`,
          };
        } catch (_e) { return null; }   // pasta ilegivel nao derruba o resto
      }));
      res.forEach((r) => { if (r) fotos.push(r); });
    }

    const dados = { configurado: true, total: fotos.length, fotos };
    cache = { em: Date.now(), dados };
    return json(dados);
  } catch (err) {
    return json({ error: String(err), fotos: [] }, 500);
  }
});
