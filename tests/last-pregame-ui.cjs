const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'../site');
 const server=http.createServer((req,res)=>{const name=req.url.split('?')[0],file=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(root+'/')||!fs.existsSync(file)){res.statusCode=404;return res.end();}res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html');res.end(fs.readFileSync(file));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({args:['--no-sandbox']});const page=await browser.newPage(),errors=[],report=[];page.on('pageerror',e=>errors.push(e.message));
  const url=process.env.TEST_URL||`http://127.0.0.1:${server.address().port}/`;
  for(const width of [320,390,768,1400]){
   await page.setViewportSize({width,height:1000});await page.goto(url+'#league-schedule');await page.reload();await page.waitForFunction(()=>typeof data!=='undefined'&&data?.pregameResults);
   assert.equal(await page.locator('[data-league-projections]').getAttribute('aria-pressed'),'false');
   await page.locator('[data-league-filter="Results"]').click();
   const checks=await page.locator('.league-fixture').evaluateAll(es=>es.map(el=>{const [sport,division,i]=JSON.parse(el.dataset.leagueFixture),g=data.divisions.find(d=>d.sport===sport&&d.division===division).schedule[i];return {id:['fall-2026',sport,division,g.home,g.away,g.start_iso],line:el.querySelector('.league-pregame').textContent,summary:el.querySelector('summary').textContent};}));
   const expected=await page.evaluate(()=>data.pregameResults.forecasts);
   for(const c of checks){const f=expected.find(f=>JSON.stringify(f.game_id)===JSON.stringify(c.id));assert.doesNotMatch(c.summary,/Last pregame|No archived/);if(f){const spread=Math.round(Math.abs(f.margin_home));assert.ok(c.line.includes(`Last pregame model · ${spread?`${f.margin_home>0?f.game_id[3]:f.game_id[4]} −${spread}`:'Pick’em'} · Total ${Math.round(f.total)}`));}else assert.equal(c.line,'No archived pregame model');}
   const fixture=page.locator('.league-fixture').filter({hasText:'Giants'}).filter({hasText:'Raiders'});
   assert.equal(await fixture.count(),1);assert.equal(await fixture.locator('.league-pregame').isVisible(),false);await fixture.locator('summary').click();
   const text=await fixture.innerText();assert.match(text,/7–19 Final/);assert.match(text,/Last pregame model · Pick’em · Total 39/);assert.match(text,/Observed public Sep 10, 2026, 3:52:34 PM CT/);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok(await fixture.evaluate(e=>e.scrollWidth<=e.clientWidth));
   assert.ok(await fixture.locator('.league-pregame a').evaluateAll(es=>es.every(e=>e.getBoundingClientRect().height>=44)));
   if(process.env.QA_DIR){fs.mkdirSync(process.env.QA_DIR,{recursive:true});await fixture.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(process.env.QA_DIR,`last-pregame-${width}.png`)});}
   const before=await fixture.locator('.league-pregame').textContent();await page.locator('[data-league-projections]').click();assert.equal(await fixture.locator('.league-pregame').textContent(),before);
   report.push({width,text,completed:checks.length,archived:expected.length});
  }
  // Failed and stalled summary fetches must not block results or substitute current models.
  for(const mode of ['failed','stale']){
   await page.route('**/projections/results.json',r=>mode==='failed'?r.abort():r.fulfill({contentType:'application/json',body:JSON.stringify({source_checked_at:'old',forecasts:[]})}));
   await page.goto(url+'#league-schedule');await page.reload();await page.waitForSelector('[data-league-fixture]');await page.locator('[data-league-filter="Results"]').click();
   assert.ok(await page.locator('.league-fixture').count()>0);assert.equal(await page.locator('.league-pregame').filter({hasText:'No archived pregame model'}).count(),await page.locator('.league-fixture').count());await page.unroute('**/projections/results.json');
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({report,errors,verified:'real final identities, compact text, CT observation, off-toggle independence, disclosure only, missing history, failed/stale feed, mobile overflow and links'}));
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
