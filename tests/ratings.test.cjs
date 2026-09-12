const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs');
const {spawnSync}=require('node:child_process');
const R=require('../site/ratings.js');
const game=(home,away,home_score,away_score)=>({home,away,home_score,away_score});
const fixture=(games,sport='flag')=>[{sport,division:'D',teams:['A','B','Strong','Weak','Base','Idle'].map(team=>({team,gp:games.filter(g=>[g.home,g.away].includes(team)).length,w:0,l:0,t:0})),games}];
const get=(rows,n)=>rows.find(t=>t.team===n);
test('losing to weak penalizes; records cannot override game-based power',()=>{
 const d=fixture([game('A','Strong',0,10),game('B','Weak',0,10),game('Strong','Base',21,0),game('Weak','Base',0,21)]);
 const rows=R.compute(d,'flag');assert.ok(get(rows,'A').power>get(rows,'B').power);
 const altered=structuredClone(d);altered[0].teams.forEach(t=>{t.w=99;t.l=0;t.t=99;});
 assert.deepEqual(R.compute(altered,'flag').map(t=>[t.team,t.power,t.rank]),rows.map(t=>[t.team,t.power,t.rank]));
});
test('zero and symmetric games tie; GP0 unrated; disconnected groups not calibrated',()=>{
 const d=fixture([game('A','B',0,0),game('Strong','Weak',0,0)]),r=R.compute(d,'flag');
 for(const n of ['A','B','Strong','Weak'])assert.equal(get(r,n).rankText,'T1');
 assert.equal(get(r,'Idle').power,null);assert.equal(get(r,'Idle').rank,null);
 assert.notEqual(get(r,'A').component,get(r,'Strong').component);
 assert.equal(get(r,'A').components,2);
 const separated=R.compute(fixture([game('A','B',10,0),game('Strong','Weak',10,0)]),'flag');
 assert.equal(get(separated,'A').rankText,'T1');
 for(const c of [1,2])assert.ok(Math.abs(separated.filter(t=>t.component===c).reduce((s,t)=>s+t.power,0))<1e-10);
});
test('caps bound blowouts in every sport; units and ridge single-game solution',()=>{
 for(const sport of ['flag','8u','6u']){
  const cap=R.METHOD.caps[sport];
  const a=R.compute(fixture([game('A','B',cap,0)],sport),sport),b=R.compute(fixture([game('A','B',cap*100,0)],sport),sport);
  assert.deepEqual(a,b);assert.ok(Math.abs(get(a,'A').power-cap/5)<1e-10);
  assert.ok(Math.abs(get(a,'B').power+cap/5)<1e-10);
 }
});
test('fixture parity and normal-equation residual verify deterministic convergence',()=>{
 const d=fixture([game('A','B',21,0),game('B','Base',12,0),game('Strong','A',10,0),game('Weak','Strong',1,0),game('A','Base',0,0)]);
 const js=R.compute(d,'flag'),p=spawnSync('python',['-m','scripts.ratings'],{input:JSON.stringify({divisions:d}),encoding:'utf8'});
 assert.equal(p.status,0,p.stderr);const py=JSON.parse(p.stdout).flag;
 js.forEach((t,i)=>{assert.equal(t.rank,py[i].rank);if(t.power!==null)assert.ok(Math.abs(t.power-py[i].power)<1e-10);});
 for(const t of js.filter(t=>t.power!==null)){
  let gradient=3*t.power;
  for(const g of d[0].games){if(![g.home,g.away].includes(t.team))continue;const sign=g.home===t.team?1:-1,m=Math.max(-21,Math.min(21,g.home_score-g.away_score));gradient+=sign*(get(js,g.home).power-get(js,g.away).power-m);}
  assert.ok(Math.abs(gradient)<1e-10);
 }
 const prior=R.METHOD.maxIterations;try{R.METHOD.maxIterations=1;assert.throws(()=>R.compute(d,'flag'),/converge/);}finally{R.METHOD.maxIterations=prior;}
});
test('Python and JS agree numerically on actual results and deterministic ordering',()=>{
 const R=require('../site/ratings.js'),d=JSON.parse(fs.readFileSync('site/data.json'));
 const p=spawnSync('python',['-m','scripts.ratings'],{input:JSON.stringify(d),encoding:'utf8'});
 assert.equal(p.status,0,p.stderr);
 const py=JSON.parse(p.stdout);
 for(const sport of ['flag','8u','6u']){
  const js=R.compute(d.divisions,sport);
  assert.deepEqual(js.map(t=>[t.division,t.team,t.rank,t.component]),py[sport].map(t=>[t.division,t.team,t.rank,t.component]));
  js.forEach((t,i)=>t.power===null?assert.equal(py[sport][i].power,null):assert.ok(Math.abs(t.power-py[sport][i].power)<1e-10));
  assert.deepEqual(R.compute([...d.divisions].reverse().map(d=>({...d,teams:[...d.teams].reverse(),games:[...d.games].reverse()})),sport),js);
 }
});
test('every schedule rank consumer uses canonical power identities',()=>{
 const R=require('../site/ratings.js'),L=require('../site/league-schedule.js'),S=require('../site/schedules.js'),d=JSON.parse(fs.readFileSync('site/data.json'));
 for(const sport of ['flag','8u','6u']){
  const expected=R.compute(d.divisions,sport);
  assert.deepEqual([...L.profiles(d,sport).teams.values()].map(t=>[t.division,t.team,t.rank]).sort(),expected.map(t=>[t.division,t.team,t.rank]).sort());
  for(const row of S.buildRows(d).filter(r=>r.sport===sport)){
   const t=expected.find(t=>t.division===row.division&&t.team===row.opponent);
   assert.equal(row.opponentRank,t.rank?t.rankText:null);
  }
 }
 const html=fs.readFileSync('site/index.html','utf8');
 assert.match(html,/SBMSARatings.compute/);
 assert.match(html,/power-method.html/);
});
test('joint opponent adjustment rewards the same win against a stronger opponent',()=>{
 const R=require('../site/ratings.js');
 const teams=['A','B','Strong','Weak','Base'].map(team=>({team,gp:2,w:1,l:1,t:0}));
 const game=(home,away,home_score,away_score)=>({home,away,home_score,away_score});
 const d=[{sport:'flag',division:'D',teams,games:[game('A','Strong',10,0),game('B','Weak',10,0),game('Strong','Base',21,0),game('Weak','Base',0,21)]}];
 const rows=R.compute(d,'flag'),get=n=>rows.find(t=>t.team===n);
 assert.ok(get('A').power>get('B').power);
 assert.ok(rows.every(t=>Number.isFinite(t.power)));
});
