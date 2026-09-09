"""Public, append-only observed result history (not reconstructed game-day history)."""
import hashlib
import json
import os
from pathlib import Path
import tempfile
from datetime import datetime, timezone
from fractions import Fraction

SEASON = 'fall-2026'
METHOD = {'id': 'win-rate-capped-margin-v1', 'caps': {'flag': 21, '8u': 3, '6u': 3},
          'order': ['(w + t/2) / gp descending', 'capped_margin_sum / gp descending'],
          'ties': 'competition', 'unplayed': 'unrated', 'scope': 'sport/age across divisions'}
TEAM_FIELDS = ('team', 'w', 'l', 't', 'gp', 'pf', 'pa', 'margin_sum', 'capped_margin_sum')
GAME_FIELDS = ('home', 'away', 'home_score', 'away_score', 'date', 'time', 'date_iso', 'start_iso')


def encoded(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False) + '\n').encode()


def result_data(divisions):
    """Explicit allowlist: no private feeds, check metadata or unplayed fixtures."""
    return [{'sport': d['sport'], 'division': d['division'], 'source_url': d['url'],
             'teams': sorted(({k: t[k] for k in TEAM_FIELDS} for t in d['teams']), key=lambda t: t['team']),
             'games': sorted(({k: g.get(k) for k in GAME_FIELDS} for g in d['schedule']
                              if g['home_score'] is not None and g['away_score'] is not None), key=lambda g: (g['date_iso'] or '', g['start_iso'] or '', encoded(g)))}
            for d in sorted(divisions, key=lambda d: (d['sport'], d['division']))]


def rank_points(divisions):
    points = []
    for sport in METHOD['caps']:
        group = [dict(t, sport=sport, division=d['division'], team_id=[SEASON, sport, d['division'], t['team']])
                 for d in divisions if d['sport'] == sport for t in d['teams']]
        def score(t):
            return (Fraction(2*t['w'] + t['t'], 2*t['gp']), Fraction(t['capped_margin_sum'], t['gp']))
        rated = sorted((t for t in group if t['gp']), key=score, reverse=True)
        anchor, rank = None, None
        for i, t in enumerate(rated):
            if score(t) != anchor:
                anchor, rank = score(t), i + 1
            t['rank'] = rank
        counts = {}
        for t in rated:
            counts[t['rank']] = counts.get(t['rank'], 0) + 1
        for t in group:
            t.setdefault('rank', None)
            t['tied'] = counts.get(t['rank'], 0) > 1
            t['win_rate'] = float(score(t)[0]) if t['gp'] else None
            t['capped_margin_per_game'] = float(score(t)[1]) if t['gp'] else None
        points.extend(group)
    return points


def atomic_write(path, content, *, immutable=False):
    """Flush a complete file before exposing it; hard-link never overwrites captures."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix='.history-', suffix='.tmp', delete=False) as handle:
            temporary = handle.name
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        if immutable:
            os.link(temporary, path)
        else:
            os.replace(temporary, path)
    finally:
        if temporary and os.path.exists(temporary):
            os.unlink(temporary)


def snapshot_entry(snapshot, path):
    return {'captured_at': snapshot['captured_at'], 'path': path,
            'result_sha256': snapshot['result_sha256'], 'teams': rank_points(snapshot['divisions']),
            'completed_games': sum(len(d['games']) for d in snapshot['divisions'])}


def load_index(directory):
    """Fail closed on damage; never reset an unreadable previous good archive."""
    directory = Path(directory)
    index_path = directory / 'index.json'
    index = json.loads(index_path.read_text()) if index_path.exists() else {'schema_version': 1, 'season': SEASON, 'ranking_method': METHOD, 'captures': []}
    try:
        if (index['schema_version'], index['season'], index['ranking_method']) != (1, SEASON, METHOD):
            raise ValueError('History schema/season/method mismatch; review before rollover')
        seen = set()
        for entry in index['captures']:
            path = Path(entry['path'])
            if path.is_absolute() or len(path.parts) != 2 or path.parts[0] != SEASON or path.suffix != '.json' or str(path) in seen:
                raise ValueError('Invalid or duplicate history path')
            seen.add(str(path))
            snapshot = json.loads((directory / path).read_text())
            digest = hashlib.sha256(encoded({'season': SEASON, 'divisions': snapshot['divisions']})).hexdigest()
            if snapshot['result_sha256'] != digest or snapshot['season'] != SEASON or snapshot['ranking_method'] != METHOD or snapshot['schema_version'] != 1:
                raise ValueError('History snapshot integrity failure')
            if snapshot_entry(snapshot, str(path)) != entry:
                raise ValueError('History index does not match immutable snapshot')
        stored = {str(p.relative_to(directory)) for p in directory.glob(f'{SEASON}/*.json')}
        if stored != seen:
            raise ValueError('Unindexed history capture; preserve files and repair index before continuing')
        return index
    except (KeyError, TypeError, OSError) as exc:
        raise ValueError('History archive incomplete or invalid; retain and investigate') from exc


def record_history(directory, payload):
    if payload.get('status') != 'ok' or payload.get('errors') or not payload.get('divisions') or payload.get('last_successful_check') != payload.get('last_checked'):
        raise ValueError('Only a complete accepted collection may enter history')
    directory = Path(directory)
    data = result_data(payload['divisions'])
    digest = hashlib.sha256(encoded({'season': SEASON, 'divisions': data})).hexdigest()
    index = load_index(directory)
    captures = index['captures']
    captured_at = payload['last_successful_check']
    observed = datetime.fromisoformat(captured_at.replace('Z', '+00:00'))
    if observed.tzinfo is None:
        raise ValueError('Capture time must include timezone')
    if captures and observed < datetime.fromisoformat(captures[-1]['captured_at'].replace('Z', '+00:00')):
        raise ValueError('Capture time predates the latest observation')
    if captures and captures[-1]['result_sha256'] == digest:
        return captures[-1]
    stamp = datetime.fromisoformat(captured_at.replace('Z', '+00:00')).astimezone(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    path = f'{SEASON}/{stamp}-{digest[:16]}.json'
    snapshot = {'schema_version': 1, 'season': SEASON, 'captured_at': captured_at,
                'capture_semantics': 'observed verified results; not game-day or source-posted time',
                'result_sha256': digest, 'ranking_method': METHOD, 'divisions': data}
    entry = snapshot_entry(snapshot, path)
    created = False
    try:
        atomic_write(directory / path, encoded(snapshot), immutable=True)
        created = True
        atomic_write(directory / 'index.json', encoded(dict(index, captures=captures + [entry])))
    except Exception:
        if created:
            (directory / path).unlink()
        raise
    return entry
