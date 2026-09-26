const test=require('node:test'),assert=require('node:assert/strict');
const L=require('../site/league-schedule.js');
test('unknown is visible in All, never final/upcoming/forecast, with distinct record coverage',()=>{
 const teams=['Bomb Pops','Lightning'].map(team=>({team,w:0,l:0,t:0,gp:0,pf:0,pa:0,margin_sum:0,capped_margin_sum:0,unknown_gp:1,reported_record:{w:0,l:1,t:0,gp:1}}));
 const data={divisions:[{sport:'6u',division:'Mbappe',teams,games:[],url:'https://sbmsa.net/sites/sbmsa/schedule/742279/',schedule:[{home:'Bomb Pops',away:'Lightning',home_score:null,away_score:null,start_iso:'2026-09-21T17:30:00-05:00',date_iso:'2026-09-21',result_status:'unknown'}]}]};
 const rows=L.buildRows(data,'6u','2026-09-20');assert.equal(rows[0].status,'Result unknown');assert.equal(rows[0].completed,false);
 assert.equal(L.filterRows(rows,{filter:'All'}).length,1);assert.equal(L.filterRows(rows,{filter:'Upcoming'}).length,0);
 const html=L.renderRows(rows);assert.match(html,/Result unknown — source lists L\/L/);assert.match(html,/Official reported record/);assert.match(html,/Verified game record/);assert.doesNotMatch(html,/0–0 Final/);
 assert.equal(L.projectionFor(rows[0],{model:{sport:'6u',id:'6u-gamma-poisson-v1',prior_games:3},forecasts:[{fixture_id:['fall-2026','6u','Mbappe','Bomb Pops','Lightning','2026-09-21T17:30:00-05:00']}]},Date.parse('2026-09-20')),null);
});
