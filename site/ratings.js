/* Canonical power rankings. No dependence on records or projection models. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.SBMSARatings=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const V2={id:'opponent-ridge-margin-v2',caps:{flag:21,'8u':3,'6u':3},ridge:3,tolerance:1e-12,maxIterations:10000,tieDecimals:8};
  const METHOD={...V2,id:'opponent-ridge-margin-v3',default_mode:'raw',modes:['raw','capped']};
  const CAPS={...METHOD.caps,'5ug':3}; // Preserve historical method metadata.
  const key=(division,team)=>JSON.stringify([division,team]);
  const compare=(a,b)=>a<b?-1:a>b?1:0;
  // Additive, browser-only power inputs. Regular games/stats and forecast inputs stay intact.
  function fullSeason(data,postseason){
    const divisions=data.divisions.map(d=>({...d,power_games:[...(d.games||[])]}));
    const coverage={scope:'regular-plus-verified-playoffs-v1',included:0,excluded:[],sources:[],missing:!postseason,crossDivision:[]};
    const roster=divisions.flatMap(d=>d.teams.map(t=>({sport:d.sport,division:d.division,...t})));
    const candidates=[];
    for(const s of postseason?.sources||[]){
      if(!divisions.some(d=>d.sport===s.sport))continue;
      coverage.sources.push({id:s.id,sport:s.sport,status:s.status,last_successful_check:s.last_successful_check,error:s.error||null});
      for(const g of s.games||[]){
        let reason=null;
        const match=p=>{if(!p||p.kind!=='team')return null;const found=roster.filter(t=>t.sport===s.sport&&t.team===p.name&&(!p.coach||p.coach===t.coach));const t=found.length===1?found[0]:null;return t&&p.identity&&p.identity.sport===t.sport&&p.identity.division===t.division&&p.identity.team===t.team?t:null;};
        const h=match(g.home),a=match(g.away);
        if(g.bye)reason='bye';
        else if(![g.home_score,g.away_score].every(n=>Number.isInteger(n)&&n>=0))reason='no numeric final';
        else if(!h||!a||key(h.division,h.team)===key(a.division,a.team))reason='unverified identity';
        else if(!g.id)reason='missing match ID';
        if(reason){coverage.excluded.push({source:s.id,id:g.id||null,sport:s.sport,reason});continue;}
        const identity=JSON.stringify([s.id,g.id]);
        const sides=[[h.division,h.team,g.home_score],[a.division,a.team,g.away_score]].sort((x,y)=>compare(JSON.stringify(x.slice(0,2)),JSON.stringify(y.slice(0,2))));
        const stamp=g.start_iso||(g.date_iso?g.date_iso+' '+(g.time||''):null);
        const fixture=stamp?JSON.stringify([s.sport,stamp,sides.map(x=>x.slice(0,2))]):identity;
        candidates.push({s,g,h,a,identity,fixture,signature:JSON.stringify(sides)});
      }
    }
    const ids=new Map(),fixtures=new Map();
    for(const c of candidates)for(const [m,k] of [[ids,c.identity],[fixtures,c.fixture]]){if(!m.has(k))m.set(k,new Set());m.get(k).add(c.signature);}
    const seenIDs=new Set(),seenFixtures=new Set();
    for(const c of candidates){
      const {s,g,h,a}=c;let reason=null;
      if(ids.get(c.identity).size>1||fixtures.get(c.fixture).size>1)reason='conflicting duplicate';
      else if(seenIDs.has(c.identity)||seenFixtures.has(c.fixture))reason='duplicate';
      if(reason){coverage.excluded.push({source:s.id,id:g.id,sport:s.sport,reason});continue;}
      seenIDs.add(c.identity);seenFixtures.add(c.fixture);
      const game={id:g.id,source:s.id,scope:'playoffs',home:h.team,away:a.team,home_division:h.division,away_division:a.division,home_score:g.home_score,away_score:g.away_score};
      divisions.find(d=>d.sport===s.sport&&d.division===h.division).power_games.push(game);coverage.included++;
      if(h.division!==a.division)coverage.crossDivision.push({...game,sport:s.sport});
    }
    return {divisions,coverage};
  }
  function compute(divisions,sport,mode='raw'){
    if(!['raw','capped'].includes(mode))throw Error('Unknown power-rating mode');
    const all=divisions.filter(d=>d.sport===sport).flatMap(d=>d.teams.map(t=>({...t,division:d.division,rank:null,rankText:'Unrated',power:null,component:null,rate:t.gp?(t.w+.5*t.t)/t.gp:null}))).sort((a,b)=>compare(key(a.division,a.team),key(b.division,b.team)));
    const ids=new Map(all.map((t,i)=>[key(t.division,t.team),i])),edges=all.map(()=>[]),rhs=all.map(()=>0),cap=mode==='capped'?CAPS[sport]:Infinity;
    if(!CAPS[sport])throw Error('Unknown power-rating sport');
    const games=[];
    for(const d of divisions.filter(d=>d.sport===sport))for(const g of d.power_games||d.games||[]){
      if(![g.home_score,g.away_score].every(Number.isFinite))continue;
      const h=ids.get(key(g.home_division||d.division,g.home)),a=ids.get(key(g.away_division||d.division,g.away));
      if(h===undefined||a===undefined||h===a)throw Error('Invalid power-rating game identity');
      games.push([h,a,Math.max(-cap,Math.min(cap,g.home_score-g.away_score))]);
    }
    games.sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]);
    for(const [h,a,m] of games){edges[h].push(a);edges[a].push(h);rhs[h]+=m;rhs[a]-=m;}
    let r=all.map(()=>0),converged=false;
    // Jacobi is a contraction: degree/(degree+ridge)<1. Fixed order, zero start.
    for(let iter=0;iter<METHOD.maxIterations;iter++){
      const next=r.map((_,i)=>(rhs[i]+edges[i].reduce((s,j)=>s+r[j],0))/(edges[i].length+METHOD.ridge));
      const delta=Math.max(0,...next.map((x,i)=>Math.abs(x-r[i])));r=next;
      if(delta<=METHOD.tolerance){converged=true;break;}
    }
    if(!converged)throw Error('Power ratings failed to converge');
    let component=0;
    all.forEach((t,i)=>{if(!edges[i].length||t.component!==null)return;component++;const stack=[i];t.component=component;while(stack.length){const j=stack.pop();for(const k of edges[j])if(all[k].component===null){all[k].component=component;stack.push(k);}}});
    all.forEach((t,i)=>{if(edges[i].length&&(t.gp>0||divisions.some(d=>d.sport===sport&&d.power_games)))t.power=r[i];});
    const rounded=t=>Math.round(t.power*1e8)/1e8;
    const rated=all.filter(t=>t.power!==null).sort((a,b)=>rounded(b)-rounded(a)||compare(a.team,b.team)||compare(a.division,b.division));
    let anchor=null;const counts={};
    rated.forEach((t,i)=>{if(anchor===null||rounded(t)!==rounded(anchor)){t.rank=i+1;anchor=t;}else t.rank=anchor.rank;counts[t.rank]=(counts[t.rank]||0)+1;});
    rated.forEach(t=>{t.tied=counts[t.rank]>1;t.rankText=(t.tied?'T':'')+t.rank;});
    all.forEach(t=>{t.components=component;t.tied=!!t.tied;});
    return rated.concat(all.filter(t=>t.power===null).sort((a,b)=>compare(a.team,b.team)||compare(a.division,b.division)));
  }
  function divisionSummary(divisions,sport,mode,coverage){
    const rows=compute(divisions,sport,mode),games=(coverage?.crossDivision||[]).filter(g=>g.sport===sport);
    const components=[...new Set(rows.map(t=>t.component))];
    return {crossGames:games.length,connected:components.length===1&&components[0]!==null,components:components.filter(c=>c!==null).length,
      divisions:divisions.filter(d=>d.sport===sport).map(d=>{const teams=rows.filter(t=>t.division===d.division),played=games.filter(g=>[g.home_division,g.away_division].includes(d.division)),record=[0,0,0];
        for(const g of played){const m=(g.home_score-g.away_score)*(g.home_division===d.division?1:-1);record[m>0?0:m<0?1:2]++;}
        return {division:d.division,teams:teams.length,rated:teams.filter(t=>t.power!==null).length,mean:teams.every(t=>t.power!==null)?teams.reduce((s,t)=>s+t.power,0)/teams.length:null,crossGames:played.length,record,components:[...new Set(teams.map(t=>t.component))]};})};
  }
  return {METHOD,V2,compute,key,fullSeason,divisionSummary};
});
