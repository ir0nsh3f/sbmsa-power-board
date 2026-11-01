const test=require('node:test'),assert=require('node:assert/strict'),R=require('../site/ratings.js'),A=require('../site/advanced.js');
const team=(team)=>({team,coach:'C',w:0,l:0,t:1,gp:1,pf:2,pa:2,margin_sum:0,capped_margin_sum:0});
const data=()=>({divisions:['D','E'].map((division,i)=>({sport:'6u',division,teams:[team('A'+i),team('B'+i)],games:[{home:'A'+i,away:'B'+i,home_score:2,away_score:2}]}))});
const p=(name,division)=>({kind:'team',name,coach:'C',identity:{sport:'6u',division,team:name}});
const feed=()=>({sources:[{id:'s',sport:'6u',games:[{id:'g',start_iso:'2026-10-31T15:00:00Z',home:p('A0','D'),away:p('A1','E'),home_score:0,away_score:1}]}]});
const row=f=>f.divisions[0].teams[0];
test('combined crossdivision stats, scoring denominators and latest corrections rebuild without accumulation',()=>{
 const d=data(),s=feed(),f=R.fullSeason(d,s),t=row(f),stats=A.compute(f.divisions,'6u')['["D","A0"]'];
 assert.deepEqual([t.w,t.l,t.t,t.gp,t.scored_gp,t.pf,t.pa],[0,1,1,2,2,2,3]);assert.equal(stats.scored_pg,1);assert.equal(stats.allowed_pg,1.5);assert.equal(stats.close_record.gp,2);
 s.sources[0].games[0].home_score=1;const corrected=R.fullSeason(f,s);assert.deepEqual([row(corrected).l,row(corrected).t,row(corrected).gp],[0,2,2]);assert.equal(row(corrected).pf,3);
 const fallback=R.fullSeason(corrected,null);assert.equal(row(fallback).gp,1);assert.match(row(fallback).record_scope,/unavailable/);assert.deepEqual(fallback.divisions[0].games,d.divisions[0].games);
});
test('duplicate and mirrored fixtures count once; conflicting, unverified, BYE and unplayed count zero',()=>{
 for(const variant of ['duplicate','mirrored','conflict','unverified','bye','unplayed']){
  const s=feed(),g=s.sources[0].games[0];
  if(variant==='duplicate')s.sources[0].games.push(structuredClone(g));
  if(variant==='mirrored')s.sources[0].games.push({...g,id:'mirror',home:g.away,away:g.home,home_score:1,away_score:0});
  if(variant==='conflict')s.sources[0].games.push({...g,home_score:5});
  if(variant==='unverified')g.home.identity=null;
  if(variant==='bye')g.bye=true;
  if(variant==='unplayed')g.home_score=g.away_score=null;
  assert.equal(row(R.fullSeason(data(),s)).gp,['duplicate','mirrored'].includes(variant)?2:1,variant);
 }
});
test('paired-only postseason counts records and SOS but no numeric averages or power; quarantine stays regular scoped',()=>{
 const d=data(),s=feed(),g=s.sources[0].games[0];g.home_score=g.away_score=null;g.home_outcome='W';g.away_outcome='L';
 d.divisions[0].teams[0].unknown_gp=1;d.divisions[0].teams[0].reported_record={w:0,l:1,t:1,gp:2};
 const f=R.fullSeason(d,s),t=row(f);assert.deepEqual([t.w,t.l,t.gp,t.scored_gp,t.outcome_only_gp],[1,0,2,1,1]);assert.deepEqual(t.reported_record,d.divisions[0].teams[0].reported_record);
 assert.equal(A.compute(f.divisions,'6u')['["D","A0"]'].scored_pg,2);assert.deepEqual(R.compute(f.divisions,'6u').map(t=>t.power),R.compute(d.divisions,'6u').map(t=>t.power));
 const py=require('node:child_process').execFileSync(process.env.PYTHON||'python',['-c','import json,sys;from scripts.fullseason import full_season;x=json.load(sys.stdin);print(json.dumps(full_season(x[0],x[1])))'],{cwd:require('node:path').join(__dirname,'..'),input:JSON.stringify([d,s]),encoding:'utf8'});assert.deepEqual(JSON.parse(py),f);
});
