// Durable price catalog. Lists + entries + sync acknowledgement commit together.
// Loaded immediately after app-core.js; retains its public storage interfaces.
(function(){
'use strict';
const DATABASE='varga-gestionale-price-catalog-v1', STORE='catalogs';
const clone=value=>JSON.parse(JSON.stringify(value));
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object'){const out={};Object.keys(value).sort().forEach(k=>{out[k]=canonical(value[k])});return out}return value}
function hash(value){const s=JSON.stringify(canonical(value));let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(36)+':'+s.length}
function validate(catalog){
 if(!catalog||!Array.isArray(catalog.priceLists)||!Array.isArray(catalog.entries))throw Error('Archivio prezziari non valido: nomi e voci devono essere presenti.');
 for(const [key,rows] of Object.entries(catalog)){if(key!=='priceLists'&&key!=='entries')continue;const ids=new Set();for(const row of rows){if(!row||typeof row!=='object'||typeof row.id!=='string'||!row.id||ids.has(row.id))throw Error('Archivio prezziari non valido: identificatori mancanti o duplicati.');ids.add(row.id)}}
 return catalog;
}
function workspace(){let cfg={};try{cfg=JSON.parse(localStorage.getItem('vg_cloudConfig')||'{}')}catch(_){}return String(document.getElementById('workspaceId')?.value||cfg.workspaceId||'varga-azienda').trim().replace(/[^a-zA-Z0-9_-]/g,'_')}
const scope=workspace(), currentKey=scope+':current', previousKey=scope+':previous';
let connection=null, record=null, loaded=false, tail=Promise.resolve(), activeWrites=0, lastError=null;
const legacyRead=readLargeEntries, legacySet=S.set;
function signal(message,error=false){window.VGPriceSaveStatus={message,error,pending:!!record?.pending};window.dispatchEvent(new CustomEvent('vg-price-status',{detail:window.VGPriceSaveStatus}))}
function open(){if(connection)return Promise.resolve(connection);return new Promise((resolve,reject)=>{const request=indexedDB.open(DATABASE,1);request.onupgradeneeded=()=>request.result.createObjectStore(STORE);request.onerror=()=>reject(request.error||Error('Archivio locale non disponibile'));request.onblocked=()=>reject(Error('Chiudi le altre schede del Gestionale e riprova.'));request.onsuccess=()=>{connection=request.result;connection.onversionchange=()=>{connection.close();connection=null};resolve(connection)}})}
async function readKey(key){const database=await open();return new Promise((resolve,reject)=>{const tx=database.transaction(STORE,'readonly');let value;const request=tx.objectStore(STORE).get(key);request.onsuccess=()=>{value=request.result||null};tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(tx.error||Error('Lettura prezziari interrotta'))})}
async function writeRecord(next,expectedRevision){
 const database=await open();return new Promise((resolve,reject)=>{
  let tx;try{tx=database.transaction(STORE,'readwrite',{durability:'strict'})}catch(_){tx=database.transaction(STORE,'readwrite')}
  const store=tx.objectStore(STORE);let failure=null;const request=store.get(currentKey);
  request.onsuccess=()=>{const old=request.result;if(Number(old?.revision||0)!==expectedRevision){failure=Error('I prezziari sono cambiati in un’altra scheda. Copia locale precedente conservata; ricarica prima di riprovare.');tx.abort();return}if(old&&hash(old.catalog)!==hash(next.catalog))store.put(old,previousKey);store.put(next,currentKey)};
  tx.oncomplete=()=>resolve(next);tx.onabort=()=>reject(failure||tx.error||Error('Salvataggio prezziari interrotto: copia precedente conservata.'));
 });
}
function current(){return {priceLists:db.priceLists,entries:db.entries}}
function cache(catalog){
 // Compatibility cache only. The atomic IndexedDB catalog is authoritative.
 try{localStorage.setItem('vg_priceLists',JSON.stringify(catalog.priceLists));localStorage.setItem('vg_entries',catalog.entries.length>2000?'[]':JSON.stringify(catalog.entries));localStorage.setItem('vg_priceCatalogScope',scope)}catch(error){console.warn('Cache compatibilità piena; archivio prezziari conservato in IndexedDB.',error)}
}
const ready=(async()=>{
 record=await readKey(currentKey);
 if(record){validate(record.catalog);db.priceLists=clone(record.catalog.priceLists);db.entries=clone(record.catalog.entries);cache(record.catalog)}
 else{
  let marker;try{marker=localStorage.getItem('vg_entries')}catch(_){}
  const legacyScope=localStorage.getItem('vg_priceCatalogScope');
  if(!legacyScope||legacyScope===scope){const legacy=await legacyRead();if(marker==='[]'&&legacy.length)db.entries=legacy}
  const catalog=clone(current());validate(catalog);
  const demoOnly=catalog.priceLists.every(p=>p.id==='pl-default')&&catalog.entries.every(e=>/^e[1-5]$/.test(e.id)&&e.priceListId==='pl-default'&&/^VERDE\.00[1-5]$/.test(e.code||''));
  record=await writeRecord({schema:1,workspaceId:scope,revision:1,catalog,pending:!demoOnly,base:{},syncedHash:'',savedAt:new Date().toISOString()},0);cache(catalog);
 }
 loaded=true;signal(record.pending?'Prezziari conservati sul dispositivo; condivisione da verificare.':'Archivio locale caricato. Verifica cloud in corso.');
 try{if(typeof refresh==='function')refresh()}catch(error){console.warn('Visualizzazione prezziari rinviata',error)}
 return true;
})();
ready.catch(error=>{lastError=error;signal('Archivio prezziari non disponibile: '+error.message,true)});
function commit(catalog,options={}){
 const frozen=clone(validate(catalog));activeWrites++;
 const task=tail.catch(()=>{}).then(async()=>{
  await ready;if(workspace()!==scope)throw Error('Workspace cambiato. Ricarica il Gestionale prima di salvare.');
  if(options.expectedRevision!=null&&record.revision!==options.expectedRevision)throw Object.assign(Error('I prezziari locali sono cambiati durante la verifica. Riprova condivisione: nessuna modifica sostituita.'),{code:'PREZZIARI_REVISIONE'});
  const mode=options.source||'local',candidate=mode==='ack'?clone(record.catalog):frozen,nextHash=hash(candidate),oldHash=hash(record.catalog);
  if(mode==='cloud'&&record.pending&&nextHash!==oldHash)throw Error('Esistono prezziari locali non condivisi: download sospeso per non sostituirli.');
  if(mode==='local'&&oldHash===nextHash){lastError=null;return clone(record)}
  let syncedHash=record.syncedHash,base=record.base||{},pending=nextHash!==syncedHash;
  if(mode==='cloud'){syncedHash=nextHash;base=options.versions||{};pending=false}
  if(mode==='ack'){syncedHash=options.uploadedHash;base=options.versions||{};pending=nextHash!==syncedHash}
  const next={schema:1,workspaceId:scope,revision:record.revision+1,catalog:candidate,pending,base:clone(base),syncedHash,savedAt:new Date().toISOString()};
  await writeRecord(next,record.revision);record=next;lastError=null;
  db.priceLists=clone(candidate.priceLists);db.entries=clone(candidate.entries);cache(candidate);
  signal(pending?'Salvato sul dispositivo — condivisione cloud in attesa.':'Salvato sul dispositivo e sincronizzato nel cloud.');
  return clone(record);
 });
 tail=task;task.catch(error=>{lastError=error.code==='PREZZIARI_REVISIONE'?null:error;signal('Prezziari: '+error.message,true)}).finally(()=>{activeWrites--});return task;
}
async function flush(){await ready;await tail.catch(error=>{if(error.code!=='PREZZIARI_REVISIONE')throw error});if(lastError)throw lastError;return clone(record)}
// app-core's delayed legacy hydration must not resurrect an older, larger array.
readLargeEntries=async function(){await ready;return db.entries};
storeLargeEntries=function(rows){return ready.then(()=>commit({priceLists:db.priceLists,entries:rows}))};
S.set=function(key,value){
 if(key!=='vg_priceLists'&&key!=='vg_entries')return legacySet.call(S,key,value);
 // Bootstrap saves must wait for full hydration, not capture the demo defaults.
 if(!loaded){const task=ready.then(()=>commit(current()));task.catch(()=>{});return task}
 return commit({priceLists:key==='vg_priceLists'?value:db.priceLists,entries:key==='vg_entries'?value:db.entries});
};
window.VGPriceCatalog={ready,flush,commit,hash,validate,scope,status:()=>record?clone(record):null,notify:signal,backup:()=>readKey(previousKey),async exportBackup(){await ready;await tail.catch(()=>{});const payload={app:'Varga Gestionale',type:'price-catalog-backup',version:1,createdAt:new Date().toISOString(),current:record,previous:await readKey(previousKey)};const url=URL.createObjectURL(new Blob([JSON.stringify(payload)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='Varga-Prezzari-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}};
window.addEventListener('beforeunload',event=>{if(activeWrites){event.preventDefault();event.returnValue=''}});
})();
