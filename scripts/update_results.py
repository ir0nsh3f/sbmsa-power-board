#!/usr/bin/env python3
"""Fetch official SBMSA standings and reconcile every recorded result."""
import json
import os
from pathlib import Path
from datetime import datetime, timezone
import tempfile
import time
from urllib.request import Request, urlopen


def fetch_html(url):
    """One retry with a pause; no browser/session credentials needed."""
    for attempt in range(2):
        try:
            request = Request(url, headers={'User-Agent':'SBMSA-Power-Board/1.0 (+public standings collector)'})
            with urlopen(request, timeout=30) as response:
                return response.read().decode('utf-8-sig')
        except (OSError, UnicodeError):
            if attempt:
                raise
            time.sleep(2)


def main():
    payload = update_results()
    print(json.dumps({'status':payload['status'],'errors':payload['errors']}))
    return 0 if payload['status'] == 'ok' else 1


from bs4 import BeautifulSoup

SOURCES = [
    ('flag','Mahomes',707765), ('flag','Burrow',707766), ('flag','Jackson',707767),
    ('8u','Pulisic',710191), ('8u','Messi',710190),
    ('6u','Messi',710199), ('6u','Haaland',710198), ('6u','Mbappe',742279),
]
# Fixed Fall 2026 division rosters; update deliberately after a source review.
EXPECTED_TEAM_COUNTS = {707765:9,707766:9,707767:10,710191:10,710190:9,710199:12,710198:12,742279:12}
DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / 'site/data.json'


def update_results(output=DEFAULT_OUTPUT, *, fetch=None, now=None):
    """All-or-nothing refresh; failures retain the last trustworthy divisions."""
    fetch = fetch or fetch_html
    now = now or datetime.now(timezone.utc).isoformat().replace('+00:00','Z')
    output = Path(output)
    previous = json.loads(output.read_text()) if output.exists() else {}
    divisions, errors = [], []
    for sport, division, identifier in SOURCES:
        url = f'https://sbmsa.net/sites/sbmsa/schedule/{identifier}/'
        try:
            parsed = parse_division(fetch(url), sport, division, url)
            if len(parsed['teams']) != EXPECTED_TEAM_COUNTS[identifier]:
                raise ValueError(f"Unexpected team count: expected {EXPECTED_TEAM_COUNTS[identifier]}, got {len(parsed['teams'])}")
            prior = next((d for d in previous.get('divisions',[]) if (d['sport'],d['division']) == (sport,division)),None)
            if prior and {t['team'] for t in parsed['teams']} != {t['team'] for t in prior['teams']}:
                raise ValueError('Team roster changed; verify official division before resetting baseline')
            divisions.append(parsed)
        except Exception as exc:
            errors.append(f'{sport} {division}: {type(exc).__name__}: {exc}')
    payload = dict(previous)
    payload.update(last_checked=now,status='error' if errors else 'ok',errors=errors)
    if errors:
        payload.setdefault('divisions',[])
        payload.setdefault('last_successful_check',None)
        payload.setdefault('data_updated',None)
    else:
        payload['divisions'] = divisions
        payload['last_successful_check'] = now
        payload['data_updated'] = previous.get('data_updated') if previous.get('divisions') == divisions else now
    output.parent.mkdir(parents=True,exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w',encoding='utf-8',dir=output.parent,prefix='.results-',suffix='.tmp',delete=False) as handle:
            temporary = handle.name
            json.dump(payload,handle,indent=2,ensure_ascii=False,allow_nan=False)
            handle.write('\n')
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary,output)
    finally:
        if temporary and os.path.exists(temporary):
            os.unlink(temporary)
    return payload


def text(node):
    return node.get_text(' ', strip=True) if node else ''


def parse_division(html, sport, division, url):
    soup = BeautifulSoup(html, 'html.parser')
    standings = soup.select_one('table[id*="standingsGrid"]')
    schedule = soup.select_one('table[id*="ScheduleGrid"]')
    if standings is None or schedule is None:
        raise ValueError('Missing standings or schedule table')
    headers = [text(h).lower() for h in standings.select('thead th')]
    if not set(('team','w','l','t')).issubset(headers):
        raise ValueError('Missing standings columns')
    teams = {}
    official_goals = {}
    for row in standings.select('tbody tr'):
        cells = row.find_all('td', recursive=False)
        if not cells:
            continue
        if len(cells) != len(headers):
            raise ValueError('Malformed standings row')
        values = dict(zip(headers, map(text, cells)))
        if 'gp' not in values:
            values['gp'] = str(sum(int(values[k]) for k in ('w','l','t')))
        name = values['team']
        if 'gf' in values and 'ga' in values:
            official_goals[name] = (int(values['gf']), int(values['ga']))
        if not name or name in teams:
            raise ValueError('Missing or duplicate team')
        if any(not values[k].isascii() or not values[k].isdigit() for k in ('w','l','t','gp')):
            raise ValueError('Invalid standings number')
        teams[name] = {'team': name, **{k: int(values[k]) for k in ('w','l','t','gp')},
                       'pf': 0, 'pa': 0, 'margin_sum': 0, 'capped_margin_sum': 0}
    if len(teams) < 2:
        raise ValueError('Suspicious empty or single-team division')
    if not schedule.select('[id$=HomeLabel]'):
        raise ValueError('Missing schedule rows')
    games = []
    seen = set()
    cap = 21 if sport == 'flag' else 3
    for row in schedule.select('tbody tr'):
        get = lambda suffix: text(row.select_one('[id$="' + suffix + '"]'))
        hs, aws = get('HomeScoreLabel'), get('AwayScoreLabel')
        if not hs and not aws:
            continue
        home, away = get('HomeLabel'), get('AwayLabel')
        if home not in teams or away not in teams or home == away:
            raise ValueError('Unknown or self-playing team')
        if any(not score.isascii() or not score.isdigit() for score in (hs,aws)):
            raise ValueError('Malformed or partial score')
        key = (get('DateLabel'),get('TimeLabel'),*sorted((home,away)))
        if key in seen:
            raise ValueError('Duplicate game')
        seen.add(key)
        hs, aws = int(hs), int(aws)
        games.append({'home':home,'away':away,'home_score':hs,'away_score':aws,'date':get('DateLabel')})
        for name, pf, pa in ((home,hs,aws),(away,aws,hs)):
            team = teams[name]
            team['pf'] += pf
            team['pa'] += pa
            team['margin_sum'] += pf-pa
            team['capped_margin_sum'] += max(-cap, min(cap,pf-pa))
    for name, team in teams.items():
        played = [(g['home_score'],g['away_score']) if g['home']==name else (g['away_score'],g['home_score']) for g in games if name in (g['home'],g['away'])]
        actual = (sum(a>b for a,b in played), sum(a<b for a,b in played), sum(a==b for a,b in played),len(played))
        if name in official_goals and official_goals[name] != (team['pf'],team['pa']):
            raise ValueError(f'Cannot reconcile goals for {name}')
        if actual != tuple(team[k] for k in ('w','l','t','gp')):
            raise ValueError(f'Cannot reconcile standings and games for {name}')
    return {'sport':sport,'division':division,'url':url,'teams':sorted(teams.values(),key=lambda t:t['team']), 'games':games}


if __name__ == '__main__':
    raise SystemExit(main())
