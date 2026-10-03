const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const clone=v=>JSON.parse(JSON.stringify(v));
function fake(initial={}){const docs=new Map(Object.entries(clone(initial)));let tail=Promise.resolve();
 function doc(path){return{path,async get(){return{exists:docs.has(path),data:()=>clone(docs.get(path))}},async set(data){docs.set(path,clone(data))},collection:name=>({async get(){return{docs:[...docs].filter(([p])=>p.startsWith(path+'/'+name+'/')&&p.split('/').length===path.split('/').length+2).map(([p,data])=>({id:p.split('/').pop(),data:()=>clone(data)}))}}})}}
 const store={doc,runTransaction(fn){const task=tail.then(async()=>{const writes=[];const result=await fn({get:ref=>ref.get(),set:(ref,data)=>writes.push([ref.path,data])});for(const [p,data]of writes)docs.set(p,clone(data));return result});tail=task.catch(()=>{});return task}};return{docs,store};
}
function load(f){const ctx={console,Date,Intl,TextEncoder,crypto:webcrypto,Event,cloudStore:f.store,cloudUser:{uid:'admin'},cloudUserRole:'admin',db:{vcRecords:[],jobs:[]},save(){},setTimeout(){},setInterval(){},addEventListener(){},dispatchEvent(){}};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync('plant-registry.js','utf8'),ctx);return ctx}
const job={vcSourceId:'commesse/bo',title:'INRETE BOLOGNA'},row=(id,data)=>({sourcePath:`commesse/bo/lavorazioni/${id}`,data});
test('same SAP across repeated work and new rounds is copied once, preserving the first GPS and original data',async()=>{
 const f=fake(),c=load(f),api=c.VargaPlantRegistry,original={idSap:'SAP1',denominazione:'Cabina',latitudine:'44,123456',longitudine:'11.123456',nota:'Prima copia'};
 await api.ensure(f.store,job,[row('w1',original),row('w2',{...original,idSap:' sap1 ',quantita:2})]);assert.equal(api.entries(job).length,1);
 await api.ensure(f.store,job,[row('new',{...original,latitudine:45,nota:'Nuova'})]);assert.equal(api.entries(job).length,1);assert.equal(api.entries(job)[0].latitudine,'44,123456');assert.equal(api.entries(job)[0].sourceSnapshot.nota,'Prima copia');
 assert.equal(api.compare({...original,latitudine:'44.1234560'},api.entries(job)),null);const warning=api.compare({...original,latitudine:45},api.entries(job));assert.equal(warning.type,'different');assert.match(warning.message,/44.123456/);assert.match(warning.message,/45/);
});
test('same plant in different commesse has a separate archive; fallback identity ignores GPS changes',async()=>{
 const f=fake(),api=load(f).VargaPlantRegistry,p={denominazione:' Cabina A ',comune:'Bologna',indirizzo:'Via Roma 1',latitudine:44,longitudine:11};
 await api.ensure(f.store,job,[row('one',p),row('two',{...p,denominazione:'cabina a',latitudine:45})]);assert.equal(api.entries(job).length,1);
 const other={vcSourceId:'commesse/mo'};await api.ensure(f.store,other,[row('other',p)]);assert.equal(api.entries(other).length,1);assert.equal([...f.docs.keys()].filter(x=>x.includes('/archivioImpianti/')).length,2);
 await api.ensure(f.store,job,[row('sap-added',{...p,idSap:'SAP1'})]);assert.equal(api.entries(job).length,1);
});
test('backfill uses the earliest archived giro before active plants and never deletes operational records',async()=>{
 const f=fake({'commesse/bo/giriContabili/old':{numeroGiro:4,closedAtIso:'2026-08-01',archiveComplete:true},'commesse/bo/giriContabili/old/impiantiFisici/p1':{idSap:'SAP1',denominazione:'Cabina',latitudine:44,longitudine:11},'commesse/bo/impiantiFisici/p2':{idSap:'SAP1',denominazione:'Cabina',latitudine:45,longitudine:12},'commesse/bo/lavorazioni/w1':{idSap:'SAP2',denominazione:'Seconda',latitudine:46,longitudine:13}}),c=load(f),api=c.VargaPlantRegistry;
 await api.refresh(job,f.store);assert.equal(api.entries(job).length,2);assert.equal(api.entries(job).find(p=>p.idSap==='SAP1').latitudine,44);assert.equal(f.docs.get('commesse/bo/impiantiFisici/p2').latitudine,45);assert.ok(f.docs.has('commesse/bo/archivioImpiantiGiri/old'));
 const reloaded=load(f).VargaPlantRegistry;await reloaded.refresh(job,f.store);assert.equal(reloaded.entries(job).length,2);assert.equal(reloaded.compare({idSap:'SAP1',latitudine:45,longitudine:12},reloaded.entries(job)).type,'different');
});
test('two clients concurrently adding the same plant still create one cloud document',async()=>{
 const f=fake(),a=load(f).VargaPlantRegistry,b=load(f).VargaPlantRegistry,p=row('w1',{idSap:'SAP1',latitudine:44,longitudine:11});await Promise.all([a.ensure(f.store,job,[p]),b.ensure(f.store,job,[p])]);assert.equal([...f.docs.keys()].filter(x=>x.includes('/archivioImpianti/')).length,1);
});
test('missing and invalid coordinates are flagged, and ambiguous identity is not treated as a GPS match',()=>{
 const api=load(fake()).VargaPlantRegistry,baseline=[{idSap:'SAP1',latitudine:44,longitudine:11}];assert.equal(api.compare({idSap:'SAP1',latitudine:44},baseline).type,'missing');assert.equal(api.compare({idSap:'SAP1',latitudine:100,longitudine:11},baseline).type,'invalid');assert.equal(api.compare({idSap:'unknown',latitudine:44,longitudine:11},baseline),null);
 assert.equal(api.compare({denominazione:'Cabina',comune:'BO'},[{idSap:'1',denominazione:'Cabina',comune:'BO'},{idSap:'2',denominazione:'Cabina',comune:'BO'}]).type,'ambiguous');
});
test('GPS export fallback uses the physical snapshot from the same giro, preserving a blank when GPS is unknown',()=>{
 const c=load(fake()),api=c.VargaPlantRegistry;c.db.vcRecords=[{sourcePath:'commesse/bo/giriContabili/g1/impiantiFisici/p1',data:{latitudine:44.123456,longitudine:11.654321}},{sourcePath:'commesse/bo/impiantiFisici/p1',data:{latitudine:45,longitudine:12}}];
 const p=api.withGps({impiantoId:'p1'},'commesse/bo/giriContabili/g1/lavorazioni/w1');assert.equal(p.latitudine,44.123456);assert.equal(p.longitudine,11.654321);assert.equal(api.withGps({impiantoId:'unknown'},'commesse/bo/lavorazioni/w2').latitudine,'');
});

test('matching SAP also flags a changed name, town or address without altering the baseline',()=>{
 const api=load(fake()).VargaPlantRegistry,base=[{idSap:'SAP1',denominazione:'Cabina',comune:'Bologna',indirizzo:'Via Roma 1',latitudine:44,longitudine:11}];
 const warning=api.compare({...base[0],indirizzo:'Via Roma 2'},base);assert.equal(warning.type,'data');assert.match(warning.message,/Via Roma 1/);assert.match(warning.message,/Via Roma 2/);assert.equal(base[0].indirizzo,'Via Roma 1');
});
