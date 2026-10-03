const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function harness(){
 const modals=[];
 function element(){const fields=new Map();return{style:{},removed:false,_html:'',set innerHTML(v){this._html=v;for(const m of v.matchAll(/<input name="([^"]+)"[^>]*value="([^"]*)"/g))fields.set(`[name="${m[1]}"]`,{value:m[2]})},get innerHTML(){return this._html},querySelector(s){if(!fields.has(s))fields.set(s,{focus(){},textContent:''});return fields.get(s)},remove(){this.removed=true}}}
 const ctx={Date,Intl,window:{},document:{createElement:element,body:{appendChild:m=>modals.push(m)}}};vm.createContext(ctx);vm.runInContext(fs.readFileSync('accounting-round-workflow.js','utf8'),ctx);
 return{api:ctx.window.VargaRoundWorkflow,modals};
}
test('review shows unfinished work and validates the accounting period before proceeding',async()=>{
 const {api,modals}=harness();assert.equal(api.day('30/09/2026'),'2026-09-30');
 const result=api.review({job:{title:'INRETE <Modena>'},plants:2,number:3,totalRows:2,doneRows:1,totalAmount:200,details:{periodStart:'2026-09-30',periodEnd:'2026-09-01',accountingDueAt:'2026-10-07'}}),modal=modals[0];
 assert.match(modal.innerHTML,/1 lavorazioni sono ancora DA FARE/);assert.match(modal.innerHTML,/INRETE &lt;Modena&gt;/);
 modal.querySelector('form').onsubmit({preventDefault(){}});assert.equal(modal.removed,false);assert.match(modal.querySelector('[data-error]').textContent,/fine del periodo/);
 modal.querySelector('[name="periodStart"]').value='2026-09-01';modal.querySelector('[name="periodEnd"]').value='2026-09-30';modal.querySelector('form').onsubmit({preventDefault(){}});
 const data=await result;assert.equal(data.numeroGiro,'3');assert.equal(data.periodStart,'2026-09-01');assert.equal(modal.removed,true);
});
test('cancel and Escape dismiss without recording a date or closing a giro',async()=>{
 const {api,modals}=harness();let result=api.sent({numeroGiro:1,commessaNome:'INRETE'});modals[0].querySelector('[data-cancel]').onclick();assert.equal(await result,null);
 result=api.map({numeroGiro:1,commessaNome:'INRETE',accountingSentAt:'2026-10-01'});modals[1].onkeydown({key:'Escape'});assert.equal(await result,null);
});
test('MAP reminder and receipt cannot precede the recorded accounting send date',async()=>{
 const {api,modals}=harness();const sent=api.sent({numeroGiro:1,commessaNome:'INRETE'}),s=modals[0];s.querySelector('[name="accountingSentAt"]').value='2026-10-02';s.querySelector('[name="mapDueAt"]').value='2026-10-01';s.querySelector('form').onsubmit({preventDefault(){}});assert.match(s.querySelector('[data-error]').textContent,/non può precedere/);s.querySelector('[data-cancel]').onclick();await sent;
 const received=api.map({numeroGiro:1,commessaNome:'INRETE',accountingSentAt:'2026-10-02'}),m=modals[1];m.querySelector('[name="mapReceivedAt"]').value='2026-10-01';m.querySelector('form').onsubmit({preventDefault(){}});assert.match(m.querySelector('[data-error]').textContent,/non può precedere/);m.querySelector('[data-cancel]').onclick();await received;
});
