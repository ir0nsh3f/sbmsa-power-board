"""Experimental empirical-Bayes goal counts. Independent of flag and power models."""
import math
from datetime import datetime, timedelta

LEGACY_MODEL = dict(id='5ug-gamma-poisson-v1', sport='5ug', season='fall-2026',
             prior_games=8, minimum_pooled_games=4, dispersion_shape=2,
             interval_mass=.95, cutoff_minutes=30, home_advantage=0)


MODEL = dict(LEGACY_MODEL, id='5ug-gamma-poisson-v2', prior_games=3)
RECOGNIZED_MODELS = {m['id']:m for m in (LEGACY_MODEL, MODEL)}


def recognized(model):
    if not isinstance(model,dict) or RECOGNIZED_MODELS.get(model.get('id')) != model:
        raise ValueError('Unrecognized soccer model configuration')
    return model


def instant(value):
    if not value:
        return None
    try:
        d=datetime.fromisoformat(value.replace('Z','+00:00'))
        return d if d.tzinfo else None
    except (ValueError, TypeError):
        return None


def count_pmf(mean, variance):
    """Negative-binomial predictive distribution from gamma-mixed Poisson rate."""
    shape=mean*mean/variance
    p=shape/(shape+mean)
    out=[p**shape]
    mass=out[0]
    for k in range(1,10000):
        out.append(out[-1]*(k-1+shape)/k*(1-p))
        mass+=out[-1]
        if mass>1-1e-12:
            return out
    raise ValueError('Goal distribution failed to converge')


def interval(distribution):
    mass=0
    lo=hi=None
    for value,p in sorted(distribution.items()):
        mass+=p
        if lo is None and mass>=.025:
            lo=value
        if mass>=.975:
            hi=value
            break
    if lo is None or hi is None:
        raise ValueError('Incomplete predictive distribution')
    return [lo,hi]


def build(divisions, checked, model=None):
    model=recognized(MODEL if model is None else model)
    cutoff=instant(checked)
    if cutoff is None:
        raise ValueError('Aware actual collection time required')
    training=[]
    ds=sorted((d for d in divisions if d['sport']=='5ug'),key=lambda d:d['division'])
    stats={}
    for d in ds:
        for t in d['teams']:
            stats[d['division'],t['team']]=dict(gp=0,gf=0,ga=0)
        for g in d.get('schedule',[]):
            start=instant(g.get('start_iso'))
            if not start or start>=cutoff or not all(type(g.get(k)) is int and g[k]>=0 for k in ('home_score','away_score')):
                continue
            training.append(dict(division=d['division'],**{k:g[k] for k in ('home','away','home_score','away_score','start_iso')}))
    training.sort(key=lambda g:(g['division'],g['start_iso'],g['home'],g['away']))
    for g in training:
        for side,other in [('home','away'),('away','home')]:
            t=stats[g['division'],g[side]]
            t['gp']+=1;t['gf']+=g[side+'_score'];t['ga']+=g[other+'_score']
    goals=[g[k] for g in training for k in ('home_score','away_score')]
    mu=sum(goals)/len(goals) if goals else None
    result=dict(schema_version=1,model=dict(model),generated_at=checked,training_cutoff=checked,
                training=training,pooled_games=len(training),pooled_goals_per_team=mu,forecasts=[])
    if len(training)<model['minimum_pooled_games'] or not mu:
        result['withheld']='Too few scored 5U Girls games (minimum 4 with a positive pooled goal rate).'
        return result
    # Baseline uncertainty: empirical second moment, with an overdispersed floor.
    baseline_var=max(mu+mu*mu/2,sum((x-mu)**2 for x in goals)/len(goals))/len(goals)
    def rate(a,b):
        k=model['prior_games']
        m=((a['gf']+k*mu)/(a['gp']+k)+(b['ga']+k*mu)/(b['gp']+k))/2
        parameter=((a['gf']+k*mu)/(a['gp']+k)**2+(b['ga']+k*mu)/(b['gp']+k)**2)/4+baseline_var
        return m,parameter+m*m/model['dispersion_shape']
    for d in ds:
        for g in d.get('schedule',[]):
            start=instant(g.get('start_iso'))
            if not start or start<=cutoff+timedelta(minutes=model['cutoff_minutes']) or any(g.get(k) is not None for k in ('home_score','away_score')):
                continue
            h,a=stats[d['division'],g['home']],stats[d['division'],g['away']]
            hm,hv=rate(h,a);am,av=rate(a,h)
            hp,ap=count_pmf(hm,hv),count_pmf(am,av)
            margins={};totals={}
            for x,px in enumerate(hp):
                for y,py in enumerate(ap):
                    margins[x-y]=margins.get(x-y,0)+px*py
                    totals[x+y]=totals.get(x+y,0)+px*py
            result['forecasts'].append(dict(fixture_id=['fall-2026','5ug',d['division'],g['home'],g['away'],g['start_iso']],
                home_mean=hm,away_mean=am,margin_home=hm-am,total=hm+am,
                margin_range=interval(margins),total_range=interval(totals),home_gp=h['gp'],away_gp=a['gp'],
                division_games=sum(t['division']==d['division'] for t in training)))
    result['forecasts'].sort(key=lambda f:(instant(f['fixture_id'][-1]),f['fixture_id']))
    return result


# Separate directory and schema: no flag capture, receipt, or evaluator is touched.
import hashlib
import json
from pathlib import Path
try:
    from scripts.history import atomic_write, encoded
except ModuleNotFoundError:
    from history import atomic_write, encoded


