"""Exact standard-library counterpart of site/ratings.js; see power-method.html."""
import json
import math

V2 = {'id': 'opponent-ridge-margin-v2', 'caps': {'flag': 21, '8u': 3, '6u': 3},
          'ridge': 3, 'tolerance': 1e-12, 'maxIterations': 10000, 'tieDecimals': 8}


METHOD = dict(V2, id='opponent-ridge-margin-v3', default_mode='raw', modes=['raw', 'capped'])


def compute(divisions, sport, mode='raw'):
    if mode not in ('raw', 'capped'):
        raise ValueError('Unknown power-rating mode')
    cap = METHOD['caps'][sport] if mode == 'capped' else float('inf')
    all_ = sorted((dict(t, division=d['division'], rank=None, rankText='Unrated', power=None,
                        component=None, rate=(t['w'] + .5*t['t'])/t['gp'] if t['gp'] else None)
                   for d in divisions if d['sport'] == sport for t in d['teams']),
                  key=lambda t: (t['division'], t['team']))
    ids = {(t['division'], t['team']): i for i, t in enumerate(all_)}
    edges, rhs = [[] for _ in all_], [0 for _ in all_]
    games = []
    for d in divisions:
        if d['sport'] != sport:
            continue
        for g in d.get('games', []):
            if not all(isinstance(g.get(k), (int, float)) and math.isfinite(g[k]) for k in ('home_score', 'away_score')):
                continue
            h, a = ids[d['division'], g['home']], ids[d['division'], g['away']]
            if h == a:
                raise ValueError('Invalid power-rating game identity')
            games.append((h, a, max(-cap, min(cap, g['home_score']-g['away_score']))))
    for h, a, m in sorted(games):
        edges[h].append(a)
        edges[a].append(h)
        rhs[h] += m
        rhs[a] -= m
    r = [0.0 for _ in all_]
    for _ in range(METHOD['maxIterations']):
        nxt = [(rhs[i] + sum(r[j] for j in edges[i]))/(len(edges[i])+METHOD['ridge']) for i in range(len(r))]
        delta = max((abs(x-y) for x, y in zip(nxt, r)), default=0)
        r = nxt
        if delta <= METHOD['tolerance']:
            break
    else:
        raise ValueError('Power ratings failed to converge')
    component = 0
    for i, t in enumerate(all_):
        if not edges[i] or t['component'] is not None:
            continue
        component += 1
        stack = [i]
        t['component'] = component
        while stack:
            j = stack.pop()
            for k in edges[j]:
                if all_[k]['component'] is None:
                    all_[k]['component'] = component
                    stack.append(k)
    for i, t in enumerate(all_):
        if t['gp'] > 0 and edges[i]:
            t['power'] = r[i]
    rounded = lambda t: math.floor(t['power']*1e8 + .5)/1e8
    rated = sorted((t for t in all_ if t['power'] is not None), key=lambda t: (-rounded(t), t['team'], t['division']))
    anchor, counts = None, {}
    for i, t in enumerate(rated):
        if anchor is None or rounded(t) != rounded(anchor):
            t['rank'], anchor = i+1, t
        else:
            t['rank'] = anchor['rank']
        counts[t['rank']] = counts.get(t['rank'], 0)+1
    for t in all_:
        t['components'] = component
        t['tied'] = counts.get(t['rank'], 0) > 1
        if t['rank'] is not None:
            t['rankText'] = ('T' if t['tied'] else '') + str(t['rank'])
    return rated + sorted((t for t in all_ if t['power'] is None), key=lambda t: (t['team'], t['division']))


if __name__ == '__main__':
    import sys
    data = json.load(sys.stdin)
    json.dump({s: compute(data['divisions'], s, data.get('ratingMode', 'raw')) for s in METHOD['caps']}, sys.stdout)
