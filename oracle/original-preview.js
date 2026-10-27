"use strict";
/* Original Varga Gestionale markup + original CSS; Oracle-only read-only bridge.
 * NEVER executes original Firebase or storage code, never writes to any endpoint.
 * This preview deliberately stays separate from the production app.
 */
(function(){
  const ROOT="gestionale_backup_20261027";
  const api=new window.VGOraclePilot();
  const $=id=>document.getElementById(id);
  const model={user:null,sections:null,cache:new Map(),epoch:0};
  const routes={
    dashboard:["quotes","clients","jobs","invoices","deadlines"],
    richieste:["requests"],preventivo:["clients","priceLists"],
    preventivi:["quotes"],clienti:["clients","priceLists"],
    commesse:["jobs","clients"],cantieriSync:["vcCommesse","vcImpianti","vcOre","vcRecords"],
    consuntivi:["consuntivi"],prezzari:["priceLists","entries"],
    fatture:["invoices","clients"],spese:["expenses","jobs"],
    scadenze:["deadlines"],documenti:["documents","clients","jobs"],
    azienda:["company"],backup:[],cloud:[],
    firmaTimbro:[]
  };
  const esc=value=>String(value===null||value===undefined?"":value)
    .replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const eur=n=>"€ "+Number(n||0).toLocaleString("it-IT",
    {minimumFractionDigits:2,maximumFractionDigits:2});
  const list=value=>Array.isArray(value)?value:[];
  function safeItem(title,sub,right){
    const wrap=document.createElement("div");wrap.className="item";
    const left=document.createElement("div");left.className="item-main";
    const name=document.createElement("div");name.className="item-title";
    name.textContent=String(title||"");
    const description=document.createElement("div");description.className="item-sub";
    description.textContent=String(sub||"");
    left.append(name,description);
    const action=document.createElement("div");action.className="item-actions";
    if(right!==undefined&&right!==null)action.textContent=String(right);
    wrap.append(left,action);
    return wrap;
  }
  function fillList(id,records,mapper,max=250){
    const target=$(id);if(!target)return;
    target.replaceChildren();
    if(!records.length){
      const empty=document.createElement("div");empty.className="empty";
      empty.textContent="Nessun elemento.";target.append(empty);return;
    }
    const fragment=document.createDocumentFragment();
    for(const row of records.slice(0,max)){
      const values=mapper(row);
      fragment.append(safeItem(values[0],values[1],values[2]));
    }
    target.append(fragment);
  }
  function stat(id,value){
    if($(id))$(id).textContent=String(value);
  }
  function explain(msg,err=false){
    const message=$("loginMessage");
    if(message){message.textContent=msg;message.hidden=!msg;message.classList.toggle("error",err);}
  }
  function authView(loggedIn){
    document.body.classList.remove("auth-loading");
    document.body.classList.toggle("auth-ready",!!loggedIn);
    document.body.classList.toggle("auth-locked",!loggedIn);
    if($("loginLoading"))$("loginLoading").hidden=true;
    if($("loginForm"))$("loginForm").hidden=!!loggedIn;
    document.querySelector(".app-shell")?.setAttribute("aria-hidden",String(!loggedIn));
    if($("loginScreen"))$("loginScreen").setAttribute("aria-hidden",String(!!loggedIn));
    if(loggedIn){
      const name=model.user?.display_name||model.user?.email?.split("@")[0]||"Utente";
      stat("sidebarUserName",name);
      stat("sidebarUserRole","Oracle · sola lettura");
      stat("sidebarAvatar",name.charAt(0).toUpperCase());
      stat("cloudUser",model.user?.email||"");
      stat("cloudStatus","Oracle (collaudo)");
      stat("cloudWorkspaceLabel",ROOT);
      stat("cloudInfo","Archivio Oracle del 27 ottobre. Modifiche disabilitate durante il collaudo.");
    } else if($("loginForm")) $("loginForm").hidden=false;
  }
  function locks(){
    const shell=document.querySelector(".app-shell");
    if(!shell)return;
    // Keep original appearance, but intercept all editing buttons and forms.
    shell.addEventListener("click",event=>{
      const btn=event.target.closest("button,a,input[type=file],label.filebtn");
      if(!btn)return;
      if(btn.matches(".nav[data-view], [data-go], #sidebarLogout"))return;
      event.preventDefault();event.stopImmediatePropagation();
      if(btn.matches("a"))return;
      const context=btn.closest(".view");
      if(context)status(context.id,"Funzione disponibile dopo la migrazione completa a Oracle.");
    },true);
    shell.addEventListener("submit",event=>{
      event.preventDefault();event.stopImmediatePropagation();
    },true);
    shell.addEventListener("change",event=>{
      if(event.target.matches("input,textarea,select")){
        event.preventDefault();event.stopImmediatePropagation();
      }
    },true);
    for(const input of shell.querySelectorAll("input,select,textarea")){
      // Every input in preview is display-only; prevents browser-local changes.
      if(input.type!=="hidden")input.disabled=true;
    }
  }
  function status(view,msg){
    // No banners or extra UI elements: the original appearance stays unchanged.
    if($("cloudInfo"))$("cloudInfo").textContent="Collaudo Oracle · "+msg;
  }
  async function section(key){
    if(!model.user)throw Error("Sessione assente");
    if(key==="migrationReview")throw Error("Sezione storica non disponibile in anteprima");
    if(model.cache.has(key))return model.cache.get(key);
    if(!model.sections||!Object.prototype.hasOwnProperty.call(model.sections,key)){
      throw Error("Sezione non trovata: "+key);
    }
    const raw=await api.readSection(ROOT,key);
    model.cache.set(key,raw.data);
    return raw.data;
  }
  function clientsName(id,clients){
    return clients.find(row=>row.id===id)?.name||"";
  }
  function render(view,data){
    const get=k=>list(data[k]);
    if(view==="dashboard"){
      const jobs=get("jobs"),invoices=get("invoices"),deadlines=get("deadlines");
      stat("kPrev",get("quotes").length);
      stat("kCli",get("clients").length);
      stat("kJobs",jobs.filter(x=>x.status!=="Terminata").length);
      stat("kDue",eur(invoices.filter(x=>x.status!=="Pagata")
        .reduce((n,x)=>n+Number(x.amount||0),0)));
      stat("kDead",deadlines.filter(x=>!x.done).length);
      fillList("dashDeadlines",deadlines.filter(x=>!x.done).slice(0,6),
        x=>[x.title,(x.date||"")+" · "+(x.type||""),""]);
    } else if(view==="clienti"){
      const prices=get("priceLists");
      fillList("clientsList",get("clients"),x=>[
        x.name,(x.vat||"")+" "+(x.city||"")+" "+(x.email||""),
        prices.find(p=>p.id===x.priceListId)?.name||""]);
    } else if(view==="commesse"){
      const clients=get("clients");
      fillList("jobsList",get("jobs"),x=>[
        (x.code||"")+" "+(x.title||x.name||""),
        clientsName(x.clientId,clients)+" · "+(x.site||"")+" · "+(x.status||""),
        eur(x.value)]);
    } else if(view==="preventivi"){
      fillList("quotesList",get("quotes"),x=>[
        (x.number||"")+" — "+(x.subject||"Preventivo"),
        (x.clientName||"")+" · "+(x.date||"")+" · "+(x.status||"Bozza"),
        eur(x.total)]);
    } else if(view==="fatture"){
      const clients=get("clients");
      fillList("invoicesList",get("invoices"),x=>[
        x.number||"Documento",
        clientsName(x.clientId,clients)+" · Scadenza "+(x.due||"-"),
        eur(x.amount)]);
    } else if(view==="spese"){
      fillList("expensesList",get("expenses"),x=>[
        (x.supplier||"")+" — "+(x.category||"Spesa"),x.date||"",eur(x.amount)]);
    } else if(view==="scadenze"){
      const rows=get("deadlines").slice().sort((a,b)=>String(a.date).localeCompare(String(b.date)));
      fillList("deadlinesList",rows,x=>[
        x.title,(x.date||"")+" · "+(x.type||""),x.done?"Fatta":"Aperta"]);
    } else if(view==="documenti"){
      const clients=get("clients");
      fillList("documentsList",get("documents"),x=>[
        x.name,(x.category||"")+" · "+clientsName(x.clientId,clients),x.driveUrl?"Documento Drive":""]);
    } else if(view==="prezzari"){
      const prices=get("priceLists");
      fillList("entriesList",get("entries").slice(-300).reverse(),x=>[
        (x.code||"")+" — "+(x.description||""),
        (prices.find(p=>p.id===x.priceListId)?.name||"")+" · "+(x.unit||""),
        eur(x.price)],300);
    } else if(view==="cantieriSync"){
      stat("vcCountCommesse",get("vcCommesse").length);
      stat("vcCountImpianti",get("vcImpianti").length);
      stat("vcCountOre",get("vcOre").length);
      stat("vcCountRecords",get("vcRecords").length);
      stat("vcImported",get("vcRecords").length);
    } else if(view==="consuntivi"){
      const rows=get("consuntivi");
      const statusValue=x=>String(x.status||"").toLowerCase();
      stat("cPending",rows.filter(x=>statusValue(x).includes("verific")).length);
      stat("cApproved",rows.filter(x=>statusValue(x).includes("approv")).length);
      stat("cPosted",rows.filter(x=>statusValue(x).includes("contabil")).length);
      fillList("consList",rows.slice(-200).reverse(),x=>[
        x.title||x.description||x.commessa||"Consuntivo",
        (x.date||x.data||"")+" · "+(x.status||""),
        x.total!==undefined?eur(x.total):""]);
    } else if(view==="richieste"){
      const rows=get("requests");
      const statusValue=x=>String(x.status||x.stato||"").toLowerCase();
      stat("reqNew",rows.filter(x=>statusValue(x).includes("nuov")).length);
      stat("reqUrgent",rows.filter(x=>x.urgent===true||x.urgente===true).length);
      stat("reqUnassigned",rows.filter(x=>!x.jobId&&!x.commessaId).length);
      stat("reqWorking",rows.filter(x=>statusValue(x).includes("lavor")).length);
      stat("reqDone",rows.filter(x=>statusValue(x).includes("complet")).length);
      fillList("requestsList",rows,x=>[
        x.subject||x.oggetto||"Richiesta",x.email||x.sender||"",x.status||x.stato||""]);
    } else if(view==="azienda"){
      const x=data.company||{};
      const fields={aName:"name",aVat:"vat",aAddress:"address",
        aCity:"city",aPhone:"phone",aEmail:"email",aPec:"pec",
        aIban:"iban",aFooter:"footer"};
      for(const [id,key] of Object.entries(fields)){
        if($(id)&&x[key]!==undefined)$(id).value=String(x[key]||"");
      }
    }
  }
  async function open(view){
    if(!model.user||!$(view))return;
    model.epoch+=1;
    const epoch=model.epoch;
    document.querySelectorAll(".view").forEach(x=>x.classList.toggle("active-view",x.id===view));
    document.querySelectorAll(".nav[data-view]").forEach(x=>x.classList.toggle("active",x.dataset.view===view));
    const needed=routes[view]||[];
    if(!needed.length)return;
    status(view,"Caricamento dati dall'archivio PostgreSQL…");
    try{
      const result=await Promise.all(needed.map(async k=>[k,await section(k)]));
      if(epoch!==model.epoch)return;
      render(view,Object.fromEntries(result));
      status(view,"Dati Oracle caricati. Consultazione di sola lettura.");
    }catch(err){
      if(epoch!==model.epoch)return;
      status(view,"Dati non disponibili: "+err.message);
    }
  }
  async function login(event){
    event.preventDefault();
    const email=$("loginEmail").value.trim(),password=$("loginPassword").value;
    $("loginPassword").value="";
    $("loginEmailButton").disabled=true;
    explain("Verifica accesso Oracle…");
    try{
      const user=await api.login(email,password);
      const response=await api.manifest(ROOT);
      if(!response.sections?.clients)throw Error("Archivio di prova non autorizzato");
      model.user=user;model.sections=response.sections;
      model.cache.clear();
      authView(true);explain("");
      open("dashboard");
    }catch(err){
      try{await api.logout();}catch(_){}
      authView(false);
      explain("Accesso non riuscito: "+err.message,true);
    }finally{$("loginEmailButton").disabled=false;}
  }
  async function logout(){
    model.epoch+=1;model.user=null;model.sections=null;model.cache.clear();
    try{await api.logout();}catch(_){}
    authView(false);explain("");
  }
  function setup(){
    locks();
    const form=$("loginForm");
    form.addEventListener("submit",login);
    for(const button of document.querySelectorAll(".nav[data-view]")){
      button.addEventListener("click",()=>open(button.dataset.view));
    }
    for(const button of document.querySelectorAll("[data-go]")){
      button.addEventListener("click",()=>open(button.dataset.go));
    }
    $("sidebarLogout")?.addEventListener("click",logout);
    // Google, recovery and registration remain visually intact but disabled in this
    // preview. They must be implemented before an Oracle-only production cutover.
    for(const id of ["loginGoogleButton","forgotPassword","createLoginAccount"]){
      $(id)?.addEventListener("click",()=>explain(
        "Disponibile solo nel Gestionale attuale. Anteprima Oracle in sola lettura.",true));
    }
    if($("loginRemember"))$("loginRemember").checked=false;
    authView(false);
    explain("Anteprima Oracle: stessa grafica, accesso separato e dati in sola lettura.");
    api.health().catch(()=>explain("API Oracle non raggiungibile.",true));
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",setup,{once:true});
  else setup();
})();
