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
  const name=req.url.split('?')[0].endsWith('data.json')?'data.json':'index.html';
  res.setHeader('Content-Type',name.endsWith('.json')?'application/json':'text/html');
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
  for(const [sport,team,coach] of [['flag','Buccaneers','Wells'],['8u','Arsenal','Klupchak'],['6u','Vipers','Ellis']]){
   await page.locator(`[data-sport="${sport}"]`).click();
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
  await page.locator('[data-sport="flag"]').click();
  if(process.env.SCREENSHOT)await page.screenshot({path:process.env.SCREENSHOT,fullPage:true});
  // Hostile name is QA-only, injected in browser memory, never written into public data.
  await page.evaluate(()=>{data.divisions.find(d=>d.sport==='flag').teams[0].coach='<img src=x onerror="window.coachInjection=true">';render();});
  assert.equal(await page.locator('#rows img').count(),0);
  assert.equal(await page.evaluate(()=>window.coachInjection),undefined);
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS: no reload button; coach names and search in all sports; responsive widths; escaped coach text; zero JavaScript errors.');
 } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
