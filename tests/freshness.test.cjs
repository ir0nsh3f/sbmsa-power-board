const {test}=require('node:test'),assert=require('node:assert/strict');
const F=require('../site/freshness.js');
test('partial freshness is age scoped and stale data never a fresh forecast',()=>{
 const stamp='2026-10-17T12:00:00Z',old='2026-10-14T21:40:58Z';
 const data={last_checked:stamp,last_successful_check:old,status:'partial',division_status:{'flag|Burrow':{status:'ok',last_successful_check:stamp},'6u|Messi':{status:'ok',last_successful_check:stamp},'6u|Haaland':{status:'error',last_successful_check:old}}};
 assert.equal(F.sourceTime(data,'flag'),stamp);assert.equal(F.sourceTime(data,'6u'),null);
 assert.match(F.summary(data,'flag',Date.parse(stamp)),/flag fresh/);
 assert.match(F.summary(data,'6u',Date.parse(stamp)),/Haaland stale/);
 assert.match(F.summary(data,'6u',Date.parse(stamp)),/mixed freshness/);
 assert.match(F.summary(data,'flag',Date.parse(stamp)),/Partial/);
});
