# Classificador de story em três classes — desenho, código e o que ele não faz

Frente: separar automaticamente, sem digitação, os stories do @fullprobr em

- **(a) próprio** — foto ou vídeo novo, de câmera;
- **(b) republicação de conteúdo nosso** — story que recompartilha um post de feed **nosso**;
- **(c) repost de outro perfil** — mesmo desenho de (b), mas o conteúdo é de terceiro.

**Veredito, antes de qualquer código:** (a) sai automático e confiável. (b) sai automático
**só como confirmação positiva** — quando o card bate com uma mídia nossa, é nosso, ponto.
**(c) não sai automático, e eu não vou fingir que sai.** "Não bateu com nada nosso" é o mesmo
resultado que dá quando o story recompartilha um reel nosso mostrando um frame do meio, quando
o recorte do card falha, ou quando a capa ainda não foi assinada. Marcar isso como "repost de
outro perfil" tiraria peça de uma meta e colocaria em outra — erra duas vezes. Então (c) vira
uma **fila curta de conferência**, ordenada, e o operador dá um toque.

Quanto isso resolve, com os números medidos abaixo: o operador deixa de olhar os stories de
câmera (a maioria) e deixa de olhar as republicações confirmadas. Sobra a fila do "não sei".

---

## 0. O que foi medido hoje (01/09/2026), e duas coisas quebradas que apareceram no caminho

Medido no banco `xgaaocnuqgcwttrljqep` e com `jpeg-js@0.4.4` rodando de verdade, não estimado.

**O acervo (`mc_pecas`, hoje):**

| fonte | tipo | linhas |
|---|---|---|
| instagram | short (reels) | 53 |
| instagram | carrossel | 7 |
| instagram | outro | 3 |
| instagram | **story** | **8** |
| youtube | longo / longo_10_15 / pure_sound / short | 24 / 12 / 8 / 25 |
| tiktok | short | 21 |
| clip | clip | 6 |

O corpus de mídias nossas do Instagram é **63 peças** (53 + 7 + 3). Isso não é uma amostra: o
coletor puxa `/{ig}/media` com até 20 páginas, então são **todas** as mídias da conta. Isso
importa em §5 — "não bateu com nada nosso" pesa mais quando o corpus é completo.

**Stories medidos:** 3 dos 8 têm `bruto.medidas`. Valores reais: `{0,0,var 3524}`,
`{0,0,var 1183}` e `{topo 2, base 17, var 2089}`. Volume: 3 stories em 28/08 e 5 em 31/08 —
ordem de 5 a 10 por dia. As miniaturas no bucket `stories` pesam **42 KB a 814 KB** (média 311 KB
em 5 arquivos).

### Bug 1 — `bruto` é apagado toda hora, e por isso `bruto.dhash` não pode existir

O enunciado pede guardar o hash em `bruto.dhash`. **Não dá, hoje.** No `coletor-pecas.ts`, a
função `guardar()` monta `bruto` do zero a cada rodada:

```ts
bruto: Object.assign({ media_type: m.media_type, media_product_type: m.media_product_type }, extra || {}),
```

e o `upsert` com `ignoreDuplicates: false` **substitui** a coluna inteira. Prova pelos dados —
as chaves que sobraram em `bruto`, por tipo:

| tipo | chaves de `bruto` | linhas |
|---|---|---|
| short / carrossel / outro | `media_product_type, media_type` | 63 |
| story | `media_product_type` | 3 |
| story | `media_product_type, media_type` | 2 |
| story | `media_product_type, media_type, medidas, thumb` | 3 |

Nenhuma das 63 mídias de feed tem qualquer chave extra: qualquer `dhash` escrito ali dura até a
próxima hora. **Por isso o corpus vai para uma tabela própria** (`mc_midia_assinatura`, §3).

### Bug 2 — a mesma miniatura de story é baixada de hora em hora, alternadamente

Consequência do bug 1, e custa banda de verdade. `jaTem` é montado a partir de `bruto.thumb`:

- hora N: sem `thumb` no banco → baixa (311 KB em média) → grava `thumb` + `medidas`;
- hora N+1: tem `thumb` → `thumbDoStory` devolve `null` → `guardar` grava `bruto` **sem** `thumb` → apaga;
- hora N+2: sem `thumb` de novo → baixa outra vez.

Confirmado por `storage.objects`: os 5 arquivos do bucket foram **re-enviados hoje**, às 10:07 e
11:07, e são exatamente os que aparecem ora com `thumb`, ora sem. São ~1,5 MB/hora de download
repetido, e a `medidas` some da metade das linhas.

Correção de três linhas, para quem estiver editando o arquivo (eu não toquei nele):

```ts
// dentro de instagram(), antes do laço dos stories: guarde o bruto que já existe
const brutoAtual = new Map<string, any>();
// ... ao ler mc_pecas para montar jaTem, preencha: brutoAtual.set(r.externo_id, r.bruto || {})
// e em guardar(): bruto: Object.assign({}, brutoAtual.get(m.id) || {}, { media_type: ..., media_product_type: ... }, extra || {}),
```

Nada em §3 depende dessa correção — o classificador grava em colunas próprias justamente para
não brigar com o `upsert`.

---

## 1. O desenho das três classes

O sinal disponível é a **imagem**, porque quem desenha o recompartilhamento é o próprio
Instagram. A API não ajuda, e isso está fechado:

