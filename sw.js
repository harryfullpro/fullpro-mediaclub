/* Service worker do painel do Media Club.
   Objetivo: o painel abrir e continuar utilizavel na garagem, onde o sinal cai.

   Regras, deliberadamente conservadoras:
   - HTML e JS/CSS proprios: rede primeiro. Estando online, voce SEMPRE ve a
     versao nova — um deploy nunca fica preso em cache.
   - Imagens e icones: cache primeiro (nao mudam e sao os arquivos pesados).
   - Supabase e qualquer API: passam direto, sem tocar no cache. Dado de
     operacao nao pode vir velho.
*/

/* v2 em 04/09/2026: o cache do v1 pode conter uma entrada /admin?code=<codigo>
   com codigo de autorizacao real dentro (ver abaixo). O activate apaga tudo que
   nao comeca com VERSAO, entao subir a versao e o que expurga aquilo. */
const VERSAO = 'mediaclub-v2';
const CACHE_SHELL = VERSAO + '-shell';
const CACHE_MIDIA = VERSAO + '-midia';

const SHELL = [
  '/admin',
  /* '/admin.html' saiu: responde 308 para /admin (cleanUrls da Vercel) e o
     cache.put RECUSA resposta redirecionada. O allSettled abaixo engolia a
     recusa, entao essa entrada nunca existiu de verdade — so parecia. */
  '/config.js',
  '/moto-catalog.js',
  '/manifest.webmanifest',
  '/assets/logo-mediaclub.png',
  '/assets/logo-short.png',
  '/assets/pwa/icone-192.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE_SHELL)
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
  );
  /* SEM skipWaiting AQUI, de proposito. O admin.html mostra "Nova versao do
     painel disponivel" com um botao, e o comentario de la diz "avisa em vez de
     trocar por baixo" — mas o skipWaiting no install trocava por baixo mesmo
     assim, e o botao Atualizar nao fazia diferenca nenhuma.
     Agora o SW novo espera de verdade e quem libera e o clique: ele manda
     'atualizar-agora', que chama skipWaiting no listener de message. */
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(
        nomes.filter((n) => !n.startsWith(VERSAO)).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

function ehMidia(url) {
  return /\.(png|jpe?g|svg|webp|gif|ico|woff2?)$/i.test(url.pathname);
}

function ehProprio(url) {
  return url.origin === self.location.origin;
}

self.addEventListener('fetch', (evento) => {
  const req = evento.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // API, Supabase, fontes externas: nunca passam pelo cache.
  if (!ehProprio(url)) return;
  if (/\/rest\/v1\/|\/functions\/v1\/|\/auth\/v1\//.test(url.pathname)) return;

  if (ehMidia(url)) {
    evento.respondWith(
      caches.match(req).then((cacheada) => cacheada || fetch(req).then((resp) => {
        if (resp.ok) {
          const copia = resp.clone();
          caches.open(CACHE_MIDIA).then((c) => c.put(req, copia));
        }
        return resp;
      }))
    );
    return;
  }

  /* URL COM QUERY NAO ENTRA NO CACHE. Duas razoes, as duas medidas em 04/09:
     1. A volta do OAuth e uma navegacao para /admin?code=<codigo>&state=… e o
        caches.put guardava isso — codigo de autorizacao gravado em disco, no
        cache do navegador, sem prazo. Nao e lugar de credencial.
     2. caches.match casa por URL INTEIRA, entao /admin?code=abc jamais seria
        batida de novo: era entrada morta, ocupando espaco para sempre.
     Quem tem query aqui e ou callback ou cache-buster; nenhum dos dois e shell. */
  const temQuery = url.search !== '';

  // Shell: rede primeiro, cache como rede de seguranca.
  evento.respondWith(
    fetch(req)
      .then((resp) => {
        if (resp.ok && !temQuery) {
          const copia = resp.clone();
          caches.open(CACHE_SHELL).then((c) => c.put(req, copia));
        }
        return resp;
      })
      .catch(() => caches.match(req).then((cacheada) => {
        if (cacheada) return cacheada;
        if (req.mode === 'navigate') return caches.match('/admin');
        return new Response('Sem conexão e sem cópia local.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }))
  );
});

/* Permite que a pagina peca uma atualizacao imediata apos um deploy. */
self.addEventListener('message', (evento) => {
  if (evento.data === 'atualizar-agora') self.skipWaiting();
});
