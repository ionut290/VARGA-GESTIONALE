const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function load(){
  const context={console,Intl,Date,Math,S:{set(){}},db:{jobs:[{id:'job-1',title:'Hera Cadriano',code:'CAD',hourlyRevenueRate:35}],economicEntries:[],expenses:[],vcOre:[],quotes:[],depurazioneConsuntivi:[],discaricheConsuntivi:[],consuntivi:[],vcRecords:[]}};
  context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','job-economics.js'),'utf8'),context,{filename:'job-economics.js'});
  return context;
}

test('calcola valore ore, entrate, uscite e risultati senza sommare due volte i documenti',()=>{
  const c=load(),job=c.db.jobs[0],api=c.VargaJobEconomics;
  c.db.vcOre.push({jobId:job.id,data:'2026-09-01',ore:2},{jobId:job.id,data:'2026-09-02',ore:3});
  c.db.expenses.push({id:'x1',jobId:job.id,amount:50,date:'2026-09-02'});
  api.registerDocument({jobId:job.id,type:'Preventivo',sourceId:'p1',amount:100,title:'Preventivo 1',status:api.PENDING},{persist:false});
  api.registerDocument({jobId:job.id,type:'Contabilita',sourceId:'c1',amount:200,title:'Giro 1',status:api.CONFIRMED},{persist:false});
  const result=api.calculate(job);
  assert.equal(result.workedHours,5);
  assert.equal(result.accrued,175);
  assert.equal(result.pending,100);
  assert.equal(result.confirmed,200);
  assert.equal(result.expenses,50);
  assert.equal(result.estimated,125);
  assert.equal(result.actual,150);
});

test('lo stesso documento aggiorna una sola entrata',()=>{
  const c=load(),api=c.VargaJobEconomics;
  api.registerDocument({jobId:'job-1',type:'Consuntivo',sourceId:'doc-1',amount:100,title:'Consuntivo'},{persist:false});
  api.registerDocument({jobId:'job-1',type:'Consuntivo',sourceId:'doc-1',amount:125,title:'Consuntivo corretto'},{persist:false});
  assert.equal(c.db.economicEntries.length,1);
  assert.equal(c.db.economicEntries[0].amount,125);
});

test('il consuntivo di un singolo impianto non crea un entrata',()=>{
  const c=load(),api=c.VargaJobEconomics;
  c.db.depurazioneConsuntivi.push({id:'dep-1',jobId:'job-1',jobName:'Hera Cadriano',plantName:'Impianto 1',date:'2026-09-03',total:450,status:'Completato'});
  api.registerDocument({jobId:'job-1',type:'Consuntivo',sourceId:'dep-1',amount:450,title:'Consuntivo Impianto 1'},{persist:false});
  api.confirmByMapReceipt({id:'map-1',depurazioneConsuntivoId:'dep-1',subject:'MAP 123',emailDate:'2026-09-05'},{persist:false});
  api.reconcile(c.db.jobs[0]);
  assert.equal(c.db.economicEntries.length,0);
  assert.equal(api.candidateDocuments(c.db.jobs[0]).length,0);
});

test('la contabilita del giro crea una sola entrata riepilogativa',()=>{
  const c=load(),api=c.VargaJobEconomics,job=c.db.jobs[0];
  job.vcSourceId='commesse/cad';
  c.db.vcRecords.push({sourcePath:'commesse/cad/giriContabili/giro-01',data:{numeroGiro:1,commessaNome:'Hera Cadriano',totalAmount:900,closedAtIso:'2026-09-05',accountingSentAt:'2026-09-06'}});
  api.reconcile(job);
  assert.equal(c.db.economicEntries.length,1);
  assert.equal(c.db.economicEntries[0].type,'Contabilita');
  assert.equal(c.db.economicEntries[0].amount,900);
});

test('la vista commessa espone pulsante, scheda e sincronizzazione economica',()=>{
  const root=path.resolve(__dirname,'..');
  const workspace=fs.readFileSync(path.join(root,'job-workspace.js'),'utf8');
  const core=fs.readFileSync(path.join(root,'app-core.js'),'utf8');
  const cloud=fs.readFileSync(path.join(root,'cloud-incremental-sync.js'),'utf8');
  const loader=fs.readFileSync(path.join(root,'app.js'),'utf8');
  assert.match(workspace,/ENTRATE E USCITE/);
  assert.match(workspace,/\['economics','Entrate e uscite'\]/);
  assert.doesNotMatch(workspace,/di costo personale/);
  assert.match(core,/economicEntries:S\.get\('vg_economicEntries'/);
  assert.match(cloud,/'economicEntries'/);
  assert.ok(loader.indexOf('job-economics.js')<loader.indexOf('job-workspace.js'));
});
