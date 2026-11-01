"""Pure full-season power input builder; never changes official records or model inputs."""

def full_season(data, postseason):
    divisions = [dict(d, power_games=list(d.get('games', []))) for d in data['divisions']]
    coverage = dict(scope='regular-plus-verified-playoffs-v1', included=0, excluded=[], sources=[], missing=postseason is None, crossDivision=[])
    roster = [dict(t, sport=d['sport'], division=d['division']) for d in divisions for t in d['teams']]
    candidates = []
    for s in (postseason or {}).get('sources', []):
        if not any(d['sport'] == s['sport'] for d in divisions):
            continue
        coverage['sources'].append({k: s.get(k) for k in ('id', 'sport', 'status', 'last_successful_check', 'error')})
        def match(p):
            if not p or p.get('kind') != 'team':
                return None
            found = [t for t in roster if t['sport'] == s['sport'] and t['team'] == p.get('name') and (not p.get('coach') or p['coach'] == t.get('coach'))]
            t = found[0] if len(found) == 1 else None
            return t if t and p.get('identity') == {k:t[k] for k in ('sport','division','team')} else None
        for g in s.get('games', []):
            h,a = match(g.get('home')),match(g.get('away'))
            reason = None
            if g.get('bye'): reason = 'bye'
            elif not all(type(g.get(k)) is int and g[k] >= 0 for k in ('home_score','away_score')): reason = 'no numeric final'
            elif not h or not a or (h['division'],h['team']) == (a['division'],a['team']): reason = 'unverified identity'
            elif not g.get('id'): reason = 'missing match ID'
            if reason:
                coverage['excluded'].append(dict(source=s['id'],id=g.get('id'),sport=s['sport'],reason=reason));continue
            identity = (s['id'],g['id'])
            sides = sorted([(h['division'],h['team'],g['home_score']),(a['division'],a['team'],g['away_score'])])
            stamp = g.get('start_iso') or (g['date_iso']+' '+g.get('time','') if g.get('date_iso') else None)
            fixture = (s['sport'],stamp,tuple(x[:2] for x in sides)) if stamp else identity
            candidates.append((s,g,h,a,identity,fixture,tuple(sides)))
    ids,fixtures = {},{}
    for s,g,h,a,identity,fixture,signature in candidates:
        ids.setdefault(identity,set()).add(signature);fixtures.setdefault(fixture,set()).add(signature)
    seen_ids,seen_fixtures = set(),set()
    for s,g,h,a,identity,fixture,signature in candidates:
        reason = 'conflicting duplicate' if len(ids[identity]) > 1 or len(fixtures[fixture]) > 1 else 'duplicate' if identity in seen_ids or fixture in seen_fixtures else None
        if reason:
            coverage['excluded'].append(dict(source=s['id'],id=g['id'],sport=s['sport'],reason=reason));continue
        seen_ids.add(identity);seen_fixtures.add(fixture)
        game = dict(id=g['id'],source=s['id'],scope='playoffs',home=h['team'],away=a['team'],home_division=h['division'],away_division=a['division'],home_score=g['home_score'],away_score=g['away_score'])
        next(d for d in divisions if d['sport']==s['sport'] and d['division']==h['division'])['power_games'].append(game)
        coverage['included'] += 1
        if h['division'] != a['division']: coverage['crossDivision'].append(dict(game,sport=s['sport']))
    return dict(divisions=divisions,coverage=coverage)
