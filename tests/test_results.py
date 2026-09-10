"""Offline parser/state regression tests. Synthetic fixtures are explicitly labeled."""
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('results', ROOT / 'scripts/update_results.py')
results = importlib.util.module_from_spec(spec)
if spec.loader and Path(spec.origin).exists():
    spec.loader.exec_module(results)


def synthetic_page(games=((0, 0), (30, 0)), extra='', records=None):
    """Synthetic fixture mimicking the official Telerik table structure."""
    records = records or [(1, 0, 1, 2), (0, 1, 1, 2)]
    standing = ''.join('<tr>'+''.join(f'<td>{v}</td>' for v in (name,*record))+'</tr>' for name,record in zip(('A','B'),records))
    rows = ''
    for i,(hs,aws) in enumerate(games):
        rows += '<tr>'+''.join(f'<td><span id="r{i}_{key}">{value}</span></td>' for key,value in [('HomeLabel','A'),('AwayLabel','B'),('HomeScoreLabel',hs),('AwayScoreLabel',aws),('DateLabel',f'Sat 9/{5 + i * 7}'),('TimeLabel','10:00 AM')])+'</tr>'
    return '<table id="standingsGrid"><thead><tr>'+''.join(f'<th>{h}</th>' for h in ('Team','W','L','T','GP'))+'</tr></thead><tbody>'+standing+'</tbody></table><table id="ScheduleGrid"><tbody>'+rows+extra+'</tbody></table>'


