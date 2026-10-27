"use strict";
/* Loads the original Varga modules on the isolated Oracle workspace. */
(function(){
  const prefix="vg-oracle-preview:";
  const rawStorage=window.localStorage;
  const scopedStorage=new Proxy(rawStorage,{
    get(target,key){
      if(key==="getItem")return name=>target.getItem(prefix+String(name));
      if(key==="setItem")return(name,value)=>target.setItem(prefix+String(name),String(value));
      if(key==="removeItem")return name=>target.removeItem(prefix+String(name));
      if(key==="clear")return()=>{for(let i=target.length-1;i>=0;i--){const name=target.key(i);if(name&&name.startsWith(prefix))target.removeItem(name)}};
      if(key==="key")return index=>{const names=[];for(let i=0;i<target.length;i++){const name=target.key(i);if(name&&name.startsWith(prefix))names.push(name.slice(prefix.length))}return names[index]??null};
      if(key==="length"){let count=0;for(let i=0;i<target.length;i++)if(target.key(i)?.startsWith(prefix))count++;return count}
      const value=Reflect.get(target,key,target);return typeof value==="function"?value.bind(target):value;
    }
  });
  try{Object.defineProperty(window,"localStorage",{configurable:true,value:scopedStorage})}
  catch(error){document.documentElement.dataset.oracleStorageError="true";throw Error("Memoria Oracle isolata non disponibile: "+error.message)}
  try{
    const idb=window.indexedDB,open=idb.open.bind(idb);
    const scoped=new Proxy(idb,{get(target,key){if(key==="open")return(name,...args)=>open(prefix+String(name),...args);const value=Reflect.get(target,key,target);return typeof value==="function"?value.bind(target):value}});
    Object.defineProperty(window,"indexedDB",{configurable:true,value:scoped});
  }catch(_){/* IndexedDB is optional for this preview. */}
  window.VG_ORACLE_SANDBOX=true;
  window.cloudUser=null;window.cloudUserRole="";window.cloudStore=null;window.cloudFunctions=null;
  window.cloudCfg={workspaceId:"gestionale_varga_ui_sandbox_20261027"};
  window.queueCloudPush=()=>{};window.stopCloudRealtime=()=>{};window.startCloudRealtime=()=>{};
  window.cloudStatus=message=>{const node=document.getElementById("cloudStatus");if(node)node.textContent=String(message||"")};
  window.firebase={firestore:{FieldValue:{serverTimestamp:()=>new Date(),delete:()=>null}}};
  const assetPrefix=new URL(".",document.currentScript.src).pathname;
  const skip=new Set(["app-sync.js","shared-auth-policy.js","cloud-users.js",
    "password-recovery-code.js","app-cloud.js","job-management-sync.js",
    "cloud-incremental-sync.js","job-plant-management.js","squadre-management-sync.js",
    "map-mail-bridge.js","drive-manager.js","drive-document-lifecycle.js",
    "user-document-assets.js"]);
  const modules=["app-core.js","cantieri-persistence.js","prezzari-persistence.js",
    "app-business.js","task-board.js","eggs-next-board.js","verde-bologna-gestionale.js",
    "verde-bologna-fullscreen-fix.js","verde-bologna-address-search.js","clienti-avola.js",
    "assets/avola-sidebar-1.js","assets/avola-sidebar-2.js","assets/avola-sidebar-3.js",
    "assets/avola-sign-1.js","assets/avola-sign-2.js","assets/avola-image-loader.js",
    "assets/depurazione-catalog.js","assets/depurazione-bologna-plants.js",
    "assets/discariche-catalog.js","assets/cadriano-catalog.js","user-document-assets.js",
    "preventivi-avola.js","app-varga.js","plant-registry.js","accounting-round-workflow.js",
    "accounting-round-close.js","accounting-sheet-view.js","accounting-sheet-tools.js",
    "inrete-accounting-export.js","atex-report.js","accounting-client-export-form.js",
    "job-economics.js","job-economics-daily-snapshot.js","accounting-round-history-v2.js",
    "dashboard-accounting-rounds.js","round-dashboard-settings.js","map-mail-bridge.js",
    "drive-document-lifecycle.js","drive-manager.js","request-mail-center.js",
    "request-sender-edit.js","request-discariche-routing.js","workforce-history.js",
    "rapportini-lavoro.js","prezzari-excel-view.js","depurazione-consuntivi.js",
    "wte-modena-consuntivi.js","cadriano-documenti.js","discariche-consuntivi.js",
    "stradelli-guelfi-consuntivi.js","job-workspace.js","job-plant-progress-summary.js",
    "job-plant-progress-excel-style.js","commesse-packages.js","view-scenes.js",
    "ui-overhaul.js","dashboard-company-economics.js","desktop-varga-navigation.js"];
  document.write('<script src="'+assetPrefix+'vendor/exceljs.min.js?v=oracle-sandbox-20261027"></scr'+'ipt>');
  for(const src of modules){
    if(skip.has(src))continue;
    if(!/^[A-Za-z0-9_./-]+\.js$/.test(src)||src.includes(".."))throw Error("Modulo non valido");
    document.write('<script src="'+assetPrefix+src+'?v=oracle-sandbox-20261027"></scr'+'ipt>');
  }
  document.write('<script src="'+assetPrefix+'original-app-adapter.js?v=oracle-sandbox-20261027"></scr'+'ipt>');
})();
