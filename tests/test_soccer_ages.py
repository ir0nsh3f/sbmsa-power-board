import copy,json,tempfile,unittest
from pathlib import Path
from scripts import soccer_projections as m

CHECK='2026-09-19T01:00:00Z'
def division(sport,score=4,name='One'):
    games=[dict(home='A',away='B',home_score=score,away_score=2,start_iso=f'2026-09-{i:02}T12:00:00Z') for i in range(1,5)]
    games.append(dict(home='C',away='A',home_score=None,away_score=None,start_iso='2026-09-20T12:00:00Z'))
    return dict(sport=sport,division=name,teams=[dict(team=x) for x in 'ABC'],schedule=games)

class AgeModels(unittest.TestCase):
    def test_archive_model_scope_receipts_and_legacy_bytes(self):
        self.assertIn('model',__import__('inspect').signature(m.record).parameters)
        for sport in ('8u','6u'):
            model=m.AGE_MODELS[sport]
            with tempfile.TemporaryDirectory() as tmp:
                root=Path(tmp)
                p=m.record(root,[division(sport),division('5ug')],CHECK,model=model)
                raw=(root/p['capture_path']).read_bytes()
                sha=p['capture_path'].split('/')[1][:-5]
                (root/'publication').mkdir()
                receipt=dict(schema_version=1,model_id=model['id'],sport=sport,capture_sha256=sha,capture_path=p['capture_path'],observed_public_at='2026-09-19T01:01:00Z')
                file=root/'publication'/f'{sha}.json';file.write_text(json.dumps(receipt))
                m.load_archive(root)
                q=m.record(root,[division(sport)],'2026-09-19T02:00:00Z',model=model)
                self.assertEqual(p['capture_path'],q['capture_path'])
                self.assertEqual(raw,(root/p['capture_path']).read_bytes())
                receipt['sport']='5ug';file.write_text(json.dumps(receipt))
                with self.assertRaises(ValueError):m.load_archive(root)

    def test_each_age_cutoff_outcomes_minimum_and_all_divisions(self):
        for sport in ('8u','6u'):
            model=m.AGE_MODELS[sport];d=division(sport)
            future=d['schedule'][-1]
            outcome=dict(d['schedule'][0],home_score=None,away_score=None,home_outcome='W',away_outcome='L')
            partial=dict(future,home_score=1)
            unknown=dict(future,start_iso=None)
            edge=dict(future,start_iso='2026-09-19T01:30:00Z')
            eligible=dict(future,start_iso='2026-09-19T01:30:01Z')
            d['schedule'] += [outcome,partial,unknown,edge,eligible,dict(future,home_outcome='W',away_outcome='L')]
            p=m.build([d,dict(d,division='Two')],CHECK,model)
            self.assertEqual(p['pooled_games'],8)
            self.assertEqual(len(p['forecasts']),4)
            self.assertEqual({f['fixture_id'][2] for f in p['forecasts']},{'One','Two'})
            d['schedule']=d['schedule'][:3]+[future,outcome]
            self.assertEqual(m.build([d],CHECK,model)['forecasts'],[])
            self.assertIn(sport.upper(),m.build([d],CHECK,model)['withheld'])
            with self.assertRaises(ValueError):m.build([d],CHECK,dict(model,prior_games=8))

    def test_explicit_age_models_and_isolated_training(self):
        self.assertTrue(hasattr(m,'AGE_MODELS'),'Explicit age-specific soccer models missing')
        ds=[division('8u'),division('6u',12),division('5ug',1),division('flag',50)]
        for sport in ('8u','6u'):
            model=m.AGE_MODELS[sport]
            self.assertEqual(model['prior_games'],3)
            self.assertEqual(model['sport'],sport)
            self.assertEqual(model['id'],sport+'-gamma-poisson-v1')
            p=m.build(ds,CHECK,model)
            self.assertEqual(p,m.build([d for d in ds if d['sport']==sport],CHECK,model))
            self.assertEqual(p['pooled_games'],4)
            self.assertEqual({f['fixture_id'][1] for f in p['forecasts']},{sport})
            f=p['forecasts'][0]
            self.assertEqual(f['home_gp'],0)
            self.assertLess(f['margin_range'][0],f['margin_home'])
            self.assertGreater(f['margin_range'][1],f['margin_home'])
            self.assertGreaterEqual(f['total_range'][0],0)
            self.assertGreater(f['total_range'][1],f['total'])
        self.assertEqual(m.build(ds,CHECK),m.build([ds[2]],CHECK))
