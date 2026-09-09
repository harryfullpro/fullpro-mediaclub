#!/usr/bin/env python3
"""
Indexa um patrocinado para a vitrine da landing /influencer.

Recebe o @ (e opcionalmente o link do post que deve aparecer) e devolve a
entrada pronta de PATROCINADOS, com número real, além de baixar a miniatura
para assets/patrocinados/.

    python3 ferramentas/indexar-patrocinado.py @pachecoalicee
    python3 ferramentas/indexar-patrocinado.py @pachecoalicee https://www.instagram.com/reel/DXMeutijVrr/
    python3 ferramentas/indexar-patrocinado.py @goga --nome "Goga" --top

Sem link, lista os posts recentes para você escolher.
Com --top, escolhe sozinho o de mais curtidas dos últimos 25.

COMO ELE LÊ OS NÚMEROS
`business_discovery` da Graph API, o mesmo caminho que o painel usa em
`fpIgDescoberta`. Ele só enxerga conta **pública** do tipo Empresa/Criador —
conta pessoal ou privada não resolve, e o script diz isso em vez de inventar.

O TOKEN sai do config.js (é o token de usuário do Harry, já público nesse
arquivo — ver a pendência de troca de credenciais). O script usa o token da
PÁGINA da FullPro, que é o que a Graph exige para business_discovery.

⚠️ views de Reels de terceiro NÃO vêm por aqui: a Graph só devolve
like_count e comments_count para conta que não é sua. Quando você souber as
views (o próprio criador manda, ou aparece no post), passe --views 58860 e o
cartão passa a liderar com elas, que é o número mais forte.
"""
import argparse
import json
import os
import re
import sys
import urllib.parse
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESTINO_FOTOS = os.path.join(RAIZ, 'assets', 'patrocinados')
API = 'https://graph.facebook.com/v21.0'


def graph(caminho, params, token):
    p = dict(params)
    p['access_token'] = token
    url = f'{API}/{caminho}?' + urllib.parse.urlencode(p)
    try:
        with urllib.request.urlopen(url, timeout=45) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read().decode())['error']['message']
        except Exception:
            msg = f'HTTP {e.code}'
        raise SystemExit(f'A Graph API recusou: {msg}')


def token_da_pagina():
    cfg = open(os.path.join(RAIZ, 'config.js'), encoding='utf-8').read()
    m = re.search(r"IG_ACCESS_TOKEN\s*:\s*'([^']+)'", cfg)
    if not m:
        raise SystemExit('IG_ACCESS_TOKEN não encontrado em config.js.')
    usuario = m.group(1)
    contas = graph('me/accounts',
                   {'fields': 'name,access_token,instagram_business_account{id,username}'},
                   usuario)
    for pag in contas.get('data', []):
        ig = pag.get('instagram_business_account') or {}
        if ig.get('username') == 'fullprobr':
            return pag['access_token'], ig['id']
    raise SystemExit('A página da FullPro não apareceu em me/accounts — o token pode ter sido rotacionado.')


def baixar(url, caminho):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=45) as r:
            dados = r.read()
        os.makedirs(os.path.dirname(caminho), exist_ok=True)
        with open(caminho, 'wb') as f:
            f.write(dados)
        return len(dados)
    except Exception as e:
        print(f'  (não deu para baixar a imagem: {str(e)[:80]})')
        return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('handle', help='@ do criador')
    ap.add_argument('link', nargs='?', help='permalink do post que deve aparecer')
    ap.add_argument('--nome', help='nome que aparece no cartão (padrão: o @)')
    ap.add_argument('--views', type=int, help='views do post, se você souber')
    ap.add_argument('--top', action='store_true', help='usa o post com mais curtidas')
    a = ap.parse_args()

    handle = a.handle.lstrip('@').strip()
    slug = re.sub(r'[^a-z0-9]+', '-', (a.nome or handle).lower()).strip('-')
    token, igid = token_da_pagina()

    inner = ('followers_count,media_count,profile_picture_url,'
             'media.limit(25){permalink,like_count,comments_count,media_type,timestamp,caption,thumbnail_url,media_url}')
    r = graph(igid, {'fields': f'business_discovery.username({handle}){{{inner}}}'}, token)
    bd = r.get('business_discovery')
    if not bd:
        raise SystemExit(f'@{handle} não resolveu. business_discovery só enxerga conta '
                         f'PÚBLICA do tipo Empresa ou Criador — confira o @ e o tipo da conta.')

    posts = (bd.get('media') or {}).get('data', [])
    print(f'@{handle}: {bd.get("followers_count"):,} seguidores, {bd.get("media_count")} posts'
          .replace(',', '.'))

    escolhido = None
    if a.link:
        alvo = a.link.split('?')[0].rstrip('/')
        escolhido = next((m for m in posts if (m.get('permalink') or '').rstrip('/') == alvo), None)
        if not escolhido:
            print(f'\n! O link não está nos 25 posts recentes. Uso os números que você passar,\n'
                  f'  e o cartão aponta para ele do mesmo jeito.')
            escolhido = {'permalink': a.link}
    elif a.top and posts:
        escolhido = max(posts, key=lambda m: (m.get('like_count') or 0))
    else:
        print('\nPosts recentes — escolha um e rode de novo com o link:\n')
        for m in posts[:12]:
            cap = (m.get('caption') or '').replace('\n', ' ')[:58]
            print(f'  {m.get("timestamp","")[:10]}  {m.get("like_count") or 0:>6} curtidas  '
                  f'{m.get("comments_count") or 0:>4} coment.  {cap}')
            print(f'      {m.get("permalink")}')
        return

    foto = bd.get('profile_picture_url')
    caminho_foto = os.path.join(DESTINO_FOTOS, f'{slug}.jpg')
    if foto:
        n = baixar(foto, caminho_foto)
        if n:
            print(f'  foto de perfil salva: assets/patrocinados/{slug}.jpg ({n // 1024} KB)')
    miniatura = escolhido.get('thumbnail_url') or escolhido.get('media_url')
    if miniatura:
        n = baixar(miniatura, os.path.join(DESTINO_FOTOS, f'{slug}-post.jpg'))
        if n:
            print(f'  miniatura do post salva: assets/patrocinados/{slug}-post.jpg ({n // 1024} KB)')

    entrada = {
        'nome': a.nome or f'@{handle}',
        'arroba': f'@{handle}',
        'link': escolhido.get('permalink'),
        'views': a.views,
        'curtidas': escolhido.get('like_count') or None,
        'comentarios': escolhido.get('comments_count') or None,
        'seguidores': bd.get('followers_count'),
        'foto': f'/assets/patrocinados/{slug}.jpg',
    }
    entrada = {k: v for k, v in entrada.items() if v is not None}

    print('\nCole isto em PATROCINADOS, dentro de influencer.html:\n')
    linhas = ',\n'.join(
        f"      {k}: " + (json.dumps(v, ensure_ascii=False) if isinstance(v, str) else str(v))
        for k, v in entrada.items())
    print('    {\n' + linhas + '\n    },')
    if not a.views:
        print('\n! Sem views: o cartão vai liderar com seguidores e o rótulo dirá\n'
              '  "seguidores no Instagram". Descobriu as views? rode de novo com --views N.')


if __name__ == '__main__':
    main()
