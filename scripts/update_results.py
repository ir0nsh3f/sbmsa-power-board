#!/usr/bin/env python3
"""Fetch official SBMSA standings and reconcile every recorded result."""
import json
import os
from pathlib import Path
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import re
import tempfile
import time
from urllib.request import Request, urlopen

try:
    from scripts.history import record_history
    from scripts.projections import record as record_projections, load_archive, receipts
except ModuleNotFoundError:  # Direct CLI execution places scripts/ on sys.path.
    from history import record_history
    from projections import record as record_projections, load_archive, receipts


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
    # Timestamp is the end of actual source collection, not the beginning of fetches.
    supplied_now = now
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
    if supplied_now is None:
        now = datetime.now(timezone.utc).isoformat().replace('+00:00','Z')
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
        receipts(output.parent / 'projections', load_archive(output.parent / 'projections'))
        record_history(output.parent / 'history', payload)
        record_projections(output.parent / 'projections', divisions, now)
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


FALL_SEASON_YEAR = 2026
CENTRAL = ZoneInfo('America/Chicago')


def schedule_dates(date_label, time_label):
    """Normalize official labels without inventing dates for pending games."""
    pending = {'', 'TBA', 'TBD'}
    day = clock = None
    if date_label.upper() not in pending:
        match = re.fullmatch(r'(?:(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+)?([0-9]{1,2})/([0-9]{1,2})', date_label)
        if not match:
            raise ValueError(f'Malformed schedule date: {date_label!r}')
        weekday, month, date = match.groups()
        day = datetime(FALL_SEASON_YEAR, int(month), int(date))
        if weekday and weekday != ('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun')[day.weekday()]:
            raise ValueError(f'Schedule weekday disagrees with Fall {FALL_SEASON_YEAR}: {date_label!r}')
    if time_label.upper() not in pending:
        if not re.fullmatch(r'(?:0?[1-9]|1[0-2]):[0-5][0-9] [AP]M', time_label):
            raise ValueError(f'Malformed schedule time: {time_label!r}')
        clock = datetime.strptime(time_label, '%I:%M %p')
    start = day.replace(hour=clock.hour, minute=clock.minute, tzinfo=CENTRAL) if day and clock else None
    return day.date().isoformat() if day else None, start.isoformat() if start else None


def safe_location_url(value, source_url):
    """Retain source map destinations exactly; reject non-map or ambiguous URLs.

    Host/path allowlist mirrors schedules.js. Review on 2026-11-30 or source
    changes: current official links use Google US/Australia, including HTTP.
    """
    from urllib.parse import urljoin, urlsplit
    if not isinstance(value, str) or not value or re.search(r'[\x00-\x20\x7f\\\\]', value):
        return None
    try:
        resolved = urljoin(source_url, value)
        url = urlsplit(resolved)
        if (url.scheme not in ('http', 'https') or url.username or url.password
                or url.port not in (None, 80 if url.scheme == 'http' else 443)):
            return None
        if url.hostname not in ('google.com', 'www.google.com', 'maps.google.com',
                                'google.com.au', 'www.google.com.au', 'maps.google.com.au'):
            return None
        return resolved if url.path == '/maps' or url.path.startswith('/maps/') else None
    except ValueError:
        return None


def parse_schedule(table, teams, source_url=''):
    entries = []
    seen = set()
    for row in table.select('tbody > tr'):
        if not row.select('[id$=HomeLabel], [id$=AwayLabel]'):
            continue
        get = lambda suffix: text(row.select_one('[id$="' + suffix + '"]'))
        home, away = get('HomeLabel'), get('AwayLabel')
        # Official bye rows use TimeLabel='Bye' and an empty AwayLabel.
        if 'BYE' in (home.upper(), away.upper()) or get('TimeLabel').upper() == 'BYE':
            continue
        if home not in teams or away not in teams or home == away:
            raise ValueError('Unknown or self-playing team in schedule')
        date_label, time_label = get('DateLabel'), get('TimeLabel')
        date_iso, start_iso = schedule_dates(date_label, time_label)
        key = (date_iso or date_label, start_iso or time_label, *sorted((home, away)))
        if key in seen:
            raise ValueError('Duplicate game in schedule')
        seen.add(key)
        hs, aws = get('HomeScoreLabel'), get('AwayScoreLabel')
        if (hs or aws) and any(not s.isascii() or not s.isdigit() for s in (hs, aws)):
            raise ValueError('Malformed or partial score')
        link = row.select_one('a[id$=LocationLink]')
        entries.append({'home':get('HomeLabel'), 'away':get('AwayLabel'),
                        'date':date_label, 'time':time_label,
                        'location':get('ScheduleLabel') or get('LocationLabel') or get('LocationLink'),
                        'location_url':safe_location_url(link.get('href') if link else None, source_url),
                        'date_iso':date_iso, 'start_iso':start_iso,
                        'home_score':int(hs) if hs else None,
                        'away_score':int(aws) if aws else None})
    return entries


def parse_division(html, sport, division, url):
    soup = BeautifulSoup(html, 'html.parser')
    standings = soup.select_one('table[id*="standingsGrid"]')
    # Exact desktop ID; the short ID supports isolated synthetic parser fixtures.
    schedule = soup.select_one('table#ctl00_ContentPlaceHolder1_StandingsResultsControl_ScheduleGrid_ctl00, table#ScheduleGrid')
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
        teams[name] = {'team': name, 'coach': values.get('coach', ''), **{k: int(values[k]) for k in ('w','l','t','gp')},
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
    return {'sport':sport,'division':division,'url':url,'teams':sorted(teams.values(),key=lambda t:t['team']), 'games':games, 'schedule':parse_schedule(schedule, teams, url)}


if __name__ == '__main__':
    raise SystemExit(main())
