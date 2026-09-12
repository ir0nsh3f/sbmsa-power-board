"""History tests use synthetic official-style pages, never published fixtures."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from test_results import results, synthetic_page


class HistoryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.output = Path(self.tmp.name) / 'data.json'
        self.history = self.output.parent / 'history'
        counts = patch.object(results, 'EXPECTED_TEAM_COUNTS', {i: 2 for _, _, i in results.SOURCES})
        counts.start()
        self.addCleanup(counts.stop)

    def collect(self, now='2026-09-08T12:00:00Z', html=None):
        return results.update_results(self.output, fetch=lambda u: html or synthetic_page(), now=now)

    def index(self):
        return json.loads((self.history / 'index.json').read_text())

    def test_method_transition_appends_without_rewriting_old_capture(self):
        from scripts import history
        with patch.object(history, 'METHOD', history.LEGACY_METHOD):
            self.collect()
        old = self.index()['captures'][0]
        immutable = (self.history / old['path']).read_bytes()
        self.collect('2026-09-08T13:00:00Z')
        index = history.load_index(self.history)
        self.assertEqual(index['schema_version'], 2)
        self.assertEqual(len(index['captures']), 2)
        self.assertEqual((self.history / old['path']).read_bytes(), immutable)
        self.assertEqual(index['captures'][0]['ranking_method_id'], history.LEGACY_METHOD['id'])
        self.assertEqual(index['captures'][1]['ranking_method_id'], history.METHOD['id'])
        self.assertEqual(index['captures'][0]['result_sha256'], index['captures'][1]['result_sha256'])
        self.assertEqual(index['captures'][1]['change_reason'], 'ranking-method-change')
        self.collect('2026-09-08T14:00:00Z')
        self.assertEqual(len(self.index()['captures']), 2)

    def test_verified_baseline_has_full_results_and_compact_rank_points(self):
        payload = self.collect()
        self.assertTrue((self.history / 'index.json').exists(), 'accepted collection must create history')
        index = self.index()
        self.assertEqual(len(index['captures']), 1)
        point = index['captures'][0]
        self.assertEqual(point['captured_at'], payload['last_successful_check'])
        snapshot = json.loads((self.history / point['path']).read_text())
        self.assertEqual(snapshot['captured_at'], '2026-09-08T12:00:00Z')
        self.assertEqual(len(snapshot['divisions']), 8)
        self.assertEqual(snapshot['divisions'][0]['teams'][0]['pf'], 30)
        self.assertEqual(snapshot['divisions'][0]['games'][0]['date_iso'], '2026-09-05')
        leaders = [t for t in point['teams'] if t['sport'] == 'flag' and t['team'] == 'A']
        self.assertEqual([t['rank'] for t in leaders], [1, 1, 1])
        self.assertTrue(all(t['tied'] for t in leaders))
        self.assertEqual(leaders[0]['capped_margin_per_game'], 10.5)
        self.assertEqual(snapshot['ranking_method']['caps'], {'flag': 21, '8u': 3, '6u': 3})

    def test_unchanged_checks_are_byte_identical_and_corrections_append(self):
        self.collect()
        initial = {p.relative_to(self.history): p.read_bytes() for p in self.history.rglob('*.json')}
        self.collect('2026-09-08T13:00:00Z')
        self.assertEqual({p.relative_to(self.history): p.read_bytes() for p in self.history.rglob('*.json')}, initial)
        self.collect('2026-09-08T14:00:00Z', synthetic_page(games=((0, 0), (31, 0))))
        self.collect('2026-09-08T15:00:00Z')  # Correction/reversion is a new observation.
        captures = self.index()['captures']
        self.assertEqual(len(captures), 3)
        self.assertEqual(captures[0]['result_sha256'], captures[2]['result_sha256'])
        self.assertNotEqual(captures[0]['path'], captures[2]['path'])
        for path, content in initial.items():
            if path.name != 'index.json':
                self.assertEqual((self.history / path).read_bytes(), content)
        self.collect('2026-09-08T15:00:00Z')  # Exact rerun is idempotent.
        self.assertEqual(len(self.index()['captures']), 3)

    def test_partial_failed_collection_does_not_append(self):
        self.collect()
        before = (self.history / 'index.json').read_bytes()
        def fetch(url):
            if '/707766/' in url:
                raise OSError('offline')
            return synthetic_page(games=((0, 0), (31, 0)))
        failed = results.update_results(self.output, fetch=fetch, now='2026-09-08T16:00:00Z')
        self.assertEqual(failed['status'], 'error')
        self.assertEqual((self.history / 'index.json').read_bytes(), before)
        self.assertEqual(len(list(self.history.glob('fall-2026/*.json'))), 1)

    def test_index_write_failure_keeps_previous_archive_and_current_payload(self):
        from scripts import history
        self.collect()
        before = {p: p.read_bytes() for p in self.output.parent.rglob('*.json')}
        real_replace = history.os.replace
        def fail_index(source, destination):
            if Path(destination).name == 'index.json':
                raise OSError('simulated disk failure')
            return real_replace(source, destination)
        with patch.object(history.os, 'replace', side_effect=fail_index):
            with self.assertRaises(OSError):
                self.collect('2026-09-08T14:00:00Z', synthetic_page(games=((0, 0), (31, 0))))
        self.assertEqual({p: p.read_bytes() for p in self.output.parent.rglob('*.json')}, before)
        self.assertEqual(list(self.history.rglob('*.tmp')), [])
        self.collect('2026-09-08T14:00:00Z', synthetic_page(games=((0, 0), (31, 0))))
        self.assertEqual(len(self.index()['captures']), 2)

    def test_corrupt_or_missing_archive_is_not_silently_replaced(self):
        self.collect()
        capture = self.history / self.index()['captures'][0]['path']
        capture.write_text('{}')
        before = (self.history / 'index.json').read_bytes()
        with self.assertRaises(ValueError):
            self.collect('2026-09-08T14:00:00Z')
        self.assertEqual(capture.read_text(), '{}')
        self.assertEqual((self.history / 'index.json').read_bytes(), before)

    def test_no_new_capture_for_order_schedule_or_metadata_changes(self):
        from scripts.history import record_history
        payload = self.collect()
        before = (self.history / 'index.json').read_bytes()
        payload['last_successful_check'] = payload['last_checked'] = '2026-09-08T16:00:00Z'
        payload['private_url'] = 'not-public'
        payload['divisions'].reverse()
        for d in payload['divisions']:
            d['teams'].reverse()
            d['schedule'].reverse()
            for g in d['schedule']:
                g['location_url'] = 'https://www.google.com/maps?q=updated'
                g['location'] = 'Updated official field'
            d['schedule'].append(dict(d['schedule'][0], home_score=None, away_score=None))
            for t in d['teams']:
                t['coach'] = 'updated official coach'
        record_history(self.history, payload)
        self.assertEqual((self.history / 'index.json').read_bytes(), before)
        self.assertNotIn('private_url', ''.join(p.read_text() for p in self.history.rglob('*.json')))

    def test_history_api_rejects_error_payload(self):
        from scripts.history import record_history
        payload = self.collect()
        payload['status'] = 'error'
        with self.assertRaises(ValueError):
            record_history(self.history, payload)

    def test_unplayed_teams_remain_unrated(self):
        self.collect(html=synthetic_page(games=(('', ''),), records=[(0, 0, 0, 0)]*2))
        self.assertTrue(all(t['rank'] is None and not t['tied'] and t['win_rate'] is None for t in self.index()['captures'][0]['teams']))

    def test_missing_index_refuses_to_reset_existing_archive(self):
        self.collect()
        (self.history / 'index.json').unlink()
        with self.assertRaises(ValueError):
            self.collect('2026-09-08T14:00:00Z')
        self.assertEqual(len(list(self.history.glob('fall-2026/*.json'))), 1)

    def test_snapshot_write_failure_is_atomic(self):
        from scripts import history
        self.collect()
        before = {p: p.read_bytes() for p in self.output.parent.rglob('*.json')}
        with patch.object(history.os, 'link', side_effect=OSError('disk full')):
            with self.assertRaises(OSError):
                self.collect('2026-09-08T14:00:00Z', synthetic_page(games=((0, 0), (31, 0))))
        self.assertEqual({p: p.read_bytes() for p in self.output.parent.rglob('*.json')}, before)
        self.assertEqual(list(self.history.rglob('*.tmp')), [])

    def test_new_game_changes_history_and_stale_capture_is_rejected(self):
        self.collect()
        changed = synthetic_page(games=((0, 0), (30, 0), (1, 0)), records=[(2, 0, 1, 3), (0, 2, 1, 3)])
        self.collect('2026-09-08T14:00:00Z', changed)
        self.assertEqual(self.index()['captures'][-1]['completed_games'], 24)
        with self.assertRaises(ValueError):
            self.collect('2026-09-08T13:00:00Z')
        self.assertEqual(len(self.index()['captures']), 2)

    def test_dashboard_write_failure_retries_without_duplicate_accepted_capture(self):
        self.collect()
        before = self.output.read_bytes()
        real_replace = results.os.replace
        def fail_output(source, destination):
            if Path(destination) == self.output:
                raise OSError('dashboard publication interrupted')
            return real_replace(source, destination)
        changed = synthetic_page(games=((0, 0), (31, 0)))
        with patch.object(results.os, 'replace', side_effect=fail_output):
            with self.assertRaises(OSError):
                self.collect('2026-09-08T14:00:00Z', changed)
        self.assertEqual(self.output.read_bytes(), before)
        self.assertEqual(len(self.index()['captures']), 2)
        self.collect('2026-09-08T15:00:00Z', changed)
        self.assertEqual(len(self.index()['captures']), 2)
        self.assertEqual(json.loads(self.output.read_text())['status'], 'ok')

    def test_immutable_creation_refuses_existing_target(self):
        from scripts.history import atomic_write
        target = self.output.parent / 'capture.json'
        atomic_write(target, b'original', immutable=True)
        with self.assertRaises(FileExistsError):
            atomic_write(target, b'changed', immutable=True)
        self.assertEqual(target.read_bytes(), b'original')

    def test_failed_initial_collection_has_no_history(self):
        self.collect(html='<html>blocked</html>')
        self.assertFalse(self.history.exists())


if __name__ == '__main__':
    unittest.main()
