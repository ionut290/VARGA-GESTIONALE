const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');

// Exercise the real workspace binding and economic submit handlers together.
// All panes exist before the user selects a tab, as in renderWorkspace().
function setup(initialTab='overview', workspaceSource=fs.readFileSync(path.join(root,'job-workspace.js'),'utf8')) {
  const selectors=new Map(), fields=new Map(), stored=new Map();
  const element=(dataset={})=>Object.assign(new EventTarget(),{dataset,value:'',classList:{toggle(){}}});
  const income=element(),expense=element();
  selectors.set('[data-eco-income-form]',[income]);
  selectors.set('[data-eco-expense-form]',[expense]);
  const tabs=['overview','economics'].map(jobTab=>element({jobTab}));
  selectors.set('[data-job-tab]',tabs);
  selectors.set('.vg-tab',tabs);
  selectors.set('.vg-pane',tabs.map(x=>element({pane:x.dataset.jobTab})));
  for(const name of ['Source','Type','Amount','Start','End','Hours','HoursInfo','DocumentDate','Title','Notes','ExpenseDate','ExpenseAmount','ExpenseCategory','ExpenseSupplier','ExpenseNotes'])fields.set('eco'+name,element());
  fields.get('ecoType').value='Consuntivo';
  fields.get('ecoTitle').value='Sfalcio Galliera';
  fields.get('ecoAmount').value='125.50';
  fields.get('ecoDocumentDate').value='2026-09-07';
  fields.get('ecoExpenseDate').value='2026-09-07';
  fields.get('ecoExpenseAmount').value='30';
  fields.get('ecoExpenseCategory').value='Materiale';
  const job={id:'discarica-1',title:'Galliera discarica'};
  const context={console,Intl,Date,Math,document:{
    getElementById:id=>id==='vgEconomicsStyles'?{}:fields.get(id),
    querySelector:s=>(selectors.get(s)||[])[0]||null,
    querySelectorAll:s=>selectors.get(s)||[]
  }, db:{jobs:[job],economicEntries:[],expenses:[]},
    S:{set:(k,v)=>stored.set(k,JSON.parse(JSON.stringify(v)))},
    currentJob:()=>job,renderWorkspace(){},activeTab:initialTab,saveCount:0,
    alert:message=>{throw Error(message)}
  };
  context.window=context;
  context.save=()=>{context.saveCount++;context.S.set('vg_economicEntries',context.db.economicEntries);context.S.set('vg_expenses',context.db.expenses)};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root,'job-economics.js'),'utf8'),context);
  const start=workspaceSource.indexOf('function bindWorkspace(){');
  const end=workspaceSource.indexOf('\nfunction renderJobCards()',start);
  vm.runInContext(workspaceSource.slice(start,end)+'\nbindWorkspace();',context);
  return {context,tabs,income,expense,stored};
}

test('scheda aperta dalla panoramica: entrata e uscita bloccano il reload e si salvano una volta',()=>{
  const c=setup();
  for(let i=0;i<3;i++){c.tabs[1].onclick();c.tabs[0].onclick()}
  c.tabs[1].onclick();
  const incomeEvent=new Event('submit',{cancelable:true});
  c.income.dispatchEvent(incomeEvent);
  assert.equal(incomeEvent.defaultPrevented,true);
  assert.equal(c.context.saveCount,1);
  assert.equal(c.stored.get('vg_economicEntries').length,1);
  assert.equal(c.stored.get('vg_economicEntries')[0].jobId,'discarica-1');
  assert.equal(c.stored.get('vg_economicEntries')[0].amount,125.5);
  assert.equal(c.stored.get('vg_economicEntries')[0].status,'DA_CONFERMARE');
  const expenseEvent=new Event('submit',{cancelable:true});
  c.expense.dispatchEvent(expenseEvent);
  assert.equal(expenseEvent.defaultPrevented,true);
  assert.equal(c.context.saveCount,2);
  assert.equal(c.stored.get('vg_expenses')[0].amount,30);
});

test('apertura diretta del dettaglio economico salva senza duplicare',()=>{
  const c=setup('economics');
  const event=new Event('submit',{cancelable:true});
  c.income.dispatchEvent(event);
  assert.equal(event.defaultPrevented,true);
  assert.equal(c.context.saveCount,1);
  assert.equal(c.context.db.economicEntries.length,1);
});
