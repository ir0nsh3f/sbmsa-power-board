"""Source coverage separate from immutable division contents; legacy full checks supported."""
def source_time(data, sport):
    coverage = data.get('division_status')
    if coverage is None:
        return data.get('last_successful_check')
    group = [v for k,v in coverage.items() if k.split('|')[0] == sport]
    if not group or any(v['status'] != 'ok' for v in group):
        return None
    times = {v['last_successful_check'] for v in group}
    return times.pop() if len(times) == 1 else None


def withheld(data, sport):
    return dict(status='withheld', sport=sport, generated_at=None, forecasts=[],
                last_checked=data['last_checked'],
                reason='New forecasts withheld: age-group source coverage is incomplete or stale. No mixed-freshness refit.',
                source_coverage={k:v for k,v in data['division_status'].items() if k.split('|')[0] == sport})
