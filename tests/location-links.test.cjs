'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ui = require('../site/schedules.js');
const maps = `https://www.google.com.au/maps/dir/''/29.7810003,-95.5532311/?q="&x=1`;
function rows(location_url=maps, location='MMS <North> & "West"') {
 return ui.buildRows({divisions:[{sport:'flag',division:'Burrow',teams:[],schedule:[{home:'Buccaneers',away:'Rivals',date_iso:'2026-09-12',location,location_url}]}]},'2026-09-08');
}
test('official map destination flows through both layouts, compact text and escaped attributes',()=>{
 assert.equal(rows()[0].locationUrl,maps);
 for(const layout of ['glance','guide']){
  const html=ui.renderHTML(rows(),'All',layout);
  assert.match(html,/class="field-map"/);
  assert.ok(html.includes(`href="${ui.escapeHTML(maps)}"`));
  assert.match(html,/target="_blank" rel="noopener noreferrer"/);
  assert.ok(html.includes('MMS &lt;North&gt; &amp; &quot;West&quot;</a>'));
  assert.ok(html.includes('in Google Maps (opens in a new tab)'));
  assert.doesNotMatch(html,/<North>/);
 }
});
test('missing, unsafe and non-map URLs remain plain field text in both layouts',()=>{
 for(const url of [null,'','javascript:alert(1)','data:text/html,x','ftp://maps.google.com/maps','https://google.com.evil/maps','https://www.google.com/url?q=x','https://user@maps.google.com/maps','https://maps.google.com:444/maps','https://maps.google.com/\\@evil/maps','https://maps.google.com/\nmaps','//maps.google.com/maps']){
  for(const layout of ['glance','guide']){
   const html=ui.renderHTML(rows(url),'All',layout);
   assert.doesNotMatch(html,/class="field-map"/);
   assert.ok(html.includes('MMS &lt;North&gt; &amp; &quot;West&quot;'));
  }
 }
 assert.doesNotMatch(ui.renderHTML(rows(maps,''),'All'),/class="field-map"/);
 assert.match(ui.renderHTML(rows(maps,''),'All'),/Field not listed/);
});
test('preserves legacy HTTP and observed Google map hosts',()=>{
 for(const url of ['http://maps.google.com/maps?li=rwp&q=3080%20Gessner','https://www.google.com/maps/@29,-95','https://www.google.com.au/maps/dir/']){
  assert.equal(ui.safeLocationURL(url),url);
 }
});
