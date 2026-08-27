import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/* =============================================================================
   drive-recentes — as pastas de SKU MODIFICADAS mais recentemente no Drive, com
   as DUAS primeiras fotos de cada uma.

   Serve o carrossel do Dashboard de fotos: o que o estúdio acabou de produzir.

   "Recente" é `modifiedTime` da PASTA, não `createdTime`. A primeira versão
   ordenava por criação e o dono viu na hora que não eram as fotos mais
   recentes: a pasta de SKU é criada quando o produto entra no catálogo, que
   pode ser meses antes de alguém fotografar. Subir foto numa pasta antiga mexe
   no `modifiedTime` dela e não no `createdTime` — logo é o `modifiedTime` que
   responde "onde entrou foto por último".

   Duas fotos por pasta porque o espaço no Dashboard é retangular: uma foto só,
   em `object-fit: cover`, era recortada nas laterais. Vão a foto 1 e a foto 2
   em ordem natural de nome — as mesmas que a listagem mostra primeiro.

   Por que uma função separada e não uma ação nova no drive-proxy: o proxy tem
   ~700 linhas e mexer nele para acrescentar uma leitura significa reimplantar
   tudo. Aqui a superfície é uma consulta. O preço é a duplicação do JWT da
   conta de serviço (as ~60 linhas de `accessToken`), consciente.

   Os BYTES das imagens continuam saindo do drive-proxy (?action=arquivo): ele
   já tem a guarda de "só arquivo de pasta filha da raiz" e o cache de 1 dia no
   navegador. Esta função devolve só as URLs.

   Secrets: GOOGLE_SA_JSON, DRIVE_ROOT_FOLDER_ID (os mesmos do drive-proxy).
     GET ?n=20  →  { configurado, total, pastas: [{ sku, modificado_em,
                     criado_em, fotos: [{ file_id, file_name, thumb, cheia }] }] }
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

    /* orderBy modifiedTime desc: a pasta onde entrou foto por ultimo. Por
       createdTime vinha a pasta criada por ultimo, que e outra coisa — o SKU
       entra no catalogo antes de alguem fotografar. Nome nao serve: SKU nao tem
       ordem cronologica. */
    const pastas = await driveGet('/files', {
      q: `'${RAIZ}' in parents and mimeType = '${PASTA_MIME}' and trashed = false`,
      fields: 'files(id,name,createdTime,modifiedTime)',
      orderBy: 'modifiedTime desc',
      pageSize: String(quantas),
    });
    const lista: any[] = Array.isArray(pastas.files) ? pastas.files : [];

    /* Os bytes saem do drive-proxy, que ja tem a guarda de pasta e o cache de
       1 dia no navegador. Aqui vao so as URLs. */
    const base = (SB_URL || url.origin).replace(/\/+$/, '') + '/functions/v1/drive-proxy';

    const urls = (id: string) => ({
      thumb: `${base}?action=arquivo&id=${encodeURIComponent(id)}`,
      cheia: `${base}?action=arquivo&id=${encodeURIComponent(id)}&full=1`,
    });

    const saida: any[] = [];
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
            pageSize: '2',
          });
          const arquivos: any[] = Array.isArray(arq.files) ? arq.files : [];
          if (!arquivos.length) return null;   // pasta mexida e ainda sem foto
          return {
            sku: p.name,
            modificado_em: p.modifiedTime,
            criado_em: p.createdTime,
            fotos: arquivos.map((a) => ({ file_id: a.id, file_name: a.name, ...urls(a.id) })),
          };
        } catch (_e) { return null; }   // pasta ilegivel nao derruba o resto
      }));
      res.forEach((r) => { if (r) saida.push(r); });
    }

    /* `pastas` e a resposta; `fotos` continua saindo com a primeira foto de
       cada pasta no formato antigo, para o painel nao ficar em branco na
       janela entre este deploy e o dele. */
    const dados = {
      configurado: true,
      total: saida.length,
      pastas: saida,
      fotos: saida.map((p) => ({
        sku: p.sku, criado_em: p.modificado_em,
        file_id: p.fotos[0].file_id, file_name: p.fotos[0].file_name,
        thumb: p.fotos[0].thumb, cheia: p.fotos[0].cheia,
      })),
    };
    cache = { em: Date.now(), dados };
    return json(dados);
  } catch (err) {
    return json({ error: String(err), fotos: [] }, 500);
  }
});
