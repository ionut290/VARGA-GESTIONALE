"use strict";
/* Revision-safe Oracle section adapter for the ORIGINAL Varga Gestionale UI.
 * This module makes NO network calls until invoked with an authenticated
 * VGOraclePilot client. It does not require or load Firebase or change HTML/CSS.
 *
 * Stage 2026-10-27: writes deliberately restricted to synthetic sandbox.
 * Product workspace write enablement needs an audited separate cutover.
 * No silent merges and NO background cloud overwrite; pending edits live only
 * in RAM (not yet suitable as offline production synchronization).
 */
(function(root,factory){
  const api=factory();
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(root)root.VGOracleSectionBridge=api;
})(typeof window!=="undefined"?window:null,function(){
  const NAME=/^[A-Za-z][A-Za-z0-9_]{0,63}$/;
  const WORKSPACE=/^[A-Za-z0-9_-]{1,64}$/;
  const SANDBOX="gestionale_sandbox_20261027";
  const READONLY_PREFIX="gestionale_backup_";
  function clone(data){
    if(data===undefined)throw Error("Dati non validi: undefined");
    // JSON roundtrip ensures no caller can alter cached data via object references.
    const raw=JSON.stringify(data);
    if(!raw||raw.length>16*1024*1024)throw Error("Dati JSON non validi o troppo grandi");
    const parsed=JSON.parse(raw);
    if(parsed===null||typeof parsed!=="object")throw Error("La sezione deve essere un oggetto o un elenco");
    return parsed;
  }
  function assertName(v,pattern,description){
    if(typeof v!=="string"||!pattern.test(v))
      throw Error(description+" non valido");
    return v;
  }
  class SectionBridge {
    constructor({client,workspace,keys,writable=false}={}){
      if(!client||typeof client.manifest!=="function"||
         typeof client.readSection!=="function"||
         typeof client.saveSection!=="function")throw Error("Client Oracle non valido");
      this.client=client;
      this.workspace=assertName(workspace,WORKSPACE,"Workspace");
      if(!Array.isArray(keys)||!keys.length||keys.length>50||
          new Set(keys).size!==keys.length)throw Error("Sezioni non valide");
      this.keys=new Set(keys.map(k=>assertName(k,NAME,"Sezione")));
      if(this.keys.has("migrationReview"))throw Error("Archivio storico escluso");
      if(writable && this.workspace!==SANDBOX)
        throw Error("Scrittura disabilitata su qualsiasi archivio non dimostrativo");
      if(writable && this.workspace.startsWith(READONLY_PREFIX))
        throw Error("Snapshot aziendale protetto");
      this.writable=writable===true;
      this.manifest=null;
      this.sections=new Map();
    }
    async initialize(){
      const remote=await this.client.manifest(this.workspace);
      if(remote?.workspace!==this.workspace||!remote.sections||
          typeof remote.sections!=="object"||Array.isArray(remote.sections))
        throw Error("Manifest Oracle inesperato");
      const absent=[...this.keys].filter(k=>!Object.prototype.hasOwnProperty.call(remote.sections,k));
      if(absent.length)throw Error("Sezioni richieste mancanti: "+absent.join(","));
      this.manifest=remote.sections;
      return {workspace:this.workspace,sections:[...this.keys]};
    }
    assertReady(key){
      assertName(key,NAME,"Sezione");
      if(!this.keys.has(key)||key==="migrationReview")
        throw Error("Sezione non autorizzata");
      if(!this.manifest)throw Error("Inizializzare prima di accedere ai dati");
    }
    entry(key){
      let entry=this.sections.get(key);
      if(!entry){
        entry={value:null,revision:null,loaded:false,draft:null,dirty:false,
               conflict:null,sequence:0,inflight:false};
        this.sections.set(key,entry);
      }
      return entry;
    }
    async load(key,{fresh=false}={}){
      this.assertReady(key);
      const entry=this.entry(key);
      if(entry.dirty||entry.inflight){
        if(fresh)throw Error("Modifiche pendenti: aggiornamento remoto bloccato");
        return clone(entry.draft);
      }
      if(entry.loaded&&!fresh)return clone(entry.value);
      const result=await this.client.readSection(this.workspace,key);
      if(result?.workspace!==this.workspace||result?.section!==key||
          !Number.isSafeInteger(result.revision)||result.revision<0)
        throw Error("Risposta sezione Oracle non valida");
      entry.value=clone(result.data);
      entry.revision=result.revision;
      entry.loaded=true;
      entry.conflict=null;
      return clone(entry.value);
    }
    view(key){
      this.assertReady(key);
      const entry=this.entry(key);
      if(!entry.loaded)throw Error("Sezione non caricata");
      return clone(entry.dirty?entry.draft:entry.value);
    }
    state(key){
      this.assertReady(key);
      const entry=this.entry(key);
      return Object.freeze({loaded:entry.loaded,dirty:entry.dirty,
        conflict:!!entry.conflict,inflight:entry.inflight,revision:entry.revision});
    }
    stage(key,nextValue){
      this.assertReady(key);
      if(!this.writable)throw Error("Sola lettura: modifiche non autorizzate");
      const entry=this.entry(key);
      if(!entry.loaded)throw Error("Prima leggere i dati Oracle");
      if(entry.inflight)throw Error("Salvataggio in corso: modifica non accettata");
      entry.draft=clone(nextValue);
      entry.dirty=true;entry.sequence++;
      return this.state(key);
    }
    async commit(key){
      this.assertReady(key);
      if(!this.writable)throw Error("Sola lettura: salvataggio non autorizzato");
      const entry=this.entry(key);
      if(entry.inflight)throw Error("Invio in corso");
      if(entry.conflict)throw Error("Conflitto non risolto: decidere esplicitamente");
      if(!entry.dirty) return {ok:true,unchanged:true,revision:entry.revision};
      const staged=clone(entry.draft);
      const sequence=entry.sequence;
      entry.inflight=true;
      try{
        // SDK supplies last-read expected_revision to API. HTTP 409 MUST NEVER
        // be retried automatically. A user-approved merge is required.
        const result=await this.client.saveSection(this.workspace,key,staged);
        if(!Number.isSafeInteger(result?.revision)||result.revision<=entry.revision)
          throw Error("Salvataggio Oracle non confermato");
        entry.revision=result.revision;
        entry.value=staged;
        if(entry.sequence===sequence){
          entry.draft=null;entry.dirty=false;
        }
        return {ok:true,revision:entry.revision,dirty:entry.dirty};
      }catch(error){
        if(error?.status===409){
          // Preserve the unsent draft BEFORE refreshing the SDK revision.
          // A second commit cannot occur until an explicit resolution.
          let remote=null;
          try{
            const read=await this.client.readSection(this.workspace,key);
            if(read?.workspace!==this.workspace||read.section!==key||
               !Number.isSafeInteger(read.revision))
              throw Error("Risposta remota non valida");
            remote=clone(read.data);
            entry.revision=read.revision;
            entry.value=remote;
          }catch(_){
            // The unsent local draft is still available in memory.
          }
          entry.conflict={remoteAvailable:remote!==null};
          return {ok:false,conflict:true,needsReview:true,
            remoteAvailable:remote!==null,revision:entry.revision};
        }
        // Network failure: do not clear pending local changes, do not report success.
        throw error;
      }finally{entry.inflight=false;}
    }
    conflictValues(key){
      this.assertReady(key);
      const e=this.entry(key);
      if(!e.conflict)return null;
      return {local:clone(e.draft),remote:e.conflict.remoteAvailable?clone(e.value):null,
        revision:e.revision};
    }
    resolveConflict(key,mergedValue){
      this.assertReady(key);
      if(!this.writable)throw Error("Sola lettura");
      const e=this.entry(key);
      if(!e.conflict||!e.conflict.remoteAvailable)
        throw Error("Leggere e confrontare entrambe le versioni prima del merge");
      // The UI must ask the operator which fields to keep; no silent overwrite.
      e.draft=clone(mergedValue);e.sequence++;e.conflict=null;e.dirty=true;
      return this.state(key);
    }
    discardDraft(key){
      this.assertReady(key);
      const e=this.entry(key);
      if(e.inflight)throw Error("Invio in corso");
      e.dirty=false;e.draft=null;e.conflict=null;e.sequence++;
      return this.state(key);
    }
    clear(){
      // Safe on logout. No browser storage or global state retained.
      this.sections.clear();
      this.manifest=null;
    }
  }
  return Object.freeze({SectionBridge,SANDBOX});
});
