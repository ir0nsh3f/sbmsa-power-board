(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./schedules.js'));
  else root.SBMSALeagueSchedule=factory(root.SBMSASchedules);
})(typeof globalThis!=='undefined'?globalThis:this,function(S){
  'use strict';
  const key=(division,team)=>JSON.stringify([division,team]);
  function profiles(data,sport){
    const all=(data?.divisions||[]).filter(d=>d.sport===sport).flatMap(d=>(d.teams||[]).map(t=>({...t,division:d.division,rank:null,rankText:'Unrated'})));
    const rated=all.filter(t=>t.gp>0&&['w','t','capped_margin_sum'].every(k=>Number.isFinite(t[k])))
      .map(t=>Object.assign(t,{rate:(t.w+.5*t.t)/t.gp,margin:t.capped_margin_sum/t.gp}))
      .sort((a,b)=>b.rate-a.rate||b.margin-a.margin||a.team.localeCompare(b.team));
    let anchor=null;const counts={};
    rated.forEach((t,i)=>{if(!anchor||Math.abs(t.rate-anchor.rate)>1e-9||Math.abs(t.margin-anchor.margin)>1e-9){t.rank=i+1;anchor=t;}else t.rank=anchor.rank;counts[t.rank]=(counts[t.rank]||0)+1;});
    rated.forEach(t=>t.rankText=(counts[t.rank]>1?'T':'')+t.rank);
    return {teams:new Map(all.map(t=>[key(t.division,t.team),t])),ratedCount:rated.length,cutoff:Math.ceil(rated.length/4)};
  }
  function highlight(row,ratedCount){
    const {away:a,home:b}=row,cutoff=Math.ceil(ratedCount/4);
    if(row.status!=='Upcoming'||!row.dateISO||![a,b].every(t=>t&&t.gp>=3&&t.rank>0&&Number.isFinite(t.rate)))return null;
    if(a.rank<=cutoff&&b.rank<=cutoff)return {label:'Top matchup',reason:`Both capped ranks in top ${cutoff} of ${ratedCount} rated teams (rounded-up top quarter; ties included). Both have at least 3 GP.`};
    const gap=Math.abs(a.rate-b.rate);
    if(a.division===b.division&&gap<=.15+1e-12)return {label:'Close records',reason:`Same division; win-rate gap ${(gap*100).toFixed(1)} percentage points (≤15). Both have at least 3 GP. This does not predict a close game.`};
    return null;
  }
  const favorites={flag:['Burrow','Buccaneers'],'8u':['Pulisic','Arsenal'],'6u':['Messi','Vipers']};
  function buildRows(data,sport,today=new Date()){
    today=typeof today==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(today)?today:S.chicagoDate(new Date(today));
    const p=profiles(data,sport),rows=[];
    for(const d of (data?.divisions||[]).filter(d=>d.sport===sport))for(const [index,g] of (d.schedule||[]).entries()){
      const start=typeof g.start_iso==='string'&&/(?:Z|[+-]\d{2}:\d{2})$/.test(g.start_iso)?Date.parse(g.start_iso):NaN;
      const dateISO=Number.isFinite(start)?S.chicagoDate(new Date(start)):/^\d{4}-\d{2}-\d{2}$/.test(g.date_iso||'')?g.date_iso:null;
      const completed=[g.away_score,g.home_score].every(n=>Number.isInteger(n)&&n>=0);
      const profile=name=>p.teams.get(key(d.division,name))||{team:name,coach:null,rank:null,rankText:'—',gp:null};
      const row={id:JSON.stringify([sport,d.division,index]),sport,division:d.division,away:profile(g.away),home:profile(g.home),
        dateISO,start:Number.isFinite(start)?start:null,timeLabel:Number.isFinite(start)?new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',hour:'numeric',minute:'2-digit'}).format(new Date(start)):g.time||'Time TBD',
        completed,awayScore:completed?g.away_score:null,homeScore:completed?g.home_score:null,
        status:completed?'Final':dateISO&&dateISO<today?'Awaiting result':dateISO?'Upcoming':'Date TBD',
        location:g.location,locationUrl:S.safeLocationURL(g.location_url),sourceUrl:S.safeSourceURL(d.url),
        ourTeam:favorites[sport]?.[0]===d.division&&[g.away,g.home].includes(favorites[sport][1])};
      row.highlight=highlight(row,p.ratedCount);rows.push(row);
    }
    return rows.sort((a,b)=>(a.dateISO||'9999').localeCompare(b.dateISO||'9999')||(a.start??-Infinity)-(b.start??-Infinity)||a.division.localeCompare(b.division)||a.id.localeCompare(b.id));
  }
  function filterRows(rows,{filter='Upcoming',division='all',query='',watchlist=false}={}){
    query=query.trim().toLowerCase();
    return rows.filter(r=>(division==='all'||r.division===division)&&(!watchlist||r.highlight)&&
      (filter==='All'||(filter==='Results'?r.completed:!r.completed&&r.status!=='Awaiting result'))&&
      [r.away,r.home].some(t=>(t.team+' '+(t.coach||'')).toLowerCase().includes(query)));
  }
  function groupDates(rows){
    const groups=new Map();for(const r of rows){if(!groups.has(r.dateISO))groups.set(r.dateISO,{dateISO:r.dateISO,rows:[]});groups.get(r.dateISO).rows.push(r);}return [...groups.values()];
  }
  const e=S.escapeHTML;
  const record=t=>['w','l','t'].every(k=>Number.isInteger(t[k]))?`${t.w}–${t.l}–${t.t}`:'—';
  function renderRows(rows){
    return groupDates(rows).map(g=>`<section class="league-day"><h3>${g.dateISO?e(new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'short',month:'short',day:'numeric'}).format(new Date(g.dateISO+'T12:00:00Z'))):'Date TBD'}</h3>${g.rows.map(r=>{
      const identity=t=>`<span class="league-team"><b>${e(t.team)}</b> <small><span class="league-rank">${t.rank?'#':''}${e(t.rankText)}</span> · ${record(t)}</small></span>`;
      const field=e(r.location||'Field not listed');
      const map=r.location&&r.locationUrl?`<a class="field-map" href="${e(r.locationUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${field} in Google Maps (opens in a new tab)">${field}</a>`:field;
      return `<details class="league-fixture" data-league-fixture="${e(r.id)}"><summary title="Expand for coaches, games played and source"><span class="league-time">${e(r.timeLabel)}</span><span class="league-match">${identity(r.away)} <span class="league-at">@</span> ${identity(r.home)}${r.completed?` <b class="league-score">${r.awayScore}–${r.homeScore} Final</b>`:''}</span><span class="league-meta">${e(r.division)} · ${map}${r.ourTeam?' · <b class="league-ours">Our team</b>':''}${r.highlight?` · <b class="league-badge">${e(r.highlight.label)}</b>`:''}${r.status==='Awaiting result'?' · Awaiting result':''}<span class="league-expand" aria-hidden="true"> ▾</span></span></summary><div class="league-detail">${[r.away,r.home].map(t=>`<p><b>${e(t.team)}</b> · Coach: ${e(t.coach||'Not listed')} · ${t.gp??'—'} GP${t.gp===0?' · Unrated':t.gp<3?' · Small sample (fewer than 3 GP)':''}</p>`).join('')}${r.highlight?`<p>${e(r.highlight.reason)}</p>`:''}<p>${r.completed?'Final score shown away–home.':'No final score published.'} ${r.sourceUrl?`<a href="${e(r.sourceUrl)}" target="_blank" rel="noopener noreferrer">Official schedule</a>`:''}</p></div></details>`;
    }).join('')}</section>`).join('')||'<p class="league-empty">No games match these filters. Try All or turn off Watchlist.</p>';
  }
  const states=new WeakMap();
  function render(data,container,options={}){
    const state=states.get(container)||{filter:'Upcoming',watchlist:false};states.set(container,state);
    const rows=buildRows(data,options.sport||'flag');
    const update=()=>{
      const shown=filterRows(rows,{...options,...state});
      container.querySelector('[data-league-content]').innerHTML=renderRows(shown);
      container.querySelector('[data-league-count]').textContent=`${shown.length} / ${rows.length} official fixtures · ${rows.filter(r=>r.highlight).length} upcoming highlights`;
      container.querySelectorAll('[data-league-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.leagueFilter===state.filter)));
      container.querySelector('[data-league-watch]').setAttribute('aria-pressed',String(state.watchlist));
    };
    container.innerHTML=`<div class="league-heading"><h2>League schedule</h2><span>Fall 2026 · All dates &amp; times Central</span></div><div class="league-toolbar"><div role="group" aria-label="League schedule view">${['Upcoming','Results','All'].map(f=>`<button data-league-filter="${f}">${f}</button>`).join('')}</div><button data-league-watch>Watchlist</button></div><p class="league-note" data-league-count role="status"></p><p class="league-note">Away @ home · # = capped rank · record W–L–T · Tap a row for coaches &amp; GP.</p><details class="league-method"><summary>Highlights &amp; ranking guide</summary><p>Highlights describe current records, not predictions or playoff stakes. No playoff or tiebreak simulation. Both teams need at least 3 games played and a rated rank; undated, completed and past unscored games receive no badge.</p><p><b>Top matchup</b> takes priority: both competition ranks ≤ ceil(rated teams ÷ 4), across all divisions of this sport/age. Ties at the cutoff are included, so more than a quarter can qualify. The denominator includes rated teams with 1–2 GP, but they cannot earn a badge.</p><p><b>Close records</b>: same division, win-rate gap ≤15 percentage points; not a prediction of a close game. Win rate = (W + ½T) / GP. Watchlist shows only upcoming highlighted games; it does not reorder them.</p><p>Ranks use win rate, then per-game capped margin (±21 flag, ±3 soccer), independent of Raw mode and filters. T = tied competition rank. All records and ranks are latest season totals, not historical pregame stats; GP 0 is unrated, GP 1–2 is a small sample. No division-strength adjustment. Same-day unscored games remain upcoming; older unscored games are awaiting results in All, never assumed draws. Undated fixtures sort last; unknown times precede known times on a date.</p></details><div data-league-content></div>`;
    container.querySelectorAll('[data-league-filter]').forEach(b=>b.addEventListener('click',()=>{state.filter=b.dataset.leagueFilter;update();}));
    container.querySelector('[data-league-watch]').addEventListener('click',()=>{state.watchlist=!state.watchlist;update();});
    update();
  }
  return {profiles,highlight,buildRows,filterRows,groupDates,renderRows,render};
});
