"""Deterministic, division-local experimental flag scoring; never historical refits."""
import hashlib
import json
import math
from datetime import datetime, timedelta, timezone
from pathlib import Path
try:
    from scripts.history import encoded, atomic_write
except ModuleNotFoundError:
    from history import encoded, atomic_write

VERSION = 'flag-huber-ridge-v1'
CONFIG = dict(baseline_points=21, baseline_prior=12, team_prior=6, huber_delta=14,
              residual_floor=14, interval_z=1.96, expected_score_max=70,
              lead_minutes=30, iterations=60, home_advantage=0)
SEASON = 'fall-2026'

def digest(value):
    return hashlib.sha256(encoded(value)).hexdigest()

def instant(value):
    try:
        t = datetime.fromisoformat(value.replace('Z','+00:00'))
        return t.astimezone(timezone.utc) if t.tzinfo else None
    except (ValueError, TypeError, AttributeError):
        return None

def identity(d,g):
    return [SEASON,d['sport'],d['division'],g['home'],g['away'],g.get('start_iso')]

def finished(g):
    return all(type(g.get(k)) is int and g[k]>=0 for k in ('home_score','away_score'))

def solve(a,b):
    """Small positive-definite ridge system, pivoted elimination; no dependencies."""
    n=len(b); m=[list(row)+[b[i]] for i,row in enumerate(a)]
    for i in range(n):
        p=max(range(i,n),key=lambda j:abs(m[j][i]));m[i],m[p]=m[p],m[i]
        scale=m[i][i]
        if abs(scale)<1e-12: raise ValueError('Singular projection system')
        m[i]=[v/scale for v in m[i]]
        for j in range(n):
            if j!=i:
                scale=m[j][i];m[j]=[x-scale*y for x,y in zip(m[j],m[i])]
    return [row[-1] for row in m]

def fit(names,games):
    n=1+2*len(names); ids={name:i for i,name in enumerate(names)}
    def vector(offense,defense):
        x=[0.0]*n;x[0]=1;x[1+ids[offense]]=1;x[1+len(names)+ids[defense]]=1
        return x
    obs=[];gp={name:0 for name in names}
    for g in games:
        for side,other in [('home','away'),('away','home')]:
            obs.append((vector(g[side],g[other]),g[side+'_score']));gp[g[side]]+=1
    prior=[CONFIG['baseline_prior']]+[CONFIG['team_prior']]*(n-1)
    beta=[float(CONFIG['baseline_points'])]+[0.]*(n-1)
    for _ in range(CONFIG['iterations']):
        a=[[prior[i] if i==j else 0. for j in range(n)] for i in range(n)]
        b=[prior[0]*CONFIG['baseline_points']]+[0.]*(n-1)
        for x,y in obs:
            residual=y-sum(v*c for v,c in zip(x,beta))
            w=min(1.,CONFIG['huber_delta']/max(abs(residual),1e-12))
            active=[i for i,v in enumerate(x) if v]
            for i in active:
                b[i]+=w*y
                for j in active:a[i][j]+=w
        new=solve(a,b)
        if max(abs(x-y) for x,y in zip(beta,new))<1e-9:
            beta=new;break
        beta=new
    residuals=[y-sum(v*c for v,c in zip(x,beta)) for x,y in obs]
    # Robust residual estimate cannot be driven by one anomalous score.
    sigma=max(CONFIG['residual_floor'],math.sqrt(sum(min(r*r,(2*CONFIG['huber_delta'])**2) for r in residuals)/len(residuals)))
    def predict(home,away):
        xh,xa=vector(home,away),vector(away,home)
        means=[max(0,min(CONFIG['expected_score_max'],sum(v*c for v,c in zip(x,beta)))) for x in (xh,xa)]
        margin,total=means[0]-means[1],sum(means)
        widths=[]
        for sign in (-1,1):
            x=[h+sign*a for h,a in zip(xh,xa)]
            invx=solve(a,x)
            variance=sigma*sigma*(2+max(0,sum(v*c for v,c in zip(x,invx))))
            widths.append(CONFIG['interval_z']*math.sqrt(variance))
        # Total cannot be negative. No artificial upper bound on realized scores.
        return dict(expected_home=round(means[0]),expected_away=round(means[1]),
                    margin_home=round(margin),total=round(total),
                    margin_range=[math.floor(margin-widths[0]),math.ceil(margin+widths[0])],
                    total_range=[max(0,math.floor(total-widths[1])),math.ceil(total+widths[1])],
                    gp_home=gp[home],gp_away=gp[away],division_games=len(games))
    return predict

