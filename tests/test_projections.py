import unittest
import json
import tempfile
from pathlib import Path
from unittest.mock import patch
from scripts import projections as P

NOW = '2026-09-10T02:45:00Z'
def game(start='2026-09-12T18:00:00-05:00', hs=None, aws=None):
    return dict(home='A', away='B', start_iso=start, date_iso=start[:10] if start else None, home_score=hs, away_score=aws)
def division(games=None):
    return dict(sport='flag', division='Burrow', teams=[{'team': n} for n in ['A','B','C']], schedule=games if games is not None else [game('2026-09-02T18:00:00-05:00',28,7),game()])
class ModelTests(unittest.TestCase):
    def test_real_scores_shrunk_and_symmetric(self):
        result=P.build([division()],NOW)
        self.assertEqual(len(result['forecasts']),1)
        f=result['forecasts'][0]
        self.assertGreater(f['margin_home'],0)
        self.assertLess(f['margin_home'],10)
        self.assertEqual(f['gp_home'],1)
        self.assertLess(f['margin_range'][0],0)
        self.assertGreater(f['margin_range'][1],21)
        self.assertEqual(result,P.build([division()],NOW))

    def test_temporal_leakage_unknown_and_no_division_data(self):
        past=game('2026-09-02T18:00:00-05:00',28,7)
        tests=[None,'2026-09-12T18:00:00','bad','2026-09-09T20:00:00-05:00',
               '2026-09-09T21:45:00-05:00','2026-09-09T22:15:00-05:00']
        for start in tests:
            self.assertEqual(P.build([division([past,game(start)])],NOW)['forecasts'],[],start)
        future_score=game('2026-09-12T18:00:00-05:00',100,0)
        unknown_score=game(None,100,0)
        self.assertEqual(P.build([division([future_score,unknown_score,game()])],NOW)['forecasts'],[])
        d=division();other=division([game()]);other['division']='Empty'
        soccer=division();soccer['sport']='8u'
        result=P.build([d,other,soccer],NOW)
        self.assertEqual([f['game_id'][2] for f in result['forecasts']],['Burrow'])
        self.assertEqual(result['forecasts'],P.build([d],NOW)['forecasts'])

    def test_outliers_bounded_means_and_unplayed_team_uncertainty(self):
        for score in [0,70,1000000]:
            d=division([game('2026-09-02T18:00:00-05:00',score,0),game()])
            f=P.build([d],NOW)['forecasts'][0]
            self.assertTrue(0<=f['expected_home']<=70 and 0<=f['expected_away']<=70)
            self.assertLess(abs(f['margin_home']),10)
            self.assertLessEqual(f['total_range'][0],f['total'])
            self.assertGreaterEqual(f['total_range'][1],f['total'])
        d=division();d['schedule'][-1]['away']='C'
        f=P.build([d],NOW)['forecasts'][0]
        self.assertEqual(f['gp_away'],0)
        self.assertGreater(f['margin_range'][1]-f['margin_range'][0],70)
        p=P.fit(['A','B'],[game('2026-09-02T18:00:00-05:00',28,7)])
        self.assertEqual(p('A','B')['margin_home'],-p('B','A')['margin_home'])
        self.assertEqual(p('A','B')['total'],p('B','A')['total'])

    def test_evaluation_requires_observed_public_pregame_capture(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);current=P.record(root,[division()],NOW)
            d=division();d['schedule'][-1].update(home_score=30,away_score=12)
            self.assertEqual(P.evaluate(root,[d]),[])
            capture=(root/current['capture_path']).read_bytes()
            P.observe_public(root,current['capture_path'],capture,'2026-09-10T03:00:00Z','https://example.org/run/1')
            first=P.evaluate(root,[d]);self.assertEqual(len(first),1)
            self.assertEqual(first[0]['actual_margin_home'],18)
            corrected=division();corrected['schedule'][0]['home_score']=0
            current=P.record(root,[corrected],'2026-09-11T03:00:00Z')
            P.observe_public(root,current['capture_path'],(root/current['capture_path']).read_bytes(),'2026-09-11T04:00:00Z','https://example.org/run/2')
            self.assertEqual(P.evaluate(root,[d]),first,'First public pregame capture is immutable')
            with self.assertRaises(ValueError):P.observe_public(root,current['capture_path'],b'{}','2026-09-11T05:00:00Z','https://example.org/run/3')

    def test_late_publication_and_reschedule_cannot_be_evaluated(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);c=P.record(root,[division()],NOW)
            raw=(root/c['capture_path']).read_bytes()
            P.observe_public(root,c['capture_path'],raw,'2026-09-12T23:00:00Z','https://example.org/run')
            d=division();d['schedule'][-1].update(home_score=30,away_score=12)
            self.assertEqual(P.evaluate(root,[d]),[],'Observation exactly at kickoff is too late')
            d['schedule'][-1]['start_iso']='2026-09-13T18:00:00-05:00'
            self.assertEqual(P.evaluate(root,[d]),[],'Rescheduled identity cannot inherit a prediction')

    def test_atomic_failure_and_corruption_preserve_history(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);P.record(root,[division()],NOW)
            original={str(p.relative_to(root)):p.read_bytes() for p in root.rglob('*.json')}
            d=division();d['schedule'][0]['home_score']=0
            write=P.atomic_write
            def fail_index(path,content,**kw):
                if Path(path).name=='index.json':raise OSError('disk failure')
                return write(path,content,**kw)
            with patch.object(P,'atomic_write',side_effect=fail_index):
                with self.assertRaises(OSError):P.record(root,[d],'2026-09-11T00:00:00Z')
            self.assertEqual({str(p.relative_to(root)):p.read_bytes() for p in root.rglob('*.json')},original)
            def fail_current(path,content,**kw):
                if Path(path).name=='current.json':raise OSError('disk failure')
                return write(path,content,**kw)
            with patch.object(P,'atomic_write',side_effect=fail_current):
                with self.assertRaises(OSError):P.record(root,[d],'2026-09-11T00:00:00Z')
            P.record(root,[d],'2026-09-11T01:00:00Z')
            self.assertEqual(len(P.load_archive(root)['captures']),2)
            with self.assertRaises(ValueError):P.record(root,[d],NOW)
            path=next((root/'captures').glob('*.json'));path.write_text('{}')
            with self.assertRaises(ValueError):P.load_archive(root)

    def test_publication_validation_and_public_field_allowlist(self):
        from scripts.projection_publication import validate
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);d=division();d['private_feed']='PRIVATE_SENTINEL';d['teams'][0]['email']='PRIVATE_SENTINEL';d['schedule'][0]['location_url']='PRIVATE_SENTINEL'
            P.record(root/'projections',[d],NOW)
            self.assertNotIn('PRIVATE_SENTINEL',''.join(p.read_text() for p in (root/'projections').rglob('*.json')))
            (root/'data.json').write_text(json.dumps(dict(divisions=[d],last_successful_check=NOW)))
            self.assertEqual(len(validate(root)['captures']),1)
            current=root/'projections/current.json';p=json.loads(current.read_text());p['forecasts'][0]['total']=999;current.write_text(json.dumps(p))
            with self.assertRaises(AssertionError):validate(root)

    def test_collector_integrates_current_and_archive(self):
        from scripts import update_results as U
        import inspect
        self.assertIn('record_projections(',inspect.getsource(U.update_results))
        self.assertIn('site/projections/',Path('.github/workflows/refresh.yml').read_text())

    def test_archive_reruns_corrections_and_fail_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            first=P.record(root,[division()],NOW)
            original={p.name:p.read_bytes() for p in (root/'captures').glob('*.json')}
            P.record(root,[division()],'2026-09-10T03:45:00Z')
            self.assertEqual(len(P.load_archive(root)['captures']),1)
            corrected=division();corrected['schedule'][0]['home_score']=35
            P.record(root,[corrected],'2026-09-10T04:45:00Z')
            self.assertEqual(len(P.load_archive(root)['captures']),2)
            for name,content in original.items():self.assertEqual((root/'captures'/name).read_bytes(),content)
            before=(root/'current.json').read_bytes()
            (root/'captures'/'unindexed.json').write_text('{}')
            with self.assertRaises(ValueError):P.record(root,[division()],'2026-09-10T05:45:00Z')
            self.assertEqual((root/'current.json').read_bytes(),before)
