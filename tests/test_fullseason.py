import json,subprocess,unittest
from pathlib import Path
from scripts import ratings
class FullSeasonTests(unittest.TestCase):
 def test_crossdivision_python_parity_and_preserved_regular_records(self):
  data=json.loads(Path('site/data.json').read_text()); playoffs=json.loads(Path('site/playoffs.json').read_text())
  original=json.dumps(data)
  self.assertTrue(hasattr(ratings,'full_season'),'Python needs canonical full-season inputs')
  f=ratings.full_season(data,playoffs)
  self.assertEqual(json.dumps(data),original)
  js=json.loads(subprocess.check_output(['node','-e',"const R=require('./site/ratings.js'),x=JSON.parse(require('fs').readFileSync(0,'utf8'));const f=R.fullSeason(x.data,x.playoffs); console.log(JSON.stringify({f,ratings:Object.fromEntries(['raw','capped'].map(m=>[m,Object.fromEntries(['flag','8u','6u','5ug'].map(s=>[s,R.compute(f.divisions,s,m)]))]))}));"],input=json.dumps(dict(data=data,playoffs=playoffs)).encode()))
  self.assertEqual(f,js['f'])
  for mode in ['raw','capped']:
   for sport in ['flag','8u','6u','5ug']:
    py=ratings.compute(f['divisions'],sport,mode)
    for a,b in zip(py,js['ratings'][mode][sport]):
     self.assertEqual((a['team'],a['division'],a['rank'],a['component']),(b['team'],b['division'],b['rank'],b['component']))
     if a['power'] is not None:self.assertAlmostEqual(a['power'],b['power'],places=10)
