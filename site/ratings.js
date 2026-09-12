/* Canonical power rankings. No dependence on records or projection models. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.SBMSARatings=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const V2={id:'opponent-ridge-margin-v2',caps:{flag:21,'8u':3,'6u':3},ridge:3,tolerance:1e-12,maxIterations:10000,tieDecimals:8};
  const METHOD={...V2,id:'opponent-ridge-margin-v3',default_mode:'raw',modes:['raw','capped']};
  const key=(division,team)=>JSON.stringify([division,team]);
  const compare=(a,b)=>a<b?-1:a>b?1:0;
  function compute(divisions,sport,mode='raw'){
    if(!['raw','capped'].includes(mode))throw Error('Unknown power-rating mode');
    const all=divisions.filter(d=>d.sport===sport).flatMap(d=>d.teams.map(t=>({...t,division:d.division,rank:null,rankText:'Unrated',power:null,component:null,rate:t.gp?(t.w+.5*t.t)/t.gp:null}))).sort((a,b)=>compare(key(a.division,a.team),key(b.division,b.team)));
    const ids=new Map(all.map((t,i)=>[key(t.division,t.team),i])),edges=all.map(()=>[]),rhs=all.map(()=>0),cap=mode==='capped'?METHOD.caps[sport]:Infinity;
    if(!METHOD.caps[sport])throw Error('Unknown power-rating sport');
    const games=[];
    for(const d of divisions.filter(d=>d.sport===sport))for(const g of d.games||[]){
      if(![g.home_score,g.away_score].every(Number.isFinite))continue;
      const h=ids.get(key(d.division,g.home)),a=ids.get(key(d.division,g.away));
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
    all.forEach((t,i)=>{if(t.gp>0&&edges[i].length)t.power=r[i];});
    const rounded=t=>Math.round(t.power*1e8)/1e8;
    const rated=all.filter(t=>t.power!==null).sort((a,b)=>rounded(b)-rounded(a)||compare(a.team,b.team)||compare(a.division,b.division));
    let anchor=null;const counts={};
    rated.forEach((t,i)=>{if(anchor===null||rounded(t)!==rounded(anchor)){t.rank=i+1;anchor=t;}else t.rank=anchor.rank;counts[t.rank]=(counts[t.rank]||0)+1;});
    rated.forEach(t=>{t.tied=counts[t.rank]>1;t.rankText=(t.tied?'T':'')+t.rank;});
    all.forEach(t=>{t.components=component;t.tied=!!t.tied;});
    return rated.concat(all.filter(t=>t.power===null).sort((a,b)=>compare(a.team,b.team)||compare(a.division,b.division)));
  }
  return {METHOD,V2,compute,key};
});
