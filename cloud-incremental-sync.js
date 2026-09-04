// Varga Gestionale - sincronizzazione Firestore incrementale a basso consumo.
// Strategia: i dati restano nella cache locale gia gestita da app-core.js.
// Firestore contiene un manifest leggero + un documento per sezione.
// Ad ogni avvio/listener si legge il manifest; si scaricano solo le sezioni con versione cambiata.
(function(){
  const SECTION_KEYS=['priceLists','entries','clients','quotes','jobs','requests','invoices','expenses','deadlines','documents','consuntivi','company'];
  const HASH_KEY='vg_cloudSectionHashes_v1';
  const VERSION_KEY='vg_cloudSectionVersions_v1';
  const LAST_PULL_KEY='vg_cloudIncrementalLastPull_v1';
  let manifestUnsub=null;
  let incrementalPushTimer=null;
  let pullingIncremental=false;
  let lastManifestUpdateMs=0;

  function safeWorkspaceId(){
    const el=document.getElementById('workspaceId');
    return String((el&&el.value)||cloudCfg.workspaceId||'varga-azienda').trim().replace(/[^a-zA-Z0-9_-]/g,'_');
  }
  function docPrefix(){return 'vargaGestionaleWorkspace_'+safeWorkspaceId();}
  function manifestRef(){return cloudStore.collection('appConfig').doc(docPrefix()+'_manifest');}
  function sectionRef(key){return cloudStore.collection('appConfig').doc(docPrefix()+'_section_'+key);}
  function legacyWorkspaceRef(){return cloudStore.collection('appConfig').doc(docPrefix());}
  function readLocalObject(key){try{return JSON.parse(localStorage.getItem(key)||'{}')||{}}catch(_){return{}}}
  function writeLocalObject(key,value){try{localStorage.setItem(key,JSON.stringify(value||{}))}catch(e){console.warn('Cache sync non salvata',e)}}
  function canonical(v){
    if(Array.isArray(v))return v.map(canonical);
    if(v&&typeof v==='object'){
      const out={};Object.keys(v).sort().forEach(k=>{out[k]=canonical(v[k])});return out;
    }
    return v;
  }
  function hashValue(v){
    const s=JSON.stringify(canonical(v));let h=2166136261;
    for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}
    return (h>>>0).toString(36)+':'+s.length;
  }
  function sectionSnapshot(){const out={};SECTION_KEYS.forEach(k=>out[k]=db[k]);return out;}
  function persistLocal(){
    SECTION_KEYS.forEach(k=>S.set('vg_'+k,db[k]));
    if(typeof refresh==='function')refresh();
  }
  function serverMs(v){try{return v&&typeof v.toMillis==='function'?v.toMillis():0}catch(_){return 0}}
  function setCloudInfo(text){const el=document.getElementById('cloudInfo');if(el)el.textContent=text;}

  async function migrateLegacySnapshotIfNeeded(){
    const m=await manifestRef().get();
    if(m.exists)return m;
    const legacy=await legacyWorkspaceRef().get();
    if(!legacy.exists)return m;
    const raw=legacy.data()||{};
    let old={};
    try{old=JSON.parse(raw.snapshotJson||'{}')||{}}catch(e){console.warn('Snapshot legacy non valido',e);return m;}
    const versions={},batch=cloudStore.batch(),now=Date.now();
    SECTION_KEYS.forEach((key,index)=>{
      if(old[key]===undefined)return;
      versions[key]=now+index;
      batch.set(sectionRef(key),{workspaceId:safeWorkspaceId(),section:key,dataJson:JSON.stringify(old[key]),version:versions[key],updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:cloudUser?.uid||'',updatedByName:typeof cloudDisplayName==='function'?cloudDisplayName():'Migrazione'},{merge:true});
    });
    batch.set(manifestRef(),{workspaceId:safeWorkspaceId(),mode:'incremental-v1',versions,updatedSections:Object.keys(versions),updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:cloudUser?.uid||'',updatedByName:typeof cloudDisplayName==='function'?cloudDisplayName():'Migrazione'},{merge:true});
    await batch.commit();
    setCloudInfo('Archivio cloud convertito alla sincronizzazione incrementale.');
    return manifestRef().get();
  }

  async function applyManifestSnapshot(snap,{forceAll=false}={}){
    if(!snap||!snap.exists)return {downloaded:0};
    const manifest=snap.data()||{};
    const remoteVersions=manifest.versions||{};
    const localVersions=readLocalObject(VERSION_KEY);
    let keys=SECTION_KEYS.filter(k=>remoteVersions[k]!=null&&(forceAll||Number(remoteVersions[k])>Number(localVersions[k]||0)));
    if(!keys.length){
      localStorage.setItem(LAST_PULL_KEY,new Date().toISOString());
      cloudStatus('Sincronizzato');
      return {downloaded:0};
    }
    pullingIncremental=true;
    try{
      const docs=await Promise.all(keys.map(k=>sectionRef(k).get()));
      let downloaded=0;
      docs.forEach((doc,i)=>{
        const key=keys[i];if(!doc.exists)return;
        const row=doc.data()||{};
        try{db[key]=JSON.parse(row.dataJson||'null');localVersions[key]=Number(row.version||remoteVersions[key]||0);downloaded++;}catch(e){console.warn('Sezione cloud non valida:',key,e)}
      });
      persistLocal();
      writeLocalObject(VERSION_KEY,localVersions);
      const hashes=readLocalObject(HASH_KEY);SECTION_KEYS.forEach(k=>hashes[k]=hashValue(db[k]));writeLocalObject(HASH_KEY,hashes);
      localStorage.setItem(LAST_PULL_KEY,new Date().toISOString());
      cloudStatus('Sincronizzato');
      setCloudInfo(downloaded?`Sincronizzazione incrementale: ${downloaded} sezion${downloaded===1?'e aggiornata':'i aggiornate'} scaricat${downloaded===1?'a':'e'}.`:'Dati locali già aggiornati.');
      return {downloaded};
    }finally{pullingIncremental=false;}
  }

  async function initialIncrementalPull(){
    if(!cloudStore||!cloudUser)return;
    try{
      let m=await migrateLegacySnapshotIfNeeded();
      if(!m.exists){cloudStatus('Connesso');setCloudInfo('Workspace cloud vuoto: al primo salvataggio verranno create solo le sezioni necessarie.');return;}
      await applyManifestSnapshot(m);
    }catch(e){console.warn('Pull incrementale fallito',e);cloudStatus('Errore sincronizzazione');}
  }

  window.stopCloudRealtime=function(){
    if(manifestUnsub){manifestUnsub();manifestUnsub=null;}
    if(typeof cloudUnsub!=='undefined'&&cloudUnsub){try{cloudUnsub()}catch(_){}cloudUnsub=null;}
  };

  window.startCloudRealtime=function(){
    if(!cloudStore||!cloudUser)return;
    stopCloudRealtime();
    initialIncrementalPull().then(()=>{
      if(!cloudStore||!cloudUser||manifestUnsub)return;
      manifestUnsub=manifestRef().onSnapshot(async snap=>{
        if(!snap.exists)return;
        const d=snap.data()||{};const ms=serverMs(d.updatedAt);
        if(ms&&ms===lastManifestUpdateMs)return;
        if(ms)lastManifestUpdateMs=ms;
        if(d.updatedBy===cloudUser.uid){
          // Le versioni locali vengono registrate durante il push: nessun download di ritorno.
          return;
        }
        try{await applyManifestSnapshot(snap)}catch(e){console.warn(e);cloudStatus('Errore sincronizzazione');}
      },err=>{console.warn(err);cloudStatus('Errore sincronizzazione');});
    });
  };

  window.pushCloudNow=async function(silent=false){
    if(pullingIncremental||applyingRemote||!cloudStore||!cloudUser)return;
    if(!(document.getElementById('workspaceId')?.value||cloudCfg.workspaceId||'').trim())return;
    const previousHashes=readLocalObject(HASH_KEY),current=sectionSnapshot(),changed=[];
    SECTION_KEYS.forEach(k=>{const h=hashValue(current[k]);if(previousHashes[k]!==h)changed.push({key:k,hash:h})});
    if(!changed.length){if(!silent)setCloudInfo('Nessuna modifica da inviare: 0 scritture dati.');cloudStatus('Sincronizzato');return;}
    try{
      const versions=readLocalObject(VERSION_KEY),manifestSnap=await manifestRef().get(),remoteVersions=manifestSnap.exists?(manifestSnap.data().versions||{}):{};
      const batch=cloudStore.batch(),updatedVersions={...remoteVersions},base=Date.now();
      changed.forEach((item,index)=>{
        const version=Math.max(base+index,Number(remoteVersions[item.key]||0)+1,Number(versions[item.key]||0)+1);
        updatedVersions[item.key]=version;versions[item.key]=version;
        batch.set(sectionRef(item.key),{workspaceId:safeWorkspaceId(),section:item.key,dataJson:JSON.stringify(current[item.key]),version,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:cloudUser.uid,updatedByName:cloudDisplayName()},{merge:true});
      });
      batch.set(manifestRef(),{workspaceId:safeWorkspaceId(),mode:'incremental-v1',versions:updatedVersions,updatedSections:changed.map(x=>x.key),updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:cloudUser.uid,updatedByName:cloudDisplayName()},{merge:true});
      await batch.commit();
      changed.forEach(x=>previousHashes[x.key]=x.hash);writeLocalObject(HASH_KEY,previousHashes);writeLocalObject(VERSION_KEY,versions);
      cloudStatus('Sincronizzato');
      if(!silent)setCloudInfo(`Sincronizzazione incrementale: ${changed.length} sezion${changed.length===1?'e':'i'} inviat${changed.length===1?'a':'e'} invece dell’intero archivio.`);
    }catch(e){console.warn('Upload incrementale fallito',e);cloudStatus('Errore upload');if(!silent)alert('Errore durante il salvataggio cloud: '+e.message);}
  };

  window.queueCloudPush=function(){
    if(pullingIncremental||applyingRemote||!cloudUser||!cloudStore)return;
    clearTimeout(incrementalPushTimer);
    incrementalPushTimer=setTimeout(()=>pushCloudNow(true),1200);
  };

  window.pullCloudNow=async function(){
    if(!cloudStore||!cloudUser)return alert('Accedi prima al cloud.');
    try{
      let m=await migrateLegacySnapshotIfNeeded();
      if(!m.exists)return alert('Workspace ancora vuoto.');
      const r=await applyManifestSnapshot(m,{forceAll:true});
      alert(`Dati cloud aggiornati. Sezioni scaricate: ${r.downloaded}.`);
    }catch(e){alert('Errore download cloud: '+e.message);}
  };

  // Se Firebase ha gia ripristinato una sessione durante il caricamento, passa subito al nuovo listener.
  setTimeout(()=>{if(typeof cloudUser!=='undefined'&&cloudUser&&cloudStore){stopCloudRealtime();startCloudRealtime();}},0);
})();
