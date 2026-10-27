"use strict";
/* Oracle-only authenticated staging console. No Firebase, no writes, no browser storage.
 * Values are rendered via textContent, never as untrusted HTML.
 */
(() => {
  const WORKSPACE="gestionale_backup_20261027";
  const FORBIDDEN=new Set(["migrationReview"]);
  const SECRET=/(?:password|passwd|token|secret|privatekey|api_?key|credential|auth|session|salt|hash)/i;
  const PAGE_SIZE=15;
  const LABELS={
    clients:"Clienti",jobs:"Commesse e lavori",quotes:"Preventivi",
    consuntivi:"Consuntivi",depurazioneConsuntivi:"Consuntivi depurazione",
    discaricheConsuntivi:"Consuntivi discariche",wteModenaConsuntivi:"Consuntivi WTE",
    vcCommesse:"Commesse Cantieri",vcRecords:"Record Cantieri",
    vcImpianti:"Impianti",vcSquadre:"Squadre",vcOre:"Ore di lavoro",
    vcUtenti:"Utenti Cantieri",vcSegnalazioni:"Segnalazioni",
    entries:"Voci prezzario",priceLists:"Listini",priceCatalog:"Catalogo prezzi",
    invoices:"Fatture",expenses:"Spese",economicEntries:"Movimenti economici",
    requests:"Richieste",dismissedRequestReceiptIds:"Richieste archiviate",
    deadlines:"Scadenze",documents:"Documenti",
    cadrianoDocuments:"Documenti Cadriano",rapportini:"Rapportini",
    company:"Azienda",meta:"Informazioni archivio",cantieriRows:"Righe Cantieri"
  };
  const ORDER=["clients","jobs","quotes","consuntivi","vcCommesse","vcRecords",
    "vcImpianti","vcSquadre","vcOre","entries","priceLists","priceCatalog",
    "requests","deadlines","documents","rapportini","invoices","expenses",
    "economicEntries","vcUtenti","vcSegnalazioni","cantieriRows",
    "depurazioneConsuntivi","discaricheConsuntivi","wteModenaConsuntivi",
    "cadrianoDocuments","dismissedRequestReceiptIds","company","meta"];
  const client=new window.VGOraclePilot();
  const el=id=>document.getElementById(id);
  const state={manifest:null,selected:null,records:null,filtered:null,page:0,loading:false,epoch:0};
  const fmt=n=>Number(n||0).toLocaleString("it-IT");
  function feedback(msg,error=false){
    el("feedback").textContent=msg||"";
    el("feedback").style.color=error?"#ffb1ad":"#b4d5ee";
  }
  function node(tag,cls,text){
    const e=document.createElement(tag);
    if(cls)e.className=cls;
    if(text!==undefined)e.textContent=text;
    return e;
  }
  function clear(id){el(id).replaceChildren();}
  function reset(){
    state.epoch+=1;
    Object.assign(state,{manifest:null,selected:null,records:null,filtered:null,page:0,loading:false});
    clear("nav");clear("stats");clear("table-area");
    el("workspace").hidden=true;
    el("login-panel").hidden=false;
    el("records").hidden=true;
    el("logout").hidden=true;
    el("session").textContent="Non autenticato";
  }
  function safeFields(record){
    if(!record||typeof record!=="object"||Array.isArray(record))return ["Valore"];
    const keys=Object.keys(record).filter(key=>!SECRET.test(key));
    const likely=["id","sourcePath","name","nome","cliente","codice","commessa",
      "descrizione","description","titolo","data","date","stato","status","importo",
      "total","totale","ore","comune","impianto","email"];
    return likely.filter(k=>keys.includes(k))
      .concat(keys.filter(k=>!likely.includes(k))).slice(0,5);
  }
  function display(value){
    if(value===null||value===undefined)return "—";
    if(typeof value==="string")return value.slice(0,160);
    if(typeof value==="number"||typeof value==="boolean")return String(value);
    if(Array.isArray(value))return "Elenco ("+value.length+")";
    if(typeof value==="object"){
      const keys=Object.keys(value).filter(k=>!SECRET.test(k));
      if(!keys.length)return "Oggetto";
      const common=keys.find(k=>["nome","name","stato","status","description","descrizione","comune"].includes(k));
      return common?String(value[common]).slice(0,140):"Oggetto ("+keys.length+" campi)";
    }
    return "—";
  }
  function navItem(key){
    const btn=node("button");
    btn.type="button";btn.dataset.section=key;
    const qty=state.manifest[key]?.count;
    btn.append(node("span","",LABELS[key]||key),
      node("span","",Number.isFinite(qty)?fmt(qty):"●"));
    btn.addEventListener("click",()=>select(key));
    return btn;
  }
  function renderManifest(){
    clear("nav");clear("stats");
    const keys=Object.keys(state.manifest)
      .filter(k=>!FORBIDDEN.has(k))
      .sort((a,b)=>{
        const ia=ORDER.indexOf(a),ib=ORDER.indexOf(b);
        return (ia<0?999:ia)-(ib<0?999:ib)||a.localeCompare(b);
      });
    keys.forEach(key=>el("nav").append(navItem(key)));
    for(const [key,label] of [
      ["clients","Clienti"],["consuntivi","Consuntivi"],
      ["vcRecords","Record Cantieri"],["entries","Voci prezzario"]]){
      const cell=node("div","stat");
      cell.append(node("small","",label),node("strong","",fmt(state.manifest[key]?.count)));
      el("stats").append(cell);
    }
    el("workspace").hidden=false;
    el("login-panel").hidden=true;
    el("logout").hidden=false;
    feedback("Archivio Oracle caricato: "+keys.length+" sezioni consultabili.");
    if(keys.includes("clients"))select("clients");
  }
  function select(key){
    if(!state.manifest||!state.manifest[key]||FORBIDDEN.has(key))return;
    state.epoch+=1;
    Object.assign(state,{selected:key,records:null,filtered:null,page:0,loading:false});
    document.querySelectorAll("#nav button").forEach(btn=>{
      if(btn.dataset.section===key)btn.setAttribute("aria-current","page");
      else btn.removeAttribute("aria-current");
    });
    el("section-name").textContent=LABELS[key]||key;
    const meta=state.manifest[key],cnt=meta.count;
    el("section-info").textContent=(Number.isFinite(cnt)?fmt(cnt)+" elementi":"Sezione oggetto")
      +" · Revisione "+meta.revision+" · origine Oracle PostgreSQL";
    el("module-overview").textContent="Premi «Carica record» per consultare questa sezione in sola lettura.";
    if(Number.isFinite(cnt)&&cnt>4000)el("module-overview").textContent+=
      " È una sezione grande: il caricamento potrebbe richiedere qualche secondo.";
    el("module-overview").hidden=false;
    el("records").hidden=true;
    el("load").hidden=false;el("load").disabled=false;
    el("search").value="";clear("table-area");
    feedback("");
  }
  function filteredSearch(){
    const q=el("search").value.trim().toLocaleLowerCase("it");
    if(!state.records)return;
    if(!q)state.filtered=state.records;
    else state.filtered=state.records.filter(record=>{
      if(!record||typeof record!=="object")return String(record).toLocaleLowerCase("it").includes(q);
      return Object.entries(record).some(([key,val])=>
        !SECRET.test(key)&&(typeof val==="string"||typeof val==="number")&&
        String(val).toLocaleLowerCase("it").includes(q));
    });
    state.page=0;renderTable();
  }
  function renderTable(){
    clear("table-area");
    const records=state.filtered||[],start=state.page*PAGE_SIZE;
    const shown=records.slice(start,start+PAGE_SIZE);
    const cols=shown.length?safeFields(shown.find(r=>r&&typeof r==="object")||shown[0]):["Valore"];
    if(!shown.length)el("table-area").append(node("div","empty","Nessun record da mostrare."));
    else{
      const table=node("table"),thead=node("thead"),header=node("tr"),tbody=node("tbody");
      cols.forEach(name=>header.append(node("th","",name)));
      thead.append(header);
      for(const record of shown){
        const tr=node("tr");
        for(const field of cols){
          const val=field==="Valore"?record:record?.[field];
          tr.append(node("td","",display(val)));
        }
        tbody.append(tr);
      }
      table.append(thead,tbody);el("table-area").append(table);
    }
    el("page-index").textContent=records.length?
      fmt(start+1)+"–"+fmt(Math.min(records.length,start+PAGE_SIZE))+" di "+fmt(records.length)
      :"0 elementi";
    el("previous").disabled=state.page===0;
    el("next").disabled=(state.page+1)*PAGE_SIZE>=records.length;
  }
  async function loadSection(){
    if(state.loading||!state.selected)return;
    const key=state.selected,epoch=++state.epoch;
    state.loading=true;el("load").disabled=true;
    feedback("Caricamento di "+(LABELS[key]||key)+" da Oracle…");
    try{
      const body=await client.readSection(WORKSPACE,key);
      if(epoch!==state.epoch)return;
      if(Array.isArray(body.data))state.records=body.data;
      else if(body.data&&typeof body.data==="object")state.records=[body.data];
      else state.records=body.data===null?[]:[body.data];
      state.filtered=state.records;state.page=0;
      el("module-overview").hidden=true;el("records").hidden=false;
      renderTable();
      feedback("Lettura completata: "+fmt(state.records.length)+" elementi, nessuna modifica.");
    }catch(err){
      if(epoch!==state.epoch)return;
      feedback("Impossibile leggere il modulo: "+err.message,true);
    }finally{
      if(epoch===state.epoch){state.loading=false;el("load").disabled=false;}
    }
  }
  async function login(event){
    event.preventDefault();
    const submit=el("login-submit");submit.disabled=true;
    const password=el("password").value,email=el("email").value.trim();
    el("password").value="";
    feedback("Accesso a Oracle…");
    try{
      const user=await client.login(email,password);
      if(user.role!=="admin"&&user.role!=="ufficio"){
        await client.logout();
        throw Error("È richiesto un account autorizzato all'ambiente di prova.");
      }
      const man=await client.manifest(WORKSPACE);
      if(!man.sections||!Object.keys(man.sections).length)
        throw Error("Archivio di prova vuoto o non autorizzato.");
      state.manifest=man.sections;
      el("session").textContent=user.email+" · "+user.role;
      renderManifest();
    }catch(err){feedback("Accesso non riuscito: "+err.message,true);}
    finally{submit.disabled=false;}
  }
  async function logout(){
    state.epoch+=1;
    try{await client.logout();}catch(_){}
    reset();feedback("Sessione terminata.");
  }
  el("login-form").addEventListener("submit",login);
  el("logout").addEventListener("click",logout);
  el("load").addEventListener("click",loadSection);
  el("search-button").addEventListener("click",filteredSearch);
  el("search").addEventListener("keydown",event=>{
    if(event.key==="Enter"){event.preventDefault();filteredSearch();}
  });
  el("clear-button").addEventListener("click",()=>{
    el("search").value="";filteredSearch();
  });
  el("previous").addEventListener("click",()=>{
    if(state.page>0){state.page--;renderTable();}
  });
  el("next").addEventListener("click",()=>{
    if((state.page+1)*PAGE_SIZE<(state.filtered||[]).length){
      state.page++;renderTable();
    }
  });
  reset();
  client.health().then(data=>{
    if(!data.ready)feedback("API Oracle non pronta.",true);
  }).catch(()=>feedback("API Oracle temporaneamente non raggiungibile.",true));
})();
