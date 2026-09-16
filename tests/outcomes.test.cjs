const {test}=require('node:test'),assert=require('node:assert/strict');
const L=require('../site/league-schedule.js'),S=require('../site/schedules.js'),A=require('../site/advanced.js'),R=require('../site/ratings.js');
function data(){return {divisions:[{sport:'6u',division:'Messi',url:'https://sbmsa.net/',teams:[{team:'Vipers',w:1,l:1,t:0,gp:2,scored_gp:1,outcome_only_gp:1,pf:4,pa:1,margin_sum:3,capped_margin_sum:3},{team:'Other',w:1,l:1,t:0,gp:2,scored_gp:1,outcome_only_gp:1,pf:1,pa:4,margin_sum:-3,capped_margin_sum:-3}],games:[{home:'Vipers',away:'Other',home_score:4,away_score:1},{home:'Vipers',away:'Other',home_score:null,away_score:null,home_outcome:'L',away_outcome:'W'}],schedule:[{home:'Vipers',away:'Other',home_score:null,away_score:null,home_outcome:'L',away_outcome:'W',date_iso:'2026-09-12',start_iso:'2026-09-12T14:45:00-05:00'}]}]};}
test('outcome-only final direction in league and both Our Teams layouts',()=>{
 for(const [h,a] of [['L','W'],['W','L']]){
 const d=data();Object.assign(d.divisions[0].schedule[0],{home_outcome:h,away_outcome:a});
 const l=L.buildRows(d,'6u','2026-09-16');assert.equal(l[0].completed,true);assert.equal(l[0].status,'Final');
 assert.match(L.renderRows(l),new RegExp(`Other ${a} – Vipers ${h} · score unavailable`));
 assert.equal(L.filterRows(l,{filter:'Results'}).length,1);assert.equal(L.filterRows(l).length,0);
 const s=S.buildRows(d,'2026-09-16');assert.equal(s[0].status,h);
 for(const layout of ['guide','glance']){const html=S.renderHTML(s,'Results',layout);assert.match(html,/score unavailable/);assert.doesNotMatch(html,/null–null|0–0/);}
 }
});
test('SOS uses official outcome records but adjusted margins use scored evidence only',()=>{
 const d=data();d.divisions[0].games.push({home:'Other',away:'C',home_score:null,away_score:null,home_outcome:'W',away_outcome:'L'});
 const s=A.compute(d.divisions,'6u')[JSON.stringify(['Messi','Vipers'])];
 assert.equal(s.sos,1);assert.equal(s.sos_coverage,1);assert.equal(s.adjusted_margin,null);
});
test('numeric evidence denominators differ from official records; power ignores outcomes',()=>{
 const d=data(),t=A.compute(d.divisions,'6u')[JSON.stringify(['Messi','Vipers'])];
 assert.equal(t.scored_pg,4);assert.equal(t.allowed_pg,1);assert.equal(t.raw_margin,3);assert.equal(t.points_pg,1.5);
 const before=R.compute(d.divisions,'6u').map(t=>[t.team,t.power]);d.divisions[0].games.pop();assert.deepEqual(R.compute(d.divisions,'6u').map(t=>[t.team,t.power]),before);
 d.divisions[0].games=[];d.divisions[0].teams.forEach(t=>Object.assign(t,{scored_gp:0,pf:0,pa:0,margin_sum:0,capped_margin_sum:0}));
 assert.equal(A.compute(d.divisions,'6u')[JSON.stringify(['Messi','Vipers'])].scored_pg,null);assert.ok(R.compute(d.divisions,'6u').every(t=>t.rank===null));
});
