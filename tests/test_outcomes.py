"""Official paired outcomes are final records, not numeric scoring evidence."""
import unittest
from test_schedule import page, row, parse

class OutcomeTests(unittest.TestCase):
    def test_paired_outcomes_both_orders(self):
        for hs, aws in [('W','L'),('L','W')]:
            records=((int(hs=='W'),int(hs=='L'),0,1),(int(aws=='W'),int(aws=='L'),0,1))
            d=parse(page(row(hs=hs,aws=aws),records))
            g=d['schedule'][0]
            self.assertEqual((g['home_outcome'],g['away_outcome']),(hs,aws))
            self.assertIsNone(g['home_score'])
            self.assertIsNone(g['away_score'])
            self.assertEqual(d['games'][0]['home_outcome'],hs)
            for t in d['teams']:
                self.assertEqual((t['gp'],t['scored_gp'],t['pf'],t['pa']),(1,0,0,0))

    def test_invalid_markers_fail_closed(self):
        for hs,aws in [('W',''),('','L'),('W','W'),('L','L'),('T','T'),('W','0'),('1','L'),('1',''),('w','l'),('FF','W')]:
            with self.subTest(hs=hs,aws=aws),self.assertRaises(ValueError):
                parse(page(row(hs=hs,aws=aws)))

    def test_correction_history_retains_old_and_new(self):
        import tempfile, json
        from pathlib import Path
        from scripts.history import record_history, load_index
        old=parse(page(row(hs='4',aws='1'),((1,0,0,1),(0,1,0,1))))
        new=parse(page(row(hs='L',aws='W'),((0,1,0,1),(1,0,0,1))))
        with tempfile.TemporaryDirectory() as tmp:
            def accept(d, stamp):
                return record_history(tmp,dict(divisions=[d],status='ok',errors=[],last_checked=stamp,last_successful_check=stamp))
            first=accept(old,'2026-09-16T10:00:00Z'); raw=(Path(tmp)/first['path']).read_bytes()
            second=accept(new,'2026-09-16T11:00:00Z')
            stored=json.loads((Path(tmp)/second['path']).read_text())
            self.assertEqual(stored['divisions'][0]['games'][0]['away_outcome'],'W')
            self.assertEqual(stored['divisions'][0]['teams'][0]['scored_gp'],0)
            self.assertIsNone(second['teams'][0]['rank'])
            self.assertIsNone(second['teams'][0]['capped_margin_per_game'])
            self.assertEqual((Path(tmp)/first['path']).read_bytes(),raw)
            self.assertEqual(len(load_index(tmp)['captures']),2)
            accept(old,'2026-09-16T12:00:00Z')
            self.assertEqual(len(load_index(tmp)['captures']),3)

    def test_numeric_and_outcome_records_and_goal_reconciliation(self):
        from bs4 import BeautifulSoup
        html=page(row(hs='4',aws='1')+row(date='Sat 9/12',hs='L',aws='W'),((1,1,0,2),(1,1,0,2)))
        d=parse(html)
        self.assertEqual([(t['gp'],t['scored_gp'],t['pf'],t['pa']) for t in d['teams']],[(2,1,4,1),(2,1,1,4)])
        soup=BeautifulSoup(html,'html.parser')
        header=soup.select_one('#standingsGrid thead tr')
        for label in ['GF','GA']:
            cell=soup.new_tag('th');cell.string=label;header.append(cell)
        for r,values in zip(soup.select('#standingsGrid tbody tr'),[(4,1),(1,4)]):
            for v in values:
                cell=soup.new_tag('td');cell.string=str(v);r.append(cell)
        self.assertEqual(parse(str(soup))['teams'],d['teams'])
        soup.select('#standingsGrid tbody tr')[0].find_all('td')[-2].string='7'
        with self.assertRaisesRegex(ValueError,'Cannot reconcile goals'):
            parse(str(soup))
        with self.assertRaisesRegex(ValueError,'Cannot reconcile standings'):
            parse(page(row(hs='L',aws='W'),((1,0,0,1),(0,1,0,1))))

    def test_projection_models_exclude_outcomes_even_future_dated(self):
        from scripts import projections, soccer_projections
        import tempfile
        from pathlib import Path
        numeric=[dict(home='A',away='B',home_score=4,away_score=1,start_iso=f'2026-09-0{i}T12:00:00Z') for i in range(1,5)]
        outcome=dict(home='A',away='B',home_score=None,away_score=None,home_outcome='W',away_outcome='L',start_iso='2026-09-20T12:00:00Z')
        d=dict(sport='flag',division='Test',teams=[dict(team='A'),dict(team='B')],schedule=numeric+[outcome])
        p=projections.build([d],'2026-09-16T12:00:00Z')
        self.assertEqual(len(p['training'][0]['games']),4)
        self.assertEqual(p['forecasts'],[])
        d['sport']='5ug'
        p=soccer_projections.build([d],'2026-09-16T12:00:00Z')
        self.assertEqual(p['pooled_games'],4)
        self.assertEqual(p['forecasts'],[])
        with tempfile.TemporaryDirectory() as tmp:
            soccer_projections.record(tmp,[d],'2026-09-16T12:00:00Z')
            self.assertEqual(len(soccer_projections.load_archive(tmp)['captures']),1)

if __name__=='__main__': unittest.main()
