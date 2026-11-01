const test=require('node:test'),assert=require('node:assert/strict'),R=require('../site/ratings.js');
const fixture=()=>({divisions:['D','E'].map((division,i)=>({sport:'8u',division,teams:['A','B'].map(team=>({team:team+i,coach:'Coach',gp:1,w:0,l:0,t:1})),games:[{home:'A'+i,away:'B'+i,home_score:0,away_score:0}]}))});
const participant=(name,division)=>({name,kind:'team',coach:'Coach',identity:{sport:'8u',division,team:name}});
const playoff=()=>({sources:[{id:'source',sport:'8u',status:'ok',last_successful_check:new Date().toISOString(),games:[{id:'source:knockout:G1',home:participant('A0','D'),away:participant('A1','E'),home_score:8,away_score:0}]}]});
test('full-season crossdivision fit changes both sides and their regular opponents without changing source records',()=>{
 const d=fixture(),original=JSON.stringify(d),p=playoff();
 assert.equal(typeof R.fullSeason,'function','canonical full-season builder is required');
 const f=R.fullSeason(d,p);assert.equal(JSON.stringify(d),original);
 assert.equal(f.coverage.included,1);
 const r=R.compute(f.divisions,'8u','capped');
 assert.ok(r.find(t=>t.team==='A0').power>0);assert.ok(r.find(t=>t.team==='A1').power<0);
 assert.ok(r.find(t=>t.team==='B0').power>0);assert.ok(r.find(t=>t.team==='B1').power<0);
 assert.equal(new Set(r.map(t=>t.component)).size,1);
 assert.equal(f.divisions[0].power_games[1].away_division,'E');
 assert.ok(Math.abs(R.compute(f.divisions,'8u','raw')[0].power/r[0].power-8/3)<1e-10);
});
test('duplicates, conflicting scores, unknown identities and nonnumeric finals never accumulate',()=>{
 const d=fixture(),p=playoff(),g=p.sources[0].games[0];
 p.sources[0].games.push(structuredClone(g),{...g,id:'blank',home_score:null},{...g,id:'WL',home_score:'W',away_score:'L'},{...g,id:'bye',bye:true},{...g,id:'alias',home:{...g.home,name:'Dinscores'}},{...g,id:'wrong',away:{...g.away,identity:{...g.away.identity,division:'D'}}});
 const f=R.fullSeason(d,p);assert.equal(f.coverage.included,1);assert.equal(f.coverage.excluded.length,6);
 assert.deepEqual(R.fullSeason(f,p),f);
 const conflict=playoff();conflict.sources[0].games.push({...conflict.sources[0].games[0],home_score:9});
 assert.equal(R.fullSeason(d,conflict).coverage.included,0);
 const mirrored=playoff(),m=mirrored.sources[0].games[0];m.start_iso='2026-11-01T10:00:00Z';mirrored.sources[0].games.push({...m,id:'second-representation',home:m.away,away:m.home,home_score:m.away_score,away_score:m.home_score});
 assert.equal(R.fullSeason(d,mirrored).coverage.included,1);
});
test('a playoff-only numeric result rates a team without inventing a regular-season GP',()=>{
 const d=fixture();for(const div of d.divisions){div.games=[];div.teams.forEach(t=>t.gp=0);}
 const f=R.fullSeason(d,playoff()),rows=R.compute(f.divisions,'8u','capped');assert.ok(rows.find(t=>t.team==='A0').power>0);assert.equal(rows.find(t=>t.team==='A0').gp,1);assert.equal(rows.find(t=>t.team==='A0').regular_record.gp,0);assert.equal(rows.find(t=>t.team==='B0').power,null);
});
test('division comparison equally weights all roster teams and exposes graph coverage and crossdivision records',()=>{
 const f=R.fullSeason(fixture(),playoff());
 assert.equal(typeof R.divisionSummary,'function');
 const summary=R.divisionSummary(f.divisions,'8u','capped',f.coverage);
 assert.equal(summary.crossGames,1);assert.equal(summary.connected,true);
 assert.equal(summary.divisions[0].teams,2);assert.ok(summary.divisions[0].mean>0);
 assert.deepEqual(summary.divisions[0].record,[1,0,0]);
 assert.equal(R.divisionSummary(fixture().divisions,'8u','capped',{crossDivision:[]}).connected,false);
});
test('postseason load installs one shared combined input, with last-good retention and honest missing coverage',async()=>{
 const P=require('../site/playoffs.js'),d=fixture(),p=playoff(),old=global.fetch;
 try{global.fetch=async()=>({ok:true,json:async()=>({...p,schema:1,season:'fall-2026'})});await P.load(d);
 assert.equal(d.powerCoverage?.included,1);
 assert.deepEqual([...P.profiles(d,'8u').values()].map(t=>t.power),R.compute(d.divisions,'8u','capped').map(t=>t.power));
 global.fetch=async()=>{throw Error('offline')};await P.load(d);assert.equal(d.powerCoverage.included,1);assert.equal(d.playoffError,true);
 const empty=fixture();await P.load(empty);assert.equal(empty.powerCoverage.missing,true);
 }finally{global.fetch=old;}
});
