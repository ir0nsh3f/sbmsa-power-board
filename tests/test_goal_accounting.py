"""Reviewed score-unavailable accounting is not a played score."""
import unittest
from bs4 import BeautifulSoup
from test_schedule import page, row
from scripts.update_results import parse_division


def source(division='Haaland', residuals=((0,3),(3,0)), extra=''):
    haaland = division == 'Haaland'
    names = ('San Jose','Blue Jays') if haaland else ('Bomb Pops','Lightning')
    records = ((0,1,0,1),(1,0,0,1)) if haaland else ((0,1,0,1),(0,1,0,1))
    h = page(row(date='Sat 9/12' if haaland else 'Mon 9/21',time='2:45 PM' if haaland else '5:30 PM',location='PSE Field #1',hs='L',aws='W' if haaland else 'L')+extra,records)
    h=h.replace('>A<',f'>{names[0]}<').replace('>B<',f'>{names[1]}<')
    soup=BeautifulSoup(h,'html.parser')
    soup.select_one('thead tr').append(BeautifulSoup('<th>GF</th><th>GA</th>','html.parser'))
    for r,goals in zip(soup.select('table#standingsGrid tbody tr'),residuals):
        r.append(BeautifulSoup(''.join(f'<td>{v}</td>' for v in goals),'html.parser'))
    return str(soup)


def parse(h,division='Haaland'):
    return parse_division(h,'6u',division,f'https://sbmsa.net/sites/sbmsa/schedule/{710198 if division=="Haaland" else 742279}/')


class AccountingTests(unittest.TestCase):
    def test_paired_outcome_retains_separate_reported_goals(self):
        d=parse(source())
        teams={t['team']:t for t in d['teams']}
        self.assertEqual(teams['Blue Jays']['reported_goals'],{'gf':3,'ga':0})
        self.assertEqual(teams['Blue Jays']['goal_residual'],{'gf':3,'ga':0})
        self.assertEqual(teams['Blue Jays']['pf'],0)
        self.assertEqual(teams['Blue Jays']['scored_gp'],0)
        self.assertEqual(teams['Blue Jays']['gp'],1)
        self.assertIsNone(d['games'][0]['away_score'])
        self.assertEqual(d['games'][0]['away_outcome'],'W')

    def test_exact_quarantine_accounting_is_not_a_draw(self):
        d=parse(source('Mbappe',((3,3),(3,3))),'Mbappe')
        self.assertEqual(d['games'],[])
        for t in d['teams']:
            self.assertEqual(t['reported_goals'],dict(gf=3,ga=3))
            self.assertEqual((t['pf'],t['pa'],t['gp']), (0,0,0))
            self.assertEqual(t['reported_record']['l'],1)
        self.assertEqual(d['schedule'][0]['result_status'],'unknown')
        self.assertNotIn('home_outcome',d['schedule'][0])

    def test_actual_october22_sources_and_all_unaffected_teams(self):
        from pathlib import Path
        from scripts.soccer_projections import build, AGE_MODELS
        fixtures=Path(__file__).parent/'fixtures'
        for division,identifier,finals in [('Haaland',710198,53),('Mbappe',742279,56)]:
            d=parse((fixtures/f'goals-{identifier}-20261022.html').read_text(),division)
            self.assertEqual(len(d['games']),finals)
            affected={t['team']:t for t in d['teams'] if 'reported_goals' in t}
            expected=({'Blue Jays':(7,54,10,54,8),'San Jose':(5,19,5,22,8)} if division=='Haaland'
                      else {'Bomb Pops':(14,27,17,30,9),'Lightning':(12,37,15,40,7)})
            self.assertEqual(set(affected),set(expected))
            for name,(gf,ga,rgf,rga,gp) in expected.items():
                t=affected[name]
                self.assertEqual((t['pf'],t['pa'],t['reported_goals']['gf'],t['reported_goals']['ga'],t.get('scored_gp',t['gp'])),(gf,ga,rgf,rga,gp))
            model=build([d],'2026-10-22T05:12:01Z',AGE_MODELS['6u'])
            self.assertEqual(model['pooled_games'],52 if division=='Haaland' else 56)
            # An unrelated official goal discrepancy must still reject the division.
            s=BeautifulSoup((fixtures/f'goals-{identifier}-20261022.html').read_text(),'html.parser')
            headers=[th.get_text(strip=True).lower() for th in s.select('table[id*=standingsGrid] thead th')]
            cell=s.select_one('table[id*=standingsGrid] tbody tr').find_all('td',recursive=False)[headers.index('gf')]
            cell.string=str(int(cell.get_text(strip=True))+1)
            with self.assertRaises(ValueError):parse(str(s),division)

    def test_unreviewed_nonreciprocal_negative_and_ambiguous_fail(self):
        for values in [((0,3),(2,0)), ((0,3),(-1,0)), ((0,4),(4,0)), ((0,3),(0,0))]:
            with self.subTest(values=values), self.assertRaises(ValueError):
                parse(source(residuals=values))
        for h in [source().replace('Sat 9/12','Sun 9/13'),
                  source(extra=row(date='Sun 9/13',hs='W',aws='L')),
                  source().replace('>W<','>L<'),
                  source().replace('<td>San Jose</td>','<td>Other</td>')]:
            with self.assertRaises(ValueError):parse(h)
        for values in [((3,3),(0,3)),((4,4),(4,4)),((-3,3),(3,-3))]:
            with self.assertRaises(ValueError):parse(source('Mbappe',values),'Mbappe')

    def test_missing_goals_columns_and_zero_residual_keep_legacy_shape(self):
        d=parse(source(residuals=((0,0),(0,0))))
        self.assertTrue(all('reported_goals' not in t for t in d['teams']))
        h=source();s=BeautifulSoup(h,'html.parser')
        for r in s.select('#standingsGrid tr'):
            r.find_all(['td','th'],recursive=False)[-1].decompose()
            r.find_all(['td','th'],recursive=False)[-1].decompose()
        self.assertEqual(parse(str(s)),d)

    def test_archive_preserves_accounting_without_changing_numeric_inputs(self):
        from scripts.history import result_data
        from scripts.ratings import compute
        from copy import deepcopy
        d=parse(source())
        saved=result_data([d])[0]
        self.assertEqual(saved['teams'][0]['reported_goals'],dict(gf=3,ga=0))
        clean=deepcopy(d)
        for t in clean['teams']:
            t.pop('reported_goals');t.pop('goal_residual')
        # Extra audit fields may propagate, but all numerical rating fields agree.
        for a,b in zip(compute([d],'6u'),compute([clean],'6u')):
            self.assertEqual({k:v for k,v in a.items() if k not in ('reported_goals','goal_residual')},b)

if __name__=='__main__':unittest.main()
