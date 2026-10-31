"""Independent official Fall 2026 postseason feed. Never feeds regular-season models."""
import json,re,hashlib
from pathlib import Path
from datetime import datetime,timezone
from bs4 import BeautifulSoup
try:
 from scripts.update_results import text,schedule_dates,safe_location_url,parse_result,fetch_html
 from scripts.history import atomic_write,encoded
except ModuleNotFoundError:
 from update_results import text,schedule_dates,safe_location_url,parse_result,fetch_html
 from history import atomic_write,encoded
SOURCES=[dict(id=str(i),sport=s,tier=t,url=f'https://sbmsa.net/sites/sbmsa/schedule/{i}/{slug}') for i,s,t,slug in [
 (710237,'8u','Gold','8U-Boys-Gold-Playoffs'),(710238,'8u','Silver','8U-Boys-Silver-Playoffs'),
 (710226,'6u','Gold','6U-Boys-Gold-Playoffs'),(710227,'6u','Silver','6U-Boys-Silver-Playoffs'),(710228,'6u','Bronze','6U-Boys-Bronze-Playoffs'),
 (710217,'5ug','Gold','5U-Girls-Gold-Playoffs'),(710218,'5ug','Silver','5U-Girls-Silver-Playoffs'),(710219,'5ug','Bronze','5U-Girls-Bronze-Playoffs')]]
def participant(label,coach=''):
 label=label.strip()
 path=re.fullmatch(r'(G\d+) (Winner|Loser)',label)
 if path:return dict(label=label,name=None,kind='path',game=path[1],outcome=path[2],coach=coach)
 if label.upper() in ('','TBD','TBA','BYE'):return dict(label=label or 'TBD',name=None,kind='bye' if label.upper()=='BYE' else 'pending',coach=coach)
 m=re.fullmatch(r'(?:\((\d+)\) )?(.+?)(?: \(([A-Z])\))?',label)
 if not m:raise ValueError('Invalid participant')
 return dict(label=label,name=m[2],seed=m[1],pool=m[3],kind='team',coach=coach)
