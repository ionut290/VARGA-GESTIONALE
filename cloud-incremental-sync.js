// Incremental synchronization. Catalog generations are immutable until published.
(function(){
'use strict';
const P=window.VGPriceCatalog;
const SECTION_KEYS=['clients','quotes','jobs','invoices','expenses','economicEntries','deadlines','documents','consuntivi','depurazioneConsuntivi','discaricheConsuntivi','cadrianoDocuments','requests','company'];
let manifestUnsub=null,timer=null,epoch=0,initialized=false,syncTail=Promise.resolve();
const copy=v=>JSON.parse(JSON.stringify(v)), hash=P.hash;
function scope(){return String(document.getElementById('workspaceId')?.value||cloudCfg.workspaceId||'varga-azienda').trim().replace(/[^a-zA-Z0-9_-]/g,'_')}
function identity(){return scope()+':'+(cloudUser?.uid||'')}
function assertSession(id){if(id!==identity()||scope()!==P.scope||!cloudUser)throw Error('Sessione o workspace cambiato: sincronizzazione sospesa.')}
const prefix=()=> 'vargaGestionaleWorkspace_'+scope();
const ref=suffix=>cloudStore.collection('appConfig').doc(prefix()+suffix);
const manifestRef=()=>ref('_manifest');
const sectionRef=key=>ref('_section_'+key);
function chunkRef(i,generation){return ref('_entries_'+(generation?generation+'_':'')+String(i).padStart(4,'0'))}
function listRef(generation){return generation?ref('_catalog_'+generation+'_lists'):sectionRef('priceLists')}
function keys(){return {hashes:'vg_cloudHashes_v3:'+scope(),versions:'vg_cloudVersions_v3:'+scope()}}
function getJSON(key){try{return JSON.parse(localStorage.getItem(key)||'{}')||{}}catch(_){return {}}}
function setJSON(key,value){localStorage.setItem(key,JSON.stringify(value))}
function info(text){const el=document.getElementById('cloudInfo');if(el)el.textContent=text}
function fail(error){console.warn('Sincronizzazione non completata',error);cloudStatus('Da sincronizzare');info(error.message);P.notify('Condivisione non completata. Prezziari locali conservati. '+error.message,true);return {ok:false,error:error.message}}
function serial(work){const run=syncTail.catch(()=>{}).then(work);syncTail=run;return run}
function catalogVersions(manifest){return {priceLists:Number(manifest.versions?.priceLists||0),entries:Number(manifest.versions?.entries||0)}}
function sameVersions(a,b){return Number(a?.priceLists||0)===Number(b?.priceLists||0)&&Number(a?.entries||0)===Number(b?.entries||0)}
function parseSection(doc,key,version){
 if(!doc.exists)throw Error('Download incompleto: manca la sezione '+key+'. Nessun dato locale sostituito.');
 const data=doc.data()||{};if(Number(data.version)!==Number(version))throw Error('La sezione '+key+' è cambiata durante il download. Riprova.');
 const value=JSON.parse(data.dataJson);if(key==='company'?!value||typeof value!=='object'||Array.isArray(value):!Array.isArray(value))throw Error('Sezione cloud non valida: '+key);return value;
}
async function readCatalog(manifest){
 const versions=catalogVersions(manifest),generation=manifest.catalogGeneration||'';
 if(!versions.priceLists||!versions.entries)throw Error('Archivio cloud prezziari incompleto. Copia locale conservata.');
 const count=Number(manifest.entryChunkCount);if(!Number.isInteger(count)||count<0||count>10000)throw Error('Numero blocchi prezziario non valido.');
 const priceLists=parseSection(await listRef(generation).get({source:'server'}),'priceLists',versions.priceLists),entries=[];
 for(let start=0;start<count;start+=10){
  const docs=await Promise.all(Array.from({length:Math.min(10,count-start)},(_,i)=>chunkRef(start+i,generation).get({source:'server'})));
  docs.forEach((doc,i)=>{entries.push(...parseSection(doc,'entries '+(start+i),versions.entries))});
 }
 const catalog=P.validate({priceLists,entries});
 if(manifest.entryCount!=null&&Number(manifest.entryCount)!==entries.length)throw Error('Download prezziario incompleto: conteggio voci diverso.');
 if(manifest.catalogHash&&manifest.catalogHash!==hash(catalog))throw Error('Download prezziario non coerente: la copia locale non è stata sostituita.');
 const listIds=new Set(priceLists.map(p=>p.id));if(entries.some(e=>!listIds.has(e.priceListId)))throw Error('Download prezziario incompleto: alcune voci non hanno il loro listino.');
 return catalog;
}
function splitEntries(entries){
 const chunks=[];let current=[],bytes=2;
 for(const row of entries){const size=new TextEncoder().encode(JSON.stringify(row)).length+1;if(size>400000)throw Error('Una voce è troppo lunga per il cloud; è conservata solo sul dispositivo.');if(current.length&&(bytes+size>400000||current.length>=900)){chunks.push(current);current=[];bytes=2}current.push(row);bytes+=size}
 if(current.length)chunks.push(current);return chunks;
}
async function stageCatalog(catalog,version,id){
 P.validate(catalog);const generation='g'+version+'_'+crypto.randomUUID().replace(/-/g,'');
 const chunks=splitEntries(catalog.entries),staged=[{reference:listRef(generation),row:{dataJson:JSON.stringify(catalog.priceLists),version}}];
 if(new TextEncoder().encode(staged[0].row.dataJson).length>700000)throw Error('Elenco prezziari troppo grande per il cloud. Copia locale conservata.');
 chunks.forEach((rows,i)=>staged.push({reference:chunkRef(i,generation),row:{dataJson:JSON.stringify(rows),version,chunk:i}}));
 // Small batches stay below Firestore request size. An interrupted staging never
 // changes the manifest or the currently readable catalog.
 for(let start=0;start<staged.length;start+=10){assertSession(id);const batch=cloudStore.batch();staged.slice(start,start+10).forEach(({reference,row})=>batch.set(reference,{...row,workspaceId:scope(),updatedBy:cloudUser.uid,updatedAt:firebase.firestore.FieldValue.serverTimestamp()}));await batch.commit()}
 return {catalogGeneration:generation,entryChunkCount:chunks.length,entryCount:catalog.entries.length,catalogHash:hash(catalog)};
}
async function migrateLegacy(id){
 let snap=await manifestRef().get({source:'server'});if(snap.exists)return snap;
 const legacy=await ref('').get({source:'server'});if(!legacy.exists)return snap;
 const old=JSON.parse(legacy.data()?.snapshotJson||'{}');
 // Never create a half-migrated catalog (the previous migration omitted entries).
 const hasCatalog=old.priceLists!==undefined||old.entries!==undefined;
 if(hasCatalog)P.validate({priceLists:old.priceLists,entries:old.entries});
 const version=Date.now(),staged=hasCatalog?await stageCatalog({priceLists:old.priceLists,entries:old.entries},version,id):{};
 assertSession(id);
 await cloudStore.runTransaction(async tx=>{
  const check=await tx.get(manifestRef());if(check.exists)return;
  assertSession(id);const versions={},updatedSections=[];
  SECTION_KEYS.forEach(key=>{if(old[key]===undefined)return;versions[key]=version;updatedSections.push(key);tx.set(sectionRef(key),{section:key,dataJson:JSON.stringify(old[key]),version,workspaceId:scope()})});
  if(hasCatalog){versions.priceLists=version;versions.entries=version;updatedSections.push('priceLists','entries')}
  tx.set(manifestRef(),{...staged,workspaceId:scope(),mode:'incremental-v3',versions,updatedSections,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:cloudUser.uid,updatedByName:cloudDisplayName()});
 });
 return manifestRef().get({source:'server'});
}
async function applyManifest(snap,id,forceAll=false){
 assertSession(id);await P.flush();if(!snap.exists)return {downloaded:0};
 const manifest=snap.data()||{},remoteVersions=manifest.versions||{},localVersions=getJSON(keys().versions),hashes=getJSON(keys().hashes);
 const wanted=SECTION_KEYS.filter(k=>remoteVersions[k]!=null&&(forceAll||Number(remoteVersions[k])>Number(localVersions[k]||0)));
 const docs=await Promise.all(wanted.map(k=>sectionRef(k).get({source:'server'}))),staged={};
 docs.forEach((doc,i)=>{staged[wanted[i]]=parseSection(doc,wanted[i],remoteVersions[wanted[i]])});
 const local=P.status(),versions=catalogVersions(manifest);let downloaded=wanted.length,conflict=false;
 const needCatalog=(versions.priceLists||versions.entries)&&(forceAll||!local.syncedHash||!sameVersions(versions,local.base));
 if(needCatalog){
  const catalog=await readCatalog(manifest);assertSession(id);
  // Recheck after network waits: an import may have completed in the meantime.
  const latest=await P.flush();
  if(latest.pending&&hash(latest.catalog)!==hash(catalog))conflict=true;
  else{await P.commit(catalog,{source:'cloud',versions});downloaded+=2}
 }
 assertSession(id);
 for(const k of wanted){db[k]=staged[k];await S.set('vg_'+k,db[k]);localVersions[k]=remoteVersions[k];hashes[k]=hash(db[k])}
 setJSON(keys().versions,localVersions);setJSON(keys().hashes,hashes);
 try{refresh();companyToForm()}catch(error){console.warn('Visualizzazione post-sync rinviata',error)}
 if(conflict){cloudStatus('Conflitto prezziari');P.notify('Il cloud contiene una versione diversa. I prezziari locali non condivisi sono conservati: nessuna sostituzione automatica.',true)}
 else{cloudStatus(P.status().pending?'Da sincronizzare':'Sincronizzato');info('Sezioni scaricate: '+downloaded+'. Archivio prezziari conservato sul dispositivo.')}
 return {downloaded,conflict};
}
async function initialize(id){if(initialized)return;await P.ready;assertSession(id);if(navigator.onLine===false)throw Error('Connessione assente. Riprovare quando torna Internet.');const snap=await migrateLegacy(id);await applyManifest(snap,id);initialized=true}
async function push(silent){
 if(!cloudStore||!cloudUser)return {ok:false,error:'Accesso cloud non disponibile.'};
 const id=identity();try{
  await initialize(id);await P.flush();assertSession(id);if(navigator.onLine===false)throw Error('Connessione assente. Copia locale conservata.');
  const local=P.status(),catalog=copy(local.catalog),previousHashes=getJSON(keys().hashes),localVersions=getJSON(keys().versions);
  const sections={};SECTION_KEYS.forEach(k=>{if(db[k]!==undefined)sections[k]=copy(db[k])});
  const changed=Object.keys(sections).filter(k=>previousHashes[k]!==hash(sections[k])||localVersions[k]==null);
  const catalogChanged=local.pending||!local.syncedHash;
  if(!changed.length&&!catalogChanged){cloudStatus('Sincronizzato');return {ok:true}}
  const before=await manifestRef().get({source:'server'}),beforeData=before.exists?before.data():{},remote=beforeData.versions||{};
  if(catalogChanged&&!sameVersions(local.base,catalogVersions(beforeData)))throw Error('Un altro dispositivo ha aggiornato i prezziari. Invio sospeso per evitare sovrascritture; la tua copia locale resta disponibile.');
  const version=Math.max(Date.now(),...Object.values(remote).map(v=>Number(v||0)+1));
  P.notify(catalogChanged?'Salvato sul dispositivo — invio al cloud in corso.':(window.VGPriceSaveStatus?.message||'Archivio locale disponibile.'));
  const staged=catalogChanged?await stageCatalog(catalog,version,id):{};
  const committedVersions=await cloudStore.runTransaction(async tx=>{
   const fresh=await tx.get(manifestRef()),manifest=fresh.exists?fresh.data():{},versions={...(manifest.versions||{})};assertSession(id);
   if(catalogChanged&&!sameVersions(local.base,catalogVersions(manifest)))throw Error('Prezziari modificati da un altro dispositivo durante l’invio. Copie conservate; nessuna sovrascrittura.');
   for(const k of changed){if(Number(versions[k]||0)!==Number(localVersions[k]||0))throw Error('La sezione '+k+' è stata aggiornata altrove. Ricarica prima di inviare.');if(new TextEncoder().encode(JSON.stringify(sections[k])).length>700000)throw Error('La sezione '+k+' supera il limite di invio. Copia locale conservata.');versions[k]=version;tx.set(sectionRef(k),{section:k,dataJson:JSON.stringify(sections[k]),version,workspaceId:scope(),updatedBy:cloudUser.uid,updatedByName:cloudDisplayName(),updatedAt:firebase.firestore.FieldValue.serverTimestamp()})}
   if(catalogChanged){versions.priceLists=version;versions.entries=version}
   tx.set(manifestRef(),{...staged,workspaceId:scope(),mode:'incremental-v3',versions,updatedSections:[...changed,...(catalogChanged?['priceLists','entries']:[])],updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:cloudUser.uid,updatedByName:cloudDisplayName()},{merge:true});
   return versions;
  });
  assertSession(id);
  if(catalogChanged){const latest=await P.flush();await P.commit(latest.catalog,{source:'ack',uploadedHash:hash(catalog),versions:catalogVersions({versions:committedVersions})})}
  for(const k of changed){localVersions[k]=committedVersions[k];previousHashes[k]=hash(sections[k])}
  setJSON(keys().versions,localVersions);setJSON(keys().hashes,previousHashes);
  cloudStatus(P.status().pending?'Da sincronizzare':'Sincronizzato');if(!silent)info('Salvataggio cloud confermato.');
  if(P.status().pending)queueCloudPush();return {ok:true};
 }catch(error){return fail(error)}
}
window.pushCloudNow=function(silent=false){return serial(()=>push(silent))};
window.queueCloudPush=function(){if(!cloudUser||!cloudStore)return;clearTimeout(timer);timer=setTimeout(()=>{pushCloudNow(true)},1200)};
window.stopCloudRealtime=function(){epoch++;initialized=false;clearTimeout(timer);if(manifestUnsub){manifestUnsub();manifestUnsub=null}if(typeof cloudUnsub!=='undefined'&&cloudUnsub){cloudUnsub();cloudUnsub=null}};
window.startCloudRealtime=function(){
 if(!cloudStore||!cloudUser)return;stopCloudRealtime();const token=epoch,id=identity();
 serial(async()=>{try{await initialize(id);if(token!==epoch)return;manifestUnsub=manifestRef().onSnapshot(snap=>{
  if(token!==epoch||snap.metadata?.hasPendingWrites||snap.metadata?.fromCache)return;
  // Do not skip snapshots by user ID: the same account can use another device.
  serial(async()=>{try{if(token===epoch)await applyManifest(snap,id)}catch(error){fail(error)}});
 },fail);if(P.status().pending)queueCloudPush()}catch(error){fail(error)}});
};
window.pullCloudNow=function(){return serial(async()=>{if(!cloudStore||!cloudUser)return {ok:false};try{const id=identity();await P.ready;const result=await applyManifest(await manifestRef().get({source:'server'}),id,true);return {ok:!result.conflict,...result}}catch(error){return fail(error)}})};
window.addEventListener('online',()=>{if(cloudUser&&cloudStore){startCloudRealtime();queueCloudPush()}});
// Testable exports contain no credentials or live database access.
window.VGIncrementalSync={splitEntries,readCatalog,applyManifest,initialize};
setTimeout(()=>{if(typeof cloudUser!=='undefined'&&cloudUser&&cloudStore)startCloudRealtime()},0);
})();
