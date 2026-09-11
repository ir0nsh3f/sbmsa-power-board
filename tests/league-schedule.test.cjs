const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const L=require('../site/league-schedule.js');
test('highlight rules prioritize top matchup, require 3 GP each, exclude unknown dates and completed games',()=>{
 const a={rank:2,gp:3,rate:.75,division:'A'},b={...a,rate:.60};
 assert.equal(L.highlight({away:a,home:b,status:'Upcoming',dateISO:'2026-09-10'},8).label,'Top matchup');
 assert.match(L.highlight({away:a,home:b,status:'Upcoming',dateISO:'2026-09-10'},8).reason,/top 2 of 8/);
 const row={away:{...a,rank:3},home:b,status:'Upcoming',dateISO:'2026-09-10'};
 assert.equal(L.highlight(row,8).label,'Close records');
 assert.equal(L.highlight({...row,home:{...b,rate:.599}},8),null);
 for(const gp of [0,1,2])assert.equal(L.highlight({...row,home:{...b,gp}},8),null);
 assert.equal(L.highlight({...row,home:{...b,rank:null}},8),null);
 assert.equal(L.highlight({...row,home:{...b,division:'B'}},8),null);
 for(const status of ['Final','Awaiting result','Date TBD'])assert.equal(L.highlight({...row,status},8),null);
 assert.equal(L.highlight({...row,dateISO:null},8),null);
});
test('all official fixtures retained with exact counts and no premature highlights',()=>{
 const data=JSON.parse(fs.readFileSync(require.resolve('./fixtures/league-baseline-20260909.json')));
 const counts={flag:[112,99,13],'8u':[81,81,0],'6u':[198,198,0]};
 for(const [sport,[all,upcoming,results]] of Object.entries(counts)){
  const rows=L.buildRows(data,sport,'2026-09-09');
  assert.equal(rows.length,all);assert.equal(L.filterRows(rows).length,upcoming);assert.equal(L.filterRows(rows,{filter:'Results'}).length,results);
  assert.equal(rows.filter(r=>r.highlight).length,0);
  for(const d of data.divisions.filter(d=>d.sport===sport))assert.equal(L.filterRows(rows,{filter:'All',division:d.division}).length,d.schedule.length);
  const d=data.divisions.find(d=>d.sport===sport),coach=d.teams[0].coach.toLowerCase();
  assert.deepEqual(L.filterRows(rows,{filter:'All',query:coach}),rows.filter(r=>[r.away,r.home].some(t=>(t.team+' '+t.coach).toLowerCase().includes(coach))));
 }
});
test('CT chronology, date-only/undated ordering, same-day and partial scores never imply draws',()=>{
 const game=(date_iso,start_iso,extra={})=>({away:'a',home:'b',date_iso,start_iso,...extra});
 const data={divisions:[{sport:'8u',division:'A',teams:[team('a'),team('b')],schedule:[game(null,null),game('2026-09-10','2026-09-10T00:30:00Z'),game('2026-09-09',null),game('2026-09-08',null),game('2026-09-09',null,{home_score:0,away_score:0}),game('2026-09-09',null,{home_score:1,away_score:null})]}]};
 const rows=L.buildRows(data,'8u','2026-09-09');
 assert.equal(rows[0].status,'Awaiting result');assert.equal(rows.at(-1).dateISO,null);
 const timed=rows.find(r=>r.start);assert.equal(timed.dateISO,'2026-09-09');assert.equal(timed.timeLabel,'7:30 PM');
 assert.equal(L.filterRows(rows).length,4);assert.equal(L.filterRows(rows,{filter:'Results'}).length,1);
 assert.equal(rows.find(r=>r.completed).status,'Final');
 assert.equal(L.filterRows(rows,{watchlist:true}).length,3);
 assert.equal(L.groupDates(rows).at(-1).dateISO,null);
});
test('render exposes both records, capped ranks, searchable official coaches, map and evidence without unsafe HTML',()=>{
 const data={divisions:[{sport:'8u',division:'Pulisic',url:'https://example.org',teams:[team('Arsenal'),team('<b>')],schedule:[{home:'Arsenal',away:'<b>',date_iso:'2026-09-10',location:'Field',location_url:'https://www.google.com/maps/'}]}]};
 const html=L.renderRows(L.buildRows(data,'8u','2026-09-09'));
 assert.match(html,/&lt;b&gt;/);assert.ok(!html.includes('<b> coach'));assert.match(html,/Arsenal coach/);assert.match(html,/Our team/);assert.match(html,/3–0–0/);assert.match(html,/T1/);assert.match(html,/Top matchup/);assert.match(html,/Both capped ranks/);assert.match(html,/noopener noreferrer/);
 const small=L.renderRows(L.buildRows({divisions:[{...data.divisions[0],teams:[team('Arsenal',1,1),team('<b>',0,0)]}]},'8u','2026-09-09'));
 assert.match(small,/Small sample/);assert.match(small,/Unrated/);assert.ok(!small.includes('Top matchup'));
});
test('favorite block class matches exact sport/division/team, home or away, through filters',()=>{
 const favorites=[['flag','Burrow','Buccaneers'],['8u','Pulisic','Arsenal'],['6u','Messi','Vipers']];
 for(const [sport,division,name] of favorites){
  const divisions=[];
  for(const s of ['flag','8u','6u'])for(const d of [division,'Other']){
   const schedule=[];
   for(const home of [name,'Opponent'])for(const completed of [false,true])schedule.push({home,away:home===name?'Opponent':name,date_iso:'2099-09-10',...(completed?{home_score:1,away_score:0}:{})});
   schedule.push({home:name+' United',away:'Opponent',date_iso:'2099-09-10'});
   divisions.push({sport:s,division:d,teams:[team(name),team(name+' United'),team('Opponent')],schedule});
  }
  for(const s of ['flag','8u','6u']){
   const rows=L.buildRows({divisions},s,'2026-09-09');
   for(const filter of ['Upcoming','Results','All'])for(const watchlist of [false,true])for(const query of ['',name,'Opponent'])for(const d of ['all',division,'Other']){
    const shown=L.filterRows(rows,{filter,watchlist,query,division:d});
    for(const r of shown){
     const expected=s===sport&&r.division===division&&[r.home.team,r.away.team].includes(name);
     assert.equal(r.ourTeam,expected);
     const html=L.renderRows([r]);
     assert.equal(/<details class="league-fixture league-fixture-ours"/.test(html),expected);
     assert.equal(html.includes('Our team'),expected);
    }
   }
  }
 }
});
test('favorite release versions CSS and renderer for returning clients',()=>{
 const html=fs.readFileSync(require.resolve('../site/index.html'),'utf8');
 for(const asset of ['league-schedule.css','league-schedule.js'])assert.ok(html.includes(asset+'?v=20260910-compact-line-1'));
});
const team=(team,gp=3,w=3,margin=9)=>({team,coach:team+' coach',gp,w,l:gp-w,t:0,capped_margin_sum:margin});
test('capped profiles use full sport competition ties and exclude unrated from denominator',()=>{
 const data={divisions:[{sport:'8u',division:'A',teams:[team('a'),team('b'),team('c',3,2),team('u',0,0,0)]},{sport:'8u',division:'B',teams:[team('d',3,1),team('e',3,0)]},{sport:'6u',division:'A',teams:[team('other')]}]};
 const p=L.profiles(data,'8u');
 assert.equal(p.ratedCount,5);assert.equal(p.cutoff,2);
 assert.equal(p.teams.get(JSON.stringify(['A','a'])).rankText,'T1');
 assert.equal(p.teams.get(JSON.stringify(['A','c'])).rank,3);
 assert.equal(p.teams.get(JSON.stringify(['A','u'])).rank,null);
});
