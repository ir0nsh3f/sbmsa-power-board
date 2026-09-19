const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const L=require('../site/league-schedule.js');
const data=JSON.parse(fs.readFileSync(__dirname+'/fixtures/league-baseline-20260909.json'));
test('Soccer age identity, half-goal favorite/total, ranges, cutoff and off default',()=>{
 for(const sport of ['8u','6u']){
  const r=L.buildRows(data,sport,'2026-09-09').find(r=>!r.completed&&r.start);
  for(const margin of [2.26,-2.26,0,.24,-.24,.25,-.25]){
   const f={fixture_id:['fall-2026',sport,r.division,r.home.team,r.away.team,new Date(r.start).toISOString()],margin_home:margin,total:6.26,margin_range:[-10,12],total_range:[0,19],home_gp:0,away_gp:1,division_games:4};
   const p={model:{id:sport+'-gamma-poisson-v1',sport,prior_games:3},forecasts:[f],pooled_games:4};
   const o={showProjections:true,projections:p,now:0};
   assert.deepEqual(L.projectionFor(r,p,0),f);
   const html=L.renderRows([r],o),spread=Math.round(Math.abs(margin)*2)/2;
   assert.ok(html.includes(`Model</b> · ${spread?`${margin>0?r.home.team:r.away.team} −${spread}`:'Pick’em'} · Total 6.5 goals`));
   assert.match(html,/scored GP away 1 \/ home 0/);assert.match(html,/3 prior games/);assert.match(html,/0 scored GP.*extrapolation/);assert.match(html,/-10 to \+12/);assert.match(html,/0–19/);
   assert.doesNotMatch(L.renderRows([r],{...o,showProjections:false}),/league-projection/);
   assert.equal(L.projectionFor(r,p,r.start),null);
   assert.equal(L.projectionFor({...r,completed:true},p,0),null);
   assert.equal(L.projectionFor({...r,start:null},p,0),null);
   assert.equal(L.projectionFor({...r,division:'wrong'},p,0),null);
   assert.equal(L.projectionFor(r,{...p,model:{...p.model,sport:'5ug'}},0),null);
   assert.equal(L.projectionFor(r,{...p,model:{...p.model,prior_games:8}},0),null);
  }
 }
});
