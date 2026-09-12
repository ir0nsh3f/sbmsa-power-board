const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const L=require('../site/league-schedule.js');
const data=JSON.parse(fs.readFileSync('tests/fixtures/league-baseline-20260909.json'));
const row={...L.buildRows(data,'flag').find(r=>r.start),completed:true};
const f={game_id:['fall-2026','flag',row.division,row.home.team,row.away.team,new Date(row.start).toISOString()],margin_home:0,total:39,model_version:'flag-huber-ridge-v1',capture_path:'captures/'+ 'a'.repeat(64)+'.json',sha256:'a'.repeat(64),observed_public_at:new Date(row.start-3600000).toISOString(),captured_at:new Date(row.start-7200000).toISOString()};
const payload=forecasts=>({schema_version:1,season:'fall-2026',selection:'last-observed-public-pregame-v1',forecasts});
test('Final details retain last pregame model independently of future toggle',()=>{
 for(const showProjections of [false,true])for(const [margin,label] of [[0,'Pick’em'],[3,row.home.team+' −3'],[-4,row.away.team+' −4']]){
  const html=L.renderRows([row],{showProjections,pregameResults:payload([{...f,margin_home:margin}])});
  assert.doesNotMatch(html.split('</summary>')[0],/Last pregame model/);
  assert.ok(html.split('</summary>')[1].includes('Last pregame model</b> · '+label+' · Total 39'));
  assert.match(html,/Observed public .* CT/);assert.match(html,/Archived capture/);
 }
 assert.doesNotMatch(L.renderRows([{...row,completed:false}],{pregameResults:payload([f])}),/Last pregame|No archived/);
 assert.doesNotMatch(L.renderRows([{...row,sport:'8u'}]),/Last pregame|No archived/);
});
test('Missing malformed late unknown or mismatched archive fails closed',()=>{
 assert.match(L.renderRows([row]),/No archived pregame model/);
 for(const change of [{total:NaN},{margin_home:null},{observed_public_at:new Date(row.start).toISOString()},{captured_at:new Date(row.start).toISOString()},{capture_path:'javascript:alert(1)'},{game_id:['fall-2025',...f.game_id.slice(1)]},{game_id:[...f.game_id.slice(0,5),new Date(row.start+1).toISOString()]}])assert.match(L.renderRows([row],{pregameResults:payload([{...f,...change}])}),/No archived pregame model/);
 assert.match(L.renderRows([{...row,start:null}],{pregameResults:payload([f])}),/No archived pregame model/);
});
