/* Anagrafica permanente per commessa: prima copia, identità stabile, confronto GPS. */
(function(){
'use strict';
const caches=new Map(),running=new Map(),initialized=new Set();
const currentStore=()=>typeof cloudStore!=='undefined'?cloudStore:window.cloudStore;
const currentUser=()=>typeof cloudUser!=='undefined'?cloudUser:window.cloudUser;
const text=v=>String(v??'').trim(),norm=v=>text(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
const escape=v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
function first(o,names){for(const name of names){const k=Object.keys(o||{}).find(x=>norm(x)===norm(name));if(k!=null&&o[k]!=null&&text(o[k])!=='')return o[k]}return''}
function plant(o){return{idSap:text(first(o,['idSap','ID SAP','sap'])),denominazione:text(first(o,['denominazione','Denominazione Impianto','impianto','nome'])),comune:text(first(o,['comune','Comune ubicazione Impianto'])),indirizzo:text(first(o,['indirizzo','Via e civico','Via e civico di ubicazione Impianto','via'])),latitudine:first(o,['latitudine','latitude','lat','gpsY','Coordinate GPS(Y)','Coordinate GPS Y / Latitudine','Coordinate Y']),longitudine:first(o,['longitudine','longitude','lng','lon','gpsX','Coordinate GPS(X)','Coordinate GPS X / Longitudine','Coordinate X'])}}
function location(p){return p.denominazione?norm([p.denominazione,p.comune,p.indirizzo].join('|')):''}
function identity(p){return p.idSap?'sap:'+norm(p.idSap):location(p)?'site:'+location(p):''}
function coordinate(v,max){if(v==null||text(v)==='')return null;const n=Number(text(v).replace(',','.'));return Number.isFinite(n)&&Math.abs(n)<=max?n:NaN}
function gps(p){return[coordinate(p.latitudine,90),coordinate(p.longitudine,180)]}
function match(p,entries){const sap=norm(p.idSap),loc=location(p);const exact=sap?entries.filter(x=>norm(x.idSap)===sap):[];if(exact.length)return exact;return loc?entries.filter(x=>location(x)===loc&&(!sap||!x.idSap)):[]}
function compare(row,entries){const p=plant(row),matches=match(p,entries);if(matches.length>1)return{type:'ambiguous',message:'Identità ambigua: più impianti corrispondono nell’archivio.'};const saved=matches[0];if(!saved)return null;const changes=[['denominazione','Denominazione'],['comune','Comune'],['indirizzo','Indirizzo']].filter(([key])=>text(p[key])&&text(saved[key])&&norm(p[key])!==norm(saved[key])).map(([key,label])=>`${label}: archivio “${saved[key]}”, giro “${p[key]}”`),dataWarning=changes.length?{type:'data',saved,message:'Dati diversi dall’archivio · '+changes.join(' · ')}:null;const current=gps(p),baseline=gps(saved);if(current.some(Number.isNaN)||baseline.some(Number.isNaN))return{type:'invalid',saved,message:'GPS non valido: controllare latitudine e longitudine.'};if(current.every(x=>x===null)&&baseline.every(x=>x===null))return dataWarning;const missing=current.some(x=>x===null)||baseline.some(x=>x===null);if(!missing&&current.every((x,i)=>x===baseline[i]))return dataWarning;return{type:missing?'missing':'different',saved,message:`${missing?'GPS incompleto':'GPS diverso dall’archivio'} · Archivio: ${baseline.map(x=>x??'—').join(', ')} · Giro: ${current.map(x=>x??'—').join(', ')}${changes.length?' · '+changes.join(' · '):''}`}}
async function id(key){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function baseOf(job){const base=text(job?.vcSourceId);if(!/^commesse\/[^/]+$/.test(base))throw Error('Commessa collegata non valida.');return base}
async function list(store,base,name){const s=await store.doc(base).collection(name).get({source:'server'});return s.docs.map(d=>({id:d.id,sourcePath:base+'/'+name+'/'+d.id,data:d.data()}))}
function entries(job){return caches.get(text(job?.vcSourceId))||[]}
function cache(base,items){caches.set(base,items);if(typeof db!=='undefined'){const prefix=base+'/archivioImpianti/';db.vcRecords=(db.vcRecords||[]).filter(x=>!text(x.sourcePath).startsWith(prefix));db.vcRecords.push(...items.map(x=>({id:x._id,sourcePath:prefix+x._id,rootCollection:'commesse',data:Object.fromEntries(Object.entries(x).filter(([k])=>k!=='_id'))})));if(typeof save==='function')save({skipCloud:true})}}
async function ensure(store,job,records){const base=baseOf(job);let existing=caches.get(base);if(!existing){const saved=await list(store,base,'archivioImpianti');existing=saved.map(x=>({...x.data,_id:x.id}));caches.set(base,existing)}
 const unique=new Map();for(const record of records){const p=plant(record.data),key=identity(p);if(key){if(!unique.has(key))unique.set(key,{record,p,key});else{const prior=unique.get(key).p;for(const field of ['latitudine','longitudine','comune','indirizzo'])if(text(prior[field])==='')prior[field]=p[field]}}}
 for(const {record,p,key}of unique.values()){
  const found=match(p,existing);if(found.length)continue;
  const docId=await id(key),ref=store.doc(base+'/archivioImpianti/'+docId);
  const saved=await store.runTransaction(async tx=>{const old=await tx.get(ref);if(old.exists)return old.data();const data={...p,identityKey:key,firstSeenAt:new Date().toISOString(),firstSourcePath:record.sourcePath||'',sourceSnapshot:record.data};tx.set(ref,data);return data});
  if(!existing.some(x=>x._id===docId))existing.push({...saved,_id:docId});
 }
 cache(base,existing);return existing;
}
async function refresh(job,store=currentStore(),write=window.cloudUserRole==='admin'){
 const base=baseOf(job);if(!store)throw Error('Accedi al Cloud per consultare l’archivio impianti.');if(running.has(base))return running.get(base);
 const task=(async()=>{
  const saved=await list(store,base,'archivioImpianti');caches.set(base,saved.map(x=>({...x.data,_id:x.id})));
  if(write){
   const [rounds,markers]=await Promise.all([list(store,base,'giriContabili'),list(store,base,'archivioImpiantiGiri')]);const seeded=new Set(markers.filter(x=>x.data.version===1).map(x=>x.id));
   rounds.sort((a,b)=>String(a.data.closedAtIso||'').localeCompare(String(b.data.closedAtIso||''))||Number(a.data.numeroGiro)-Number(b.data.numeroGiro));
   for(const r of rounds){if(seeded.has(r.id)||r.data.archiveComplete===false)continue;const groups=await Promise.all(['impiantiFisici','impianti','lavorazioni'].map(name=>list(store,r.sourcePath,name)));const records=groups.flat();if(!records.length)continue;await ensure(store,job,records);await store.doc(base+'/archivioImpiantiGiri/'+r.id).set({version:1,seededAt:new Date().toISOString()})}
   const groups=await Promise.all(['impiantiFisici','impianti','lavorazioni'].map(name=>list(store,base,name)));await ensure(store,job,groups.flat());
  }else cache(base,caches.get(base));
  initialized.add(base);window.dispatchEvent(new Event('varga-plant-registry-updated'));return entries(job);
 })();running.set(base,task);try{return await task}finally{running.delete(base)}
}
function initialize(job){const base=baseOf(job);return running.get(base)||(!initialized.has(base)?refresh(job):Promise.resolve(entries(job)))}
function withGps(o,path){const current=plant(o),base=text(path).split('/lavorazioni/')[0];if(typeof db==='undefined'||!o.impiantoId||!base)return current;const parent=(db.vcRecords||[]).find(x=>x.sourcePath===base+'/impiantiFisici/'+o.impiantoId)||(db.vcRecords||[]).find(x=>x.sourcePath===base+'/impianti/'+o.impiantoId);if(!parent)return current;const p=plant(parent.data);return{...current,latitudine:text(current.latitudine)===''?p.latitudine:current.latitudine,longitudine:text(current.longitudine)===''?p.longitudine:current.longitudine}}
async function syncKnown(){if(!currentStore()||!currentUser()||window.cloudUserRole!=='admin'||typeof db==='undefined')return;if(window.VGCantieriArchive)await window.VGCantieriArchive.ready;for(const job of db.jobs||[]){if(!/^commesse\/[^/]+$/.test(text(job.vcSourceId)))continue;try{await refresh(job)}catch(error){console.warn('Archivio impianti '+job.title,error)}}}
async function open(job){
 const overlay=document.createElement('div');overlay.style.cssText='position:fixed;inset:0;z-index:100006;background:rgba(4,18,12,.72);padding:16px;display:grid;place-items:center';overlay.innerHTML=`<div style="background:white;border-radius:16px;padding:20px;width:min(1100px,96vw);max-height:92vh;overflow:auto"><div style="display:flex;justify-content:space-between;gap:12px"><h2>Archivio impianti — ${escape(job.title)}</h2><button class="ghost" data-close>CHIUDI</button></div><p>Una copia per impianto. I GPS archiviati restano il riferimento per confrontare i nuovi giri.</p><input data-search placeholder="Cerca ID SAP, impianto, comune o indirizzo" style="width:100%"><div data-table>Caricamento archivio…</div></div>`;overlay.querySelector('[data-close]').onclick=()=>overlay.remove();document.body.appendChild(overlay);
 try{await refresh(job);const render=()=>{const q=norm(overlay.querySelector('[data-search]').value),all=entries(job),items=all.filter(p=>!q||norm([p.idSap,p.denominazione,p.comune,p.indirizzo].join(' ')).includes(q));overlay.querySelector('[data-table]').innerHTML=`<p>${all.length} impianti in archivio · ${items.length} visualizzati</p><div style="overflow:auto"><table class="vpm-table"><thead><tr>${['ID SAP','Impianto','Comune','Indirizzo','Latitudine','Longitudine','Prima copia'].map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${items.map(p=>`<tr>${[p.idSap,p.denominazione,p.comune,p.indirizzo,p.latitudine,p.longitudine,p.firstSeenAt?.slice(0,10)].map(x=>`<td>${escape(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`};overlay.querySelector('[data-search]').oninput=render;render()}catch(error){overlay.querySelector('[data-table]').textContent=error.message||error}
}
window.VargaPlantRegistry={plant,withGps,identity,compare,entries,ensure,initialize,refresh,open,syncKnown};
const run=()=>syncKnown().catch(error=>console.warn('Archivio impianti non aggiornato',error));window.addEventListener('varga-cantieri-synced',run);let initializedUser='';const poll=setInterval(()=>{if(window.cloudUserRole==='admin'&&currentUser()?.uid&&typeof db!=='undefined'&&db.jobs?.length&&initializedUser!==currentUser().uid){initializedUser=currentUser().uid;run()}},3000);setTimeout(run,8000);
})();
