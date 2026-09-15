/* Separate team view: public team identity, not an Our Teams association. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.SBMSARainbow=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const team='Rainbow Unicorns';
function nextTwo(divisions,now=Date.now()){
 return divisions.filter(d=>d.sport==='5ug'&&d.division==='Boxx').flatMap(d=>(d.schedule||[]).filter(g=>[g.home,g.away].includes(team)&&g.home_score===null&&g.away_score===null&&Number.isFinite(Date.parse(g.start_iso))&&Date.parse(g.start_iso)>now+30*60000).map(g=>({...g,division:d.division,url:d.url}))).sort((a,b)=>Date.parse(a.start_iso)-Date.parse(b.start_iso)||a.home.localeCompare(b.home)||a.away.localeCompare(b.away)).slice(0,2);
}
const half=n=>Math.floor(n*2+.5)/2;
function line(f,home,away){const spread=half(Math.abs(f.margin_home));return (spread?(f.margin_home>0?home:away)+' −'+spread:'Pick’em')+' · Total '+half(f.total)+' goals';}
function render(data,container,now=Date.now()){
 if(!container||!data)return;
 const S=globalThis.SBMSASchedules,e=S.escapeHTML,rows=nextTwo(data.divisions,now),d=data.divisions.find(d=>d.sport==='5ug'&&d.division==='Boxx');
 const ranks=globalThis.SBMSARatings.compute(data.divisions,'5ug',data.ratingMode||'raw');
 const p=data.soccerProjections?.generated_at===data.last_successful_check?data.soccerProjections:null;
 const date=s=>new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(s));
 container.innerHTML=`<h2>Rainbow Unicorns</h2><p>5U Girls Soccer · Boxx · Coach ${e(d?.teams.find(t=>t.team===team)?.coach||'Not listed')} · Fall 2026</p><p><b>Next two games · Central time.</b> Only dated, unplayed kickoffs more than 30 minutes away. Undated games cannot be ordered; past unscored games are not treated as future.</p><p class="rainbow-caution"><b>Experimental · enormous uncertainty at low GP.</b> These are strongly shrunk goal estimates, not betting odds or a fair betting-cover line. No shot-based xG or calibration. Ranks are separate, current-season ${e(data.ratingMode||'raw')} power.</p>`+rows.map(g=>{
 const opponent=g.home===team?g.away:g.home,t=ranks.find(t=>t.division==='Boxx'&&t.team===opponent),id=['fall-2026','5ug','Boxx',g.home,g.away,g.start_iso];
 const f=p?.forecasts.find(f=>JSON.stringify(f.fixture_id)===JSON.stringify(id));
 const map=S.safeLocationURL(g.location_url);
 return `<article class="rainbow-fixture" data-start="${e(g.start_iso)}"><h3>${e(date(g.start_iso))} CT</h3><p><b>${e(g.away)} @ ${e(g.home)}</b></p><p>Opponent: ${e(t?.rankText||'Unrated')} · ${t?`${t.w}–${t.l}–${t.t} · ${t.gp} GP`:'Record unavailable'} · Coach ${e(t?.coach||'Not listed')}</p><p>${map?`<a href="${e(map)}" target="_blank" rel="noopener noreferrer">${e(g.location||'Field map')} ↗</a>`:e(g.location||'Field not listed')} · <a href="${e(g.url)}" target="_blank" rel="noopener noreferrer">Official schedule ↗</a></p>${f?`<p class="rainbow-line"><b>Model · ${e(line(f,g.home,g.away))}</b></p><p>Approximate 95% model-based ranges: home margin ${f.margin_range[0]} to ${f.margin_range[1]} goals; combined total ${f.total_range[0]}–${f.total_range[1]} goals. Not validated coverage.</p><p>Training: ${e(g.home)} ${f.home_gp} GP; ${e(g.away)} ${f.away_gp} GP. ${f.division_games} Boxx games / ${p.pooled_games} pooled 5U Girls games; ${p.pooled_goals_per_team.toFixed(2)} goals/team/game. ${!f.home_gp||!f.away_gp?'Zero-GP team: pooled-prior extrapolation.':''}</p><p>Mean goals: home ${f.home_mean.toFixed(2)}, away ${f.away_mean.toFixed(2)}. ${e(p.model.prior_games)} prior games per attack/defense component shrink early samples.</p>`:`<p class="rainbow-line">Model withheld: ${e(p?.withheld||'No current verified forecast available.')}</p>`}</article>`;
 }).join('')+(rows.length<2?`<p>Only ${rows.length} eligible dated future fixtures are currently published; no replacement dates invented.</p>`:'')+`<p><a href="./soccer-method.html">Goal model assumptions &amp; equations</a>${p?.capture_path&&/^captures\/[a-f0-9]{64}\.json$/.test(p.capture_path)?` · <a href="./soccer-projections/${p.capture_path}">Immutable forecast capture</a>`:''} · <a href="./soccer-projections/index.json">Archive index</a></p>`;
}
return {nextTwo,line,render};
});
