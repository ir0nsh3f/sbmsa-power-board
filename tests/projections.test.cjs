const test=require('node:test'),assert=require('node:assert/strict');
const L=require('../site/league-schedule.js');
const fs=require('node:fs');
test('Compact model line uses the favorite negative spread, rounded zero is pick’em',()=>{
 const data=JSON.parse(fs.readFileSync(__dirname+'/fixtures/league-baseline-20260909.json'));
 const r=L.buildRows(data,'flag','2026-09-09').find(r=>!r.completed&&r.start>Date.parse('2026-09-10'));
 for(const [margin,line] of [[3,`${r.home.team} −3`],[-3,`${r.away.team} −3`],[0,'Pick’em'],[.4,'Pick’em'],[-.4,'Pick’em'],[2.6,`${r.home.team} −3`],[-2.6,`${r.away.team} −3`]]){
  const f={game_id:['fall-2026','flag',r.division,r.home.team,r.away.team,new Date(r.start).toISOString()],margin_home:margin,total:33,margin_range:[-40,44],total_range:[0,85],gp_home:0,gp_away:1,division_games:4};
  const options={projections:{model_version:'flag-huber-ridge-v1',forecasts:[f]},showProjections:true,now:0};
  const html=L.renderRows([r],options),summary=html.split('</summary>')[0],detail=html.split('</summary>')[1];
  assert.ok(summary.includes(`<b>Model</b> · ${line} · Total 33`),summary);
  assert.doesNotMatch(summary,/Home margin|95%|division games|very small sample/);
  assert.match(summary,/league-match[\s\S]*league-projection[\s\S]*league-meta/);
  assert.match(detail,/Home margin/);assert.match(detail,/-40 to \+44/);assert.match(detail,/0–85/);
  assert.match(detail,/GP away 1 \/ home 0/);assert.match(detail,/4 division games/);
  assert.match(detail,/0 GP.*extrapolation/);assert.match(detail,/prior-heavy/);
  assert.doesNotMatch(L.renderRows([r],{...options,showProjections:false}),/league-projection|Home margin/);
 }
});
test('Projection only for exact future flag identity; no chronology/rank/watchlist changes',()=>{
 const data=JSON.parse(fs.readFileSync(__dirname+'/fixtures/league-baseline-20260909.json'));
 const rows=L.buildRows(data,'flag','2026-09-09'),r=rows.find(r=>!r.completed&&r.start>Date.parse('2026-09-10'));
 const f={game_id:['fall-2026','flag',r.division,r.home.team,r.away.team,new Date(r.start).toISOString()],margin_home:2,total:40,margin_range:[-40,44],total_range:[0,85],gp_home:1,gp_away:1,division_games:4};
 const p={model_version:'flag-huber-ridge-v1',forecasts:[f]};
 assert.ok(L.projectionFor(r,p,Date.parse('2026-09-09')));
 assert.equal(L.projectionFor(r,p,r.start),null);
 assert.equal(L.projectionFor({...r,sport:'8u'},p,0),null);
 assert.equal(L.projectionFor({...r,start:null},p,0),null);
 assert.equal(L.projectionFor({...r,division:'Other'},p,0),null);
 assert.equal(L.projectionFor({...r,completed:true},p,0),null);
 assert.equal(L.renderRows([r]).includes('Experimental ·'),false);
 const html=L.renderRows([r],{projections:p,showProjections:true,now:Date.parse('2026-09-09')});
 assert.match(html,/Experimental · very small sample/);assert.match(html,/Home margin/);assert.match(html,/Total/);assert.match(html,/GP/);
 assert.deepEqual(L.filterRows(rows,{watchlist:true}),rows.filter(r=>r.highlight));
 assert.deepEqual(L.buildRows(data,'flag','2026-09-09'),rows);
});
