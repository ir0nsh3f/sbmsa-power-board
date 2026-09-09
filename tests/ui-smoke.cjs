// Browser regression checks against the real local publication (or TEST_URL).
// Requires Playwright Chromium; set PLAYWRIGHT_MODULE if installed outside this repo.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
 const site=path.join(__dirname,'../site');
 const server=http.createServer((req,res)=>{
  const requested=path.basename(req.url.split('?')[0]);
  const name=['data.json','advanced.js','schedules.js','league-schedule.js','league-schedule.css'].includes(requested)?requested:'index.html';
  res.setHeader('Content-Type',name.endsWith('.css')?'text/css':name.endsWith('.json')?'application/json':name.endsWith('.js')?'application/javascript':'text/html');
  res.end(fs.readFileSync(path.join(site,name)));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try {
  browser=await chromium.launch({args:['--no-sandbox']});
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.TEST_URL || `http://127.0.0.1:${server.address().port}/`);
  await page.waitForSelector('.row');
  assert.equal(await page.locator('button').filter({hasText:/Reload published data/i}).count(),0,'Redundant reload button must be absent');
  assert.equal(await page.locator('#advanced').count(),1,'Advanced stats section must exist');
  assert.equal(await page.getByRole('tab').count(),4,'Four separate dashboard views');
  assert.equal(await page.locator('#advanced').isVisible(),false,'Inactive advanced panel is hidden');
  for(const [sport,team,coach] of [['flag','Buccaneers','Wells'],['8u','Arsenal','Klupchak'],['6u','Vipers','Ellis']]){
   await page.getByRole('tab',{name:'Advanced',exact:true}).click();
   await page.locator(`[data-sport="${sport}"]`).click();
   assert.ok(await page.locator('#search').isVisible());
   assert.equal(await page.locator('#stat-sort option[value="raw_total"]').count(),1,'Raw TOTAL sort exists');
   assert.equal(await page.locator('#stats-body tr').count(),await page.locator('.row').count(),'Advanced stats must include the entire filtered field');
   assert.ok((await page.locator('#stats-body').innerText()).includes(coach),'Advanced stats must retain coaches');
   assert.ok((await page.locator('#stats-head').innerText()).includes(sport==='flag'?'PF/G':'GF/G'),'Sport-specific scoring labels');
   const summary=await page.evaluate(({sport,team})=>{const d=data.divisions.find(d=>d.sport===sport&&d.teams.some(t=>t.team===team));const t=d.teams.find(t=>t.team===team);return {gp:t.gp,pf:t.pf,pa:t.pa};},{sport,team});
   const statsRow=page.locator('#stats-body tr').filter({hasText:team}).first();
   const cells=await statsRow.locator('td').allTextContents();
   assert.equal(cells[6],summary.gp?(summary.pf/summary.gp).toFixed(1):'—');
   assert.equal(cells[7],summary.gp?(summary.pa/summary.gp).toFixed(1):'—');
   for(const sort of ['raw_total','raw_margin','scored_pg','allowed_pg','adjusted_margin','sos','board']){
    await page.locator('#stat-sort').selectOption(sort);
    const actual=await page.locator('#stats-body tr').evaluateAll(rows=>rows.map(r=>({team:r.dataset.team,value:r.dataset.metric,rank:r.dataset.metricRank,label:r.cells[1].textContent})));
    const expected=await page.evaluate(sort=>{const stats=SBMSAAdvanced.compute(data.divisions,sport);return rankings().map(t=>{const st=stats[JSON.stringify([t.division,t.team])];return {team:t.team,value:!t.gp?null:sort==='board'?t.rank:sort==='raw_total'?t.margin_sum:st[sort]};}).sort((a,b)=>a.value==null?(b.value==null?a.team.localeCompare(b.team):1):b.value==null?-1:(sort==='board'||sort==='allowed_pg'?a.value-b.value:b.value-a.value)||a.team.localeCompare(b.team));},sort);
    assert.deepEqual(actual.map(r=>r.team),expected.map(r=>r.team),sport+'/'+sort+' order');
    let rank=0;for(let i=0;i<actual.length;i++){const r=actual[i],v=expected[i].value;if(v==null){assert.equal(r.label,'—');continue;}if(i===0||Math.abs(v-expected[i-1].value)>1e-9)rank=i+1;assert.equal(+r.rank,rank);assert.equal(+r.value,v);const tied=expected.filter(x=>x.value!=null&&Math.abs(x.value-v)<=1e-9).length>1;assert.equal(r.label,(tied?'T':'')+rank);}
   }
   assert.ok(await page.locator('.metric-definition').first().isVisible());
   await page.locator('.stats-method summary').click();assert.ok((await page.locator('.stats-method').innerText()).includes('n/(n+3)'));await page.locator('.stats-method summary').click();
   await page.locator('#stat-sort').selectOption('board');
   await page.getByRole('tab',{name:'Rankings',exact:true}).click();
   assert.ok((await page.locator(`.row[data-team="${team}"]`).innerText()).includes('Coach: '+coach),'Team row must identify its coach');
   assert.ok((await page.locator('#focus').innerText()).includes('Coach: '+coach),'Spotlight must identify its coach');
   await page.locator('#search').fill(coach.toLowerCase());
   assert.ok(await page.locator(`.row[data-team="${team}"]`).count(),'Coach search must find team');
   await page.locator('#search').fill('');
   for(const width of [320,390,768,1400]){
    await page.setViewportSize({width,height:1000});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Overflow at ${width}`);
   }
  }
  await page.getByRole('tab',{name:'Our Teams',exact:true}).click();
  assert.ok((await page.locator('#team-schedules').innerText()).toLowerCase().includes('opponent'),'Our teams opponent guide must render');
  const guide=page.locator('#team-schedules');
  assert.equal(await guide.locator('[data-schedule-layout="glance"]').getAttribute('aria-pressed'),'true');
  assert.match(await page.locator('script[src*="schedules.js"]').getAttribute('src'),/\?v=/);
  for(const width of [320,390,768,1400]){
   await page.setViewportSize({width,height:1000});
   for(const filter of ['Upcoming','Results','All'])for(const team of ['all','flag|Burrow|Buccaneers','8u|Pulisic|Arsenal','6u|Messi|Vipers']){
    await guide.locator(`[data-schedule-filter="${filter}"]`).click();
    await guide.locator('[data-schedule-team]').selectOption(team);
    const expected=await page.evaluate(({filter,team})=>SBMSASchedules.filterRows(SBMSASchedules.buildRows(data),filter,team).map(r=>r.team+'|'+r.opponent+'|'+r.child),{filter,team});
    for(const layout of ['guide','glance']){
     await guide.locator(`[data-schedule-layout="${layout}"]`).click();
     assert.equal(await guide.locator('table').count(),1,'One schedule, not duplicate tables');
     assert.equal(await guide.locator('[data-fixture-team]').count(),expected.length,`${width}/${layout}/${filter}/${team} includes every fixture`);
     assert.equal(await guide.locator('[data-schedule-team]').inputValue(),team);
     assert.equal(await guide.locator(`[data-schedule-filter="${filter}"]`).getAttribute('aria-pressed'),'true');
     assert.ok(await guide.locator('.sbmsa-schedule-scroll').evaluate(e=>e.scrollWidth<=e.clientWidth));
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
     assert.ok(await guide.locator('button,select').evaluateAll(es=>es.every(e=>e.getBoundingClientRect().height>=44)));
     assert.ok(await guide.locator('button').evaluateAll(es=>es.every(e=>e.scrollWidth<=e.clientWidth)),'Control labels must not overlap');
     const mapExpected=await page.evaluate(({filter,team})=>SBMSASchedules.filterRows(SBMSASchedules.buildRows(data),filter,team).filter(r=>r.location && r.locationUrl).map(r=>r.location+'|'+r.locationUrl).sort(),{filter,team});
     const mapSelector=layout==='glance'?'.glance-fixture .field-map':'.fixture-date .field-map';
     const mapActual=await guide.locator(mapSelector).evaluateAll(es=>es.map(e=>e.textContent+'|'+e.getAttribute('href')).sort());
     assert.deepEqual(mapActual,mapExpected,'Exact published field destinations in both layouts');
     assert.ok(await guide.locator('.field-map').evaluateAll(es=>es.every(e=>e.target==='_blank' && e.rel==='noopener noreferrer' && e.getAttribute('aria-label')===e.textContent+' in Google Maps (opens in a new tab)')));
     const density=await guide.locator('[data-schedule-content]').evaluate(e=>{
      const before=[e.getBoundingClientRect().height,...Array.from(e.querySelectorAll('tr'),r=>r.getBoundingClientRect().height)];
      const html=e.innerHTML;e.querySelectorAll('.field-map').forEach(a=>a.replaceWith(document.createTextNode(a.textContent)));
      const plain=[e.getBoundingClientRect().height,...Array.from(e.querySelectorAll('tr'),r=>r.getBoundingClientRect().height)];e.innerHTML=html;
      return {before,plain};
     });
     assert.deepEqual(density.before,density.plain,`Map links must not increase row density at ${width}/${layout}`);
     if(layout==='glance'){
      assert.deepEqual(await guide.locator('thead th').allTextContents(),['Date','Dexter','Beckham']);
      assert.ok(await guide.locator('thead').isVisible(),'Keep child columns on mobile');
      const caption=await guide.locator('caption').boundingBox(),table=await guide.locator('table').boundingBox();
      assert.ok(caption.width>=table.width-2,'Caption spans the entire table, not just the date column');
      const selectBox=await guide.locator('[data-schedule-team]').boundingBox();assert.ok(selectBox.width>=110,'Team selection remains legible');
      const actual=await guide.locator('.glance-fixture').evaluateAll(es=>es.map(e=>e.querySelector('strong').textContent+'|'+e.querySelector('span:not(.glance-time)').textContent.replace(/^(vs|@) /,'')+'|'+(e.parentElement.cellIndex===1?'Dexter':'Beckham')));
      assert.deepEqual(actual.sort(),expected.sort(),'Correct child column, team and opponent');
      const dates=await page.evaluate(({filter,team})=>new Set(SBMSASchedules.filterRows(SBMSASchedules.buildRows(data),filter,team).map(r=>r.dateISO)).size,{filter,team});
      assert.equal(await guide.locator('tbody tr').count(),dates||1,'Exactly one row per date');
     }
    }
   }
   await guide.locator('[data-schedule-team]').selectOption('all');
   await guide.locator('[data-schedule-filter="All"]').click();
   await page.evaluate(()=>scrollTo(0,0));
   if(process.env.QA_DIR)await page.screenshot({path:path.join(process.env.QA_DIR,`glance-${width}.png`),fullPage:false});
  }
  await guide.locator('[data-schedule-layout="guide"]').click();
  await guide.locator('[data-schedule-filter="Upcoming"]').click();
  for(const width of [320,390,768,1400]){
   await page.setViewportSize({width,height:1000});
   assert.equal(await page.locator('#publication-details').getAttribute('open'),null,'Our Teams publication starts collapsed');
   for(const filter of ['All','Results','Upcoming']){
    await guide.locator(`[data-schedule-filter="${filter}"]`).click();
    assert.ok(await guide.locator('.sbmsa-schedule-scroll').evaluate(e=>e.scrollWidth<=e.clientWidth),'Schedule itself must not scroll horizontally at '+width);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   }
   const first=await guide.locator('tbody tr').first().boundingBox();assert.ok(first.y<500,'Compact Our Teams header at '+width);
   const select=guide.locator('[data-schedule-team]');await select.selectOption('8u|Pulisic|Arsenal');
   assert.ok((await guide.locator('tbody tr[data-fixture-team]').count())>0);
   assert.ok((await guide.locator('tbody tr[data-fixture-team]').evaluateAll(rs=>rs.every(r=>r.dataset.fixtureTeam==='8u|Pulisic|Arsenal'))));
   await select.selectOption('all');
   const detail=guide.locator('.fixture-details').first();await detail.locator('summary').click();assert.ok(await detail.getByRole('link',{name:'Public source',exact:true}).isVisible());await detail.locator('summary').click();
   await page.evaluate(()=>scrollTo(0,0));
   if(process.env.QA_DIR)await page.screenshot({path:path.join(process.env.QA_DIR,`schedule-${width}.png`),fullPage:false});
  }
  // Schedule ranks must remain the capped full-field ranks even with Raw and board filters selected.
  const rankChecks=await page.evaluate(()=>{const before={sport,mode};const rows=SBMSASchedules.buildRows(data);const checks=[];for(const r of rows){sport=r.sport;mode='capped';const t=rankings().find(t=>t.team===r.opponent&&t.division===r.division);checks.push([r.opponentRank,t?.gp?t.rankText:null]);}sport=before.sport;mode=before.mode;return checks;});
  for(const [actual,expected] of rankChecks)assert.equal(actual,expected);
  await page.evaluate(()=>{mode='raw';render();});
  await guide.locator('[data-schedule-layout="guide"]').click();
  assert.deepEqual(await guide.locator('.fixture-strength b').allTextContents(),await page.evaluate(()=>SBMSASchedules.filterRows(SBMSASchedules.buildRows(data)).map(r=>'Cap rank '+(r.opponentRank||(r.opponentGP===0?'Unrated':'—')))));
  await page.evaluate(()=>{mode='capped';render();});
  await guide.locator('[data-schedule-layout="guide"]').click();
  await guide.getByRole('button',{name:'All',exact:true}).click();
  const expectedGames=await page.evaluate(()=>data.divisions.reduce((n,d)=>{const favorites={'flag|Burrow':'Buccaneers','8u|Pulisic':'Arsenal','6u|Messi':'Vipers'};const team=favorites[d.sport+'|'+d.division];return n+(team?(d.schedule||[]).filter(g=>g.home===team||g.away===team).length:0);},0));
  assert.ok(expectedGames>0,'Actual public schedules required');
  assert.equal(await guide.locator('tbody tr').count(),expectedGames,'Every favorite fixture must appear in All view');
  await guide.getByRole('button',{name:'Results',exact:true}).click();
  assert.ok((await guide.innerText()).includes('34'),'Completed Buccaneers result is present');
  await guide.getByRole('button',{name:'Upcoming',exact:true}).click();
  await page.getByRole('tab',{name:'Rankings',exact:true}).click();
  await page.locator('[data-sport="flag"]').click();
  if(process.env.SCREENSHOT){
   await page.screenshot({path:process.env.SCREENSHOT,fullPage:true});
   for(const [selector,suffix] of [['#advanced','stats'],['#team-schedules','schedule']]){
    await page.evaluate(id=>setView(id),selector.slice(1));
    await page.locator(selector).screenshot({path:process.env.SCREENSHOT+'.'+suffix+'.png'});
   }
  }
  await page.getByRole('tab',{name:'Rankings',exact:true}).focus();await page.keyboard.press('ArrowRight');assert.ok(await page.locator('#advanced').isVisible());
  for(const [hash,panel] of [['team-schedules','team-schedules'],['boardtitle','rankings'],['advanced','advanced']]){await page.evaluate(hash=>location.hash=hash,hash);await page.waitForFunction(panel=>!document.getElementById(panel).hidden,panel);}
  for(const hash of ['unknown-view','constructor','toString','__proto__']){
   await page.evaluate(hash=>new Promise(resolve=>{window.addEventListener('hashchange',()=>resolve(),{once:true});location.hash=hash;}),hash);
   assert.ok(await page.locator('#advanced').isVisible(),`Unknown hash #${hash} must preserve the active panel`);
   assert.equal(await page.getByRole('tab',{selected:true}).getAttribute('data-view'),'advanced',`Unknown hash #${hash} must preserve the selected tab`);
   assert.equal(await page.locator('[role="tabpanel"]:visible').count(),1,`Unknown hash #${hash} must leave exactly one visible panel`);
  }
  await page.emulateMedia({media:'print'});for(const panel of ['rankings','advanced','team-schedules'])assert.ok(await page.locator('#'+panel).isVisible());await page.emulateMedia({media:'screen'});
  // Browser-only edge matrix: equal metrics, missing histories and an unplayed team.
  await page.evaluate(()=>{window.originalCompute=SBMSAAdvanced.compute;window.originalData=data;data=structuredClone(data);const d=data.divisions.find(d=>d.sport==='flag');d.teams=d.teams.slice(0,4);data.divisions=[d];d.teams.forEach((t,i)=>{t.gp=i===3?0:1;t.margin_sum=[10,10,-2,0][i];});SBMSAAdvanced.compute=()=>Object.fromEntries(d.teams.map((t,i)=>[JSON.stringify([d.division,t.team]),{scored_pg:[10,10,null,0][i],allowed_pg:[2,2,null,0][i],raw_margin:[10,10,null,0][i],adjusted_margin:[3,3,null,0][i],sos:[.5,.5,null,0][i],capped_margin:null,sos_coverage:0,close_record:{w:0,l:0,t:0}}]));resetDivision();render();setView('advanced');});
  for(const sort of ['raw_total','raw_margin','scored_pg','allowed_pg','adjusted_margin','sos']){await page.locator('#stat-sort').selectOption(sort);const labels=await page.locator('#stats-body tr td:nth-child(2)').allTextContents();assert.deepEqual(labels,sort==='raw_total'?['T1','T1','3','—']:['T1','T1','—','—']);}
  await page.evaluate(()=>{data=window.originalData;SBMSAAdvanced.compute=window.originalCompute;resetDivision();render();setView('rankings');});
  // Hostile name is QA-only, injected in browser memory, never written into public data.
  await page.evaluate(()=>{data.divisions.find(d=>d.sport==='flag').teams[0].coach='<img src=x onerror="window.coachInjection=true">';render();});
  assert.equal(await page.locator('#rows img').count(),0);
  assert.equal(await page.evaluate(()=>window.coachInjection),undefined);
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS: no reload button; coach names and search in all sports; responsive widths; escaped coach text; zero JavaScript errors.');
 } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