class ResultsTests(unittest.TestCase):
    def setUp(self):
        from unittest.mock import patch
        # State-machine tests use deliberately tiny synthetic divisions.
        self.count_patch = patch.object(results,'EXPECTED_TEAM_COUNTS',{i:2 for _,_,i in results.SOURCES},create=True)
        self.count_patch.start()
        self.addCleanup(self.count_patch.stop)

    def test_initial_collection_rejects_short_official_rosters(self):
        import tempfile
        self.count_patch.stop()
        with tempfile.TemporaryDirectory() as tmp:
            payload = results.update_results(Path(tmp)/'data.json',fetch=lambda u:synthetic_page())
            self.assertEqual(payload['status'],'error')
            self.assertEqual(len(payload['errors']),8)
            self.assertEqual(payload['divisions'],[])
            self.assertIsNone(payload['last_successful_check'])
            self.assertIsNone(payload['data_updated'])
            self.assertTrue(all('team count' in e for e in payload['errors']))

    def test_rejects_malformed_partial_or_duplicate_pages(self):
        from bs4 import BeautifulSoup
        valid = synthetic_page()
        cases = ['<html>blocked</html>', valid.replace('<td>A</td>','<td>B</td>'), valid.replace('>30</span>','>-1</span>'), valid.replace('>30</span>','></span>')]
        for selector in ('#standingsGrid tbody tr', '#ScheduleGrid tbody tr'):
            soup = BeautifulSoup(valid,'html.parser')
            for row in soup.select(selector):
                row.decompose()
            cases.append(str(soup))
        soup = BeautifulSoup(valid,'html.parser')
        import copy
        soup.select_one('#ScheduleGrid tbody').append(copy.copy(soup.select_one('#ScheduleGrid tbody tr')))
        cases.append(str(soup))
        for html in cases:
            with self.subTest(html=html[:60]), self.assertRaises(ValueError):
                results.parse_division(html,'flag','Test','url')

    def test_soccer_goals_columns_reconcile_and_derive_gp(self):
        html = synthetic_page().replace('<th>GP</th>','<th>GF</th><th>GA</th>').replace('<td>2</td>','<td>30</td><td>0</td>',1)
        html = html.replace('<td>2</td>','<td>0</td><td>30</td>',1)
        d = results.parse_division(html,'8u','Test','url')
        self.assertEqual(d['teams'][0]['gp'],2)
        self.assertEqual(d['teams'][0]['capped_margin_sum'],3)
        with self.assertRaisesRegex(ValueError,'goals'):
            results.parse_division(html.replace('<td>30</td>','<td>31</td>',1),'8u','Test','url')

    def test_zero_draws_caps_numeric_names_and_unplayed_byes(self):
        bye = '<tr><td><span id="bye_HomeLabel">49ers</span><span id="bye_AwayLabel">BYE</span><span id="bye_HomeScoreLabel"></span><span id="bye_AwayScoreLabel"></span></td></tr>'
        html = synthetic_page(extra=bye).replace('>A<','>49ers<')
        for sport,cap in [('flag',21),('8u',3),('6u',3)]:
            d = results.parse_division(html,sport,'Test','url')
            self.assertEqual(len(d['games']),2)
            self.assertEqual(d['games'][0]['home_score'],0)
            t = d['teams'][0]
            self.assertEqual((t['team'],t['w'],t['t'],t['gp'],t['pf'],t['capped_margin_sum']),('49ers',1,1,2,30,cap))

    def test_update_retains_payload_on_failure_and_tracks_timestamps(self):
        import tempfile, json
        self.assertTrue(hasattr(results,'update_results'),'updater not implemented')
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp)/'data.json'
            fetch = lambda url: synthetic_page()
            first = results.update_results(output,fetch=fetch,now='2026-09-08T12:00:00Z')
            self.assertEqual(first['status'],'ok')
            self.assertEqual(len(first['divisions']),8)
            second = results.update_results(output,fetch=fetch,now='2026-09-08T13:00:00Z')
            self.assertEqual(second['data_updated'],first['data_updated'])
            self.assertEqual(second['last_successful_check'],'2026-09-08T13:00:00Z')
            forecasts = {str(p):p.read_bytes() for p in (Path(tmp)/'projections').rglob('*.json')}
            def fail(url):
                raise OSError('offline')
            error = results.update_results(output,fetch=fail,now='2026-09-08T14:00:00Z')
            self.assertEqual(error['status'],'error')
            self.assertEqual(error['last_checked'],'2026-09-08T14:00:00Z')
            for key in ('divisions','data_updated','last_successful_check'):
                self.assertEqual(error[key],second[key])
            self.assertEqual(json.loads(output.read_text()),error)
            self.assertEqual({str(p):p.read_bytes() for p in (Path(tmp)/'projections').rglob('*.json')},forecasts)
            changed = results.update_results(output,fetch=lambda u: synthetic_page(games=((0,0),(31,0))),now='2026-09-08T15:00:00Z')
            self.assertEqual(changed['data_updated'],'2026-09-08T15:00:00Z')
            self.assertEqual(set(Path(tmp).iterdir()), {output, Path(tmp)/'history', Path(tmp)/'projections'})
            self.assertEqual(list(Path(tmp).rglob('*.tmp')), [])

    def test_network_retry_timeout_and_cli_exit_code(self):
        from unittest.mock import patch
        from io import BytesIO
        self.assertTrue(hasattr(results,'fetch_html'),'network fetch not implemented')
        with patch.object(results,'urlopen',side_effect=[OSError('temporary'),BytesIO(b'<html>ok</html>')]) as request, patch.object(results.time,'sleep') as sleep:
            self.assertEqual(results.fetch_html('https://example.org'),'<html>ok</html>')
            self.assertEqual(request.call_count,2)
            self.assertEqual(request.call_args.kwargs['timeout'],30)
            sleep.assert_called_once()
        with patch.object(results,'urlopen',side_effect=OSError('offline')) as request, patch.object(results.time,'sleep'):
            with self.assertRaises(OSError):
                results.fetch_html('https://example.org')
            self.assertEqual(request.call_count,2)
        with patch.object(results,'update_results',return_value={'status':'error','errors':['offline']}), patch('builtins.print'):
            self.assertEqual(results.main(),1)
        with patch.object(results,'update_results',return_value={'status':'ok','errors':[]}), patch('builtins.print'):
            self.assertEqual(results.main(),0)

    def test_rejects_empty_preseason_schedule_and_disappearing_teams(self):
        from bs4 import BeautifulSoup
        import tempfile
        html = synthetic_page(games=(('', ''),),records=[(0,0,0,0)]*2)
        soup = BeautifulSoup(html,'html.parser')
        soup.select_one('#ScheduleGrid tbody').clear()
        with self.assertRaisesRegex(ValueError,'schedule'):
            results.parse_division(str(soup),'6u','Test','url')
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp)/'data.json'
            previous = results.update_results(output,fetch=lambda u:html)
            # Synthetic prior payload includes an idle third team; disappearance is suspicious.
            import json
            for d in previous['divisions']:
                d['teams'].append(dict(d['teams'][0],team='C'))
            output.write_text(json.dumps(previous))
            current = results.update_results(output,fetch=lambda u:html)
            self.assertEqual(current['status'],'error')
            self.assertEqual(current['divisions'],previous['divisions'])

    def test_rejects_unreconciled_standings(self):
        with self.assertRaisesRegex(ValueError, 'reconcile'):
            results.parse_division(synthetic_page(records=[(2,0,0,2),(0,2,0,2)]), 'flag','Test','url')

    def test_preserves_coach_column_and_handles_unlisted_coaches(self):
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(synthetic_page(), 'html.parser')
        header = soup.new_tag('th')
        header.string = 'Coach'
        soup.select_one('#standingsGrid thead tr').append(header)
        for row, coach in zip(soup.select('#standingsGrid tbody tr'), ['Smith / Jones', '']):
            cell = soup.new_tag('td')
            cell.string = coach
            row.append(cell)
        parsed = results.parse_division(str(soup), 'flag', 'Test', 'url')
        self.assertEqual([t.get('coach') for t in parsed['teams']], ['Smith / Jones', ''])
        missing = results.parse_division(synthetic_page(), 'flag', 'Test', 'url')
        self.assertEqual([t.get('coach') for t in missing['teams']], ['', ''])

    def test_real_mahomes_standings_and_completed_games(self):
        self.assertTrue(hasattr(results, 'parse_division'), 'parser not implemented')
        division = results.parse_division((ROOT / 'tests/fixtures/mahomes.html').read_text(), 'flag', 'Mahomes', 'source')
        self.assertEqual(len(division['teams']), 9)
        self.assertEqual(len(division['games']), 4)
        jets = next(t for t in division['teams'] if t['team'] == 'Jets')
        self.assertEqual((jets['w'], jets['pf'], jets['pa'], jets['margin_sum'], jets['capped_margin_sum']), (1,21,7,14,14))


if __name__ == '__main__':
    unittest.main()
