(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.SBMSAFreshness=factory();})(globalThis,function(){
 'use strict';
 function sourceTime(data,sport){
  if(!data?.division_status)return data?.last_successful_check;
  const group=Object.entries(data.division_status).filter(([k])=>k.startsWith(sport+'|')).map(([,v])=>v);
  if(!group.length||group.some(v=>v.status!=='ok'))return null;
  const times=new Set(group.map(v=>v.last_successful_check));return times.size===1?[...times][0]:null;
 }
 function summary(data,sport,now=Date.now()){
  const entries=Object.entries(data?.division_status||{}),group=entries.filter(([k])=>!sport||k.startsWith(sport+'|'));
  const stale=group.filter(([,v])=>v.status!=='ok'||!v.last_successful_check||now-Date.parse(v.last_successful_check)>12*3600000);
  const prefix=data?.status==='partial'?'Partial refresh · ':'';
  if(stale.length&&!sport)return (data.status==='partial'?'Partial · ':data.status==='error'?'Source errors · ':'')+[...new Set(stale.map(([k])=>k.split('|')[0]))].join(', ')+' stale; mixed dates';
  if(stale.length)return prefix+sport+' '+stale.map(([k])=>k.split('|')[1]).join('/')+' stale · mixed freshness'+(group.some(([,v])=>v.status!=='ok')?'; forecasts withheld':'; source check overdue');
  return prefix+(sport||'Sources')+' fresh · checked within 12 hours'+(entries.some(([,v])=>v.status!=='ok')?' · other divisions retained (details)':'');
 }
 return {sourceTime,summary};
});
