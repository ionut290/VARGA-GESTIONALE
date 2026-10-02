// Large Cantieri mirrors belong in IndexedDB, not the small localStorage quota.
(function(){
'use strict';
const DATABASE='varga-gestionale-cantieri-v1',STORE='sections';
const keys=['cantieriRows','vcCommesse','vcImpianti','vcSquadre','vcOre','vcSegnalazioni','vcUtenti','vcRecords'];
const storageKeys=new Set(keys.map(k=>'vg_'+k)),cache=new Map();
const originalSet=S.set,originalGet=S.get;
let connection=null,tail=Promise.resolve(),pending=0;
function open(){return new Promise((resolve,reject)=>{
 if(!window.indexedDB)return reject(Error('Archivio locale Cantieri non disponibile.'));
 const request=indexedDB.open(DATABASE,1);
 request.onupgradeneeded=()=>request.result.createObjectStore(STORE);
 request.onerror=()=>reject(request.error||Error('Apertura archivio Cantieri non riuscita.'));
 request.onblocked=()=>reject(Error('Chiudi le altre schede del Gestionale e riprova.'));
 request.onsuccess=()=>{connection=request.result;connection.onversionchange=()=>{connection.close();connection=null};resolve(connection)};
})}
async function write(values){const database=connection||await open();return new Promise((resolve,reject)=>{
 let transaction;try{transaction=database.transaction(STORE,'readwrite',{durability:'strict'})}catch(_){transaction=database.transaction(STORE,'readwrite')}
 try{const store=transaction.objectStore(STORE);for(const [key,value] of values)store.put(value,key)}catch(error){transaction.abort();reject(error);return}
 transaction.oncomplete=()=>{for(const [key,value] of values){cache.set(key,value);try{localStorage.removeItem(key)}catch(_){}}resolve(true)};
 transaction.onabort=()=>reject(transaction.error||Error('Salvataggio Cantieri interrotto: copia precedente conservata.'));
})}
const ready=(async()=>{
 const database=await open();const stored=await new Promise((resolve,reject)=>{
  const transaction=database.transaction(STORE,'readonly'),values=new Map();
  for(const key of storageKeys){const request=transaction.objectStore(STORE).get(key);request.onsuccess=()=>{if(request.result!==undefined)values.set(key,request.result)}}
  transaction.oncomplete=()=>resolve(values);transaction.onabort=()=>reject(transaction.error||Error('Lettura archivio Cantieri interrotta.'));
 });
 const migrate=[];
 for(const key of storageKeys){if(stored.has(key)){const value=stored.get(key);if(!Array.isArray(value))throw Error('Archivio Cantieri non valido: '+key);cache.set(key,value);db[key.slice(3)]=value}else if(localStorage.getItem(key)!==null)migrate.push([key,db[key.slice(3)]])}
 // Never discard the old local copy before the migration transaction commits.
 if(migrate.length)await write(migrate);
 for(const key of stored.keys()){try{localStorage.removeItem(key)}catch(_){}}
 try{refresh();if(typeof refreshVcCounts==='function')refreshVcCounts()}catch(_){/* UI modules may still be loading. */}
 return true;
})();
ready.catch(error=>{console.error('Archivio Cantieri non disponibile',error);window.VGPriceCatalog?.notify(error.message,true)});
S.get=function(key,fallback){return cache.has(key)?cache.get(key):originalGet.call(S,key,fallback)};
S.set=function(key,value){
 if(!storageKeys.has(key))return originalSet.call(S,key,value);
 // Freeze each requested state so later mutations cannot change an in-flight save.
 const frozen=JSON.parse(JSON.stringify(value));pending++;
 const task=tail.catch(()=>{}).then(async()=>{await ready;return write([[key,frozen]])});tail=task;
 task.then(()=>{pending--},()=>{pending--});task.catch(()=>{});return task;
};
window.VGCantieriArchive={ready,async flush(){await ready;await tail;return true}};
window.addEventListener('beforeunload',event=>{if(pending){event.preventDefault();event.returnValue=''}});
})();
