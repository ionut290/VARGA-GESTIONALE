const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const cp=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
const DEL='__DELETE_FIELD__';
function fake(initial){
 const data=new Map(Object.entries(cp(initial))),state={batches:0,transactions:0,failBatch:0,failTransaction:0,beforeTransaction:null,reads:[],writes:[]};let next=0;
 const snap=path=>({id:path.split('/').pop(),exists:data.has(path),ref:doc(path),data:()=>cp(data.get(path))});
 function apply(ops){for(const [type,path,value,options]of ops){state.writes.push({type,path});if(type==='delete'){data.delete(path);continue}const v=options?.merge?{...data.get(path),...cp(value)}:cp(value);for(const key of Object.keys(v))if(v[key]===DEL)delete v[key];data.set(path,v)}}
 function doc(path){return{path,id:path.split('/').pop(),collection:name=>collection(path+'/'+name),async get(){state.reads.push(path);return snap(path)},async set(value,options){apply([['set',path,value,options]])}}}
 function collection(path){return{doc:id=>doc(path+'/'+(id||'round-'+(++next))),async get(){state.reads.push(path);const docs=[...data.keys()].filter(k=>k.startsWith(path+'/')&&k.split('/').length===path.split('/').length+1).map(snap);return{docs,size:docs.length,empty:!docs.length}}}}
 const store={doc,batch(){const ops=[];return{set(ref,v,opt){ops.push(['set',ref.path,v,opt])},async commit(){state.batches++;if(state.failBatch===state.batches)throw Error('rete interrotta');apply(ops)}}},async runTransaction(fn){state.transactions++;if(state.beforeTransaction)await state.beforeTransaction(state.transactions,data);if(state.failTransaction===state.transactions)throw Error('transazione interrotta');const ops=[];const result=await fn({get:async ref=>snap(ref.path),set(ref,v,opt){ops.push(['set',ref.path,v,opt])},delete(ref){ops.push(['delete',ref.path])}});apply(ops);return result}};
 return{data,state,store};
}
function seed(){return{
 'commesse/bo':{nome:'INRETE BOLOGNA',code:'BO',firstDoneAt:'2026-09-01'},
 'commesse/bo/lavorazioni/w1':{impiantoId:'p1',stato:'FATTO',totale:'1.200,50',denominazione:'Cabina',idSap:'SAP1',operatoreNome:'Cris',dataEsecuzione:'2026-09-30',oraEsecuzione:'10:00',note:'Nota storica',latitudine:'44.123456',longitudine:'11.654321'},
 'commesse/bo/lavorazioni/w2':{impiantoId:'p2',stato:'DA FARE',totale:20,denominazione:'Seconda cabina'},
 'commesse/bo/impiantiFisici/p1':{denominazione:'Cabina',idSap:'SAP1'},
 'commesse/bo/impiantiFisici/p2':{denominazione:'Seconda cabina'},
 'commesse/bo/impianti/p1':{physicalPlantId:'p1',done:true,operatore:'Cris'},
 'commesse/bo/impianti/p2':{physicalPlantId:'p2',done:false},
 'commesse/bo/fattoVisualEvidence/e1':{impiantoId:'p1',operatore:'Cris',data:'2026-09-30'},
 'commesse/bo/noteCommessa/n1':{impiantoId:'p1',nota:'Conservare'},
 'commesse/bo/prezziario/pr1':{codiceVoce:'SFALCIO',prezzoBase:25},
 'personale/u1':{nome:'Cris',linkedUserId:'auth1'},'users/u1':{email:'test@example.com'},
 'oreReports/h1':{commessaId:'bo',ore:8,operatore:'u1'},'squadre/s1':{utenti:['u1']},
 'commesse/mo/impianti/m1':{done:true},'commesse/mo/lavorazioni/mw1':{stato:'FATTO',totale:100}
}}
function load(f){const context={console,Date,Intl,Map,Set,window:{}};vm.createContext(context);vm.runInContext(fs.readFileSync('accounting-round-close.js','utf8'),context);return options=>context.window.VargaRoundClose.close({store:f.store,job:{vcSourceId:'commesse/bo',title:'INRETE BOLOGNA',code:'BO'},uid:'admin',confirm:()=>true,stamp:()=>123,removeField:()=>DEL,...options})}
test('archives the complete list before clearing only the selected operational collections',async()=>{
 const input=seed(),f=fake(input),result=await load(f)();const prefix=result.roundPath;
 assert.equal(result.header.totalRows,2);assert.equal(result.header.doneRows,1);assert.equal(result.header.totalAmount,1200.5);assert.equal(result.header.archiveComplete,true);assert.equal(result.header.clearStatus,'COMPLETED');
 for(const name of ['lavorazioni','impiantiFisici','impianti','fattoVisualEvidence'])for(const [path,value]of Object.entries(input).filter(([p])=>p.startsWith('commesse/bo/'+name+'/'))){assert.equal(f.data.has(path),false);assert.deepEqual(f.data.get(path.replace('commesse/bo',prefix)),value)}
 for(const path of ['personale/u1','users/u1','oreReports/h1','squadre/s1','commesse/bo/prezziario/pr1','commesse/bo/noteCommessa/n1','commesse/mo/impianti/m1','commesse/mo/lavorazioni/mw1'])assert.deepEqual(f.data.get(path),input[path]);
 assert.equal(f.data.get('commesse/bo').impiantiCount,0);assert.equal(f.data.get('commesse/bo').pendingRoundClosureId,undefined);assert.equal(f.data.get('commesse/bo/impiantoChangeIndex/p1').deleted,true);
 const firstDelete=f.state.writes.findIndex(x=>x.type==='delete');const seal=f.state.writes.findIndex(x=>x.path===prefix&&f.data.get(x.path).archiveComplete);assert.ok(firstDelete>seal);
 assert.ok(result.archivedRecords.some(x=>x.sourcePath===prefix+'/lavorazioni/w2'));
});
test('cancel changes nothing',async()=>{const input=seed(),f=fake(input);const r=await load(f)({confirm:()=>false});assert.equal(r.cancelled,true);assert.deepEqual(Object.fromEntries(f.data),input);assert.equal(f.state.writes.length,0)});
test('failed archive copy never clears a source and retry completes the same round',async()=>{
 const input=seed(),f=fake(input);f.state.failBatch=2;const run=load(f);await assert.rejects(run(),/rete interrotta/);
 for(const [path,value]of Object.entries(input))if(path!=='commesse/bo')assert.deepEqual(f.data.get(path),value);
 assert.equal(f.state.writes.some(x=>x.type==='delete'),false);const id=f.data.get('commesse/bo').pendingRoundClosureId;f.state.failBatch=0;const r=await run();assert.equal(r.header.giroId,id);assert.equal(r.header.clearStatus,'COMPLETED');
});
test('interrupted clearing resumes a sealed archive without replacing its data',async()=>{
 const f=fake(seed()),run=load(f);f.state.failTransaction=3;await assert.rejects(run(),/transazione interrotta/);
 const id=f.data.get('commesse/bo').pendingRoundClosureId,prefix='commesse/bo/giriContabili/'+id,original=cp(f.data.get(prefix+'/lavorazioni/w1'));
 assert.equal(f.data.get(prefix).archiveComplete,true);assert.equal(f.data.has('commesse/bo/lavorazioni/w1'),false);
 f.state.failTransaction=0;const r=await run();assert.equal(r.header.giroId,id);assert.deepEqual(f.data.get(prefix+'/lavorazioni/w1'),original);assert.equal(r.header.clearStatus,'COMPLETED');
});
test('concurrent edits remain active with their parent plants',async()=>{
 const f=fake(seed());f.state.beforeTransaction=(n,data)=>{if(n===2)data.get('commesse/bo/lavorazioni/w1').note='Nuova nota'};
 const r=await load(f)();assert.equal(f.data.get('commesse/bo/lavorazioni/w1').note,'Nuova nota');assert.equal(f.data.get(r.roundPath+'/lavorazioni/w1').note,'Nota storica');assert.equal(f.data.has('commesse/bo/impianti/p1'),true);assert.equal(r.header.clearStatus,'COMPLETED_WITH_REMAINING');
});
test('legacy operational plants are retained exactly and adapted for archived accounting',async()=>{
 const input=seed();for(const p of Object.keys(input))if(p.startsWith('commesse/bo/lavorazioni/')||p.startsWith('commesse/bo/impiantiFisici/'))delete input[p];input['commesse/bo/impianti/p1']={done:true,nome:'Legacy',totale:50,codicePrezzo:'SFALCIO',operatore:'Cris'};
 const f=fake(input),r=await load(f)();assert.deepEqual(f.data.get(r.roundPath+'/impianti/p1'),input['commesse/bo/impianti/p1']);assert.equal(f.data.get(r.roundPath+'/lavorazioni/p1').operatoreNome,'Cris');assert.equal(r.header.totalRows,2);assert.equal(r.header.totalAmount,50);assert.equal(f.data.has('commesse/bo/impianti/p1'),false);
});
test('large lists cross Firestore batch limits without losing rows',async()=>{
 const input={'commesse/bo':{nome:'INRETE BOLOGNA'}};for(let i=0;i<620;i++){input['commesse/bo/lavorazioni/w'+i]={stato:'FATTO',totale:1,impiantoId:'p'+i};input['commesse/bo/impianti/p'+i]={done:true}}
 const f=fake(input),r=await load(f)();assert.equal(r.header.totalRows,620);assert.equal(r.header.totalAmount,620);assert.equal(r.header.remainingActiveRows,0);assert.equal([...f.data.keys()].filter(p=>p.startsWith(r.roundPath+'/lavorazioni/')).length,620);
});
test('changed or missing archived copy prevents removal',async()=>{
 const f=fake(seed());f.state.beforeTransaction=(n,data)=>{if(n===2){const header=[...data.keys()].find(p=>/^commesse\/bo\/giriContabili\/[^/]+$/.test(p));data.delete(header+'/lavorazioni/w1')}};
 await assert.rejects(load(f)(),/Archivio alterato/);assert.equal(f.data.has('commesse/bo/lavorazioni/w1'),true);assert.equal(f.state.writes.some(x=>x.type==='delete'),false);
});
test('the real management button closes the round and replaces local active rows with its archive',async()=>{
 const f=fake(seed()),elements=new Map(),events=[];
 const el=()=>({innerHTML:'',disabled:false,textContent:'',querySelector(selector){if(!elements.has(selector))elements.set(selector,el());return elements.get(selector)},querySelectorAll:()=>[]});
 const manager=el();elements.set('jobPlantManager',manager);
 const context={console,Date,Intl,Map,Set,Event,TextEncoder,crypto:require('node:crypto').webcrypto,addEventListener(){},setInterval(){},window:null,document:{getElementById:id=>elements.get(id),addEventListener(){}},setTimeout(){},db:{jobs:[{id:'j1',vcSourceId:'commesse/bo',title:'INRETE BOLOGNA',code:'BO'}],vcRecords:Object.entries(seed()).map(([sourcePath,data])=>({sourcePath,id:sourcePath.split('/').pop(),data})),vcImpianti:[]},cloudUserRole:'admin',cloudUser:{uid:'admin'},cloudStore:f.store,firebase:{firestore:{FieldValue:{serverTimestamp:()=>123,delete:()=>DEL}}},save(){},nav(){},scrollTo(){},confirm:()=>true,alert:message=>events.push(message),dispatchEvent:event=>events.push(event.type)};
 context.window=context;vm.createContext(context);
 for(const file of ['plant-registry.js','accounting-round-close.js','job-plant-management.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
 context.VargaRoundWorkflow={day:v=>String(v||'').slice(0,10),review:async()=>({numeroGiro:1,periodStart:'2026-09-01',periodEnd:'2026-09-30',accountingDueAt:'2026-10-07'})};
 context.VargaJobPlantManager.open('j1');
 await context.VargaPlantRegistry.initialize(context.db.jobs[0]);
 assert.match(manager.innerHTML,/FINE GIRO — ARCHIVIA IMPIANTI/);
 await elements.get('[data-vpm-close]').onclick();
 assert.equal(context.db.vcRecords.some(r=>r.sourcePath.startsWith('commesse/bo/lavorazioni/')),false);
 assert.equal(context.db.vcRecords.filter(r=>/giriContabili\/[^/]+\/lavorazioni\//.test(r.sourcePath)).length,2);
 assert.ok([...f.data.keys()].some(p=>p.startsWith('commesse/bo/archivioImpianti/')));assert.equal(context.VargaPlantRegistry.entries(context.db.jobs[0]).length,2);
 assert.ok(events.includes('varga-round-closed'));assert.ok(events.some(x=>x.includes('archiviato e verificato')));
});
test('archived list keeps states, operators, times and Italian amounts; accounting and MAP actions still work',async()=>{
 const f=fake(seed()),r=await load(f)(),elements=new Map(),modals=[],timers=[];
 const element=()=>({style:{},innerHTML:'',querySelector(){return{onclick:null}},insertAdjacentElement(position,child){elements.set(child.id,child)},remove(){}});
 const section=element(),anchor=element();section.querySelector=()=>anchor;section.firstElementChild=anchor;elements.set('consuntivi',section);
 const context={console,Date,Intl,Event,dispatchEvent(){},cloudUserRole:'admin',window:null,document:{getElementById:id=>elements.get(id),createElement:element,body:{appendChild:child=>modals.push(child)}},db:{jobs:[{vcSourceId:'commesse/bo',code:'BO',title:'INRETE BOLOGNA'}],vcRecords:[...r.archivedRecords,{sourcePath:r.roundPath,data:r.header}]},cloudStore:f.store,firebase:{firestore:{FieldValue:{serverTimestamp:()=>123}}},save(){},confirm:()=>true,prompt:()=> 'MAP-123',alert(message){throw Error(message)},setInterval(){},setTimeout:fn=>timers.push(fn),addEventListener(){}};
 context.window=context;vm.createContext(context);
 for(const file of ['accounting-round-close.js','accounting-round-history-v2.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
 timers.forEach(fn=>fn());const panel=elements.get('accountingRoundsPanel');
 const sheets=[],files=[];context.XLSX={utils:{book_new:()=>({}),aoa_to_sheet:rows=>rows,book_append_sheet:(book,rows,name)=>sheets.push({name,rows})},writeFile:(book,name)=>files.push(name)};
 context.VargaRoundWorkflow={sent:async()=>({accountingSentAt:'2026-10-01',accountingReference:'PROT-12',mapDueAt:'2026-10-09'}),map:async()=>({mapReceivedAt:'2026-10-02',mapReference:'MAP-123'})};
 assert.match(panel.innerHTML,/VEDI ELENCO ARCHIVIATO/);assert.match(panel.innerHTML,/CONTABILITÀ INVIATA/);
 const click=ra=>panel.onclick({target:{closest:()=>({dataset:{ra,path:r.roundPath},disabled:false})}});
 await click('view');assert.match(modals[0].innerHTML,/Seconda cabina/);assert.match(modals[0].innerHTML,/DA FARE/);assert.match(modals[0].innerHTML,/Cris/);assert.match(modals[0].innerHTML,/10:00/);assert.match(modals[0].innerHTML,/44.123456/);assert.match(modals[0].innerHTML,/1\.?200,50/);
 await click('excel');assert.equal(files.length,1);assert.equal(sheets[1].name,'Contabilita FATTO');assert.equal(sheets[1].rows.length,2);assert.equal(sheets[1].rows[1][8],1200.5);assert.equal(sheets[1].rows[1][14],44.123456);assert.equal(sheets[1].rows[1][15],11.654321);assert.equal(sheets[2].name,'Non eseguite');assert.equal(sheets[2].rows[1][1],'Seconda cabina');
 await click('sent');assert.equal(f.data.get(r.roundPath).accountingSentAt,'2026-10-01');assert.equal(f.data.get(r.roundPath).accountingReference,'PROT-12');assert.equal(f.data.get(r.roundPath).stato,'MAP_IN_ATTESA');assert.match(panel.innerHTML,/MAP RICEVUTO/);
 await click('map');assert.equal(f.data.get(r.roundPath).stato,'CHIUSO_DEFINITIVAMENTE');assert.equal(f.data.get(r.roundPath).mapReference,'MAP-123');assert.equal(f.data.get(r.roundPath).mapReceivedAt,'2026-10-02');
 assert.match(panel.innerHTML,/PROT-12/);assert.match(panel.innerHTML,/CHIUSO CON MAP/);
 await click('hide');assert.equal(f.data.get(r.roundPath).dashboardHidden,true);assert.match(panel.innerHTML,/MOSTRA NELLA HOME/);assert.match(panel.innerHTML,/VEDI ELENCO ARCHIVIATO/);
 await click('show');assert.equal(f.data.get(r.roundPath).dashboardHidden,false);
 context.confirm=()=>false;await click('delete');assert.equal(f.data.get(r.roundPath).roundDeletedAt,undefined);
 context.confirm=()=>true;await click('delete');assert.ok(f.data.get(r.roundPath).roundDeletedAt);assert.match(panel.innerHTML,/Cestino \(1\)/);assert.doesNotMatch(panel.innerHTML,/VEDI ELENCO ARCHIVIATO/);assert.ok(f.data.has(r.roundPath+'/lavorazioni/w1'));
 await assert.rejects(click('view'),/cestino/);await click('restore');assert.equal(f.data.get(r.roundPath).roundDeletedAt,null);assert.equal(f.data.get(r.roundPath).mapReference,'MAP-123');assert.match(panel.innerHTML,/VEDI ELENCO ARCHIVIATO/);

 context.db.vcRecords.find(x=>x.sourcePath===r.roundPath).data={...r.header,accountingSentAt:null,mapStatus:'NON_RICEVUTO'};
 await assert.rejects(click('sent'),/già registrato/);assert.equal(f.data.get(r.roundPath).mapStatus,'RICEVUTO');
 f.data.get(r.roundPath).clearStatus='PENDING';await assert.rejects(click('sent'),/Completa prima/);
 context.cloudUserRole='worker';await assert.rejects(click('sent'),/amministratore/);
});

test('review assigns the real giro number and accounting period from authoritative rows',async()=>{
 const f=fake(seed());let summary;
 const r=await load(f)({review:async x=>{summary=x;return{numeroGiro:4,periodStart:'2026-09-01',periodEnd:'2026-09-30',accountingDueAt:'2026-10-07'}}});
 assert.equal(summary.doneRows,1);assert.equal(summary.totalRows,2);assert.equal(summary.totalAmount,1200.5);
 assert.equal(r.header.numeroGiro,4);assert.equal(r.header.periodStart,'2026-09-01');assert.equal(r.header.periodEnd,'2026-09-30');assert.equal(r.header.accountingDueAt,'2026-10-07');
});
test('cancelled review and duplicate real giro numbers never archive or clear live rows',async()=>{
 const f=fake(seed());const cancelled=await load(f)({review:async()=>null});assert.equal(cancelled.cancelled,true);assert.equal(f.state.writes.length,0);
 f.data.set('commesse/bo/giriContabili/old',{numeroGiro:4});
 await assert.rejects(load(f)({review:async()=>({numeroGiro:4,periodStart:'2026-09-01',periodEnd:'2026-09-30',accountingDueAt:'2026-10-07'})}),/già presente/);
 assert.equal(f.state.writes.length,0);assert.ok(f.data.has('commesse/bo/lavorazioni/w1'));
});
