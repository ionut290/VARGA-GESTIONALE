const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function load(db){
  const context={db,console};context.globalThis=context;vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','job-plant-progress-summary.js'),'utf8'),context,{filename:'job-plant-progress-summary.js'});
  return context.VargaPlantProgressSummary;
}

test('riepiloga impianti unici per commessa DEPURAZIONE e INRETE',()=>{
  const jobs=[
    {id:'dep',title:'HERA DEPURAZIONE BOLOGNA',code:'DEP',vcSourceId:'commesse/dep'},
    {id:'mod',title:'INRETE GAS MODENA',code:'MOD',vcSourceId:'commesse/mod'},
    {id:'altro',title:'VEGA CARBURANTI',vcSourceId:'commesse/vega'}
  ];
  const vcRecords=[
    {sourcePath:'commesse/dep/lavorazioni/1',data:{impiantoId:'p1',stato:'FATTO'}},
    {sourcePath:'commesse/dep/lavorazioni/2',data:{impiantoId:'p1',stato:'FATTO'}},
    {sourcePath:'commesse/dep/lavorazioni/3',data:{impiantoId:'p2',stato:'DA FARE'}},
    {sourcePath:'commesse/mod/lavorazioni/1',data:{idSap:'SAP-1',stato:'FATTO'}},
    {sourcePath:'commesse/vega/lavorazioni/1',data:{impiantoId:'x',stato:'DA FARE'}}
  ];
  const rows=load({jobs,vcRecords,vcImpianti:[]}).summaries();
  assert.equal(rows.length,2);
  assert.deepEqual(JSON.parse(JSON.stringify(rows.map(({family,total,done,todo,progress})=>({family,total,done,todo,progress})))),[
    {family:'DEPURAZIONE',total:2,done:1,todo:1,progress:50},
    {family:'INRETE',total:1,done:1,todo:0,progress:100}
  ]);
});

test('usa gli impianti fisici quando non esistono righe lavorazione',()=>{
  const jobs=[{id:'bo',title:'IN RETE BOLOGNA',vcSourceId:'commesse/bo'}];
  const vcRecords=[
    {sourcePath:'commesse/bo/impiantiFisici/a',data:{idSap:'A',statoGenerale:'FATTO'}},
    {sourcePath:'commesse/bo/impiantiFisici/b',data:{idSap:'B',statoGenerale:'DA FARE'}}
  ];
  const row=load({jobs,vcRecords,vcImpianti:[]}).jobSummary(jobs[0]);
  assert.equal(row.total,2);assert.equal(row.done,1);assert.equal(row.todo,1);assert.equal(row.progress,50);
});

test('il modulo viene caricato dopo la vista commesse',()=>{
  const loader=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  assert.ok(loader.indexOf('job-workspace.js')<loader.indexOf('job-plant-progress-summary.js'));
});