def semantic(snapshot):
    return {k:v for k,v in snapshot.items() if k not in ('generated_at','training_cutoff')}

def load_archive(directory):
    """Validate every immutable byte/hash and indexed path before any write."""
    root=Path(directory);path=root/'index.json'
    index=json.loads(path.read_text()) if path.exists() else dict(schema_version=1,season=SEASON,captures=[])
    try:
        assert set(index)=={'schema_version','season','captures'}
        assert index['schema_version']==1 and index['season']==SEASON
        seen=set();previous=None
        for entry in index['captures']:
            assert set(entry)=={'path','sha256','generated_at','semantic_sha256'}
            assert entry['path']=='captures/'+entry['sha256']+'.json'
            assert entry['path'] not in seen
            seen.add(entry['path'])
            raw=(root/entry['path']).read_bytes();snapshot=json.loads(raw)
            assert hashlib.sha256(raw).hexdigest()==entry['sha256']
            assert digest(semantic(snapshot))==entry['semantic_sha256']
            assert snapshot['generated_at']==entry['generated_at']==snapshot['training_cutoff']
            captured=instant(snapshot['generated_at']);assert captured is not None
            assert previous is None or captured>previous
            previous=captured
            assert snapshot['schema_version']==1 and snapshot['season']==SEASON
            assert digest(snapshot['training'])==snapshot['training_sha256']
            assert all(instant(g['start_iso'])<captured for d in snapshot['training'] for g in d['games'])
            ids=set()
            for f in snapshot['forecasts']:
                gid=f['game_id'];assert len(gid)==6 and gid[:2]==[SEASON,'flag']
                assert instant(gid[-1])>captured+timedelta(minutes=snapshot['config']['lead_minutes'])
                assert tuple(gid) not in ids;ids.add(tuple(gid))
                assert f['division_games']>0
        assert {str(p.relative_to(root)) for p in (root/'captures').glob('*.json')}==seen
    except (AssertionError,KeyError,TypeError,OSError,ValueError) as exc:
        raise ValueError('Invalid projection archive; preserve files and investigate') from exc
    return index

def receipts(root,index):
    root=Path(root);valid={e['path']:e for e in index['captures']};out=[]
    try:
        for path in (root/'publication').glob('*.json'):
            r=json.loads(path.read_text());entry=valid[r['capture_path']]
            assert set(r)=={'capture_path','sha256','observed_public_at','run_url','schema_version'}
            assert r['schema_version']==1 and r['sha256']==entry['sha256'] and path.name==entry['sha256']+'.json'
            assert instant(r['observed_public_at']) is not None and instant(r['observed_public_at'])>=instant(entry['generated_at'])
            out.append(r)
    except (KeyError,AssertionError,TypeError,ValueError) as exc:
        raise ValueError('Invalid publication receipt; preserve and investigate') from exc
    return out

def observe_public(directory,capture_path,public_bytes,observed_at,run_url):
    """Only call AFTER fetching exact public bytes; observation, not deployment start."""
    root=Path(directory);index=load_archive(root);receipts(root,index)
    entry=next((e for e in index['captures'] if e['path']==capture_path),None)
    if (entry is None or hashlib.sha256(public_bytes).hexdigest()!=entry['sha256'] or
        instant(observed_at) is None or instant(observed_at)<instant(entry['generated_at'])):
        raise ValueError('Public bytes or observation timestamp do not match capture')
    path=root/'publication'/(entry['sha256']+'.json')
    if not path.exists():
        atomic_write(path,encoded(dict(schema_version=1,capture_path=capture_path,sha256=entry['sha256'],
                     observed_public_at=observed_at,run_url=run_url)),immutable=True)

def evaluate(directory,divisions):
    """First *observed-public* pregame forecast only. No refit, no hindsight score."""
    root=Path(directory);index=load_archive(root);first={}
    for receipt in sorted(receipts(root,index),key=lambda r:(instant(r['observed_public_at']),r['capture_path'])):
        snapshot=json.loads((root/receipt['capture_path']).read_text())
        for f in snapshot['forecasts']:
            if instant(receipt['observed_public_at'])<instant(f['game_id'][-1]):
                first.setdefault(tuple(f['game_id']),(f,receipt,snapshot))
    out=[]
    for d in divisions:
        if d['sport']!='flag':continue
        for g in d.get('schedule',[]):
            item=first.get(tuple(identity(d,g)))
            if not finished(g) or item is None:continue
            f,r,snapshot=item;actual=g['home_score']-g['away_score'];total=g['home_score']+g['away_score']
            out.append(dict(game_id=f['game_id'],capture_path=r['capture_path'],model_version=snapshot['model_version'],
                            observed_public_at=r['observed_public_at'],projected_margin_home=f['margin_home'],
                            projected_total=f['total'],actual_margin_home=actual,actual_total=total,
                            margin_error=f['margin_home']-actual,total_error=f['total']-total))
    return sorted(out,key=lambda f:f['game_id'])

