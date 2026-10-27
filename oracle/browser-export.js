/* Varga Gestionale private export for moving all data from Firebase to Oracle.
 * Loaded ONLY with ?oracle-export=1. Never uploads data to public websites.
 * Requires existing Firebase administrator session and an explicit button click.
 */
(function(){
"use strict";
if(new URLSearchParams(location.search).get("oracle-export")!=="1")return;
const workspace=()=>String(document.getElementById("workspaceId")?.value||cloudCfg.workspaceId||"varga-azienda").trim().replace(/[^a-zA-Z0-9_-]/g,"_");
const SECTION_KEYS=["clients","quotes","jobs","invoices","expenses","economicEntries","deadlines","documents",
 "consuntivi","depurazioneConsuntivi","discaricheConsuntivi","wteModenaConsuntivi","cadrianoDocuments","requests","company"];
const clone=obj=>JSON.parse(JSON.stringify(obj));
function textStatus(text){const el=document.getElementById("vg-oracle-export-status");if(el)el.textContent=text}
function counts(data){return Object.fromEntries(Object.entries(data||{}).map(([key,value])=>
 [key,Array.isArray(value)?value.length:(value&&typeof value==="object"?"oggetto":"valore")]))}
function readSection(snap,key,version){
 if(!snap.exists)throw Error("Sezione Firestore mancante: "+key);
 const row=snap.data()||{};
 if(Number(row.version)!==Number(version))throw Error("Versione cambiata durante export: "+key);
 const value=JSON.parse(row.dataJson);
 if(key==="company"?!value||typeof value!=="object"||Array.isArray(value):!Array.isArray(value))
   throw Error("Formato inatteso della sezione "+key);
 return value
}
async function collectRemote(){
 if(typeof cloudStore==="undefined"||!cloudStore||typeof cloudUser==="undefined"||!cloudUser)
   throw Error("Effettua prima l'accesso al Gestionale con Firebase.");
 if(window.cloudUserRole!=="admin")throw Error("Export riservato all'amministratore autorizzato.");
 const id=workspace(),prefix="vargaGestionaleWorkspace_"+id,ref=suffix=>cloudStore.collection("appConfig").doc(prefix+suffix);
 textStatus("Leggo i manifest Firebase...");
 const manifestSnap=await ref("_manifest").get({source:"server"});
 if(!manifestSnap.exists){
   const old=await ref("").get({source:"server"});
   if(!old.exists)throw Error("Non esiste né lo snapshot precedente né il manifest incremental-v3.");
   const snapshot=JSON.parse((old.data()||{}).snapshotJson||"{}");
   if(!snapshot||typeof snapshot!=="object"||Object.keys(snapshot).length===0)throw Error("Snapshot legacy vuoto.");
   return {data:snapshot,mode:"legacy",manifest:null};
 }
 const manifest=manifestSnap.data()||{};
 if(manifest.mode!=="incremental-v3")throw Error("Versione manifest sconosciuta, export fermato.");
 const versions=manifest.versions||{};
 const data={};
 for(const key of SECTION_KEYS){
  if(versions[key]===undefined)continue;
  textStatus("Esporto sezione "+key+"...");
  data[key]=readSection(await ref("_section_"+key).get({source:"server"}),key,versions[key]);
 }
 const listVersion=versions.priceLists,entryVersion=versions.entries;
 if(Boolean(listVersion)!==Boolean(entryVersion))throw Error("Manifest dei prezziari incompleto.");
 if(listVersion&&entryVersion){
   const g=manifest.catalogGeneration||"";
   const priceRef=g?"_catalog_"+g+"_lists":"_section_priceLists";
   const entryPrefix=g?"_entries_"+g+"_":"_entries_";
   data.priceLists=readSection(await ref(priceRef).get({source:"server"}),"priceLists",listVersion);
   const chunkCount=Number(manifest.entryChunkCount);
   if(!Number.isInteger(chunkCount)||chunkCount<0||chunkCount>10000)throw Error("Conteggio blocchi non valido");
   data.entries=[];
   for(let i=0;i<chunkCount;i++){
     if(i%10===0)textStatus("Esporto prezziari: "+(i+1)+"/"+chunkCount+"...");
     data.entries.push(...readSection(await ref(entryPrefix+String(i).padStart(4,"0")).get({source:"server"}),"entries",entryVersion))
   }
   if(manifest.entryCount!=null&&data.entries.length!==Number(manifest.entryCount))
     throw Error("Conteggio articoli prezzo diverso dal manifest.");
   const P=window.VGPriceCatalog;
   if(P?.hash&&manifest.catalogHash&&P.hash({priceLists:data.priceLists,entries:data.entries})!==manifest.catalogHash)
     throw Error("Verifica integrità catalogo non riuscita.");
 }
 const fresh=(await ref("_manifest").get({source:"server"})).data()||{};
 if(JSON.stringify(fresh.versions||{})!==JSON.stringify(versions)||
     fresh.catalogGeneration!==manifest.catalogGeneration)
   throw Error("Archivio modificato durante l'export. Riprovare.");
 return {data,mode:"incremental-v3",manifest:{versions,catalogGeneration:manifest.catalogGeneration,
   entryCount:manifest.entryCount,entryChunkCount:manifest.entryChunkCount}}
}
async function exportAll(){
 textStatus("Avvio backup completo e verifica...");
 const remote=await collectRemote();
 const local=typeof db!=="undefined"?clone(db):{};
 try{
   if(window.VGPriceCatalog?.flush){
    const p=await window.VGPriceCatalog.flush();
    if(p?.catalog)local.priceCatalog=clone(p.catalog)
   }
 }catch(error){console.warn("Prezzario IndexedDB da verificare:",error);local.localExportWarnings=["Prezzario IndexedDB non completamente letto"]}
 const wrapper={app:"Varga Gestionale",purpose:"Oracle migration private backup",workspace:workspace(),
   exported_at:new Date().toISOString(),source_mode:remote.mode,data:remote.data,
   manifest:remote.manifest,local_browser_archive:local,cloud_counts:counts(remote.data),
   local_counts:counts(local),requires_review:true};
 const serialized=JSON.stringify(wrapper,null,2);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(serialized)))).map(x=>x.toString(16).padStart(2,"0")).join("");
 const blob=new Blob([serialized],{type:"application/json"});
 const url=URL.createObjectURL(blob);
 const a=document.createElement("a");a.href=url;a.download="Varga-Gestionale-export-Oracle-"+new Date().toISOString().slice(0,10)+".json";
 a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
 textStatus("Backup scaricato (NON inviato): "+Math.round(blob.size/1024)+" KB. SHA256: "+hash+
    ". Verifica i conteggi prima di importare. Conserva il file in cartella privata.");
}
function init(){
 const panel=document.createElement("aside");
 panel.id="vg-oracle-export-panel";
 panel.style.cssText="position:fixed;right:12px;bottom:12px;z-index:999999;background:#112944;color:#fff;border:2px solid #e7bf69;border-radius:12px;padding:16px;max-width:360px;box-shadow:0 5px 25px #0009;font:14px system-ui";
 const title=document.createElement("strong");title.textContent="Migrazione Oracle · Backup";
 const info=document.createElement("p");info.textContent="Esporta Firebase e l'archivio locale in un file privato, senza inviare dati al server.";
 const button=document.createElement("button");button.textContent="ESPORTA TUTTI I DATI";
 button.type="button";button.disabled=true;button.style.cssText="background:#e7bf69;color:#132438;border:0;border-radius:8px;padding:12px;cursor:pointer;width:100%;font-weight:700";
 const status=document.createElement("p");status.id="vg-oracle-export-status";status.setAttribute("role","status");
 status.textContent="Accedi come amministratore...";
 const close=document.createElement("button");close.type="button";close.textContent="Chiudi";close.style.cssText="background:transparent;color:#fff;border:1px solid #8ba3ba;padding:5px;margin-top:8px;border-radius:6px";
 close.onclick=()=>panel.remove();
 button.onclick=async()=>{button.disabled=true;try{await exportAll()}catch(e){console.warn(e);textStatus("Export interrotto: "+e.message)}finally{button.disabled=false}};
 panel.append(title,info,button,status,close);document.body.append(panel);
 let tries=0;
 const interval=setInterval(()=>{
  tries++;
  if(typeof cloudUser!=="undefined"&&cloudUser&&window.cloudUserRole==="admin"){
     button.disabled=false;textStatus("Pronto: archivio "+workspace()+". Avvia l'export quando vuoi.");
     clearInterval(interval)
  }else if(tries>=300){clearInterval(interval);textStatus("Non risulti amministratore. Effettua l'accesso prima di esportare.")}
 },1000);
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init()
})();
