"""Only the reviewed exact L/L fixture may be quarantined."""
import unittest
from test_schedule import page, row
from scripts.update_results import parse_division
URL='https://sbmsa.net/sites/sbmsa/schedule/742279/'
def html(hs='L',aws='L',records=((0,1,0,1),(0,1,0,1)), **kw):
    return page(row(date='Mon 9/21',time='5:30 PM',location='PSE Field #1',hs=hs,aws=aws,**kw),records).replace('>A<','>Bomb Pops<').replace('>B<','>Lightning<')
def parse(h, url=URL):
    return parse_division(h,'6u','Mbappe',url)
class QuarantineTests(unittest.TestCase):
    def test_exact_unknown_and_reported_records(self):
        d=parse(html());g=d['schedule'][0]
        self.assertEqual(g['result_status'],'unknown')
        self.assertEqual(g['result_note'],'Result unknown — source lists L/L')
        self.assertIsNone(g['home_score']);self.assertIsNone(g['away_score'])
        self.assertNotIn('home_outcome',g)
        self.assertEqual(d['games'],[])
        for t in d['teams']:
            self.assertEqual((t['w'],t['l'],t['t'],t['gp']),(0,0,0,0))
            self.assertEqual(t['reported_record'],dict(w=0,l=1,t=0,gp=1))
            self.assertEqual(t['unknown_gp'],1)
    def test_only_exact_plausible_delta_and_identity(self):
        for records in [((1,0,0,1),(0,1,0,1)),((0,2,0,2),(0,1,0,1)),((0,0,0,0),(0,1,0,1))]:
            with self.subTest(records=records),self.assertRaises(ValueError):parse(html(records=records))
        for h,u in [(html(),URL.replace('742279','710199')),(html().replace('Mon 9/21','Tue 9/22'),URL),(html().replace('PSE Field #1','PSE Field #4'),URL),(html('W','W'),URL),(html('L',''),URL)]:
            with self.assertRaises(ValueError):parse(h,u)
    def test_official_correction_resolves_without_carryforward(self):
        for hs,aws in [('2','0'),('W','L')]:
            d=parse(html(hs,aws,((1,0,0,1),(0,1,0,1))))
            self.assertNotIn('result_status',d['schedule'][0])
            self.assertEqual(len(d['games']),1)
            self.assertTrue(all('reported_record' not in t for t in d['teams']))
    def test_atomic_refresh_warning_correction_and_unrelated_error(self):
        import tempfile,json
        from pathlib import Path
        from unittest.mock import patch
        from scripts import update_results as U
        with tempfile.TemporaryDirectory() as tmp, patch.object(U,'SOURCES',[('6u','Mbappe',742279)]),patch.object(U,'EXPECTED_TEAM_COUNTS',{742279:2}):
            p=Path(tmp)/'data.json'
            first=U.update_results(p,fetch=lambda _:html(),now='2026-09-25T00:00:00Z')
            self.assertEqual(first['status'],'ok');self.assertEqual(len(first['warnings']),1)
            failed=U.update_results(p,fetch=lambda _:html().replace('<td>1</td>','<td>2</td>',1),now='2026-09-25T01:00:00Z')
            self.assertEqual(failed['status'],'error');self.assertEqual(failed['divisions'],first['divisions'])
            fixed=U.update_results(p,fetch=lambda _:html('0','0',((0,0,1,1),(0,0,1,1))),now='2026-09-25T02:00:00Z')
            self.assertEqual(fixed['status'],'ok');self.assertEqual(fixed['warnings'],[])
            self.assertEqual(fixed['divisions'][0]['games'][0]['home_score'],0)
    def test_archive_audit_and_projection_exclusion(self):
        import tempfile,json
        from pathlib import Path
        from scripts.history import record_history,load_index
        from scripts.soccer_projections import record,load_archive,AGE_MODELS
        d=parse(html())
        from scripts.soccer_projections import build
        numeric=[dict(home='Bomb Pops',away='Lightning',home_score=2,away_score=1,start_iso=f'2026-09-0{i}T12:00:00Z') for i in range(1,5)]
        model_data=dict(d,schedule=numeric+d['schedule'])
        forecast=build([model_data],'2026-09-20T12:00:00Z',AGE_MODELS['6u'])
        self.assertEqual(forecast['pooled_games'],4)
        self.assertEqual(forecast['forecasts'],[])
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            def accept(d,stamp):
                return record_history(root/'history',dict(divisions=[d],status='ok',errors=[],last_checked=stamp,last_successful_check=stamp))
            first=accept(d,'2026-09-20T12:00:00Z')
            raw=(root/'history'/first['path']).read_bytes()
            saved=json.loads(raw)['divisions'][0]
            self.assertEqual(saved['quarantined_games'][0]['result_status'],'unknown')
            self.assertEqual(saved['teams'][0]['reported_record']['l'],1)
            self.assertEqual(first['completed_games'],0)
            record(root/'soccer',[d],'2026-09-20T12:00:00Z',AGE_MODELS['6u'])
            capture=load_archive(root/'soccer')['captures'][0]
            payload=json.loads((root/'soccer'/capture['path']).read_text())
            self.assertIn('result_status',str(payload))
            accept(parse(html('2','0',((1,0,0,1),(0,1,0,1)))),'2026-09-22T12:00:00Z')
            self.assertEqual(len(load_index(root/'history')['captures']),2)
            self.assertEqual((root/'history'/first['path']).read_bytes(),raw)
if __name__=='__main__':unittest.main()
