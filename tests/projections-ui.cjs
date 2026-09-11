const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'../site');
 const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));if(!file.startsWith(root+'/')||!fs.existsSync(file)){res.statusCode=404;return res.end();}res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html');res.end(fs.readFileSync(file));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({args:['--no-sandbox']});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const url=process.env.TEST_URL||`http://127.0.0.1:${server.address().port}/`;
  const countReport={};
  for(const width of [320,390,768,1400]){
   await page.setViewportSize({width,height:1000});await page.goto(url+'#league-schedule');await page.waitForSelector('[data-league-fixture]');
   const toggle=page.locator('[data-league-projections]');assert.equal(await toggle.getAttribute('aria-pressed'),'false');assert.equal(await page.locator('.league-projection').count(),0);assert.equal(await page.locator('[data-projection-caution]').isVisible(),false);
   const ids=()=>page.locator('[data-league-fixture]').evaluateAll(es=>es.map(e=>e.dataset.leagueFixture));const baseline=await ids();
   await toggle.click();assert.equal(await toggle.getAttribute('aria-pressed'),'true');assert.deepEqual(await ids(),baseline);
   const expected=await page.evaluate(()=>data.projections.forecasts.filter(f=>Date.parse(f.game_id[5])>Date.now()).length);
   assert.ok(expected>0,'Actual collected projections loaded, not QA fixtures');assert.equal(await page.locator('.league-projection b').count(),expected);countReport[width]=expected;
   const checks=await page.locator('.league-projection b').evaluateAll(es=>es.map(e=>{const fixture=e.closest('[data-league-fixture]');const [sport,division,index]=JSON.parse(fixture.dataset.leagueFixture);const d=data.divisions.find(d=>d.sport===sport&&d.division===division),g=d.schedule[index];const p=data.projections.forecasts.find(f=>f.game_id[2]===division&&f.game_id[3]===g.home&&f.game_id[4]===g.away&&Date.parse(f.game_id[5])===Date.parse(g.start_iso));return {text:e.parentElement.innerText,detail:fixture.querySelector('.league-projection-detail').textContent,insideMatch:!!e.closest('.league-match'),p,done:g.home_score!==null||g.away_score!==null,start:Date.parse(g.start_iso)};}));
   for(const c of checks){
    assert.ok(!c.done&&c.start>Date.now());const f=c.p,spread=Math.round(Math.abs(f.margin_home));
    const favorite=f.margin_home>0?f.game_id[3]:f.game_id[4];
    assert.equal(c.text,`Model · ${spread?`${favorite} −${spread}`:'Pick’em'} · Total ${Math.round(f.total)}`);
    assert.ok(c.insideMatch);assert.doesNotMatch(c.text,/Home margin|95%|GP/);
    const signed=n=>n>0?'+'+n:String(n);
    assert.ok(c.detail.includes(`Home margin ${signed(f.margin_home)} (${signed(f.margin_range[0])} to ${signed(f.margin_range[1])})`));
    assert.ok(c.detail.includes(`Total ${f.total} (${f.total_range[0]}–${f.total_range[1]})`));
    assert.ok(c.detail.includes(`GP away ${f.gp_away} / home ${f.gp_home}`));assert.ok(c.detail.includes(`${f.division_games} division games`));
    assert.match(c.detail,/Experimental · very small sample/);assert.match(c.detail,/prior-heavy/);
    if(!f.gp_home||!f.gp_away)assert.match(c.detail,/0 GP.*extrapolation/);
   }
   assert.ok(await page.locator('[data-projection-caution]').isVisible());
   assert.match(await page.locator('[data-projection-caution]').innerText(),/Experimental · very small sample.*not market lines/);
   const fixture=page.locator('.league-fixture').filter({has:page.locator('.league-projection b')}).first();
   assert.equal(await fixture.locator('.league-projection-detail').isVisible(),false);
   await fixture.locator('summary').click();assert.ok(await fixture.locator('.league-projection-detail').isVisible());
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(process.env.QA_DIR)await page.screenshot({path:path.join(process.env.QA_DIR,`projection-detail-${width}.png`)});
   await fixture.locator('summary').click();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok(await page.locator('#league-schedule').evaluate(e=>e.scrollWidth<=e.clientWidth));
   assert.ok(await toggle.evaluate(e=>e.getBoundingClientRect().height>=44&&e.scrollWidth<=e.clientWidth));
   if(process.env.QA_DIR){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(process.env.QA_DIR,`projections-${width}.png`)});await page.locator('.league-projection b').first().evaluate(e=>scrollTo(0,e.closest('.league-fixture').getBoundingClientRect().top+scrollY-80));await page.screenshot({path:path.join(process.env.QA_DIR,`projection-rows-${width}.png`)});}
   await page.locator('[data-projection-guide] summary').click();assert.match(await page.locator('[data-projection-guide]').innerText(),/not learned calibration/);assert.match(await page.locator('[data-projection-guide]').innerText(),/6 observations/);
   if(process.env.QA_DIR)await page.screenshot({path:path.join(process.env.QA_DIR,`projection-guide-${width}.png`)});
   await page.locator('[data-projection-guide] summary').click();
   for(const division of await page.locator('#division option').evaluateAll(es=>es.map(e=>e.value))){
    await page.locator('#division').selectOption(division);
    const actual=await page.locator('.league-projection b').count();const n=await page.evaluate(division=>data.projections.forecasts.filter(f=>(division==='all'||f.game_id[2]===division)&&Date.parse(f.game_id[5])>Date.now()).length,division);assert.equal(actual,n);
   }
   await page.locator('#division').selectOption('all');await page.locator('#search').fill('Buccaneers');assert.equal(await page.locator('.league-projection b').count(),await page.evaluate(()=>data.projections.forecasts.filter(f=>f.game_id.includes('Buccaneers')&&Date.parse(f.game_id[5])>Date.now()).length));await page.locator('#search').fill('');
   await page.locator('[data-league-filter="Results"]').click();assert.equal(await page.locator('.league-projection').count(),0);await page.locator('[data-league-filter="Upcoming"]').click();
   await page.locator('[data-league-watch]').click();const watch=await ids();await toggle.click();assert.deepEqual(await ids(),watch);await page.locator('[data-league-watch]').click();
   for(const sport of ['8u','6u']){await page.locator(`[data-sport="${sport}"]`).click();assert.equal(await page.locator('[data-league-projections]').count(),0);assert.equal(await page.locator('.league-projection').count(),0);}
   await page.locator('[data-sport="flag"]').click();await page.locator('[data-league-projections]').click();await page.reload();await page.waitForSelector('[data-league-fixture]');assert.equal(await page.locator('[data-league-projections]').getAttribute('aria-pressed'),'false');
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({widths:countReport,errors,verified:'real current projections, exact identity, sample GP, default off, filters, chronology, watchlist unchanged, soccer excluded, overflow, 44px controls'}));
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
