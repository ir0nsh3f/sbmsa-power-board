"""Schedule regression tests using clearly synthetic official-shaped markup."""
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('schedule_results', ROOT / 'scripts/update_results.py')
results = importlib.util.module_from_spec(spec)
spec.loader.exec_module(results)
GRID = 'ctl00_ContentPlaceHolder1_StandingsResultsControl_ScheduleGrid_ctl00'


def row(home='A', away='B', date='Sat 9/5', time='10:30 AM', hs='', aws='', location='MMS Aux East'):
    values = [('DateLabel', date), ('TimeLabel', time), ('HomeLabel', home),
              ('AwayLabel', away), ('HomeScoreLabel', hs), ('AwayScoreLabel', aws)]
    return '<tr>' + ''.join(f'<td><span id="r_{k}">{v}</span></td>' for k, v in values) + f'<td><a id="r_LocationLink" href="https://example.org/map"><span id="r_ScheduleLabel">{location}</span></a></td></tr>'


def page(rows, records=((0, 0, 0, 0), (0, 0, 0, 0))):
    standings = ''.join('<tr>' + ''.join(f'<td>{v}</td>' for v in (name, *record)) + '</tr>' for name, record in zip(('A', 'B'), records))
    return '<table id="standingsGrid"><thead><tr><th>Team</th><th>W</th><th>L</th><th>T</th><th>GP</th></tr></thead><tbody>' + standings + f'</tbody></table><table id="{GRID}"><tbody><tr><td>Week 1</td></tr>' + rows + '<tr></tr></tbody></table>'


def parse(html):
    return results.parse_division(html, 'flag', 'Test', 'https://example.org/public')


class ScheduleTests(unittest.TestCase):
    def test_schedule_failure_retains_entire_snapshot(self):
        import json
        import tempfile
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as tmp, patch.object(results, 'EXPECTED_TEAM_COUNTS', {i: 2 for _, _, i in results.SOURCES}):
            output = Path(tmp) / 'data.json'
            first = results.update_results(output, fetch=lambda _: page(row()), now='2026-09-08T12:00:00Z')
            self.assertEqual(first['status'], 'ok')
            self.assertTrue(all(len(d['schedule']) == 1 for d in first['divisions']))
            bad_url = f'https://sbmsa.net/sites/sbmsa/schedule/{results.SOURCES[0][2]}/'
            current = results.update_results(output, fetch=lambda url: page(row(away='Unknown' if url == bad_url else 'B')), now='2026-09-08T13:00:00Z')
            self.assertEqual(current['status'], 'error')
            self.assertEqual(len(current['errors']), 1)
            for key in ('divisions', 'data_updated', 'last_successful_check'):
                self.assertEqual(current[key], first[key])
            self.assertEqual(json.loads(output.read_text()), current)

    def test_field_label_fallback_and_numeric_team_name(self):
        html = page(row()).replace('r_ScheduleLabel', 'r_LocationLabel').replace('>A<', '>49ers<')
        game = parse(html)['schedule'][0]
        self.assertEqual(game['location'], 'MMS Aux East')
        self.assertEqual(game['home'], '49ers')
        self.assertIsNone(game['home_score'])

    def test_official_time_label_bye_with_empty_opponent(self):
        self.assertEqual(len(parse(page(row() + row(away='', date='', time='Bye')))['schedule']), 1)
        with self.assertRaises(ValueError):
            parse(page(row(away='', date='', time='TBD')))

    def test_byes_unknown_opponents_duplicates_and_mobile_table(self):
        mobile = f'<table id="{GRID.replace("_ScheduleGrid_", "_MobileScheduleGrid_")}"><tbody>' + row(home='Unknown') + '</tbody></table>'
        result = parse(mobile + page(row() + row(away='BYE', date='', time='')))
        self.assertEqual(len(result['schedule']), 1)
        for rows in [row(away='Unknown'), row(home='A', away='A'), row() + row(),
                     row() + row(home='B', away='A'), row(hs='0'), row(aws='-1')]:
            with self.subTest(rows=rows), self.assertRaises(ValueError):
                parse(page(rows))

    def test_pending_dates_times_and_fall_dst(self):
        for date, time, expected_day, expected_start in [
            ('Sat 10/31', '12:00 PM', '2026-10-31', '2026-10-31T12:00:00-05:00'),
            ('Sun 11/1', '12:00 PM', '2026-11-01', '2026-11-01T12:00:00-06:00'),
            ('11/7', '12:00 AM', '2026-11-07', '2026-11-07T00:00:00-06:00'),
            ('Sat 9/5', 'TBD', '2026-09-05', None),
            ('TBA', '10:30 AM', None, None), ('TBD', 'TBA', None, None),
            ('', '', None, None),
        ]:
            with self.subTest(date=date, time=time):
                game = parse(page(row(date=date, time=time)))['schedule'][0]
                self.assertEqual((game['date_iso'], game['start_iso']), (expected_day, expected_start))
                self.assertEqual((game['date'], game['time']), (date, time))
        for date, time in [('Sat 9/1', '10:00 AM'), ('Mon 2/30', '10:00 AM'),
                           ('not a date', 'TBD'), ('Sat 9/5', '25:00 PM'),
                           ('TBD', 'garbage'), ('Sat 9/5', '10:3 AM')]:
            with self.subTest(date=date, time=time), self.assertRaises(ValueError):
                parse(page(row(date=date, time=time)))

    def test_completed_zero_and_unplayed_with_field_text(self):
        result = parse(page(row(hs='0', aws='0') + row(date='Sat 9/12'), records=((0, 0, 1, 1),) * 2))
        self.assertIn('schedule', result)
        self.assertEqual(len(result['schedule']), 2)
        self.assertEqual(result['schedule'][0], dict(home='A', away='B', date='Sat 9/5', time='10:30 AM', location='MMS Aux East', location_url=None, date_iso='2026-09-05', start_iso='2026-09-05T10:30:00-05:00', home_score=0, away_score=0))
        self.assertIsNone(result['schedule'][1]['home_score'])
        self.assertIsNone(result['schedule'][1]['away_score'])
        self.assertEqual(result['games'], [dict(home='A', away='B', home_score=0, away_score=0, date='Sat 9/5')])


if __name__ == '__main__':
    unittest.main()
