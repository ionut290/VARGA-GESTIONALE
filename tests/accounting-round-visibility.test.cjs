const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('Home excludes hidden and trashed rounds immediately and after reloading persisted headers',()=>{
 const items=[{commessaNome:'Visibile',numeroGiro:1},{commessaNome:'Nascosto',numeroGiro:2,dashboardHidden:true},{commessaNome:'Eliminato',numeroGiro:3,roundDeletedAt:'2026-10-03'}];
 const records=items.map((data,i)=>({sourcePath:`commesse/bo/giriContabili/g${i}`,data}));
 const elements=new Map(),timers=[],listeners={},actions=[];
 const panel={style:{},innerHTML:'',addEventListener(event,fn){this[event]=fn}};
 const dashboard={querySelector:()=>({insertAdjacentElement(where,el){elements.set(el.id,el)}})};elements.set('dashboard',dashboard);
 const ctx={Date,Intl,console,db:{vcRecords:records},window:null,document:{getElementById:id=>elements.get(id),createElement:()=>panel},setTimeout:fn=>timers.push(fn),setInterval(){},addEventListener:(type,fn)=>listeners[type]=fn,VargaRoundHistory:{action(ev){const b=ev.target.closest();actions.push(b.dataset);records[0].data.dashboardHidden=true;listeners['varga-round-status-changed']()}},alert:message=>{throw Error(message)}};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync('dashboard-accounting-rounds.js','utf8'),ctx);timers.forEach(fn=>fn());
 assert.match(panel.innerHTML,/Visibile/);assert.doesNotMatch(panel.innerHTML,/Nascosto|Eliminato/);assert.match(panel.innerHTML,/NASCONDI DALLA HOME/);
 panel.click({target:{closest:()=>({dataset:{path:records[0].sourcePath,roundAction:'hide'}})}});assert.equal(actions[0].ra,'hide');assert.equal(panel.style.display,'none');
 ctx.db.vcRecords=JSON.parse(JSON.stringify(records));listeners['varga-round-status-changed']();assert.equal(panel.style.display,'none');
 records[0].data.dashboardHidden=false;ctx.db.vcRecords=records;listeners['varga-round-status-changed']();assert.match(panel.innerHTML,/Visibile/);assert.equal(panel.style.display,'block');
});
