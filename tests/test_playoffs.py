import unittest,json,tempfile,copy
from bs4 import BeautifulSoup
from pathlib import Path
from scripts import playoffs as P
FIX=Path(__file__).parent/'fixtures/playoffs'
class Playoffs(unittest.TestCase):
 def test_actual_gold(self):
  d=P.parse((FIX/'710237.html').read_text(),P.SOURCES[0])
  self.assertEqual([len(p['teams']) for p in d['pools']],[4,4])
  self.assertEqual(len(d['games']),15)
  arsenal=[g for g in d['games'] if any(g[k]['name']=='Arsenal' for k in ('home','away'))]
  self.assertEqual(len(arsenal),3)
  self.assertEqual(arsenal[0]['start_iso'],'2026-10-31T08:30:00-05:00')
  self.assertEqual(arsenal[1]['start_iso'],'2026-11-03T18:45:00-06:00')
  self.assertEqual(d['games'][-1]['home']['label'],'G1 Winner')
  self.assertTrue(all(g['home_score'] is None for g in d['games']))
 def test_actual_all_layouts(self):
  expected=[15,10,23,11,11,15,7,7]
  for spec,n in zip(P.SOURCES,expected):
   with self.subTest(source=spec['id']):
    d=P.parse((FIX/(spec['id']+'.html')).read_text(),spec)
    self.assertEqual(len(d['games']),n)
    self.assertEqual(len({g['id'] for g in d['games']}),n)
 def test_retention_and_isolation(self):
  regular=json.loads((FIX.parents[2]/'site/data.json').read_text());before=copy.deepcopy(regular)
  def fetch(url):return (FIX/(url.split('/')[-2]+'.html')).read_text()
  with tempfile.TemporaryDirectory() as tmp:
   out=Path(tmp)/'playoffs.json';first=P.collect(out,regular,fetch,'2026-10-29T20:00:00Z')
   def broken(url):
    if '/710237/' in url:raise OSError('source unavailable')
    return fetch(url)
   second=P.collect(out,regular,broken,'2026-10-29T21:00:00Z')
   self.assertEqual(first['sources'][0]['games'],second['sources'][0]['games'])
   self.assertEqual(second['sources'][0]['status'],'error')
   self.assertEqual(second['sources'][0]['last_successful_check'],'2026-10-29T20:00:00Z')
   self.assertEqual(second['sources'][1]['status'],'ok');self.assertEqual(regular,before)
 def test_results_unknown_and_bye(self):
  original=(FIX/'710237.html').read_text()
  for pair,valid in [(('0','0'),True),(('W','L'),True),(('',''),True),(('L','L'),False),(('2',''),False)]:
   s=BeautifulSoup(original,'html.parser')
   s.select_one('[id$=HomeScoreLabel]').string=pair[0];s.select_one('[id$=AwayScoreLabel]').string=pair[1]
   if valid:
    d=P.parse(str(s),P.SOURCES[0]);self.assertEqual(d['games'][0]['home_score'],0 if pair==('0','0') else None)
   else:
    with self.assertRaises(ValueError):P.parse(str(s),P.SOURCES[0])
  s=BeautifulSoup(original,'html.parser');s.select_one('[id$=TimeLabel]').string='Bye'
  self.assertTrue(P.parse(str(s),P.SOURCES[0])['games'][0]['bye'])
  s=BeautifulSoup(original,'html.parser');s.select_one('[id$=DateLabel]').string='TBD';s.select_one('[id$=TimeLabel]').string='TBD'
  self.assertIsNone(P.parse(str(s),P.SOURCES[0])['games'][0]['start_iso'])
 def test_identity_collision_and_no_fuzzy_alias(self):
  d=P.parse((FIX/'710237.html').read_text(),P.SOURCES[0]);regular=json.loads((FIX.parents[2]/'site/data.json').read_text())
  self.assertEqual(P.join(d,regular)['pools'][0]['teams'][1]['identity']['division'],'Pulisic')
  regular['divisions'].append(copy.deepcopy(next(x for x in regular['divisions'] if x['sport']=='8u' and x['division']=='Pulisic')))
  self.assertIsNone(P.join(d,regular)['pools'][0]['teams'][1]['identity'])
  silver=P.join(P.parse((FIX/'710238.html').read_text(),P.SOURCES[1]),regular)
  self.assertIsNone(next(g for g in silver['games'] if g['home']['name']=='Dinscores')['home']['identity'])

