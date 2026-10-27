"use strict";
/* DEMO-only persistent draft storage. Explicitly opt-in and NEVER auto-submit.
 * Caller supplies an IndexedDB-like async store implementing get/put/delete.
 * No production workspaces, passwords, tokens or business records allowed.
 */
(function(root,factory){
  const mod=factory();
  if(typeof module!=="undefined"&&module.exports)module.exports=mod;
  if(root)root.VGOracleDemoDraftVault=mod;
})(typeof window!=="undefined"?window:null,function(){
  const WORKSPACE="gestionale_sandbox_20261027";
  const KEYS=new Set(["clients","jobs","quotes"]);
  const MAX=256*1024;
  function scope(userId,key){
    if(!KEYS.has(key))throw Error("Sezione DEMO non consentita");
    if(typeof userId!=="string"||!/^[A-Za-z0-9_.@-]{3,160}$/.test(userId))
      throw Error("Identificativo utente non valido");
    return "varga-demo-draft-v1:"+userId+":"+WORKSPACE+":"+key;
  }
  function payload(data,revision){
    if(!Number.isSafeInteger(revision)||revision<0)throw Error("Revisione non valida");
    const raw=JSON.stringify(data);
    if(!raw||raw.length>MAX||!Array.isArray(data))throw Error("Bozza DEMO non valida o eccessiva");
    const copy=JSON.parse(raw);
    return {schema:1,workspace:WORKSPACE,revision,data:copy};
  }
  class DemoDraftVault {
    constructor({store,userId,workspace}={}){
      if(workspace!==WORKSPACE)throw Error("Archivio aziendale non ammesso");
      if(!store||typeof store.get!=="function"||typeof store.put!=="function"||typeof store.delete!=="function")
        throw Error("Archivio persistente non configurato");
      scope(userId,"clients");
      this.store=store;this.userId=userId;
    }
    async save(key,data,revision){
      const entry=payload(data,revision);
      await this.store.put(scope(this.userId,key),JSON.stringify(entry));
      return {saved:true,revision};
    }
    async inspect(key){
      const raw=await this.store.get(scope(this.userId,key));
      if(raw===undefined||raw===null)return null;
      if(typeof raw!=="string"||raw.length>MAX+1024)throw Error("Bozza persistente non valida");
      const entry=JSON.parse(raw);
      if(entry?.schema!==1||entry.workspace!==WORKSPACE)throw Error("Bozza non appartenente al laboratorio");
      return payload(entry.data,entry.revision);
    }
    async clear(key){await this.store.delete(scope(this.userId,key));}
  }
  // Browser adapter: isolated IndexedDB, never reads Firebase or app storage.
  // IndexedDB may be unavailable (private mode/disabled): fail closed.
  function openBrowserStore(indexedDB){
    if(!indexedDB||typeof indexedDB.open!=="function")
      throw Error("IndexedDB non disponibile");
    const dbName="varga-oracle-demo-drafts-v1";
    const table="drafts";
    const open=()=>new Promise((resolve,reject)=>{
      const req=indexedDB.open(dbName,1);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains(table))db.createObjectStore(table);
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||Error("Apertura IndexedDB fallita"));
      req.onblocked=()=>reject(Error("Archivio IndexedDB bloccato"));
    });
    async function action(method,key,value){
      const db=await open();
      try{
        return await new Promise((resolve,reject)=>{
          const tx=db.transaction(table,method==="get"?"readonly":"readwrite");
          const store=tx.objectStore(table);
          const req=method==="get"?store.get(key):
            method==="put"?store.put(value,key):store.delete(key);
          let result;
          req.onsuccess=()=>{result=req.result};
          req.onerror=()=>reject(req.error||Error("Operazione IndexedDB fallita"));
          tx.oncomplete=()=>resolve(result);
          tx.onerror=()=>reject(tx.error||Error("Transazione IndexedDB fallita"));
          tx.onabort=()=>reject(tx.error||Error("Transazione IndexedDB annullata"));
        });
      }finally{db.close();}
    }
    return Object.freeze({
      get:key=>action("get",key),
      put:(key,value)=>action("put",key,value),
      delete:key=>action("delete",key)
    });
  }
  return Object.freeze({DemoDraftVault,WORKSPACE,openBrowserStore});
});
