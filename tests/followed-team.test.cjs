const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const L=require('../site/league-schedule.js'),S=require('../site/schedules.js');
const html=fs.readFileSync(require.resolve('../site/index.html'),'utf8');
test('Celtic followed identity is exact in Rankings and Advanced, not a household favorite',()=>{
 const fn=html.match(/function isFollowed\(t\)\{[^\n]+/)[0];
 for(const sport of ['8u','6u','flag','5ug'])for(const division of ['Messi','Pulisic'])for(const team of ['Celtic','Celtics','Celtic United']){
  assert.equal(vm.runInNewContext(fn+';isFollowed(t)',{sport,t:{division,team}}),sport==='8u'&&division==='Messi'&&team==='Celtic');
 }
 assert.match(html,/isFollowed\(t\).*Followed team/);
});
test('followed fixtures highlight either side only in exact league/division; household rows unchanged',()=>{
 const data=JSON.parse(fs.readFileSync(require.resolve('../site/data.json')));
 const household=S.buildRows(data);
 assert.ok(household.length);assert.deepEqual([...new Set(household.map(r=>[r.sport,r.division,r.team,r.child].join('|')))].sort(),['flag|Burrow|Buccaneers|Dexter','8u|Pulisic|Arsenal|Beckham','6u|Messi|Vipers|Dexter'].sort());
 for(const sport of ['8u','6u','flag'])for(const division of ['Messi','Pulisic'])for(const team of ['Celtic','Celtics','Celtic United'])for(const home of [team,'Opponent']){
  const d={sport,division,teams:[],games:[],schedule:[{home,away:home===team?'Opponent':team,date_iso:'2099-09-10'}]};
  const row=L.buildRows({divisions:[d]},sport)[0],expected=sport==='8u'&&division==='Messi'&&team==='Celtic';
  assert.equal(!!row.followedTeam,expected);assert.equal(row.ourTeam,false);
  const rendered=L.renderRows([row]);assert.equal(rendered.includes('league-fixture-ours'),expected);assert.equal(rendered.includes('Followed team'),expected);
 }
 assert.deepEqual(S.buildRows(data),household);
});
