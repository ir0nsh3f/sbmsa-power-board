"""Division acceptance preserves source truth without shared-age forecast mixing."""
import json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from test_schedule import page,row
from scripts import update_results as r
from scripts.history import load_index

class PartialTests(unittest.TestCase):
 def test_two_failures_retain_only_affected_and_recover(self):
  with tempfile.TemporaryDirectory() as tmp,patch.object(r,'EXPECTED_TEAM_COUNTS',{i:2 for _,_,i in r.SOURCES}):
   out=Path(tmp)/'data.json';first=r.update_results(out,fetch=lambda _:page(row()),now='2026-09-08T12:00:00Z')
   old={f:f.read_bytes() for f in Path(tmp).rglob('*.json') if 'captures' in f.parts or 'fall-2026' in f.parts}
   def fetch(url):
    return page(row(away='Unknown')) if any('/'+str(i)+'/' in url for i in (710198,742279)) else page(row(hs='1',aws='0'),((1,0,0,1),(0,1,0,1)))
   p=r.update_results(out,fetch=fetch,now='2026-09-08T13:00:00Z')
   self.assertEqual(p['status'],'partial')
   self.assertEqual(p['last_successful_check'],first['last_successful_check'])
   for d,before in zip(p['divisions'],first['divisions']):
    key=d['sport']+'|'+d['division'];m=p['division_status'][key]
    if d['sport']=='6u' and d['division']!='Messi':
     self.assertEqual(d,before);self.assertEqual(m['last_successful_check'],first['last_checked']);self.assertIn('Unknown',m['error'])
    else:self.assertEqual(len(d['games']),1);self.assertEqual(m['last_successful_check'],p['last_checked'])
   self.assertEqual(len(p['errors']),2)
   self.assertEqual(json.loads((Path(tmp)/'soccer-projections-6u/current.json').read_text())['status'],'withheld')
   self.assertEqual(json.loads((Path(tmp)/'soccer-projections/current.json').read_text())['generated_at'],p['last_checked'])
   from scripts.soccer_projections import validate,AGE_MODELS
   from scripts.projection_publication import validate as flag_validate
   validate(tmp);validate(tmp,AGE_MODELS['6u']);flag_validate(tmp)
   entry=load_index(Path(tmp)/'history')['captures'][-1]
   snap=json.loads((Path(tmp)/'history'/entry['path']).read_text())
   self.assertEqual(snap['source_coverage'],p['division_status'])
   for f,raw in old.items():self.assertEqual(f.read_bytes(),raw)
   recovered=r.update_results(out,fetch=lambda _:page(row()),now='2026-09-08T14:00:00Z')
   self.assertEqual(recovered['status'],'ok');self.assertEqual(recovered['errors'],[])
   self.assertTrue(all(v['status']=='ok' and v['error'] is None for v in recovered['division_status'].values()))

 def test_first_missing_division_does_not_erase_good_data(self):
  with tempfile.TemporaryDirectory() as tmp,patch.object(r,'EXPECTED_TEAM_COUNTS',{i:2 for _,_,i in r.SOURCES}):
   out=Path(tmp)/'data.json'
   def fetch(url):
    if '/710198/' in url:raise OSError('offline')
    return page(row())
   p=r.update_results(out,fetch=fetch,now='2026-09-08T12:00:00Z')
   self.assertEqual(p['status'],'partial');self.assertEqual(len(p['divisions']),9)
   self.assertIsNone(p['division_status']['6u|Haaland']['last_successful_check'])
   again=r.update_results(out,fetch=lambda _:(_ for _ in ()).throw(OSError('offline')),now='2026-09-08T13:00:00Z')
   self.assertEqual(again['divisions'],p['divisions']);self.assertEqual(again['status'],'error')
