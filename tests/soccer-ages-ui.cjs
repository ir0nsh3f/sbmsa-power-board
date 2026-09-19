const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=path.resolve(__dirname,'../site'),server=http.createServer((req,res)=>{const p=req.url.split('?')[0],f=path.resolve(root,'.'+(p==='/'?'/index.html':p));if(!f.startsWith(root+'/')||!fs.existsSync(f)){res.statusCode=404;return res.end();}res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':f.endsWith('.json')?'application/json':'text/html');res.end(fs.readFileSync(f));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({args:['--no-sandbox']});const url=process.env.TEST_URL||`http://127.0.0.1:${server.address().port}/`,report=[];
  for(const width of [320,390,1400])for(const sport of ['8u','6u']){
   const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(url+'#league-schedule');await page.waitForSelector('[data-league-fixture]');await page.locator(`[data-sport="${sport}"]`).click();
   const toggle=page.locator('[data-league-projections]');assert.equal(await toggle.count(),1,'Soccer toggle present');assert.equal(await toggle.getAttribute('aria-pressed'),'false');assert.equal(await page.locator('.league-projection').count(),0);
   await page.waitForFunction(s=>data.soccerAgeProjections?.[s],sport);
   const ids=()=>page.locator('[data-league-fixture]').evaluateAll(es=>es.map(e=>e.dataset.leagueFixture));const before=await ids();await toggle.click();assert.deepEqual(await ids(),before);
   const actual=await page.locator('.league-projection b').evaluateAll(es=>es.map(e=>{const row=e.closest('[data-league-fixture]'),[s,d,i]=JSON.parse(row.dataset.leagueFixture),g=data.divisions.find(x=>x.sport===s&&x.division===d).schedule[i],p=data.soccerAgeProjections[s],f=p.forecasts.find(f=>f.fixture_id[2]===d&&f.fixture_id[3]===g.home&&f.fixture_id[4]===g.away&&Date.parse(f.fixture_id[5])===Date.parse(g.start_iso));return {text:e.parentElement.innerText,detail:row.querySelector('.league-projection-detail').textContent,f,model:p.model};}));
   const expected=await page.evaluate(s=>data.soccerAgeProjections[s].forecasts.filter(f=>Date.parse(f.fixture_id[5])>Date.now()).length,sport);assert.equal(actual.length,expected);assert.ok(expected>0);
   for(const {text,detail,f,model} of actual){const spread=Math.round(Math.abs(f.margin_home)*2)/2;assert.equal(text,`Model · ${spread?`${f.fixture_id[f.margin_home>0?3:4]} −${spread}`:'Pick’em'} · Total ${Math.round(f.total*2)/2} goals`);assert.match(detail,/Broad approximate 95%/);assert.ok(detail.includes(`scored GP away ${f.away_gp} / home ${f.home_gp}`));assert.ok(detail.includes(`${f.total_range[0]}–${f.total_range[1]}`));assert.equal(model.prior_games,3);assert.equal(model.sport,sport);}
   assert.equal(await page.locator('[data-projection-caution]').isVisible(),true);
   const first=page.locator('.league-fixture').filter({has:page.locator('.league-projection b')}).first();await first.locator('summary').click();assert.equal(await first.locator('.league-projection-detail').isVisible(),true);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok(await page.locator('#league-schedule').evaluate(e=>e.scrollWidth<=e.clientWidth));assert.ok(await toggle.evaluate(e=>e.getBoundingClientRect().height>=44&&e.scrollWidth<=e.clientWidth));
   if(process.env.QA_DIR){await first.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(process.env.QA_DIR,`${sport}-${width}.png`)});}
   await page.locator('[data-projection-guide] summary').click();assert.match(await page.locator('[data-projection-guide]').innerText(),/trained separately/);
   const divisions=await page.locator('#division option').evaluateAll(es=>es.map(e=>e.value));
   for(const d of divisions){await page.locator('#division').selectOption(d);assert.equal(await page.locator('.league-projection b').count(),await page.evaluate(({sport,d})=>data.soccerAgeProjections[sport].forecasts.filter(f=>(d==='all'||f.fixture_id[2]===d)&&Date.parse(f.fixture_id[5])>Date.now()).length,{sport,d}));}
   await page.locator('#division').selectOption('all');await page.locator('#search').fill(sport==='8u'?'Arsenal':'Vipers');const sample=await page.locator('.league-projection b').first().locator('..').innerText();report.push({width,sport,expected,divisions,sample});
   await page.locator('[data-league-filter="Results"]').click();assert.equal(await page.locator('.league-projection').count(),0);
   await page.reload();await page.waitForSelector('[data-league-fixture]');assert.equal(await page.locator('[data-league-projections]').getAttribute('aria-pressed'),'false');assert.deepEqual(errors,[]);await page.close();
  }
  console.log(JSON.stringify(report,null,2));
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
