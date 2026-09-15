"""Synthetic model tests, never published as official data."""
import unittest
from importlib import util
from pathlib import Path

class SoccerModel(unittest.TestCase):
    def test_archive_is_immutable_reproducible_and_separate(self):
        import tempfile,json
        from scripts import soccer_projections as m
        self.assertTrue(hasattr(m,'record'), 'Soccer pregame archive missing')
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            one=m.record(root,[],'2026-09-15T12:00:00Z')
            raw=(root/one['capture_path']).read_bytes()
            two=m.record(root,[],'2026-09-15T13:00:00Z')
            self.assertEqual(one['capture_path'],two['capture_path'])
            self.assertEqual(raw,(root/one['capture_path']).read_bytes())
            self.assertEqual(len(m.load_archive(root)['captures']),1)
            (root/one['capture_path']).write_text('{}')
            with self.assertRaises(ValueError):m.load_archive(root)

    def test_temporal_edges_and_withholding(self):
        from scripts.soccer_projections import build
        past=[dict(home='A',away='B',home_score=3,away_score=1,start_iso=f'2026-09-0{i}T12:00:00Z') for i in range(1,5)]
        future=[dict(home='A',away='B',home_score=None,away_score=None,start_iso=s) for s in [None,'2026-09-15T12:00:00Z','2026-09-15T12:30:00Z','2026-09-15T12:30:01Z']]
        d=dict(sport='5ug',division='Boxx',teams=[dict(team='A'),dict(team='B')],schedule=past+future)
        p=build([d],'2026-09-15T12:00:00Z')
        self.assertEqual([f['fixture_id'][-1] for f in p['forecasts']],['2026-09-15T12:30:01Z'])
        self.assertEqual(p['pooled_games'],4)
        self.assertEqual(build([dict(d,schedule=past[:3]+future)],'2026-09-15T12:00:00Z')['forecasts'],[])
        partial=dict(future[-1],home_score=0)
        self.assertEqual(build([dict(d,schedule=past+[partial])],'2026-09-15T12:00:00Z')['forecasts'],[])
        self.assertEqual(build([dict(d,schedule=past+[dict(future[-1],home_score=99,away_score=0)])],'2026-09-15T12:00:00Z')['pooled_games'],4)

    def test_goal_model_is_dedicated_and_shrunk(self):
        path=Path(__file__).resolve().parents[1]/'scripts/soccer_projections.py'
        self.assertTrue(path.exists(), 'Dedicated soccer goal model missing')
        from scripts.soccer_projections import build
        teams=[{'team':n} for n in ['Rainbow Unicorns','B']]
        past=[dict(home='Rainbow Unicorns',away='B',home_score=5,away_score=1,start_iso=f'2026-09-0{i}T12:00:00Z') for i in range(1,5)]
        future=dict(home='Rainbow Unicorns',away='B',home_score=None,away_score=None,start_iso='2026-09-16T12:00:00Z')
        ds=[dict(sport='5ug',division='Boxx',teams=teams,schedule=past+[future])]
        p=build(ds,'2026-09-15T12:00:00Z')
        self.assertEqual(p['model']['sport'],'5ug')
        self.assertEqual(p['pooled_games'],4)
        f=p['forecasts'][0]
        self.assertGreater(f['margin_home'],0)
        self.assertLess(f['margin_home'],4)
        self.assertEqual(f['total'],6)
        self.assertLess(f['margin_range'][0],0)
        self.assertGreater(f['margin_range'][1],4)
        self.assertEqual(p,build(ds,'2026-09-15T12:00:00Z'))
        self.assertEqual(build([dict(ds[0],sport='flag')],'2026-09-15T12:00:00Z')['forecasts'],[])