def parse(html,source):
 soup=BeautifulSoup(html,'html.parser')
 def table(suffix):
  matches=soup.select('table[id$="_'+suffix+'"]')
  if len(matches)>1:raise ValueError('Duplicate desktop table')
  return matches[0] if matches else None
 standings=table('standingsGrid_ctl00');schedule=table('ScheduleGrid_ctl00');knockout=table('PlayoffGrid_ctl00');bracket=table('BracketsTable')
 if knockout is None or bracket is None:raise ValueError('Missing official knockout/bracket tables')
 pools=[];roster={}
 if standings:
  headers=[text(x) for x in standings.select('thead th')]
  pool=None
  for row in standings.select('tbody > tr'):
   if 'rgGroupHeader' in row.get('class',[]):
    m=re.fullmatch(r'Pool: ([A-Z])',text(row))
    if not m:raise ValueError('Unknown pool group')
    pool=dict(name=m[1],teams=[]);pools.append(pool);continue
   cells=row.find_all('td',recursive=False)
   if not cells:continue
   if len(cells)!=len(headers) or pool is None:raise ValueError('Invalid standings row')
   values=dict(zip(headers,map(text,cells)));p=participant(values['Team'],values.get('Coach',''))
   if not p['name'] or p['name'] in roster:raise ValueError('Invalid/duplicate roster')
   p['pool']=pool['name'];p['record']={k:values[k] for k in ('W','L','T','PTS') if k in values}
   if any(not v.isdigit() for v in p['record'].values()):raise ValueError('Malformed pool record')
   roster[p['name']]=p;pool['teams'].append(p)
 if bool(standings)!=bool(schedule):raise ValueError('Incomplete pool tables')
 games=[];ids=set()
 for phase,t in [('pool',schedule),('knockout',knockout)]:
  if t is None:continue
  group=''
  for row in t.select('tbody > tr'):
   if 'rgGroupHeader' in row.get('class',[]):group=text(row);continue
   if not row.select('[id$=HomeLabel]'):continue
   get=lambda suffix:text(row.select_one('[id$="'+suffix+'"]'))
   home,away=participant(get('HomeLabel')),participant(get('AwayLabel'))
   bye=get('TimeLabel').upper()=='BYE' or any(p['kind']=='bye' for p in (home,away))
   date,start=schedule_dates(get('DateLabel'),'' if bye else get('TimeLabel'))
   result=parse_result(get('HomeScoreLabel'),get('AwayScoreLabel'))
   for p in (home,away):
    if p['name'] in roster:
     r=roster[p['name']]
     if p.get('pool') and p['pool']!=r['pool']:raise ValueError('Wrong pool')
     p['coach']=r['coach'];p['pool']=r['pool']
    if phase=='pool' and not bye and p['name'] not in roster:raise ValueError('Unknown pool participant')
   if phase=='pool' and not bye and home['pool']!=away['pool']:raise ValueError('Cross-pool game')
   number=get('GameLabel')
   identity=number if phase=='knockout' else hashlib.sha256(encoded([home['label'],away['label']])).hexdigest()[:16]
   if phase=='knockout' and not re.fullmatch('G[0-9]+',number):raise ValueError('Missing knockout ID')
   uid=source['id']+':'+phase+':'+identity
   if uid in ids:raise ValueError('Duplicate game')
   ids.add(uid)
   link=row.select_one('a[id$=LocationLink]')
   games.append(dict(id=uid,phase=phase,round=group,number=number,home=home,away=away,date=get('DateLabel'),time=get('TimeLabel'),date_iso=date,start_iso=start,location=get('ScheduleLabel') or get('LocationLabel'),location_url=safe_location_url(link.get('href') if link else None,source['url']),bye=bye,**result))
 expected={'710237':(8,12,3),'710238':(0,0,10),'710226':(12,18,5),'710227':(0,0,11),'710228':(0,0,11),'710217':(8,12,3),'710218':(0,0,7),'710219':(0,0,7)}[source['id']]
 if (len(roster),sum(g['phase']=='pool' for g in games),sum(g['phase']=='knockout' for g in games))!=expected:raise ValueError('Official postseason structure changed or incomplete; review before accepting')
 nodes={g['number']:g for g in games if g['phase']=='knockout'}
 for g in games:
  for p in (g['home'],g['away']):
   if p['kind']=='path' and (p['game'] not in nodes or int(p['game'][1:])>=int(g['number'][1:])):raise ValueError('Invalid winner path')
 # Bracket is a second representation, not another set of matches. Verify its nodes.
 inside=bracket.select('td.bracketsInside');seen=set()
 for cell in inside:
  labels=cell.get_text('|',strip=True).replace('\xa0',' ').split('|');number=labels[0].strip()
  if number not in nodes or number in seen:raise ValueError('Bracket game mismatch')
  seen.add(number);g=nodes[number];box=cell.find_parent('table')
  teams=[text(td).replace('\xa0',' ') for td in box.select('td') if any('TopTeam' in c or 'BottomTeam' in c for c in td.get('class',[]))]
  # Official completed nodes append each team's score in parentheses. Match
  # exact label AND its scheduled score; never strip arbitrary numeric suffixes
  # or infer home/away orientation from bracket top/bottom positions.
  expected_teams=[g[k]['label']+(f" ({g[k+'_score']})" if g[k+'_score'] is not None else '') for k in ('home','away')]
  if sorted(teams)!=sorted(expected_teams):raise ValueError('Bracket participants or scores disagree')
 if seen!=set(nodes):raise ValueError('Incomplete bracket')
 return dict(source,pools=pools,games=games)

def join(d,regular):
 """Exact unique age/name; when a postseason coach exists it must also match."""
 for p in [t for pool in d['pools'] for t in pool['teams']]+[g[k] for g in d['games'] for k in ('home','away')]:
  p['identity']=None
  if p['kind']!='team':continue
  found=[(div,t) for div in regular['divisions'] if div['sport']==d['sport'] for t in div['teams'] if t['team']==p['name'] and (not p['coach'] or t.get('coach')==p['coach'])]
  if len(found)==1:
   div,t=found[0];p['identity']=dict(sport=d['sport'],division=div['division'],team=t['team']);p['regular_coach']=t.get('coach','');p['identity_basis']='exact age/name'+('/coach' if p['coach'] else ' (unique; postseason coach absent)')
 return d

def collect(output,regular,fetch=fetch_html,now=None):
 output=Path(output);previous=json.loads(output.read_text()) if output.exists() else {};sources=[]
 for spec in SOURCES:
  old=next((s for s in previous.get('sources',[]) if s['id']==spec['id']),None)
  stamp=now or datetime.now(timezone.utc).isoformat()
  try:
   d=join(parse(fetch(spec['url']),spec),regular)
   d.update(status='ok',last_checked=stamp,last_successful_check=stamp,error=None)
  except Exception as exc:
   d=dict(old or dict(spec,pools=[],games=[],last_successful_check=None),status='error',last_checked=stamp,error=type(exc).__name__+': '+str(exc))
  sources.append(d)
 payload=dict(schema=1,season='fall-2026',sources=sources)
 atomic_write(output,encoded(payload));return payload
if __name__=='__main__':
 root=Path(__file__).resolve().parents[1]/'site'
 payload=collect(root/'playoffs.json',json.loads((root/'data.json').read_text()))
 print(json.dumps({s['id']:{'status':s['status'],'games':len(s['games']),'error':s['error']} for s in payload['sources']}))
