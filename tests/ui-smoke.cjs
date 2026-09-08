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
  const name=['data.json','advanced.js','schedules.js'].includes(requested)?requested:'index.html';
  res.setHeader('Content-Type',name.endsWith('.json')?'application/json':name.endsWith('.js')?'application/javascript':'text/html');
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
  for(const [sport,team,coach] of [['flag','Buccaneers','Wells'],['8u','Arsenal','Klupchak'],['6u','Vipers','Ellis']]){
   await page.locator(`[data-sport="${sport}"]`).click();
   assert.equal(await page.locator('#stats-body tr').count(),await page.locator('.row').count(),'Advanced stats must include the entire filtered field');
   assert.ok((await page.locator('#stats-body').innerText()).includes(coach),'Advanced stats must retain coaches');
   assert.ok((await page.locator('#stats-head').innerText()).includes(sport==='flag'?'PF/G':'GF/G'),'Sport-specific scoring labels');
   const summary=await page.evaluate(({sport,team})=>{const d=data.divisions.find(d=>d.sport===sport&&d.teams.some(t=>t.team===team));const t=d.teams.find(t=>t.team===team);return {gp:t.gp,pf:t.pf,pa:t.pa};},{sport,team});
   const statsRow=page.locator('#stats-body tr').filter({hasText:team}).first();
   const cells=await statsRow.locator('td').allTextContents();
   assert.equal(cells[4],summary.gp?(summary.pf/summary.gp).toFixed(1):'—');
   assert.equal(cells[5],summary.gp?(summary.pa/summary.gp).toFixed(1):'—');
   await page.locator('#stat-sort').selectOption('scored_pg');
   await page.locator('#stat-sort').selectOption('board');
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
  assert.ok((await page.locator('#team-schedules').innerText()).toLowerCase().includes('opponent'),'Our teams opponent guide must render');
  const guide=page.locator('#team-schedules');
  await guide.getByRole('button',{name:'All',exact:true}).click();
  const expectedGames=await page.evaluate(()=>data.divisions.reduce((n,d)=>{const favorites={'flag|Burrow':'Buccaneers','8u|Pulisic':'Arsenal','6u|Messi':'Vipers'};const team=favorites[d.sport+'|'+d.division];return n+(team?(d.schedule||[]).filter(g=>g.home===team||g.away===team).length:0);},0));
  assert.ok(expectedGames>0,'Actual public schedules required');
  assert.equal(await guide.locator('tbody tr').count(),expectedGames,'Every favorite fixture must appear in All view');
  await guide.getByRole('button',{name:'Results',exact:true}).click();
  assert.ok((await guide.innerText()).includes('34'),'Completed Buccaneers result is present');
  await guide.getByRole('button',{name:'Upcoming',exact:true}).click();
  await page.locator('[data-sport="flag"]').click();
  if(process.env.SCREENSHOT){
   await page.screenshot({path:process.env.SCREENSHOT,fullPage:true});
   for(const [selector,suffix] of [['#advanced','stats'],['#team-schedules','schedule']]){
    await page.locator(selector).screenshot({path:process.env.SCREENSHOT+'.'+suffix+'.png'});
   }
  }
  // Hostile name is QA-only, injected in browser memory, never written into public data.
  await page.evaluate(()=>{data.divisions.find(d=>d.sport==='flag').teams[0].coach='<img src=x onerror="window.coachInjection=true">';render();});
  assert.equal(await page.locator('#rows img').count(),0);
  assert.equal(await page.evaluate(()=>window.coachInjection),undefined);
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS: no reload button; coach names and search in all sports; responsive widths; escaped coach text; zero JavaScript errors.');
 } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
