import json
import tempfile
import unittest
from pathlib import Path
from scripts import projections as P
from test_projections import division, NOW

class LastPregameTests(unittest.TestCase):
    def test_artifact_writer_and_validation(self):
        from scripts import projection_publication as pub
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);d=division()
            P.record(root/'projections',[d],NOW)
            (root/'data.json').write_text(json.dumps(dict(divisions=[d],last_successful_check=NOW)))
            self.assertTrue(callable(getattr(pub,'summarize',None)))
            pub.summarize(root)
            self.assertEqual(json.loads((root/'projections/results.json').read_text())['forecasts'],[])
            pub.validate(root)
            payload=json.loads((root/'projections/results.json').read_text());payload['forecasts']=[{}]
            (root/'projections/results.json').write_text(json.dumps(payload))
            with self.assertRaises(AssertionError):pub.validate(root)

    def test_missing_late_tied_receipts_exact_identity_and_corruption(self):
        for observed in [None,'2026-09-12T23:00:00Z','2026-09-13T00:00:00Z','2026-09-11T04:00:00Z']:
            with self.subTest(observed=observed), tempfile.TemporaryDirectory() as tmp:
                root=Path(tmp);d=division();a=P.record(root,[d],NOW)
                d['schedule'][0]['home_score']=0
                b=P.record(root,[d],'2026-09-11T03:00:00Z')
                if observed:
                    for c in [b,a]:P.observe_public(root,c['capture_path'],(root/c['capture_path']).read_bytes(),observed,'https://example.org/run')
                d['schedule'][-1].update(home_score=19,away_score=7)
                result=P.last_pregame(root,[d])
                if observed=='2026-09-11T04:00:00Z':
                    self.assertEqual(result[0]['capture_path'],max(a['capture_path'],b['capture_path']))
                else:self.assertEqual(result,[])
                for field,value in [('start_iso',None),('start_iso','2026-09-13T18:00:00-05:00'),('home','Unknown'),('away','Unknown')]:
                    changed=json.loads(json.dumps(d));changed['schedule'][-1][field]=value
                    self.assertEqual(P.last_pregame(root,[changed]),[])
                for field,value in [('sport','8u'),('division','Other')]:
                    changed=json.loads(json.dumps(d));changed[field]=value
                    self.assertEqual(P.last_pregame(root,[changed]),[])
                (root/a['capture_path']).write_text('{}')
                with self.assertRaises(ValueError):P.last_pregame(root,[d])

    def test_corrupt_receipt_or_cutoff_cannot_publish(self):
        from scripts import projection_publication as pub
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);d=division();c=P.record(root/'projections',[d],NOW)
            archive=root/'projections'
            P.observe_public(archive,c['capture_path'],(archive/c['capture_path']).read_bytes(),'2026-09-10T03:00:00Z','https://example.org/run')
            d['schedule'][-1].update(home_score=19,away_score=7)
            (root/'data.json').write_text(json.dumps(dict(divisions=[d],last_successful_check=NOW)))
            pub.summarize(root);before=(archive/'results.json').read_bytes()
            receipt=next((archive/'publication').glob('*.json'));raw=receipt.read_bytes()
            value=json.loads(raw);value['sha256']='bad';receipt.write_text(json.dumps(value))
            with self.assertRaises(ValueError):pub.summarize(root)
            self.assertEqual((archive/'results.json').read_bytes(),before)
            receipt.write_bytes(raw)
            value=json.loads((archive/c['capture_path']).read_text());value['training_cutoff']='2026-09-13T00:00:00Z'
            (archive/c['capture_path']).write_text(json.dumps(value))
            with self.assertRaises(ValueError):pub.summarize(root)
            self.assertEqual((archive/'results.json').read_bytes(),before)

    def test_latest_public_not_first_or_refit(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            d=division()
            first=P.record(root,[d],NOW)
            P.observe_public(root,first['capture_path'],(root/first['capture_path']).read_bytes(),'2026-09-10T03:00:00Z','https://example.org/1')
            d['schedule'][0]['home_score']=0
            last=P.record(root,[d],'2026-09-11T03:00:00Z')
            P.observe_public(root,last['capture_path'],(root/last['capture_path']).read_bytes(),'2026-09-11T04:00:00Z','https://example.org/2')
            d['schedule'][-1].update(home_score=19,away_score=7)
            self.assertTrue(callable(getattr(P,'last_pregame',None)), 'Missing latest public selection')
            selected=P.last_pregame(root,[d])
            self.assertEqual(selected[0]['capture_path'],last['capture_path'])
            self.assertEqual(P.evaluate(root,[d])[0]['capture_path'],first['capture_path'])
            old={p:p.read_bytes() for folder in ['captures','publication'] for p in (root/folder).glob('*.json')}
            d['schedule'][-1]['home_score']=28
            P.record(root,[d],'2026-09-13T03:00:00Z')
            self.assertEqual(P.last_pregame(root,[d]),selected)
            for p,raw in old.items():self.assertEqual(p.read_bytes(),raw)
