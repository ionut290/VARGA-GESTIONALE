"use strict";
/* Oracle data adapter for the original Varga UI. Firebase is not initialized here. */
(function(){
  const ROOT="gestionale_varga_ui_sandbox_20261027";
  const api=new window.VGOraclePilot();
  const $=id=>document.getElementById(id);
  function setOracleLoginCopy(){
    const brand=document.querySelector(".login-brand-copy");
    if(brand){
      const title=brand.querySelector("h1");
      const paragraphs=brand.querySelectorAll("p");
      if(title)title.textContent="Accesso Oracle per Varga Gestionale.";
      if(paragraphs[1])paragraphs[1].textContent="Usa le credenziali Oracle assegnate. L'accesso al Gestionale è separato da quello di Varga Cantieri.";
    }
    const intro=document.querySelector("#loginForm .login-intro");
    if(intro)intro.textContent="Inserisci le credenziali Oracle assegnate.";
    const help=document.querySelector("#loginForm .login-help");
    if(help)help.textContent="Gli account Oracle vengono creati e autorizzati dall'amministratore. Varga Cantieri continua a usare il proprio accesso.";
    if($("loginEmail"))$("loginEmail").placeholder="nome@azienda.it · account Oracle";
    if($("loginPassword"))$("loginPassword").placeholder="Password Oracle";
    $("loginForm")?.querySelector(".login-divider")?.setAttribute("hidden","");
  }
  setOracleLoginCopy();
  const keys=["priceLists","entries","clients","quotes","jobs","invoices","expenses",
    "economicEntries","deadlines","documents","requests","dismissedRequestReceiptIds",
    "cantieriRows","consuntivi","meta",
    "depurazioneConsuntivi","discaricheConsuntivi","wteModenaConsuntivi",
    "cadrianoDocuments","vcCommesse","vcImpianti","vcSquadre","vcOre",
    "vcSegnalazioni","vcUtenti","vcRecords","company"];
  const revisions=new Map(),baseline=new Map();
  let busy=false,timer=0,draftTimer=0;
  if(typeof window.updateBackupInfo!=="function")window.updateBackupInfo=()=>{};
  if(typeof window.autoFolderBackup!=="function")window.autoFolderBackup=()=>{};
  const defaults={priceLists:[],entries:[],clients:[],quotes:[],jobs:[],invoices:[],expenses:[],
    economicEntries:[],deadlines:[],documents:[],requests:[],dismissedRequestReceiptIds:[],
    cantieriRows:[],consuntivi:[],meta:{},
    depurazioneConsuntivi:[],discaricheConsuntivi:[],wteModenaConsuntivi:[],
    cadrianoDocuments:[],vcCommesse:[],vcImpianti:[],vcSquadre:[],vcOre:[],
    vcSegnalazioni:[],vcUtenti:[],vcRecords:[],company:{}};
  const DRAFT_DB="varga-oracle-original-drafts-v1",DRAFT_TABLE="drafts";
  let draftPanel=null,draftWarning="";
  function draftKey(user){
    const id=String(user?.id||"");
    if(!/^[A-Za-z0-9_.@-]{3,160}$/.test(id))throw Error("Utente Oracle non valido per la bozza locale.");
    return ROOT+":"+id;
  }
  function draftAction(method,key,value){
    return new Promise((resolve,reject)=>{
      let request;
      try{request=window.indexedDB.open(DRAFT_DB,1)}
      catch(error){reject(error);return}
      request.onupgradeneeded=()=>{
        const store=request.result;
        if(!store.objectStoreNames.contains(DRAFT_TABLE))store.createObjectStore(DRAFT_TABLE);
      };
      request.onerror=()=>reject(request.error||Error("Apertura archivio bozze non riuscita."));
      request.onblocked=()=>reject(Error("Archivio bozze locale bloccato."));
      request.onsuccess=()=>{
        const storeDb=request.result;
        let transaction,result;
        try{
          transaction=storeDb.transaction(DRAFT_TABLE,method==="get"?"readonly":"readwrite");
          const store=transaction.objectStore(DRAFT_TABLE);
          const operation=method==="get"?store.get(key):method==="put"?store.put(value,key):store.delete(key);
          operation.onsuccess=()=>{result=operation.result};
          operation.onerror=()=>reject(operation.error||Error("Operazione archivio bozze non riuscita."));
          transaction.oncomplete=()=>{storeDb.close();resolve(result)};
          transaction.onerror=()=>{storeDb.close();reject(transaction.error||Error("Transazione bozze non riuscita."))};
          transaction.onabort=()=>{storeDb.close();reject(transaction.error||Error("Transazione bozze annullata."))};
        }catch(error){storeDb.close();reject(error)}
      };
    });
  }
  async function persistOfflineDraft(){
    const user=window.cloudUser;
    if(!user||!window.indexedDB)return false;
    const key=draftKey(user),sections={};
    let byteCount=0;
    for(const section of keys){
      const serialized=JSON.stringify(db[section]??defaults[section]);
      if(serialized===baseline.get(section))continue;
      const revision=revisions.get(section);
      if(!Number.isSafeInteger(revision)||revision<0)continue;
      byteCount+=new TextEncoder().encode(serialized).byteLength;
      if(byteCount>15*1024*1024)throw Error("Bozza troppo grande per la memoria locale.");
      sections[section]={expected_revision:revision,value:JSON.parse(serialized)};
    }
    if(!Object.keys(sections).length){
      await draftAction("delete",key);
      await refreshOfflineDraftControls();
      return true;
    }
    const record={schema:1,workspace:ROOT,updated_at:new Date().toISOString(),sections};
    await draftAction("put",key,record);
    await refreshOfflineDraftControls();
    return true;
  }
  async function readOfflineDraft(user=window.cloudUser){
    if(!user||!window.indexedDB)return null;
    const key=draftKey(user),record=await draftAction("get",key);
    if(record===undefined||record===null)return null;
    if(record.schema!==1||record.workspace!==ROOT||!record.sections||typeof record.sections!=="object"||Array.isArray(record.sections))
      throw Error("La bozza locale non è valida; non è stata applicata.");
    for(const [section,item] of Object.entries(record.sections)){
      if(!keys.includes(section)||!Number.isSafeInteger(item?.expected_revision)||item.expected_revision<0||
         item.value===undefined)throw Error("La bozza locale contiene una sezione non valida.");
    }
    return record;
  }
  function ensureDraftPanel(){
    if(draftPanel?.isConnected)return draftPanel;
    const info=$("cloudInfo");
    if(!info?.parentElement)return null;
    draftPanel=document.createElement("div");
    draftPanel.className="actions left";
    draftPanel.style.marginTop="10px";
    draftPanel.hidden=true;
    info.insertAdjacentElement("afterend",draftPanel);
    return draftPanel;
  }
  function draftButton(label,action,style="ghost"){
    const button=document.createElement("button");
    button.type="button";button.className=style;button.textContent=label;
    button.addEventListener("click",action);
    return button;
  }
  function exportOfflineDraft(record){
    const blob=new Blob([JSON.stringify({workspace:ROOT,updated_at:record.updated_at,sections:record.sections},null,2)],
      {type:"application/json"});
    const url=URL.createObjectURL(blob),link=document.createElement("a");
    link.href=url;link.download="varga-oracle-bozza-locale.json";link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function refreshOfflineDraftControls(){
    const panel=ensureDraftPanel();
    if(!panel)return;
    panel.replaceChildren();panel.hidden=true;
    if(!window.cloudUser||!window.indexedDB)return;
    try{
      const record=await readOfflineDraft();
      if(!record)return;
      const sections=Object.keys(record.sections);
      const stale=sections.filter(section=>revisions.get(section)!==record.sections[section].expected_revision);
      const note=document.createElement("span");
      note.className="muted";
      note.textContent=stale.length
        ?"Bozza locale conservata; revisione Oracle cambiata per "+stale.join(", ")+". Recupero bloccato per evitare sovrascritture."
        :"Bozza locale non inviata: "+sections.join(", ")+".";
      panel.append(note);
      if(!stale.length)panel.append(draftButton("RECUPERA BOZZA LOCALE",async()=>{
        try{
          if(busy){status("Attendi la fine del salvataggio Oracle prima di recuperare la bozza.");return}
          if(!window.confirm("Recuperare e inviare su Oracle la bozza locale di "+sections.join(", ")+"?"))return;
          const current=await readOfflineDraft();
          if(!current)return;
          const conflicts=Object.keys(current.sections).filter(section=>revisions.get(section)!==current.sections[section].expected_revision);
          if(conflicts.length){status("Recupero bloccato: Oracle è cambiato per "+conflicts.join(", ")+". La bozza resta conservata.");await refreshOfflineDraftControls();return}
          for(const section of Object.keys(current.sections))db[section]=current.sections[section].value;
          if(typeof window.refresh==="function")window.refresh();
          if(typeof window.refreshVcCounts==="function")window.refreshVcCounts();
          window.queueCloudPush();
        }catch(error){status("Recupero non completato: "+error.message)}
      },"primary"));
      panel.append(draftButton("ESPORTA BOZZA",()=>exportOfflineDraft(record)));
      panel.append(draftButton("ELIMINA BOZZA",async()=>{
        try{
          if(!window.confirm("Eliminare la bozza locale non inviata? Questa azione non modifica i dati Oracle."))return;
          await draftAction("delete",draftKey(window.cloudUser));
          await refreshOfflineDraftControls();
          status("Bozza locale eliminata. I dati Oracle non sono stati modificati.");
        }catch(error){status("Bozza locale non eliminata: "+error.message)}
      }));
      panel.hidden=false;
    }catch(error){
      const note=document.createElement("span");note.className="muted";
      note.textContent="Bozza locale non leggibile: "+error.message;
      panel.append(note);panel.hidden=false;
    }
  }
  async function clearCommittedDraftSections(user,serializedByKey,newRevisions){
    const key=draftKey(user),record=await draftAction("get",key);
    if(!record?.sections)return;
    for(const [section,serialized] of serializedByKey){
      const item=record.sections[section];
      if(!item)continue;
      if(JSON.stringify(item.value)===serialized)delete record.sections[section];
      else if(Number.isSafeInteger(newRevisions[section]))item.expected_revision=newRevisions[section];
    }
    if(!Object.keys(record.sections).length)await draftAction("delete",key);
    else{record.updated_at=new Date().toISOString();await draftAction("put",key,record)}
    await refreshOfflineDraftControls();
  }
  function message(text,error=false){
    const el=$("loginMessage");if(el){el.textContent=text||"";el.hidden=!text;el.classList.toggle("error",!!error)}
    const info=$("cloudInfo");if(info&&text)info.textContent=text;
  }
  function status(text){window.cloudStatus(text);const info=$("cloudInfo");if(info)info.textContent=text}
  function setBusy(value,label){
    const button=$("loginEmailButton");if(button){button.disabled=!!value;if(label)button.textContent=label;else button.textContent="ACCEDI"}
    const loading=$("loginLoading");if(loading)loading.hidden=!value;
  }
  function refreshAuth(user){
    document.body.classList.remove("auth-loading");
    document.body.classList.toggle("auth-ready",!!user);
    document.body.classList.toggle("auth-locked",!user);
    document.querySelector(".app-shell")?.setAttribute("aria-hidden",String(!user));
    if($("loginScreen"))$("loginScreen").setAttribute("aria-hidden",String(!!user));
    if($("loginForm"))$("loginForm").hidden=!!user;
    if($("loginLoading"))$("loginLoading").hidden=true;
    if(user){
      const name=user.display_name||user.displayName||user.email?.split("@")[0]||"Utente";
      if($("sidebarUserName"))$("sidebarUserName").textContent=name;
      if($("sidebarUserRole"))$("sidebarUserRole").textContent="Oracle · workspace di prova";
      if($("sidebarAvatar"))$("sidebarAvatar").textContent=name.charAt(0).toUpperCase();
      if($("cloudUser"))$("cloudUser").textContent=user.email||"";
      if($("cloudWorkspaceLabel"))$("cloudWorkspaceLabel").textContent=ROOT;
      status("Oracle · workspace di prova");
      window.VargaUserDocumentAssets?.onUserReady?.(user,null);
    }
  }
  async function loadData(){
    const manifest=await api.manifest(ROOT);
    const loaded=await Promise.all(keys.map(async key=>[key,await api.readSection(ROOT,key)]));
    for(const [key,raw] of loaded){
      const value=raw.data===null||raw.data===undefined?defaults[key]:raw.data;
      db[key]=value;
      revisions.set(key,raw.revision||manifest.sections?.[key]?.revision||0);
      baseline.set(key,JSON.stringify(value));
    }
    if(typeof window.companyToForm==="function")window.companyToForm();
    if(typeof window.clearQuote==="function")window.clearQuote();
    if(typeof window.refresh==="function")window.refresh();
      if(typeof window.refreshVcCounts==="function")window.refreshVcCounts();
    await refreshOfflineDraftControls();
    if($("cloudInfo"))$("cloudInfo").textContent="Dati caricati dal workspace Oracle di prova. Firebase del Gestionale originale resta separato.";
  }
  const cantieriSections=["jobs","clients","vcCommesse","vcImpianti","vcOre","vcSquadre","vcRecords","vcUtenti","vcSegnalazioni"];
  async function reloadCantieriFromOracle(){
    const button=$("syncVcNow"),info=$("vcSyncInfo");
    if(busy)throw Error("Attendi la fine del salvataggio in corso.");
    const dirty=cantieriSections.filter(key=>baseline.has(key)
      &&JSON.stringify(db[key]??defaults[key])!==baseline.get(key));
    if(dirty.length)throw Error("Prima salva le modifiche locali a: "+dirty.join(", ")+". Nessuna modifica è stata ricaricata.");
    if(button){button.disabled=true;button.dataset.oracleOldText=button.textContent;button.textContent="LETTURA ORACLE…"}
    try{
      const loaded=await Promise.all(cantieriSections.map(async key=>[key,await api.readSection(ROOT,key)]));
      for(const [key,raw] of loaded){
        const value=raw.data===null||raw.data===undefined?defaults[key]:raw.data;
        db[key]=value;
        revisions.set(key,raw.revision||0);
        baseline.set(key,JSON.stringify(value));
      }
      if(typeof window.refresh==="function")window.refresh();
      if(typeof window.refreshVcCounts==="function")window.refreshVcCounts();
      if(info)info.textContent="Dati riletti dal workspace Oracle. La sincronizzazione Cantieri aggiorna questo workspace ogni cinque minuti.";
      return true;
    }finally{
      if(button){button.disabled=false;button.textContent=button.dataset.oracleOldText||"SINCRONIZZA";delete button.dataset.oracleOldText}
    }
  }
  async function pushChanged(){
    if(busy||!window.cloudUser)return;
    busy=true;
    try{
      const changed={};
      const serializedByKey=new Map();
      for(const key of keys){
        const value=db[key]??defaults[key],serialized=JSON.stringify(value);
        if(serialized===baseline.get(key))continue;
        if(revisions.get(key)===undefined)throw Error("Rileggi la sezione "+key+" prima di salvarla.");
        changed[key]=value;
        serializedByKey.set(key,serialized);
      }
      const names=Object.keys(changed);
      if(!names.length)return;
      const result=await api.saveSections(ROOT,changed);
      for(const key of names){
        revisions.set(key,result.revisions[key]);
        baseline.set(key,serializedByKey.get(key));
      }
      try{await clearCommittedDraftSections(window.cloudUser,serializedByKey,result.revisions)}
      catch(error){console.warn("Bozza locale non ripulita dopo il salvataggio",error);status("Dati salvati su Oracle; pulizia bozza locale non riuscita: "+error.message);return}
      draftWarning="";
      status("Modifiche salvate insieme nel workspace Oracle di prova.");
    }catch(error){
      console.error("Salvataggio Oracle non riuscito",error);
      const localNote=draftWarning?" La bozza locale non è stata salvata: "+draftWarning:"";
      if(error.status===409)status("Conflitto di revisione: nessuna sezione del gruppo è stata salvata. Rileggi i dati Oracle prima di riprovare."+localNote);
      else status("Salvataggio Oracle non riuscito: nessuna sezione del gruppo è stata salvata. "+error.message+localNote);
    }finally{busy=false}
  }
  window.queueCloudPush=function(){
    if(!window.cloudUser)return;
    clearTimeout(timer);clearTimeout(draftTimer);
    draftTimer=setTimeout(()=>{
      persistOfflineDraft().then(()=>{draftWarning=""})
        .catch(error=>{draftWarning=error.message;status("Bozza locale non salvata: "+error.message)});
    },120);
    timer=setTimeout(async()=>{
      clearTimeout(draftTimer);
      try{await persistOfflineDraft();draftWarning=""}
      catch(error){draftWarning=error.message}
      await pushChanged();
    },650);
  };
  window.addEventListener("pagehide",()=>{if(window.cloudUser)persistOfflineDraft().catch(()=>{})});
  window.startCloudRealtime=()=>{};window.stopCloudRealtime=()=>{};
  window.cloudDisplayName=()=>window.cloudUser?.display_name||window.cloudUser?.email||"Utente";
  window.authorizeCloudUser=async()=>true;
  window.VargaCloud=Object.freeze({authToken:async()=>{await api.me();return null}});
  async function login(email,password){
    if(!email||!password){message("Inserisci email e password.",true);return}
    setBusy(true,"ACCESSO…");message("Accesso al workspace Oracle…");
    try{
      const user=await api.login(email,password,$("loginRemember")?.checked!==false);
      window.cloudUser={...user,uid:user.id,displayName:user.display_name,getIdToken:async()=>null};
      window.cloudUserRole=user.role||"operatore";
      await loadData();refreshAuth(user);message("");
      if(typeof window.nav==="function")window.nav("dashboard");
    }catch(error){
      window.cloudUser=null;window.cloudUserRole="";await api.logout().catch(()=>{});
      refreshAuth(null);message("Accesso Oracle non riuscito: "+error.message,true);
    }finally{setBusy(false)}
  }
  async function logout(){
    clearTimeout(timer);clearTimeout(draftTimer);
    try{await persistOfflineDraft()}catch(error){status("Bozza locale non salvata prima dell'uscita: "+error.message)}
    window.cloudUser=null;window.cloudUserRole="";
    await api.logout().catch(()=>{});location.reload();
  }
  async function restoreSavedSession(){
    const loading=$("loginLoading"),form=$("loginForm");
    if(loading){loading.hidden=false;const label=loading.querySelector("strong");if(label)label.textContent="Ripristino accesso…"}
    if(form)form.hidden=true;
    try{
      const user=await api.me();
      window.cloudUser={...user,uid:user.id,displayName:user.display_name,getIdToken:async()=>null};
      window.cloudUserRole=user.role||"operatore";
      await loadData();refreshAuth(user);
      if(typeof window.nav==="function")window.nav("dashboard");
    }catch(error){
      window.cloudUser=null;window.cloudUserRole="";refreshAuth(null);
      if(error.status!==401)message("Non riesco a ripristinare la sessione Oracle: "+error.message,true);
    }
  }
  if($("syncVcNow"))$("syncVcNow").onclick=async event=>{
    event?.preventDefault();
    const info=$("vcSyncInfo");
    try{if(info)info.textContent="Leggo gli aggiornamenti Cantieri già sincronizzati su Oracle…";await reloadCantieriFromOracle()}
    catch(error){if(info)info.textContent="Lettura Oracle non completata: "+error.message}
  };
  $("loginForm")?.addEventListener("submit",event=>{event.preventDefault();login($("loginEmail")?.value.trim(),$("loginPassword")?.value||"");});
  $("loginEmailButton")?.addEventListener("click",event=>{event.preventDefault();login($("loginEmail")?.value.trim(),$("loginPassword")?.value||"")});
  $("loginCloud")?.addEventListener("click",event=>{event.preventDefault();login($("authEmail")?.value.trim(),$("authPassword")?.value||"")});
  $("sidebarLogout")?.addEventListener("click",logout);$("logoutCloud")?.addEventListener("click",logout);
  for(const id of ["loginGoogleButton","loginGoogleCloud","createLoginAccount","registerCloud","forgotPassword"]){const node=$(id);if(node){node.hidden=true;node.disabled=true}}
  if($("cloudInfo"))$("cloudInfo").textContent="Accedi per lavorare sulla copia Oracle. I dati Firebase del Gestionale originale non vengono modificati.";
  if(typeof window.__vgOracleBootReady==="function")window.__vgOracleBootReady();
  else window.VG_ORACLE_UI_READY=true;
  refreshAuth(null);
  restoreSavedSession();
})();
