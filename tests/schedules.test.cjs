'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
let ui;
try { ui = require('../site/schedules.js'); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; ui = {}; }
// Synthetic test-only data. Never published as real schedules.
const game = (extra = {}) => ({home:'Buccaneers',away:'Rivals',date_iso:'2026-09-09',start_iso:null,home_score:null,away_score:null,...extra});
const division = (extra = {}) => ({sport:'flag',division:'Burrow',url:'https://example.com/schedule',teams:[{team:'Rivals',coach:'Local coach',w:1,l:1,t:0,gp:2,pf:30,pa:12}],schedule:[game()],...extra});
const rows = (schedule) => ui.buildRows({divisions:[division({schedule})]}, '2026-09-08');
test('exact sport/division/team favorite matching isolates opponent joins', () => {
 assert.equal(typeof ui.buildRows,'function');
 const result = ui.buildRows({divisions:[division(),division({division:'Other',teams:[{team:'Rivals',coach:'Wrong coach'}]}),division({sport:'8u',division:'Pulisic',schedule:[game({home:'Arsenal'})]}),division({sport:'6u',division:'Messi',schedule:[game({home:'Vipers'})]}),division({schedule:[game({home:'buccaneers'})]})]},'2026-09-08');
 assert.deepEqual(result.map(r=>[r.child,r.team,r.opponentCoach]),[['Dexter','Buccaneers','Local coach'],['Beckham','Arsenal','Local coach'],['Dexter','Vipers','Local coach']]);
 assert.equal(result[0].sourceUrl,'https://example.com/schedule');
});
test('focal result handles home, away, scoreless draw, and missing scores without zero coercion', () => {
 const result = [
  game({home_score:7,away_score:0}),game({home:'Rivals',away:'Buccaneers',home_score:7,away_score:0}),
  game({home_score:0,away_score:0}),game({home_score:0,away_score:null}),
  game({date_iso:'2026-09-01'}),game({date_iso:null}),game({home_score:'0',away_score:'0'})
 ].map(g => rows([g])[0]);
 assert.deepEqual(result.map(r=>r.status),['W','L','T','Upcoming','Awaiting result','Time TBD','Upcoming']);
 assert.equal(result[1].venue,'Away');
 assert.equal(result[1].scoreFor,0);
 assert.equal(result[0].opponentRecord,'1–1–0');
 assert.equal(result[0].scoredPerGame,15);
 assert.equal(result[0].allowedPerGame,6);
 assert.equal(result[0].scoredLabel,'PF/G');
 assert.equal(ui.buildRows({divisions:[division({sport:'8u',division:'Pulisic',schedule:[game({home:'Arsenal'})]})]},'2026-09-08')[0].allowedLabel,'GA/G');
 assert.equal(ui.buildRows({divisions:[division({teams:[]})]},'2026-09-08')[0].scoredPerGame,null);
});

test('Chicago date boundaries and chronological ordering put undated last', () => {
 assert.equal(typeof ui.chicagoDate,'function');
 assert.equal(ui.chicagoDate(new Date('2026-09-09T02:00:00Z')),'2026-09-08');
 assert.equal(ui.chicagoDate(new Date('2026-01-02T05:30:00Z')),'2026-01-01');
 const result = rows([game({date_iso:null}),game({start_iso:'2026-09-10T01:00:00Z'}),game({date_iso:'2026-09-07'}),game({start_iso:'2026-09-09T15:00:00-05:00'}),game({start_iso:'2026-09-09T09:00:00-05:00'})]);
 assert.deepEqual(result.map(r=>r.dateISO),['2026-09-07','2026-09-09','2026-09-09','2026-09-09',null]);
 assert.match(result[1].timeLabel,/9:00 AM CT/);
 assert.match(result[3].timeLabel,/8:00 PM CT/);
 assert.equal(result[0].status,'Awaiting result');
 assert.equal(ui.buildRows({divisions:[division({schedule:[game({date_iso:'2026-09-08'})]})]},new Date('2026-09-09T02:00:00Z'))[0].status,'Upcoming');
});

test('safe semantic markup, local filters, and explicit historical-stat disclosure', () => {
 assert.equal(typeof ui.renderHTML,'function');
 const list = rows([game({date_iso:'2026-09-01'}),game({home_score:0,away_score:0}),game({date_iso:null})]);
 assert.deepEqual(ui.filterRows(list,'Upcoming').map(r=>r.status),['Time TBD']);
 assert.equal(ui.filterRows(list,'Results').length,1);
 assert.equal(ui.filterRows(list,'All').length,3);
 const html = ui.renderHTML(list,'All');
 assert.match(html,/<table/); assert.match(html,/<caption>/); assert.match(html,/scope="col"/);
 assert.match(html,/1 past game awaiting a published result/);
 assert.match(html,/latest published season totals/); assert.match(html,/not pre-game/); assert.match(html,/Small samples are provisional/);
 assert.match(html,/aria-pressed="true"[^>]*>All/);
 const attack = '<img src=x onerror="alert(1)">';
 const unsafe = {...list[0],opponent:attack,opponentCoach:attack,location:attack,sourceUrl:'javascript:alert(1)'};
 const escaped = ui.renderHTML([unsafe],'All');
 assert.doesNotMatch(escaped,/<img|javascript:|href=/);
 assert.match(escaped,/&lt;img/);
 assert.equal(ui.escapeHTML(`<&"'>`),'&lt;&amp;&quot;&#39;&gt;');
 assert.equal(ui.safeSourceURL('data:text/html,x'),null);
 assert.match(ui.renderHTML([{...unsafe,sourceUrl:'https://example.com/?q="&x=1'}],'All'),/href="https:\/\/example.com\/\?q=&quot;&amp;x=1"/);
});
test('browser global exposes render; rerender replaces local subtree without container listeners', () => {
 const vm = require('node:vm');
 const fs = require('node:fs');
 const context = {}; vm.runInNewContext(fs.readFileSync(require.resolve('../site/schedules.js'),'utf8'),context);
 assert.equal(typeof context.SBMSASchedules.render,'function');
 const styles = [];
 const doc = {getElementById:id=>styles.find(s=>s.id===id),createElement:()=>({}),head:{appendChild:s=>styles.push(s)}};
 const buttons = ['Upcoming','Results','All'].map(filter=>({dataset:{scheduleFilter:filter},setAttribute(k,v){this[k]=v;},addEventListener(type,fn){this.click=fn;}}));
 const body = {innerHTML:''};
 const container = {ownerDocument:doc,classList:{add(){}},innerHTML:'',querySelectorAll:()=>buttons,querySelector:()=>body};
 const data = {divisions:[division()]};
 ui.render(data,container,'2026-09-08');
 assert.match(container.innerHTML,/Our teams — schedule &amp; opponent guide/);
 buttons[2].click(); assert.equal(buttons[2]['aria-pressed'],'true');
 ui.render(data,container,'2026-09-08'); assert.equal(styles.length,1);
});

test('fall DST repeated hour is ordered by actual offset-aware start instant', () => {
 const result = rows([game({start_iso:'2026-11-01T01:15:00-06:00'}),game({start_iso:'2026-11-01T01:45:00-05:00'})]);
 assert.deepEqual(result.map(r=>r.timeLabel),['1:45 AM CT','1:15 AM CT']);
});