- a lista de campos do IG Media é fechada — não existe `story_type`, `reshared_from` nem
  `source_media` ([IG Media reference](https://developers.facebook.com/docs/instagram-platform/reference/instagram-media));
- a borda `/stories` avisa em letra: *"New stories created when a user reshares a story will not
  be returned"* ([Stories edge](https://developers.facebook.com/docs/instagram-api/reference/user/stories)).
  Ou seja: reshare de **story** nem chega. O que chega, e sem marcador, é reshare de **post de feed** —
  que é exatamente a fronteira (b)/(c).

### (a) próprio — geometria, e só

Story de câmera preenche o quadro. Reshare de post é um card **menor, centrado, com margens
laterais simétricas** sobre fundo liso (o Instagram usa um degradê borrado tirado do próprio
post — degradê borrado tem variância baixa, então conta como "liso").

A regra de hoje no coletor (`topo_pct >= 8 && base_pct >= 8 && var_meio > 200`) tem um furo
medido: um dos stories reais deu `topo 2 / base 17`, e cai em "só uma ponta lisa" → nada.
Céu liso em cima, barra preta embaixo, letterbox de vídeo — tudo isso derruba a regra de duas pontas.

**Troco por área e simetria**, que é o que separa card de quadro cheio:

| medida | próprio (quadro cheio) | card de reshare |
|---|---|---|
| área do retângulo com textura | **≥ 60% do quadro** | 12% a 46% |
| margens laterais | quase iguais **por acidente** | iguais **por construção** (`\|esq−dir\| ≤ 6%`) |
| razão largura/altura do retângulo | qualquer | 1:1, 4:5 ou 16:9 → 0,45 a 1,45 |

Medido no ensaio: story de câmera sintético → área **78,4%** → `proprio`. Cards a 62%, 76% e 90%
da largura → área 21,6% / 32,5% / 45,6%, margens laterais batendo em 0,1 ponto → `card`.
A detecção de banda **acertou o retângulo do card exatamente** (dx=dy=dw=dh=0) nos três tamanhos.
Não precisa varrer janelas.

### (b) e (c) — mesma geometria, decididas pelo conteúdo do card

Uma vez recortado o card, a pergunta é só uma: **essa imagem é uma das nossas 63?**

---

## 2. O método para separar (b) de (c) — e onde ele para

### O que a pesquisa anterior mediu, e por que ela subestimou o problema por um lado e superestimou por outro

A medição anterior (dHash do quadro inteiro sem sinal: 34 bits no caso verdadeiro contra 32
aleatório; só o recorte funciona: 1 bit; varrendo janelas, 9 bits contra 15 do melhor falso —
6 bits de margem com distratores **aleatórios**) está certa no diagnóstico e frágil na conclusão.
O enunciado desconfia com razão: o feed da FullPro é o oposto de distratores aleatórios.

Refiz a medição aqui. Dois resultados mudam o desenho:

**Primeiro: não precisa varrer janelas.** O recorte sai da própria detecção de bandas, exato.
Os 9 bits da varredura eram o custo de não saber onde estava o card. Com o recorte certo,
o caso verdadeiro volta para **1 a 5 bits**.

**Segundo, e mais importante: dHash é o comparador errado para o nosso feed.** O dHash gasta 64
bits em comparações entre células vizinhas — e em foto de produto sobre fundo liso, boa parte
dessas comparações é empate técnico, decidida por ruído de JPEG. Medido nas fotos do repo:

| imagem | mediana da diferença entre células vizinhas (0–255) | bits com margem < 2 |
|---|---|---|
| `mochila.jpg` | 50,1 | 11 de 64 |
| `pastilhas.jpg` | 4,8 | **28 de 64** |
| `capa-chuva.jpg` | 28,4 | 5 de 64 |

Quase metade do hash de `pastilhas.jpg` é sorteio. Foto de peça em fundo claro — o nosso caso —
é justo o pior caso do dHash.

**A troca:** comparar o recorte 32×32 em tons de cinza por **correlação normalizada (NCC)** em
vez de contar bits. Mesmo custo (o recorte já está reamostrado), e usa a intensidade inteira em
vez de jogá-la fora. Medido, mesmo par de imagens, mesmo pipeline:

| caso | dHash (bits) | NCC 32×32 |
|---|---|---|
| story recompartilha `mochila` (card 90%) | 3 | **1,000** |
| story recompartilha `mochila` (card 76%) | 4 | **1,000** |
| story recompartilha `mochila` (card 62%) | 3 | **1,000** |
| mesma foto com brilho +8% | 3–4 | 0,999 |
| outra foto nossa (`pastilhas`) | 22 | 0,341 |
| outra foto nossa (`capa-chuva`) | 31 | 0,231 |
| conteúdo de terceiro (`site.png`) contra o corpus | 24 (melhor) | **0,278** (melhor) |

Separação de 1,000 contra 0,34. O dHash continua no desenho, mas como **segunda condição**
(barato, e pega erro grosseiro de reamostragem); quem decide é o NCC.

### Onde o método para: as deformações reais

Aqui está a parte que nenhuma medição anterior cobriu, e que decide o desenho. Medi cada
deformação que o recompartilhamento real aplica, contra a mesma capa:

| deformação | NCC 32×32 | dHash |
|---|---|---|
| idêntico | 1,000 | 0 bits |
| faixa do @usuario cobrindo 10% + cantos arredondados | **0,961** | 3 bits |
| recorte do card errou 3% | 0,925 | 3 bits |
| capa 1:1 exibida como 4:5 (o IG corta) | 0,849 | 7 bits |
| **story de um reel nosso mostrando outro frame** (zoom 10%) | **0,825** | 5 bits |
| recorte do card errou 8% | 0,688 | 12 bits |
| **frame bem diferente** (zoom 25%) | **0,491** | 18 bits |
| **outra pose do mesmo produto** (espelhada) — proxy de "outra capa do mesmo ensaio" | **0,617** | 24 bits |

Leia as duas linhas em negrito juntas: um **acerto** deformado cai a 0,49–0,83, e um **erro**
plausível (duas capas do mesmo ensaio, mesma moto, mesmo estúdio) sobe a 0,62. **As faixas se
cruzam.** Não existe um limiar que separe as duas coisas no meio da escala.

O que existe é uma ponta limpa: acima de **0,93** só ficou coisa que é de fato a mesma imagem
(o pior acerto "limpo", com faixa do @ e cantos, deu 0,961; o melhor falso do ensaio deu 0,341,
e o pior falso imaginável — outra pose do mesmo produto — 0,617).

**Decisão, então:**

- limiar alto e **de mão única**: `NCC ≥ 0,93` **e** `dHash ≤ 8 bits` → **é nosso**, com o id da
  peça que bateu gravado junto (auditável: o operador vê qual post casou);
- **tudo o mais que tem cara de card vira `nao_proprio`** — que junta (b) não confirmado com (c),
  exatamente a saída que o enunciado sugere em §5, e que eu recomendo;
- **nunca** afirmar (c) sozinho.

Detalhe que simplifica: **não exijo folga sobre o segundo colocado**. Confundir duas mídias
*nossas* entre si não muda a classe — as duas são "nosso". A folga só serviria para escolher qual
post casou, e para isso o segundo colocado fica gravado do lado.

---

## 3. O código, pronto para colar em `coletor-pecas.ts`

Não editei `coletor-pecas.ts`, `instagram-proxy.ts` nem `youtube-proxy.ts`. O bloco abaixo é
autocontido: só depende de `decodificador()`, que já existe no arquivo (import dinâmico de
`npm:jpeg-js@0.4.4`), e das constantes `GRAPH` e do cliente `sb`.

**Rodou de verdade** antes de entrar aqui: `autoteste()` passou e as quatro situações
(reshare nosso com faixa do @, reshare nosso pequeno, reshare de terceiro, story de câmera)
classificaram certo. O autoteste existe porque a primeira versão da reamostragem tinha um erro de
aritmética no recorte (`x0 + Math.max(...)` em vez de `Math.max(..., x0 + ...)`) que fazia o caso
verdadeiro dar 19 bits em vez de 3 — parecia limitação do método e era bug meu. Se `autoteste()`
devolver qualquer linha, **não confie no resultado**.

### 3.1 Migração (arquivo novo, aplicar antes)

```sql
-- Corpus de assinaturas. Tabela própria porque mc_pecas.bruto é reescrito a cada
-- rodada do coletor (medido em 01/09: nenhuma das 63 mídias de feed tem chave extra).
create table if not exists public.mc_midia_assinatura (
  externo_id   text primary key,
  fonte        text not null default 'instagram',
  dhash        text,                    -- 16 hex = 64 bits
  p32          text,                    -- 32x32 cinza, base64 (1024 bytes)
  largura      int,
  altura       int,
  campo_origem text,                    -- thumbnail_url | media_url | children[0]
  erro         text,                    -- por que não deu, quando não deu
  tentativas   int not null default 0,
  assinado_em  timestamptz not null default now()
);
alter table public.mc_midia_assinatura enable row level security;
-- Sem policy, de propósito: só o service_role (o coletor) lê e escreve, igual mc_integrations.

-- O palpite do classificador vai em COLUNA, não em bruto, pelo mesmo motivo.
alter table public.mc_pecas
  add column if not exists auto_classe   text,
  add column if not exists auto_conf     numeric,
  add column if not exists auto_match    text,        -- externo_id da mídia que casou
  add column if not exists auto_medidas  jsonb;

alter table public.mc_pecas drop constraint if exists mc_pecas_auto_classe_chk;
alter table public.mc_pecas add constraint mc_pecas_auto_classe_chk
  check (auto_classe is null or auto_classe in ('proprio','republicacao_nossa','nao_proprio','indeterminado'));

create index if not exists mc_pecas_fila_story on public.mc_pecas (auto_classe)
  where tipo = 'story' and classificado_em is null;
```

### 3.2 O bloco TypeScript

```ts
/* ── FP-STORY-3CLASSES ───────────────────────────────────────────────────────
   Classifica story em: proprio | republicacao_nossa | nao_proprio | indeterminado.

   O QUE ELE AFIRMA E O QUE NÃO AFIRMA
   - 'proprio': a imagem ocupa o quadro. Confiável.
   - 'republicacao_nossa': o card bate com uma mídia NOSSA acima de um limiar alto.
     Afirmação de mão única — quando dá, é verdade; quando não dá, não diz nada.
   - 'nao_proprio': tem cara de card e NÃO bateu. Isso NÃO é "repost de outro perfil":
     é também o que acontece quando o story mostra um frame do meio de um reel nosso.
     Fila de conferência do operador.
   - 'indeterminado': não deu para medir. Nunca vira meta sozinho.
   Medições que sustentam os limiares: ver classificador-story.md §2.
   ────────────────────────────────────────────────────────────────────────── */

const LISO = 60;              /* variância de linha/coluna abaixo disso = lisa */
const AREA_CHEIA = 0.60;      /* retângulo com textura >= 60% do quadro = câmera */
const ASSIM_MAX = 0.06;       /* |margem esq - dir| máxima para ser card */
const RAZAO_MIN = 0.45, RAZAO_MAX = 1.45;   /* 16:9, 4:5, 1:1 com folga */
const AREA_CARD_MIN = 0.12;
const TEXTURA_MIN = 200;
const NCC_CONFIRMA = 0.93;    /* pior acerto limpo medido: 0,961 */
const DHASH_CONFIRMA = 8;     /* acerto limpo medido: 1 a 5 bits */

type Cinza = { W: number; H: number; g: Float64Array };

function cinza(img: any): Cinza {
  const W = img.width, H = img.height, d = img.data;
  const g = new Float64Array(W * H);
  for (let i = 0, j = 0; j < W * H; i += 4, j++) g[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  return { W, H, g };
}

/* Reamostragem por média de caixa de um RECORTE (x0,y0,w,h) para nw x nh.
   A aritmética do recorte é o ponto frágil: sx1 tem que ser max(sx0+1, x0+floor(...)),
   com o x0 DENTRO do floor. Errar isso não quebra nada visivelmente — só degrada a
   comparação em silêncio. Por isso tem autoteste. */
function reamostrar(src: Cinza, x0: number, y0: number, w: number, h: number, nw: number, nh: number): Float64Array {
  const out = new Float64Array(nw * nh);
  for (let ry = 0; ry < nh; ry++) {
    const sy0 = y0 + Math.floor(ry * h / nh);
    const sy1 = Math.max(sy0 + 1, y0 + Math.floor((ry + 1) * h / nh));
    for (let rx = 0; rx < nw; rx++) {
      const sx0 = x0 + Math.floor(rx * w / nw);
      const sx1 = Math.max(sx0 + 1, x0 + Math.floor((rx + 1) * w / nw));
      let s = 0, n = 0;
      for (let y = sy0; y < sy1; y++) {
        const base = Math.min(src.H - 1, y) * src.W;
        for (let x = sx0; x < sx1; x++) { s += src.g[base + Math.min(src.W - 1, x)]; n++; }
      }
      out[ry * nw + rx] = n ? s / n : 0;
    }
  }
  return out;
}

/* dHash 9x8 -> 16 hex. Fica como SEGUNDA condição: barato e pega erro grosseiro.
   Não decide sozinho — em foto de produto sobre fundo claro, metade dos bits é empate
   técnico (medido: 28 de 64 com margem < 2 numa das fotos). */
function dhash64(p: Float64Array): string {
  let hex = '', byte = 0, bits = 0;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    byte = (byte << 1) | (p[y * 9 + x] < p[y * 9 + x + 1] ? 1 : 0);
    if (++bits === 4) { hex += byte.toString(16); byte = 0; bits = 0; }
  }
  return hex;
}
const POP = new Uint8Array(16);
for (let i = 0; i < 16; i++) POP[i] = (i & 1) + ((i >> 1) & 1) + ((i >> 2) & 1) + ((i >> 3) & 1);
function distHex(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) d += POP[(parseInt(a[i], 16) ^ parseInt(b[i], 16)) & 15];
  return d;
}

/* Correlação normalizada: é ela que decide. Invariante a brilho e contraste, que é
   exatamente o que o Instagram mexe ao redesenhar o post dentro do story. */
function ncc(a: Float64Array, b: Float64Array): number {
  const n = a.length; if (n !== b.length) return -1;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let s = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { const u = a[i] - ma, v = b[i] - mb; s += u * v; da += u * u; db += v * v; }
  return (da > 0 && db > 0) ? s / Math.sqrt(da * db) : 0;
}

/* Acha o maior retângulo com textura: come as linhas e colunas lisas das quatro bordas.
   Medido: acerta o card exatamente (erro 0 px) em fundo liso ou degradê borrado. */
function acharCard(src: Cinza) {
  const { W, H } = src, AM = 64;
  const varLinha = (y: number) => {
    let s = 0, s2 = 0;
    for (let c = 0; c < AM; c++) { const x = Math.min(W - 1, Math.floor((c + 0.5) * W / AM)); const v = src.g[y * W + x]; s += v; s2 += v * v; }
    return s2 / AM - (s / AM) * (s / AM);
  };
  const varCol = (x: number) => {
    let s = 0, s2 = 0;
    for (let r = 0; r < AM; r++) { const y = Math.min(H - 1, Math.floor((r + 0.5) * H / AM)); const v = src.g[y * W + x]; s += v; s2 += v * v; }
    return s2 / AM - (s / AM) * (s / AM);
  };
  let y0 = 0; while (y0 < H - 1 && varLinha(y0) < LISO) y0++;
  let y1 = H - 1; while (y1 > y0 && varLinha(y1) < LISO) y1--;
  let x0 = 0; while (x0 < W - 1 && varCol(x0) < LISO) x0++;
  let x1 = W - 1; while (x1 > x0 && varCol(x1) < LISO) x1--;

  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const p = reamostrar(src, x0, y0, Math.max(1, w), Math.max(1, h), 16, 16);
  let m = 0; for (let i = 0; i < 256; i++) m += p[i]; m /= 256;
  let v = 0; for (let i = 0; i < 256; i++) v += (p[i] - m) * (p[i] - m);
  const um = (n: number, d: number) => Math.round(1000 * n / d) / 10;
  return {
    x0, y0, w, h, textura: Math.round(v / 256),
    area_pct: um(w * h, W * H), topo_pct: um(y0, H), base_pct: um(H - 1 - y1, H),
    esq_pct: um(x0, W), dir_pct: um(W - 1 - x1, W),
  };
}

function assinar(src: Cinza, x0: number, y0: number, w: number, h: number) {
  return { dhash: dhash64(reamostrar(src, x0, y0, w, h, 9, 8)), p32: reamostrar(src, x0, y0, w, h, 32, 32) };
}
function p32ParaB64(p32: Float64Array): string {
  let s = '';
  for (let i = 0; i < 1024; i++) s += String.fromCharCode(Math.max(0, Math.min(255, Math.round(p32[i]))));
  return btoa(s);
}
function b64ParaP32(s: string): Float64Array {
  const bin = atob(s), out = new Float64Array(1024);
  for (let i = 0; i < 1024 && i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ── O CORPUS: assinatura das nossas mídias de feed ──────────────────────────
   Uma vez por mídia, para sempre. Grava em mc_midia_assinatura (NÃO em bruto:
   o upsert do coletor reescreve bruto toda hora — medido em 01/09).

   ORDEM IMPORTA: `publicado_em desc`. O reshare para o story acontece minutos
   depois do post ir ao ar; se a capa nova não estiver assinada, o story dele cai
   em 'nao_proprio' sem motivo. Por isso esta função roda ANTES de classificar
   story, e o mais novo entra primeiro.

   `limite` é orçamento de CPU, não de paciência: ver §4. Comece com 8. */
async function atualizarCorpus(sb: any, tokPagina: string, limite: number, erros: string[]) {
  /* Duas consultas, sem view nem RPC nova: as mídias de feed, e quem já tem assinatura.
     Uma linha com `erro` é tentada de novo, até 3 vezes — capa pode não ter baixado por
     azar de rede. Depois disso para de insistir, senão o orçamento vira loop. */
  const { data: midias, error: eM } = await sb.from('mc_pecas')
    .select('externo_id, publicado_em')
    .eq('fonte', 'instagram').in('tipo', ['short', 'carrossel', 'outro'])
    .order('publicado_em', { ascending: false }).limit(400);
  if (eM) { erros.push('corpus/pendentes: ' + eM.message); return 0; }

  const { data: jaTem, error: eJ } = await sb.from('mc_midia_assinatura')
    .select('externo_id, erro, tentativas');
  if (eJ) { erros.push('corpus/assinadas: ' + eJ.message); return 0; }

  const tentativasDe = new Map<string, number>();
  const pula = new Set<string>();
  for (const r of (jaTem || [])) {
    tentativasDe.set(r.externo_id, r.tentativas || 0);
    if (!r.erro || (r.tentativas || 0) >= 3) pula.add(r.externo_id);
  }
  const ids = (midias || []).map((r: any) => r.externo_id)
    .filter((id: string) => id && !pula.has(id)).slice(0, limite);
  if (!ids.length) return 0;

  let feitas = 0;
  for (const id of ids) {   /* SEQUENCIAL de propósito: 256 MB de memória, e um
                               decode de 1080x1920 já são ~8 MB de RGBA. */
    const linha: any = { externo_id: id, fonte: 'instagram', assinado_em: new Date().toISOString(),
                         tentativas: (tentativasDe.get(id) || 0) + 1 };
    try {
      const r = await fetch(`${GRAPH}/${id}?fields=media_type,media_product_type,thumbnail_url,media_url,` +
        `children{media_type,media_url,thumbnail_url}&access_token=${tokPagina}`);
      const m = await r.json();
      if (m?.error) throw new Error(m.error.message);

      /* De onde sai a CAPA, por tipo. thumbnail_url só existe em VIDEO
         (developers.facebook.com/docs/instagram-platform/reference/instagram-media).
         media_url de VIDEO é o .mp4 — NUNCA baixar. */
      let url = '', campo = '';
      if (m.media_type === 'CAROUSEL_ALBUM') {
        const c = m.children?.data?.[0];
        url = (c?.media_type === 'VIDEO' ? c?.thumbnail_url : c?.media_url) || '';
        campo = 'children[0]';
      } else if (m.media_type === 'VIDEO') {
        url = m.thumbnail_url || ''; campo = 'thumbnail_url';
      } else {
        url = m.media_url || ''; campo = 'media_url';
      }
      if (!url) throw new Error('sem URL de capa (media_type=' + m.media_type + ')');

      const img = await fetch(url);
      if (!img.ok) throw new Error('capa não baixou (' + img.status + ')');
      const ct = img.headers.get('content-type') || '';
      if (!/jpe?g/i.test(ct)) throw new Error('capa não é JPEG (' + ct + ') — jpeg-js não decodifica');
      const bin = new Uint8Array(await img.arrayBuffer());

      const jpeg = await decodificador();
      if (!jpeg) throw new Error('sem decodificador de imagem nesta função');
      const dec = jpeg.decode(bin, { useTArray: true });
      const src = cinza(dec);
      const a = assinar(src, 0, 0, src.W, src.H);
      Object.assign(linha, { dhash: a.dhash, p32: p32ParaB64(a.p32), largura: src.W, altura: src.H, campo_origem: campo, erro: null });
      feitas++;
    } catch (e) {
      linha.erro = e instanceof Error ? e.message : 'falhou';
      erros.push('assinatura ' + id + ': ' + linha.erro);
    }
    const { error: eUp } = await sb.from('mc_midia_assinatura')
      .upsert(linha, { onConflict: 'externo_id', ignoreDuplicates: false });
    if (eUp) erros.push('assinatura ' + id + ': ' + eUp.message);
  }
  return feitas;
}

async function carregarCorpus(sb: any, erros: string[]) {
  const { data, error } = await sb.from('mc_midia_assinatura')
    .select('externo_id, dhash, p32').not('p32', 'is', null);
  if (error) { erros.push('corpus: ' + error.message); return []; }
  return (data || []).map((r: any) => ({ externo_id: r.externo_id, dhash: r.dhash, p32: b64ParaP32(r.p32) }));
}

/* ── A CLASSIFICAÇÃO ───────────────────────────────────────────────────────── */
type Corpus = { externo_id: string; dhash: string; p32: Float64Array }[];

async function classificarStory(bin: Uint8Array, corpus: Corpus) {
  const nada = (motivo: string, medidas: any = null) =>
    ({ classe: 'indeterminado', conf: null, match: null, segundo: null, medidas, motivo });

  const jpeg = await decodificador();
  if (!jpeg) return nada('sem decodificador de imagem nesta função');
  let img: any;
  try { img = jpeg.decode(bin, { useTArray: true }); } catch { return nada('não deu para decodificar a miniatura'); }
  if (!img.width || !img.height) return nada('imagem vazia');

  const src = cinza(img);
  const c = acharCard(src);
  const medidas = { topo_pct: c.topo_pct, base_pct: c.base_pct, esq_pct: c.esq_pct,
                    dir_pct: c.dir_pct, area_pct: c.area_pct, textura: c.textura };

  if (c.w < 8 || c.h < 8 || c.textura < TEXTURA_MIN)
    return nada('imagem sem textura (' + c.textura + ') — fundo liso, capa preta ou frame perdido', medidas);

  if (c.area_pct >= AREA_CHEIA * 100)
    return { classe: 'proprio', conf: 0.9, match: null, segundo: null, medidas,
      motivo: 'a imagem ocupa ' + c.area_pct + '% do quadro (margens ' + c.topo_pct + '/' + c.base_pct
            + '/' + c.esq_pct + '/' + c.dir_pct + '%) — foto ou vídeo de câmera' };

  const assim = Math.abs(c.esq_pct - c.dir_pct) / 100;
  const razao = c.w / c.h;
  if (!(assim <= ASSIM_MAX && razao >= RAZAO_MIN && razao <= RAZAO_MAX && c.area_pct / 100 >= AREA_CARD_MIN))
    return nada('sobrou um retângulo sem cara de card (área ' + c.area_pct + '%, razão ' + razao.toFixed(2)
      + ', margens laterais ' + c.esq_pct + '/' + c.dir_pct + '%)', medidas);

  const a = assinar(src, c.x0, c.y0, c.w, c.h);
  let melhor: any = null, segundo: any = null;
  for (const m of corpus) {
    const cand = { externo_id: m.externo_id, ncc: ncc(a.p32, m.p32), bits: distHex(a.dhash, m.dhash) };
    if (!melhor || cand.ncc > melhor.ncc) { segundo = melhor; melhor = cand; }
    else if (!segundo || cand.ncc > segundo.ncc) segundo = cand;
  }
  const comum = { medidas, match: melhor, segundo, dhash_card: a.dhash };

  if (!melhor)
    return { classe: 'nao_proprio', conf: 0.3, ...comum,
      motivo: 'card centrado, mas o corpus está vazio — não dá para dizer se é nosso' };

  /* Mão única: acima do limiar É nosso. Abaixo NÃO É "de outro perfil" — é "não sei". */
  if (melhor.ncc >= NCC_CONFIRMA && melhor.bits <= DHASH_CONFIRMA)
    return { classe: 'republicacao_nossa', conf: Math.round(melhor.ncc * 100) / 100, ...comum,
      motivo: 'o card bate com a nossa mídia ' + melhor.externo_id
            + ' (NCC ' + melhor.ncc.toFixed(3) + ', dHash ' + melhor.bits + ' bits)' };

  return { classe: 'nao_proprio', conf: Math.round((1 - Math.max(0, melhor.ncc)) * 100) / 100, ...comum,
    motivo: 'card centrado que NÃO bate com nada nosso (melhor: ' + melhor.externo_id
          + ', NCC ' + melhor.ncc.toFixed(3) + ', ' + melhor.bits + ' bits) — pode ser repost de outro '
          + 'perfil OU republicação nossa que o corpus não reconheceu' };
}

/* ── AUTOTESTE ──────────────────────────────────────────────────────────────
   Chame no endpoint com ?autoteste=1 e leia a resposta. Se voltar QUALQUER linha,
   não confie na classificação: o erro que ele pega (aritmética do recorte) degrada
   o resultado em silêncio, sem lançar exceção. */
function autoteste(): string[] {
  const erros: string[] = [];
  const W = 100, H = 80, g = new Float64Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g[y * W + x] = x * 2;
  const src: Cinza = { W, H, g };

  const r = reamostrar(src, 50, 0, 50, H, 5, 1);
  const esperado = [109, 129, 149, 169, 189];
  for (let i = 0; i < 5; i++)
    if (Math.abs(r[i] - esperado[i]) > 1.01) erros.push('reamostrar recorte: célula ' + i + ' deu ' + r[i].toFixed(1) + ', esperado ~' + esperado[i]);
  const inteiro = reamostrar(src, 0, 0, W, H, 2, 2);
  if (Math.abs(inteiro[0] - 49) > 1.01) erros.push('reamostrar quadro inteiro: ' + inteiro[0].toFixed(1) + ' != ~49');

  const p = reamostrar(src, 0, 0, W, H, 9, 8);
  const h1 = dhash64(p);
  if (distHex(h1, h1) !== 0) erros.push('dHash contra si mesmo não deu 0');
  const inv = new Float64Array(72); for (let i = 0; i < 72; i++) inv[i] = 255 - p[i];
  if (distHex(h1, dhash64(inv)) !== 64) erros.push('dHash da imagem invertida deveria dar 64 bits');
  const neg = new Float64Array(72); for (let i = 0; i < 72; i++) neg[i] = -p[i];
  if (Math.abs(ncc(p, p) - 1) > 1e-9) erros.push('ncc(a,a) != 1');
  if (Math.abs(ncc(p, neg) + 1) > 1e-9) erros.push('ncc(a,-a) != -1');

  const CW = 200, CH = 360, cg = new Float64Array(CW * CH).fill(20);
  for (let y = 100; y < 260; y++) for (let x = 40; x < 160; x++) cg[y * CW + x] = ((x * 37 + y * 91) % 200) + 20;
  const c = acharCard({ W: CW, H: CH, g: cg });
  if (Math.abs(c.x0 - 40) > 4 || Math.abs(c.y0 - 100) > 6 || Math.abs(c.w - 120) > 8 || Math.abs(c.h - 160) > 12)
    erros.push('acharCard errou o retângulo: ' + JSON.stringify({ x0: c.x0, y0: c.y0, w: c.w, h: c.h }));
  return erros;
}
```

### 3.3 Como plugar (o que muda em `coletor-pecas.ts` — quem edita é você)

Dentro de `instagram()`, depois de resolver `tok` e `igId`, e **antes** do laço dos stories:

```ts
const corpusFeitas = await atualizarCorpus(sb, tok, 8, erros);   // 8 = orçamento, ver §4
const corpus = await carregarCorpus(sb, erros);
```

Em `thumbDoStory`, onde hoje há `analise = await analisarStory(bin)`, troque por
`analise = await classificarStory(bin, corpus)`, e no laço dos stories empilhe o resultado em
`analisados`. Por fim, no UPDATE do palpite (que já filtra `classificado_em is null` — mantenha
esse filtro, ele é o que protege a correção do operador):

```ts
.update({
  auto_classe:  a.classe,
  auto_conf:    a.conf,
  auto_match:   a.match?.externo_id ?? null,
  auto_medidas: a.medidas,
  /* compatibilidade: admin.html hoje lê auto_repost === false/true. Enquanto o painel
     não conhecer auto_classe, o mapa é este — e 'indeterminado' vira null, que o painel
     já trata como "não sei". */
  auto_repost:  a.classe === 'proprio' ? false : (a.classe === 'indeterminado' ? null : true),
  auto_motivo:  a.motivo,
  auto_em:      new Date().toISOString(),
})
```

---

## 4. O custo — e ele não cabe todo numa chamada

Limites da plataforma, do doc: **CPU 2 s por requisição**, memória 256 MB, wall clock 150 s no
plano gratuito (400 s nos pagos) — [Edge Functions limits](https://supabase.com/docs/guides/functions/limits).
A organização `fullpro_shared` está no plano **free**: o teto é **150 s** de wall clock e **2 s de CPU**.
CPU e wall clock são orçamentos separados; download não gasta CPU, decodificação gasta tudo.

Medido com `jpeg-js@0.4.4` neste Mac (Apple Silicon):

| operação | CPU medida |
|---|---|
| decodificar JPEG 1080×1920 | 51–67 ms |
| cinza + bandas + assinatura | 6 ms |
| **classificar 1 story inteiro** | **60 ms** |
| assinar 20 capas de 1080×1920 | 1 318 ms (66 ms cada) |

O core do edge runtime é compartilhado e mais lento: conte **2 a 3×**. Então, no edge:

| tarefa | por rodada | CPU estimada no edge |
|---|---|---|
| classificar stories novos (medido: 5–10/dia → ≤ 3 por hora) | 3 imagens | 0,4–0,6 s — **cabe folgado** |
| assinar o corpus inteiro de uma vez | 63 imagens | **4 a 12 s — NÃO cabe** (teto 2 s) |
| assinar 8 por rodada | 8 imagens | 1,1–1,6 s — cabe, com o resto da coleta junto |

**Então não cabe, e a saída é orçamento em vez de lote.** Com `limite = 8` e o coletor rodando de
hora em hora, as 63 capas ficam assinadas em **8 rodadas ≈ 8 horas**, uma vez só na vida; depois
disso entra 1 a 3 capas novas por dia. Se preferir tudo pronto hoje, chame o endpoint do coletor
à mão 8 vezes seguidas — é a mesma coisa, sem esperar o relógio.

Banda: as capas são ~40–300 KB (as miniaturas dos stories, medidas no bucket, deram 42–814 KB,
média 311 KB). 63 capas ≈ 7 MB, uma vez. Download não conta no teto de CPU, e 8 downloads
sequenciais levam 1–3 s de wall clock dos 150 disponíveis.

Memória: um decode de 1080×1920 são ~8 MB de RGBA, e o `jpeg-js` mantém buffers intermediários.
**Sequencial, nunca `Promise.all`** — 8 decodes em paralelo passam de 100 MB sem precisar.

Se um dia não couber (corpus de centenas, ou o coletor engordar): tire a assinatura do coletor
para uma função própria chamada pelo mesmo `pg_cron`, com `limite` maior. O classificador de
story continua no coletor, porque ele **tem que** rodar de hora em hora — story vive 24 h.

---

## 5. A taxa de erro, e para que lado ela erra

Sem stories reais rotulados, taxa exata é chute. O que dá para afirmar é **a direção do erro**,
e ela é assimétrica de propósito.

### Classe (a) próprio — erro raro, e para o lado seguro

Decidida por área ≥ 60%. Erra quando o story de câmera tem bordas lisas grandes: céu, parede
branca, letterbox de vídeo vertical, capa preta no primeiro frame. No ensaio, um quadro cheio de
foto de produto sobre fundo claro ainda deu 78,4% — sobra. Quando erra, cai em `indeterminado` ou
`nao_proprio`: vai para a fila do operador, **não** para a meta errada.

O caso inverso — card grande demais sendo lido como quadro cheio — precisaria de um card acima de
60% da área, ou seja ~78% da largura em formato 1:1. Existe (o Instagram desenha cards nessa
faixa), e é o único erro *silencioso* do desenho. Se aparecer, o conserto é baixar `AREA_CHEIA`
para 0,52 e **medir de novo**, não chutar.

### Classe (b) republicação nossa — quando afirma, acerta; quase nunca afirma demais

Limiar 0,93 de NCC mais 8 bits de dHash, contra um corpus **completo** (as 63 mídias da conta).
No ensaio, o pior acerto limpo deu 0,961 e o melhor falso 0,341; o pior falso *concebível* — outra
pose do mesmo produto, mesmo enquadramento — deu 0,617. Falso positivo aqui exige duas imagens
praticamente idênticas.

Existe um falso positivo que **nenhum método de imagem resolve**: se outro perfil republicou uma
peça NOSSA e nós recompartilhamos o post DELE, o card é a nossa imagem e o classificador vai
dizer `republicacao_nossa`, quando pela definição do dono é `repost de outro perfil`. Para loja de
peças, com marca e revenda republicando, isso acontece. É por isso que o `auto_match` fica
gravado: o operador vê qual post casou e corrige em um toque.

O erro por omissão é o comum, e é o desejado: reshare com zoom, frame do meio de um reel, capa
recortada para 4:5 — tudo isso cai abaixo de 0,93 e vira fila, não classificação errada.

### Classe (c) repost de outro perfil — **não é confiável, e por isso não existe automática**

Esta é a resposta direta ao item 5 do enunciado: **a separação (b) × (c) não se sustenta como
decisão automática.** A prova está na tabela de §2: um acerto deformado vale 0,49–0,83 e um erro
plausível vale 0,62. Não há corte entre eles. Some a isso o que mais empurra (b) para baixo do
limiar sem ter nada a ver com terceiros:

- **story de reel nosso mostra um frame qualquer**, não a capa — e o corpus só tem a capa. Medido:
  zoom de 10% já derruba para 0,825; 25% para 0,491. Os stories recentes da conta são todos
  `media_type = VIDEO`, então este não é um caso de canto, é o caso comum;
- capa ainda não assinada (post de minutos atrás);
- `media_url` omitido pela Meta por direito autoral — a doc diz que o campo some nesse caso
  ([IG Media](https://developers.facebook.com/docs/instagram-platform/reference/instagram-media));
- reshare de **story**, que a API nem devolve
  ([Stories edge](https://developers.facebook.com/docs/instagram-api/reference/user/stories)).

**Proposta, que é o que recomendo aprovar:** juntar (b)-não-confirmado e (c) numa classe única
`nao_proprio` e mandar só ela para o operador, **ordenada pela chance de ser de terceiro**
(`1 − melhor NCC`, que já vai em `auto_conf`). Ele vê a miniatura e, ao lado, o post nosso que
mais se pareceu, com a nota. Dois botões: "é nosso" / "é de outro perfil".

Com os volumes medidos (5–10 stories/dia), o dashboard sai automático para a maior parte, e
sobra uma fila de poucos itens por dia — em vez de classificar tudo à mão, que é hoje.

### Uma quarta classe que o enunciado não previu, e que precisa de decisão sua

**Arte promocional própria** — o card feito no Canva, produto em fundo liso, postado só no story.
Não é foto de câmera, não é republicação, não é repost. Se ela preencher o quadro, sai `proprio`;
se for um card centrado, sai `nao_proprio` e some na fila. **Não vou adivinhar em que meta isso
entra.** Diga qual é a regra e eu implemento — hoje ela existe e está sem lugar.

---

## 6. Como provar antes de ligar

Nada disso foi medido contra story real da conta: as miniaturas estão em bucket privado e eu não
uso token para ler imagem. O que rodou aqui foi um ensaio sintético (card montado sobre fundo
liso, recompactado em JPEG q72) mais as fotos de produto do repositório. **Isso valida o mecanismo,
não a taxa.** Antes de deixar o classificador alimentar meta, faça esta passagem — dá uma tarde:

1. Aplique a migração (§3.1) e cole o bloco (§3.2). Chame o coletor com `?autoteste=1`.
   Qualquer linha de volta = pare.
2. Rode o coletor 8 vezes seguidas para assinar as 63 capas. Confira:
   `select count(*) filter (where p32 is not null), count(*) filter (where erro is not null) from mc_midia_assinatura;`
   Se muitas linhas tiverem erro "capa não é JPEG", o corpus não serve e a conversa muda.
3. Deixe rodar **uma semana** sem ligar nada no dashboard. `auto_classe` grava, ninguém consome.
4. No fim, abra a lista com miniatura, `auto_classe`, `auto_conf`, `auto_match` e `auto_medidas`,
   e classifique à mão os ~50 stories da semana. Aí sim existe taxa de erro, por classe.
5. Só então mexa em `AREA_CHEIA` e `NCC_CONFIRMA` — com os números na frente. Um limiar de
   classificador ajustado no olho é pior que classificador nenhum, porque parece confiável.

Um jeito barato de fechar o ponto cego do frame de reel, se a taxa vier ruim: assinar **três**
frames por reel em vez da capa. A Graph API não entrega frames intermediários, então isso significa
baixar o `.mp4` e decodificar — o que **não cabe** no edge. Ficaria como job separado, fora da
função. Não recomendo antes de a medição do passo 4 dizer que vale.

---

## 7. Resumo das afirmações de contrato de API usadas aqui

| afirmação | fonte |
|---|---|
| IG Media não tem campo de reshare; `thumbnail_url` "Only available on `VIDEO` media"; `media_url` é omitido em caso de direito autoral | https://developers.facebook.com/docs/instagram-platform/reference/instagram-media |
| "New stories created when a user reshares a story will not be returned" | https://developers.facebook.com/docs/instagram-api/reference/user/stories |
| Batch de até 50 requisições por chamada (alternativa, se um dia assinar em lote maior) | https://developers.facebook.com/docs/graph-api/batch-requests |
| Edge Function: CPU 2 s por requisição, memória 256 MB, wall clock 150 s (free) / 400 s (pago) | https://supabase.com/docs/guides/functions/limits |

Arquivos citados, todos absolutos:
`/Users/harry/Documents/fullpro-mediaclub/supabase/coletor-pecas.ts` (não editado),
`/Users/harry/Documents/fullpro-mediaclub/supabase/classificador-story.md` (este),
`/Users/harry/Documents/fullpro-mediaclub/admin.html` (não editado — o mapa de compatibilidade em
§3.3 existe para não precisar tocar nele agora).
