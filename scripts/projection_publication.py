"""Validate before deploy; record exact public-byte observations AFTER deploy."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import time
from datetime import datetime, timezone
from urllib.request import Request, urlopen
try:
    from scripts.projections import load_archive, receipts, observe_public, build, semantic, evaluate, last_pregame, atomic_write, encoded
except ModuleNotFoundError:
    from projections import load_archive, receipts, observe_public, build, semantic, evaluate, last_pregame, atomic_write, encoded

ROOT=Path(__file__).resolve().parents[1]/'site'
PUBLIC='https://ir0nsh3f.github.io/sbmsa-power-board/projections/'

def result_payload(root):
    root=Path(root);data=json.loads((root/'data.json').read_text())
    return dict(schema_version=1,season='fall-2026',selection='last-observed-public-pregame-v1',
                source_checked_at=data['last_successful_check'],
                forecasts=last_pregame(root/'projections',data['divisions']))

def summarize(root=ROOT):
    root=Path(root)
    atomic_write(root/'projections/results.json',encoded(result_payload(root)))

def validate(root=ROOT):
    root=Path(root);directory=root/'projections';index=load_archive(directory);receipts(directory,index)
    data=json.loads((root/'data.json').read_text());current=json.loads((directory/'current.json').read_text())
    expected=build(data['divisions'],data['last_successful_check'])
    assert {k:v for k,v in current.items() if k in expected}=={k:v for k,v in expected.items() if k!='training'}
    entry=next(e for e in index['captures'] if e['path']==current['capture_path'])
    snapshot=json.loads((directory/entry['path']).read_text())
    assert semantic(expected)==semantic(snapshot) and current['captured_at']==snapshot['generated_at']
    if (directory/'results.json').exists():
        assert json.loads((directory/'results.json').read_text())==result_payload(root)
    return index

def observe(root=ROOT):
    root=Path(root);index=validate(root);directory=root/'projections'
    seen={r['capture_path'] for r in receipts(directory,index)}
    run='https://github.com/ir0nsh3f/sbmsa-power-board/actions/runs/'+os.environ['GITHUB_RUN_ID']
    for entry in index['captures']:
        if entry['path'] in seen:continue
        for attempt in range(6):
            try:
                request=Request(PUBLIC+entry['path']+'?observation='+str(time.time_ns()),headers={'Cache-Control':'no-cache'})
                with urlopen(request,timeout=30) as response:raw=response.read()
                if hashlib.sha256(raw).hexdigest()!=entry['sha256']:raise ValueError('Public capture bytes differ')
                observed=datetime.now(timezone.utc).isoformat().replace('+00:00','Z')
                observe_public(directory,entry['path'],raw,observed,run)
                break
            except (OSError,ValueError):
                if attempt==5:raise
                time.sleep(5)
    print(json.dumps({'validated_captures':len(index['captures']),'publication_receipts':len(receipts(directory,index))}))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('command',choices=['validate','observe','evaluate','summarize']);args=parser.parse_args()
    if args.command=='summarize':summarize()
    elif args.command=='observe':observe()
    elif args.command=='validate':
        index=validate();print(json.dumps({'validated_captures':len(index['captures'])}))
    else:
        validate();data=json.loads((ROOT/'data.json').read_text())
        print(json.dumps(evaluate(ROOT/'projections',data['divisions']),indent=2))
