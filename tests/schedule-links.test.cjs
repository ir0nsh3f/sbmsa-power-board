'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const L=require('../site/league-schedule.js');
test('exact selected-team fixture filter does not conflate names or divisions',()=>{
 const row=(division,away,home='Other')=>({sport:'8u',division,away:{team:away},home:{team:home},completed:true});
 const rows=[row('A','United'),row('A','United FC'),row('B','United'),row('A','Other','United')];
 assert.deepEqual(L.filterRows(rows,{filter:'Results',team:{sport:'8u',division:'A',team:'United'}}),[rows[0],rows[3]]);
});
test('bookmark links roundtrip exact unusual identities and reject unknown teams',()=>{
 const N=require('../site/schedule-links.js');
 const team={sport:'8u',division:'A & B',team:'A < B / #? "United"'};
 const data={divisions:[{sport:team.sport,division:team.division,teams:[{team:team.team}]}]};
 assert.deepEqual(N.parse(N.href(team),data),team);
 assert.equal(N.parse(N.href({...team,team:'United'}),data),null);
 assert.equal(N.parse('#league-schedule',data),null);
 assert.equal(N.parse('#league-schedule?team=%ZZ',data),null);
});
