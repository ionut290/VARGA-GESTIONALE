/* Fine giro: copia verificata prima di rimuovere i soli elenchi operativi. */
(function(){
'use strict';
const removable=['lavorazioni','impiantiFisici','impianti','fattoVisualEvidence'];
const collections=[...removable,'noteCommessa'];
const clean=v=>String(v??'').trim();
const done=r=>clean(r.stato||r.statoGenerale).toUpperCase()==='FATTO'||r.done===true;
function numeric(v){if(typeof v==='number')return Number.isFinite(v)?v:0;let s=clean(v).replace(/€/g,'').replace(/\s/g,'');if(s.includes(',')&&s.includes('.'))s=s.lastIndexOf(',')>s.lastIndexOf('.')?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');else s=s.replace(',','.');return Number(s)||0}
function canonical(value){if(value&&typeof value.toJSON==='function')value=value.toJSON();if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value}
const fingerprint=v=>JSON.stringify(canonical(v));
async function read(store,path,names=collections){return Object.fromEntries(await Promise.all(names.map(async name=>{const s=await store.doc(path).collection(name).get({source:'server'});return[name,s.docs.map(d=>({id:d.id,data:d.data()}))]})))}
function records(path,source){return Object.entries(source).flatMap(([name,items])=>items.map(item=>({id:item.id,sourcePath:`${path}/${name}/${item.id}`,rootCollection:'commesse',data:item.data})))}
function legacyWork(item){const p=item.data;return{id:item.id,data:{...p,legacySourceId:item.id,archivedFromLegacy:true,impiantoId:p.physicalPlantId||item.id,denominazione:p.denominazione||p.nome||'',stato:done(p)?'FATTO':p.stato||'DA FARE',codiceVocePrezzo:p.codiceVocePrezzo||p.codicePrezzo||'',tipologiaLavorazione:p.tipologiaLavorazione||p.tipologiaIntervento||'',operatoreNome:p.operatoreNome||p.operatore||''}}}
async function copy(store,path,source){for(const [name,items]of Object.entries(source)){for(let i=0;i<items.length;i+=300){const batch=store.batch();items.slice(i,i+300).forEach(item=>batch.set(store.doc(`${path}/${name}/${item.id}`),item.data));await batch.commit()}}}
function verify(source,archive){for(const name of collections){const target=new Map((archive[name]||[]).map(x=>[x.id,x.data]));for(const item of source[name]||[])if(!target.has(item.id)||fingerprint(target.get(item.id))!==fingerprint(item.data))throw Error('Copia archivio non verificata: '+name+'/'+item.id)}}
async function close(options){
 const {store,job,uid,confirm,stamp,removeField}=options,base=clean(job?.vcSourceId);
 if(!/^commesse\/[^/]+$/.test(base))throw Error('Commessa collegata non valida.');
 if(!uid||!store)throw Error('Accedi al Cloud come amministratore.');
 const commessa=store.doc(base),root=await commessa.get({source:'server'});
 if(!root.exists)throw Error('La commessa non esiste più.');
 let roundId=root.data().pendingRoundClosureId,roundPath,header,source,archive;
 if(roundId){
  roundPath=base+'/giriContabili/'+roundId;
  const prior=await store.doc(roundPath).get({source:'server'});
  if(!prior.exists)throw Error('Archivio in corso non trovato. Non verrà rimosso alcun impianto.');
  header=prior.data();
 }
 if(!header?.archiveComplete){
  source=await read(store,base);
  if(!source.lavorazioni.length&&!source.impianti.length)throw Error('Non ci sono impianti o lavorazioni da archiviare.');
  const work=source.lavorazioni.length?source.lavorazioni:source.impianti.map(legacyWork),completed=work.filter(x=>done(x.data));
  if(!completed.length)throw Error('Nessuna lavorazione FATTO: completa il giro prima di archiviarlo.');
  const previous=await commessa.collection('giriContabili').get({source:'server'}),number=header?.numeroGiro||Math.max(0,...previous.docs.map(d=>numeric(d.data().numeroGiro)))+1;
  const total=completed.reduce((sum,x)=>sum+numeric(x.data.totale??x.data.importo),0);
  if(!confirm(`FINE GIRO ${number} — ${job.title}\n\nArchiviare l’intero elenco: ${source.impianti.length||source.impiantiFisici.length} impianti, ${work.length} lavorazioni (${completed.length} FATTO, ${work.length-completed.length} da fare)?\nTotale FATTO: ${total.toLocaleString('it-IT',{style:'currency',currency:'EUR'})}\n\nDopo la verifica della copia, gli impianti verranno tolti dall’elenco attivo di Varga Cantieri. Commessa, prezziario, personale, squadre e ore resteranno disponibili.`))return{cancelled:true};
  roundId=roundId||commessa.collection('giriContabili').doc().id;roundPath=base+'/giriContabili/'+roundId;
  const now=new Date(),due=new Date(now);due.setDate(due.getDate()+7);
  header={...header,giroId:roundId,numeroGiro:number,commessaId:base.split('/')[1],commessaNome:job.title,codiceCommessa:job.code||'',closedAtIso:header?.closedAtIso||now.toISOString(),createdBy:uid,doneRows:completed.length,totalRows:work.length,totalAmount:total,stato:'ARCHIVIAZIONE_IN_CORSO',accountingDueAt:due.toISOString(),mapStatus:'NON_RICEVUTO',archiveComplete:false,archiveVersion:3,immutableSnapshot:true,sourceType:source.lavorazioni.length?'lavorazioni':'impianti-legacy',sourceCounts:Object.fromEntries(collections.map(name=>[name,source[name].length])),commessaSnapshot:root.data(),clearStatus:'PENDING'};
  await store.runTransaction(async tx=>{const latest=await tx.get(commessa);const pending=latest.data()?.pendingRoundClosureId;if(pending&&pending!==roundId)throw Error('Un altro fine giro è già in corso. Riapri la commessa e riprova.');tx.set(store.doc(roundPath),header);tx.set(commessa,{pendingRoundClosureId:roundId},{merge:true})});
  // Keep exact source copies. Derived legacy rows are used only by client accounting.
  archive={...source,lavorazioni:work,impiantiFisici:source.impiantiFisici.length?source.impiantiFisici:source.impianti};
  await copy(store,roundPath,archive);
  const checked=await read(store,roundPath);
  verify(source,checked);
  if(checked.lavorazioni.length!==work.length)throw Error('Conteggio lavorazioni archiviate non verificato.');
  header={...header,archiveComplete:true,stato:'CONTABILITA_DA_INVIARE',archiveVerifiedAt:new Date().toISOString()};
  await store.doc(roundPath).set(header,{merge:true});
  archive=checked;
 }else{
  if(!confirm(`Riprendere lo svuotamento del Giro ${header.numeroGiro}? La copia completa è già conservata nello storico.`))return{cancelled:true};
  archive=await read(store,roundPath);
  for(const name of collections){const expected=header.sourceCounts?.[name];if(expected!=null&&archive[name].length<expected)throw Error('Archivio incompleto: nessun impianto verrà rimosso.');}
 }
 const removed=[],changed=[];
 // Work and physical plants precede the operational list. Each delete is paired
 // with an exact archived copy, checked in the same Firestore transaction.
 for(const name of removable){
  if(name==='impiantiFisici'&&header.sourceType!=='impianti-legacy'){
   const activeWork=await store.doc(base).collection('lavorazioni').get({source:'server'});
   if(activeWork.docs.length)break; // Keep the parent plants of new/changed work.
  }
  if(name==='lavorazioni'&&header.sourceType==='impianti-legacy')continue;
  if(name==='impiantiFisici'&&!header.sourceCounts.impiantiFisici)continue;
  const items=archive[name]||[];
  for(let start=0;start<items.length;start+=100){
   const chunk=items.slice(start,start+100);
   const result=await store.runTransaction(async tx=>{
    const docs=await Promise.all(chunk.map(async item=>{const live=store.doc(`${base}/${name}/${item.id}`),saved=store.doc(`${roundPath}/${name}/${item.id}`);return{item,live,current:await tx.get(live),snapshot:await tx.get(saved)}}));
    const deleted=[],kept=[];
    for(const d of docs){if(!d.snapshot.exists||fingerprint(d.snapshot.data())!==fingerprint(d.item.data))throw Error('Archivio alterato: svuotamento interrotto.');if(!d.current.exists){deleted.push(d.live.path);continue}if(fingerprint(d.current.data())!==fingerprint(d.snapshot.data())){kept.push(d.live.path);continue}tx.delete(d.live);deleted.push(d.live.path);if(name==='impianti')tx.set(store.doc(`${base}/impiantoChangeIndex/${d.item.id}`),{impiantoId:d.item.id,commessaId:base.split('/')[1],deleted:true,changedAt:stamp(),source:'varga-gestionale-fine-giro'},{merge:true})}
    return{deleted,kept};
   });removed.push(...result.deleted);changed.push(...result.kept);
  }
 }
 const remaining=await read(store,base),work=remaining.lavorazioni,plants=remaining.impianti;
 const counts={impiantiCount:plants.length,totalPlants:plants.length,workItemsCount:work.length,impiantiFattiCount:plants.filter(x=>done(x.data)).length,impiantiDaFareCount:plants.filter(x=>!done(x.data)).length,workItemsFattiCount:work.filter(x=>done(x.data)).length,workItemsDaFareCount:work.filter(x=>!done(x.data)).length,completedSubtotal:work.filter(x=>done(x.data)).reduce((s,x)=>s+numeric(x.data.totale),0)};
 const leftover=removable.reduce((sum,name)=>sum+remaining[name].length,0);
 header={...header,clearStatus:leftover?'COMPLETED_WITH_REMAINING':'COMPLETED',clearedAtIso:new Date().toISOString(),remainingActiveRows:leftover};
 const dates=leftover?{}:Object.fromEntries(['firstDoneAt','firstDoneDateKey','lastDoneAt','lastDoneDateKey','lastResetAt','lastResetDateKey'].map(key=>[key,removeField()]));
 const batch=store.batch();batch.set(store.doc(roundPath),header,{merge:true});batch.set(commessa,{...counts,...dates,subtotalCompleted:counts.completedSubtotal,pendingRoundClosureId:removeField(),lastClosedGiroId:roundId,lastClosedGiroNumber:header.numeroGiro,lastClosedGiroAt:stamp(),currentGiroNumber:header.numeroGiro+1,accountingRoundStatus:header.stato,operationalModelSyncedAt:stamp(),updatedAt:stamp(),updatedBy:uid},{merge:true});await batch.commit();
 return{header,roundPath,archivedRecords:records(roundPath,archive),removedPaths:removed,activeRecords:records(base,remaining),remaining:remaining,changedPaths:changed};
}
window.VargaRoundClose={close,number:numeric};
})();
