"""Pure full-season power input builder; never changes official records or model inputs."""

def full_season(data, postseason):
    divisions = [dict(d, regular_teams=d.get('regular_teams', d['teams']), teams=[dict(t, scored_gp=t.get('scored_gp', t['gp']), regular_record={k:t[k] for k in ('w','l','t','gp')}, playoff_record=dict(w=0,l=0,t=0,gp=0), record_scope='regular + verified playoffs' if postseason is not None else 'regular only (playoff feed unavailable)') for t in d.get('regular_teams', d['teams'])], power_games=list(d.get('games', [])), record_games=list(d.get('games', []))) for d in data['divisions']]
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
            elif not all(type(g.get(k)) is int and g[k] >= 0 for k in ('home_score','away_score')) and not (g.get('home_score') is None and g.get('away_score') is None and (g.get('home_outcome'),g.get('away_outcome')) in [('W','L'),('L','W')]): reason = 'no numeric final'
            elif not h or not a or (h['division'],h['team']) == (a['division'],a['team']): reason = 'unverified identity'
            elif not g.get('id'): reason = 'missing match ID'
            if reason:
                coverage['excluded'].append(dict(source=s['id'],id=g.get('id'),sport=s['sport'],reason=reason));continue
            identity = (s['id'],g['id'])
            sides = sorted([(h['division'],h['team'],g['home_score'] if g['home_score'] is not None else g['home_outcome']),(a['division'],a['team'],g['away_score'] if g['away_score'] is not None else g['away_outcome'])])
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
        owner = next(d for d in divisions if d['sport']==s['sport'] and d['division']==h['division'])
        numeric = type(g['home_score']) is int and type(g['away_score']) is int
        if numeric:
            owner['power_games'].append(game)
            coverage['included'] += 1
        else:
            game.update(home_outcome=g['home_outcome'], away_outcome=g['away_outcome'])
        owner['record_games'].append(game)
        for p,side,other in [(h,'home','away'),(a,'away','home')]:
            t = next(t for d in divisions if d['sport']==s['sport'] and d['division']==p['division'] for t in d['teams'] if t['team']==p['team'])
            score,allowed=g[side+'_score'],g[other+'_score']
            result=('w' if score>allowed else 'l' if score<allowed else 't') if numeric else g[side+'_outcome'].lower()
            t[result]+=1;t['gp']+=1;t['playoff_record'][result]+=1;t['playoff_record']['gp']+=1
            if not numeric:
                t['outcome_only_gp']=t.get('outcome_only_gp',0)+1
                continue
            t['scored_gp']+=1
            cap=21 if s['sport']=='flag' else 3
            for field,value in [('pf',score),('pa',allowed),('margin_sum',score-allowed),('capped_margin_sum',max(-cap,min(cap,score-allowed)))]:
                t[field]=t.get(field,0)+value
        if numeric and h['division'] != a['division']: coverage['crossDivision'].append(dict(game,sport=s['sport']))
    return dict(divisions=divisions,coverage=coverage)
