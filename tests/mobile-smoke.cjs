// Real-publication mobile density checks; no fixture data replaces publication.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const server=http.createServer((req,res)=>{const requested=path.basename(req.url.split('?')[0]);const name=['ratings.js','data.json','advanced.js','schedules.js','league-schedule.js','league-schedule.css'].includes(requested)?requested:'index.html';res.setHeader('Content-Type',name.endsWith('.css')?'text/css':name.endsWith('.json')?'application/json':name.endsWith('.js')?'application/javascript':'text/html');res.end(fs.readFileSync(path.join(__dirname,'../site',name)));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.TEST_URL || `http://127.0.0.1:${server.address().port}/`);await page.waitForSelector('.row');
  const metrics=()=>page.evaluate(()=>({firstRow:document.querySelector('.row').getBoundingClientRect().top+scrollY-[...document.querySelectorAll('#publication .warning')].reduce((n,e)=>n+e.getBoundingClientRect().height+10,0),row:document.querySelector('.row').getBoundingClientRect().height,page:document.documentElement.scrollHeight}));
  console.log('390px layout',await metrics());
  assert.ok((await metrics()).firstRow<=600,'Rankings must start within 600px at 390px');
  assert.equal(await page.getByRole('tab').count(),4,'Separate views');
  for(const width of [320,390,600]){
   await page.setViewportSize({width,height:844});
   const m=await metrics();assert.ok(m.firstRow<=(width===320?700:600),`First ranking at ${m.firstRow}px (${width})`);assert.ok(m.row<=(width===320?72:60),`Compact row ${m.row}px`);
   assert.ok(await page.locator('#rows').isVisible());assert.ok(!await page.locator('#advanced').isVisible());assert.ok(!await page.locator('#team-schedules').isVisible());
   for(const [sport,team,coach] of [['flag','Buccaneers','Wells'],['8u','Arsenal','Klupchak'],['6u','Vipers','Ellis']]){
    await page.locator(`[data-sport="${sport}"]`).click();await page.locator('#search').fill(coach);
    const row=page.locator(`.row[data-team="${team}"]`);assert.ok(await row.isVisible());assert.ok((await row.innerText()).includes('Coach: '+coach));await page.locator('#search').fill('');
   }
   await page.getByRole('tab',{name:'Our Teams',exact:true}).click();
   for(const filter of ['All','Results','Upcoming']){await page.locator(`[data-schedule-filter="${filter}"]`).click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`No overflow ${width}/${filter}`);}
   await page.getByRole('tab',{name:'Advanced',exact:true}).click();
   const advancedMetrics=await page.locator('#stats-body tr').first().evaluate(e=>({top:e.getBoundingClientRect().top+scrollY-[...document.querySelectorAll('#publication .warning')].reduce((n,w)=>n+w.getBoundingClientRect().height+10,0),row:e.getBoundingClientRect().height}));console.log(width+'px advanced',advancedMetrics);assert.ok(advancedMetrics.top<=650,'Advanced table starts within 650px');
   const selectedRight=await page.locator('#stats-body tr td:nth-child(3)').first().evaluate(e=>e.getBoundingClientRect().right);assert.ok(selectedRight<=width,'Selected value visible without swipe');
   assert.ok(await page.locator('#division').isVisible());assert.ok(await page.locator('#search').isVisible());
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   const sizes=await page.locator('button,input,select,summary').evaluateAll(els=>els.filter(e=>e.getClientRects().length).map(e=>({name:e.textContent||e.id,height:e.getBoundingClientRect().height})));
   for(const size of sizes)assert.ok(size.height>=44,`Touch height ${size.name}: ${size.height}`);
   assert.ok(await page.locator('#stats-body tr').first().evaluate(e=>e.getBoundingClientRect().height<=82),'Dense stats rows');
   await page.getByRole('tab',{name:'Rankings',exact:true}).click();
  }
  await page.setViewportSize({width:390,height:844});
  assert.ok(!await page.locator('.timestamps').isVisible(),'Timestamp detail starts collapsed on mobile');
  await page.locator('#publication-details summary').click();assert.ok(await page.locator('.timestamps').isVisible());
  await page.evaluate(()=>publication());assert.ok(await page.locator('.timestamps').isVisible(),'Refresh preserves expanded details');
  await page.locator('#publication-details summary').click();
  await page.evaluate(()=>{window.savedPublication={status:data.status,last_successful_check:data.last_successful_check,errors:data.errors};data.status='error';data.last_successful_check='2000-01-01';data.errors=['QA source failure'];publication();});
  assert.ok((await page.locator('#publication').innerText()).includes('Stale:'));assert.ok(await page.getByText('QA source failure',{exact:true}).isVisible());
  await page.evaluate(()=>{Object.assign(data,window.savedPublication);publication();});
  await page.locator('[data-sport="flag"]').click();await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(process.env.QA_DIR||'/tmp','sbmsa-tabs-mobile.png'),fullPage:true});
  await page.getByRole('tab',{name:'Advanced',exact:true}).click();await page.locator('#stat-sort').selectOption('scored_pg');await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(process.env.QA_DIR||'/tmp','sbmsa-tabs-mobile-advanced.png'),fullPage:true});
  await page.getByRole('tab',{name:'Rankings',exact:true}).click();
  assert.equal(errors.length,0,errors.join('\n'));console.log('Final 390px layout',await metrics());console.log('PASS: separate mobile views, compact heights, coaches/search, touch targets, overflow and JavaScript.');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
