'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const S=require('../site/schedules.js'),L=require('../site/league-schedule.js'),R=require('../site/ratings.js');
const data=require('../site/data.json');
const label=t=>t.rank?(t.rankText.startsWith('T')?'T#'+t.rank:'#'+t.rank):'—';
const escaped=S.escapeHTML;
test('ties and zero numeric evidence stay tied/unrated beside exact names',()=>{
 const team=(team,extra={})=>({team,w:0,l:0,t:1,gp:1,pf:0,pa:0,margin_sum:0,capped_margin_sum:0,...extra});
 const game=away=>({home:'Buccaneers',away,date_iso:'2026-10-01',home_score:null,away_score:null});
 const d={divisions:[{sport:'flag',division:'Burrow',teams:[team('Buccaneers'),team('Tie'),team('Unplayed',{gp:0}),team('Outcome',{scored_gp:0,outcome_only_gp:1})],games:[{home:'Buccaneers',away:'Tie',home_score:0,away_score:0}],schedule:[game('Tie'),game('Unplayed'),game('Outcome')]},{sport:'flag',division:'Other',teams:[team('Buccaneers'),team('Tie')],games:[],schedule:[]}]};
 for(const ratingMode of ['raw','capped']){
  d.ratingMode=ratingMode;
  for(const r of S.buildRows(d)) for(const layout of ['glance','guide']){
   const html=S.renderHTML([r],'All',layout);
   assert.ok(html.includes('>T#1</span>\u00a0Buccaneers</strong>'));
   assert.ok(html.includes(`>${r.opponent==='Tie'?'T#1':'—'}</span>\u00a0${r.opponent}</strong>`));
   if(r.opponent!=='Tie')assert.match(html,/aria-label="Unrated · no numerically scored game evidence"/);
  }
  const html=L.renderRows(L.buildRows(d,'flag'));
  assert.ok(html.includes('>T#1</span> Buccaneers</b>'));
  for(const name of ['Unplayed','Outcome'])assert.ok(html.includes(`>—</span> ${name}</b>`));
 }
});
test('league away and home power ranks are inside the exact team name, not the mobile record subline',()=>{
 for(const ratingMode of ['raw','capped']) for(const sport of ['flag','8u','6u','5ug']){
  for(const row of L.buildRows({...data,ratingMode},sport)){
   const html=L.renderRows([row]);
   for(const t of [row.away,row.home]) assert.ok(html.includes(`>${label(t)}</span> ${escaped(t.team)}</b>`),`${ratingMode} ${sport}/${t.division}/${t.team}`);
  }
 }
});
test('both Our Teams layouts place canonical selected full-age power beside exact own and opponent names',()=>{
 for(const ratingMode of ['raw','capped']){
  const d={...data,ratingMode};
  for(const row of S.buildRows(d)){
   const board=R.compute(d.divisions,row.sport,ratingMode);
   for(const layout of ['glance','guide']){
    const html=S.renderHTML([row],'All',layout);
    for(const name of [row.team,row.opponent]){
     const t=board.find(t=>t.division===row.division&&t.team===name);
     assert.ok(html.includes(`>${label(t)}</span> ${escaped(name)}</strong>`),`${layout} ${ratingMode} ${row.sport}/${row.division}/${name}`);
    }
   }
  }
 }
});
