"use strict";
/* Oracle data adapter for the original Varga UI. Firebase is not initialized here. */
(function(){
  const ROOT="gestionale_varga_ui_sandbox_20261027";
  const api=new window.VGOraclePilot();
  const $=id=>document.getElementById(id);
  const keys=["priceLists","entries","clients","quotes","jobs","invoices","expenses",
    "economicEntries","deadlines","documents","requests","dismissedRequestReceiptIds",
    "cantieriRows","consuntivi","meta",
    "depurazioneConsuntivi","discaricheConsuntivi","wteModenaConsuntivi",
    "cadrianoDocuments","vcCommesse","vcImpianti","vcSquadre","vcOre",
    "vcSegnalazioni","vcUtenti","vcRecords","company"];
  const revisions=new Map(),baseline=new Map();
  let busy=false,timer=0;
  if(typeof window.updateBackupInfo!=="function")window.updateBackupInfo=()=>{};
  if(typeof window.autoFolderBackup!=="function")window.autoFolderBackup=()=>{};
  const defaults={priceLists:[],entries:[],clients:[],quotes:[],jobs:[],invoices:[],expenses:[],
    economicEntries:[],deadlines:[],documents:[],requests:[],dismissedRequestReceiptIds:[],
    cantieriRows:[],consuntivi:[],meta:{},
    depurazioneConsuntivi:[],discaricheConsuntivi:[],wteModenaConsuntivi:[],
    cadrianoDocuments:[],vcCommesse:[],vcImpianti:[],vcSquadre:[],vcOre:[],
    vcSegnalazioni:[],vcUtenti:[],vcRecords:[],company:{}};
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
    if($("cloudInfo"))$("cloudInfo").textContent="Dati caricati dal workspace Oracle di prova. Firebase del Gestionale originale resta separato.";
  }
  async function pushChanged(){
    if(busy||!window.cloudUser)return;
    busy=true;
    try{
      for(const key of keys){
        const value=db[key]??defaults[key],serialized=JSON.stringify(value);
        if(serialized===baseline.get(key))continue;
        const revision=revisions.get(key);
        if(revision===undefined)throw Error("Rileggi la sezione "+key+" prima di salvarla.");
        const result=await api.saveSection(ROOT,key,value);
        revisions.set(key,result.revision);baseline.set(key,serialized);
      }
      status("Modifiche salvate nel workspace Oracle di prova.");
      return true;
    }catch(error){
      console.error("Salvataggio Oracle non riuscito",error);
      status("Salvataggio Oracle non riuscito: "+error.message);
      if(error.status===409)status("Conflitto di revisione: ricarica i dati Oracle prima di riprovare.");
      return false;
    }finally{busy=false}
  }
  async function flush(){
    if(!window.cloudUser)throw Error("Accedi al workspace Oracle prima di salvare.");
    clearTimeout(timer);
    while(busy)await new Promise(resolve=>setTimeout(resolve,50));
    const saved=await pushChanged();
    if(saved!==true)throw Error("Salvataggio Oracle non confermato.");
  }
  window.queueCloudPush=function(){if(!window.cloudUser)return;clearTimeout(timer);timer=setTimeout(()=>pushChanged(),650)};
  window.VGOraclePersistence=Object.freeze({flush,keys:Object.freeze([...keys]),workspace:ROOT});
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
      window.VargaOracleDriveBackup?.mount?.(db);
      if(typeof window.nav==="function")window.nav("dashboard");
    }catch(error){
      window.cloudUser=null;window.cloudUserRole="";await api.logout().catch(()=>{});
      refreshAuth(null);message("Accesso Oracle non riuscito: "+error.message,true);
    }finally{setBusy(false)}
  }
  async function logout(){
    clearTimeout(timer);window.cloudUser=null;window.cloudUserRole="";
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
      window.VargaOracleDriveBackup?.mount?.(db);
      if(typeof window.nav==="function")window.nav("dashboard");
    }catch(error){
      window.cloudUser=null;window.cloudUserRole="";refreshAuth(null);
      if(error.status!==401)message("Non riesco a ripristinare la sessione Oracle: "+error.message,true);
    }
  }
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
