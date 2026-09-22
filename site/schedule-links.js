// Original board navigation only; the standalone 5U exporter does not copy this module.
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.SBMSAScheduleLinks=factory();
})(globalThis,function(){
  'use strict';
  function href(team){
    return '#league-schedule?'+new URLSearchParams({sport:team.sport,division:team.division,team:team.team}).toString();
  }
  function parse(hash,data){
    if(!hash.startsWith('#league-schedule?'))return null;
    const p=new URLSearchParams(hash.split('?').slice(1).join('?'));
    const team={sport:p.get('sport'),division:p.get('division'),team:p.get('team')};
    return ['flag','8u','6u'].includes(team.sport)&&(data?.divisions||[]).some(d=>d.sport===team.sport&&d.division===team.division&&d.teams.some(t=>t.team===team.team))?team:null;
  }
  return {href,parse};
});