def last_pregame(directory,divisions):
    """Latest verified public observation, exact final-game identity; never refit.

    Equal observation instants use lexicographically greatest capture path.
    This presentation selection does not change first-forecast evaluation.
    """
    root=Path(directory);index=load_archive(root);latest={}
    finals={tuple(identity(d,g)) for d in divisions if d['sport']=='flag'
            for g in d.get('schedule',[]) if finished(g) and instant(g.get('start_iso'))}
    for r in sorted(receipts(root,index),key=lambda r:(instant(r['observed_public_at']),r['capture_path'])):
        snapshot=json.loads((root/r['capture_path']).read_text())
        for f in snapshot['forecasts']:
            gid=tuple(f['game_id']);start=instant(gid[-1])
            if gid not in finals or not (instant(r['observed_public_at'])<start and
                    instant(snapshot['training_cutoff'])<start and instant(snapshot['generated_at'])<start):continue
            latest[gid]=dict(game_id=f['game_id'],margin_home=f['margin_home'],total=f['total'],
                model_version=snapshot['model_version'],capture_path=r['capture_path'],sha256=r['sha256'],
                observed_public_at=r['observed_public_at'],captured_at=snapshot['generated_at'])
    return [latest[k] for k in sorted(latest)]


def record(directory,divisions,generated_at):
    root=Path(directory);index=load_archive(root);receipts(root,index)
    snapshot=build(divisions,generated_at);key=digest(semantic(snapshot))
    if index['captures'] and instant(generated_at)<instant(index['captures'][-1]['generated_at']):
        raise ValueError('Cannot backdate projection captures')
    if not index['captures'] or index['captures'][-1]['semantic_sha256']!=key:
        if index['captures'] and instant(generated_at)<=instant(index['captures'][-1]['generated_at']):
            raise ValueError('Changed capture must advance time')
        sha=digest(snapshot);relative='captures/'+sha+'.json'
        entry=dict(path=relative,sha256=sha,generated_at=generated_at,semantic_sha256=key)
        atomic_write(root/relative,encoded(snapshot),immutable=True)
        index['captures'].append(entry)
        try:atomic_write(root/'index.json',encoded(index))
        except Exception:
            (root/relative).unlink();raise
    current={k:v for k,v in snapshot.items() if k!='training'}
    current['capture_path']=index['captures'][-1]['path']
    current['captured_at']=index['captures'][-1]['generated_at']
    current['provenance']='Captured at collection; not an exact publication timestamp. Publication observations are separate receipts.'
    atomic_write(root/'current.json',encoded(current))
    return current

def build(divisions,generated_at):
    cutoff=instant(generated_at)
    if cutoff is None:raise ValueError('Aware collection timestamp required')
    forecasts=[];training=[]
    for d in sorted(divisions,key=lambda d:(d['sport'],d['division'])):
        if d['sport']!='flag':continue
        names=sorted(t['team'] for t in d['teams'])
        games=[{k:g.get(k) for k in ('home','away','start_iso','home_score','away_score')} for g in d.get('schedule',[])
               if finished(g) and instant(g.get('start_iso')) is not None and instant(g['start_iso'])<cutoff]
        games.sort(key=encoded)
        training.append(dict(division=d['division'],teams=names,games=games))
        if not games:continue
        predict=fit(names,games)
        for g in d.get('schedule',[]):
            start=instant(g.get('start_iso'))
            if (start is None or start<=cutoff+timedelta(minutes=CONFIG['lead_minutes']) or
                g.get('home_score') is not None or g.get('away_score') is not None):continue
            forecasts.append(dict(game_id=identity(d,g),**predict(g['home'],g['away'])))
    forecasts.sort(key=lambda f:(f['game_id'][-1],f['game_id']))
    return dict(schema_version=1,season=SEASON,model_version=VERSION,config=CONFIG.copy(),
                generated_at=generated_at,training_cutoff=generated_at,training_sha256=digest(training),
                training=training,forecasts=forecasts)
