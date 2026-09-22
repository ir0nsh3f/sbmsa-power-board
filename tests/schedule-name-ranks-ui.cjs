// Real browser checks for adjacent ranks and exact team-results navigation.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
(async()=>{
 const site=path.join(__dirname,'../site');
 const server=http.createServer((req,res)=>{let name=decodeURIComponent(req.url.split('?')[0]);if(name==='/')name='/index.html';const f=path.join(site,name);if(!f.startsWith(site)||!fs.existsSync(f)){res.statusCode=404;return res.end();}res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.json')?'application/json':f.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(f));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 const url=process.env.TEST_URL||`http://127.0.0.1:${server.address().port}/`,qa=process.env.QA_DIR||'/tmp';fs.mkdirSync(qa,{recursive:true});
 try{
 browser=await chromium.launch({args:['--no-sandbox']});
 for(const width of [320,390,1400]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.waitForSelector('.row');
  assert.equal(await page.locator('#raw').getAttribute('aria-pressed'),'true');
  for(const input of ['raw','capped']){
   await page.locator('.section-links [data-view="rankings"]').click();await page.locator('#'+input).click();
   await page.locator('.section-links [data-view="team-schedules"]').click();
   for(const layout of ['glance','guide']){
    await page.locator(`[data-schedule-layout="${layout}"]`).click();await page.locator('[data-schedule-filter="All"]').click();
    const check=await page.evaluate(layout=>{
     const rows=SBMSASchedules.buildRows(data),selector=layout==='glance'?'.glance-fixture':'tr[data-fixture-team]',els=[...document.querySelectorAll('#team-schedules '+selector)];
     const key=r=>JSON.stringify([r.sport,r.division,r.team,r.opponent]);
     const seen=[];for(const el of els){const id=el.dataset.fixtureTeam.split('|'),strong=[...el.querySelectorAll('strong')].filter(n=>n.querySelector('.schedule-rank'));if(strong.length!==2)return {error:'missing adjacent names'};const names=strong.map(n=>n.childNodes[n.childNodes.length-1].textContent.trim());const row=rows.find(r=>r.sport===id[0]&&r.division===id[1]&&r.team===names[0]&&r.opponent===names[1]);if(!row)return {error:'wrong identity'};seen.push(key(row));const board=SBMSARatings.compute(data.divisions,row.sport,data.ratingMode);for(let i=0;i<2;i++){const t=board.find(t=>t.division===row.division&&t.team===names[i]),want=t.rank?(t.rankText.startsWith('T')?'T#':'#')+t.rank:'—';if(strong[i].querySelector('.schedule-rank').textContent!==want)return {error:'wrong rank'};}}
     return {seen:seen.sort(),expected:rows.map(key).sort(),overflow:document.documentElement.scrollWidth>innerWidth||document.querySelector('#team-schedules').scrollWidth>document.querySelector('#team-schedules').clientWidth};
    },layout);
    assert.equal(check.error,undefined);assert.deepEqual(check.seen,check.expected);assert.equal(check.overflow,false);
    if(input==='raw'&&width<400)await page.screenshot({path:path.join(qa,`name-ranks-${layout}-${width}.png`)});
   }
   await page.locator('.section-links [data-view="rankings"]').click();await page.locator('[data-sport="8u"]').click();
   await page.locator('#division').selectOption('Pulisic');await page.locator('#search').fill('Arsenal');
   const link=page.locator('#rows .team-results-link');await link.focus();await page.keyboard.press('Enter');
   await page.waitForSelector('.league-selected-team');
   assert.equal(await page.locator('[data-league-filter="Results"]').getAttribute('aria-pressed'),'true');
   assert.ok((await page.locator('.league-selected-team').innerText()).includes('Arsenal'));
   const checkTeam=async filter=>{
    const result=await page.evaluate(filter=>{const chosen=SBMSAScheduleLinks.parse(location.hash,data),all=SBMSALeagueSchedule.buildRows(data,chosen.sport);const expected=all.filter(r=>r.division===chosen.division&&[r.home.team,r.away.team].includes(chosen.team)&&(filter==='All'||(filter==='Results'?r.completed:!r.completed&&r.status!=='Awaiting result')));const shown=[...document.querySelectorAll('[data-league-fixture]')];return {ids:shown.map(n=>n.dataset.leagueFixture),expected:expected.map(r=>r.id),badRank:shown.some((el,i)=>[...el.querySelectorAll('.league-team>b')].some((n,j)=>{const t=[expected[i].away,expected[i].home][j],rank=t.rank?(t.rankText.startsWith('T')?'T#':'#')+t.rank:'—';return n.textContent!==rank+' '+t.team;})),overflow:document.documentElement.scrollWidth>innerWidth,mode:data.ratingMode};},filter);
    assert.deepEqual(result.ids,result.expected);assert.equal(result.badRank,false);assert.equal(result.overflow,false);assert.equal(result.mode,input);
   };
   await checkTeam('Results');
   for(const f of ['Upcoming','All']){await page.locator(`[data-league-filter="${f}"]`).click();await checkTeam(f);}
   if(input==='raw'&&width<400)await page.screenshot({path:path.join(qa,`team-results-${width}.png`)});
   await page.locator('.league-selected-team a[href="#boardtitle"]').click();await page.waitForSelector('#rows .team-results-link');
   assert.equal(await page.locator('#division').inputValue(),'Pulisic');assert.equal(await page.locator('#search').inputValue(),'Arsenal');
   await page.locator('#rows .team-results-link').click();await page.waitForSelector('.league-selected-team');
   await page.locator('.league-selected-team a[href="#league-schedule"]').click();await page.waitForFunction(()=>!document.querySelector('.league-selected-team'));
   await page.locator('.section-links [data-view="rankings"]').click();await page.locator('#search').fill('');await page.locator('#division').selectOption('all');
  }
  // A direct bookmark defaults to Results, while the power mode still defaults Raw on load.
  await page.goto(url+'#league-schedule?sport=8u&division=Pulisic&team=Arsenal');await page.reload();await page.waitForSelector('.league-selected-team');
  assert.equal(await page.locator('[data-league-filter="Results"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#raw').getAttribute('aria-pressed'),'true');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({width,adjacentRanks:true,exactResultsLinks:true,rawCap:true,noOverflow:true}));await page.close();
 }
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
