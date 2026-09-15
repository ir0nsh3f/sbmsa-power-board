const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('followed ranking identity is exact sport/division/team, not family membership',()=>{
 const html=fs.readFileSync('site/index.html','utf8');
 const fn=html.match(/function isFollowed\(t\)\{[^\n]+\}/)?.[0];assert.ok(fn,'exact followed identity helper');
 for(const [sport,division,team,want] of [['5ug','Boxx','Rainbow Unicorns',true],['5ug','Akers','Rainbow Unicorns',false],['6u','Boxx','Rainbow Unicorns',false],['5ug','Boxx','Rainbow Unicorns II',false]])assert.equal(vm.runInNewContext(fn+';isFollowed(t)',{sport,t:{division,team}}),want);
 assert.ok(html.includes('aria-label="Followed team"'));
 assert.ok(html.includes("t.team===fav?.team||isFollowed(t)?'favorite':''"));
});