def semantic(p):
    return {k:v for k,v in p.items() if k not in ('generated_at','training_cutoff','inputs')}


def load_archive(directory):
    directory=Path(directory)
    path=directory/'index.json'
    index=json.loads(path.read_text()) if path.exists() else dict(schema_version=1,model=MODEL,captures=[])
    if index.get('schema_version')!=1 or index.get('model') not in RECOGNIZED_MODELS.values():
        raise ValueError('Soccer archive model mismatch')
    seen=set();capture_models={}
    for e in index['captures']:
        name=e['sha256']
        if len(name)!=64 or any(c not in '0123456789abcdef' for c in name) or e['path']!=f'captures/{name}.json' or name in seen:
            raise ValueError('Invalid soccer archive path')
        raw=(directory/e['path']).read_bytes()
        if hashlib.sha256(raw).hexdigest()!=name:
            raise ValueError('Soccer capture hash mismatch')
        p=json.loads(raw)
        if p['generated_at']!=e['captured_at'] or dict(build(p['inputs'],p['generated_at'],model=p['model']),inputs=p['inputs'])!=p:
            raise ValueError('Soccer capture not reproducible')
        seen.add(name);capture_models[name]=p['model']['id']
    if {p.stem for p in (directory/'captures').glob('*.json')}!=seen:
        raise ValueError('Unindexed soccer capture; preserve and investigate')
    for path in (directory/'publication').glob('*.json'):
        r=json.loads(path.read_text())
        if path.stem not in seen or r.get('capture_sha256')!=path.stem or r.get('model_id')!=capture_models.get(path.stem) or r.get('sport')!='5ug' or r.get('capture_path')!=f'captures/{path.stem}.json' or instant(r.get('observed_public_at')) is None:
            raise ValueError('Invalid soccer publication receipt')
        e=next(e for e in index['captures'] if e['sha256']==path.stem)
        if instant(r['observed_public_at'])<instant(e['captured_at']):
            raise ValueError('Receipt precedes capture')
    return index


def record(directory,divisions,checked):
    directory=Path(directory);index=load_archive(directory)
    inputs=[dict(sport=d['sport'],division=d['division'],teams=[{'team':t['team']} for t in d['teams']],
                 schedule=[{k:g.get(k) for k in ('home','away','home_score','away_score','start_iso')} for g in d.get('schedule',[])]) for d in divisions if d['sport']=='5ug']
    p=build(inputs,checked)
    previous=json.loads((directory/index['captures'][-1]['path']).read_text()) if index['captures'] else None
    if previous and instant(checked)<instant(previous['generated_at']):
        raise ValueError('Soccer collection predates capture')
    if previous and semantic(previous)==semantic(p):
        e=index['captures'][-1]
    else:
        capture=dict(p,inputs=inputs);raw=encoded(capture);digest=hashlib.sha256(raw).hexdigest()
        e=dict(path=f'captures/{digest}.json',sha256=digest,captured_at=checked)
        atomic_write(directory/e['path'],raw,immutable=True)
        try:
            atomic_write(directory/'index.json',encoded(dict(index,model=MODEL,captures=index['captures']+[e])))
        except Exception:
            (directory/e['path']).unlink()
            raise
    current=dict({k:v for k,v in p.items() if k!='training'},capture_path=e['path'],captured_at=e['captured_at'])
    atomic_write(directory/'current.json',encoded(current))
    return current


def validate(root):
    root=Path(root);directory=root/'soccer-projections';index=load_archive(directory)
    d=json.loads((root/'data.json').read_text());p=build(d['divisions'],d['last_successful_check'])
    current=json.loads((directory/'current.json').read_text())
    e=next(e for e in index['captures'] if e['path']==current['capture_path'])
    expected=dict({k:v for k,v in p.items() if k!='training'},capture_path=e['path'],captured_at=e['captured_at'])
    if current!=expected or semantic(json.loads((directory/e['path']).read_text()))!=semantic(p):
        raise ValueError('Soccer current data disagreement')
    return index


def observe(root):
    import os,time
    from urllib.request import urlopen
    from datetime import timezone
    root=Path(root);index=validate(root);directory=root/'soccer-projections'
    run='https://github.com/ir0nsh3f/sbmsa-power-board/actions/runs/'+os.environ['GITHUB_RUN_ID']
    for e in index['captures']:
        path=directory/'publication'/f"{e['sha256']}.json"
        if path.exists():continue
        for attempt in range(6):
            try:
                with urlopen('https://ir0nsh3f.github.io/sbmsa-power-board/soccer-projections/'+e['path']+'?check='+str(time.time_ns()),timeout=30) as r:raw=r.read()
                if hashlib.sha256(raw).hexdigest()!=e['sha256']:
                    raise ValueError('Public soccer capture bytes differ')
                receipt=dict(schema_version=1,model_id=json.loads(raw)['model']['id'],sport='5ug',capture_path=e['path'],capture_sha256=e['sha256'],observed_public_at=datetime.now(timezone.utc).isoformat().replace('+00:00','Z'),run_url=run)
                atomic_write(path,encoded(receipt),immutable=True)
                break
            except (OSError,ValueError):
                if attempt==5:raise
                time.sleep(5)
    load_archive(directory)


if __name__=='__main__':
    import sys
    root=Path(__file__).resolve().parents[1]/'site'
    if sys.argv[1:]==['observe']:observe(root)
    elif sys.argv[1:]==['validate']:validate(root)
    else:raise SystemExit('Usage: soccer_projections.py validate|observe')
