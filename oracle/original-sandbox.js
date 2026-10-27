"use strict";
/* Original Gestionale HTML/CSS on Oracle. This independent test page writes
 * ONLY to an isolated workspace containing four synthetic sections.
 * Never loads Firebase or the real business workspace. */
(function(){
  const ROOT="gestionale_sandbox_20261027";
  const api=new window.VGOraclePilot();
  const bridge=new window.VGOracleSectionBridge.SectionBridge({
    client:api,workspace:ROOT,keys:["clients","jobs","quotes","consuntivi","invoices","priceLists","entries"],writable:true
  });
  // Optional DEMO draft vault. Never write business workspaces or auto-retry.
  let draftVault=null;
  async function initDraftVault(user){
    draftVault=null;
    if(!window.VGOracleDemoDraftVault||!window.indexedDB)return;
    try{
      draftVault=new window.VGOracleDemoDraftVault.DemoDraftVault({
        store:window.VGOracleDemoDraftVault.openBrowserStore(window.indexedDB),
        userId:String(user.email||"").toLowerCase(),
        workspace:ROOT
      });
      const pending=[];
      for(const key of ["clients","jobs","quotes"]){
        if(await draftVault.inspect(key))pending.push(key);
      }
      if(pending.length)status("cloud","Bozze DEMO locali da verificare: "+pending.join(", ")+". Usa Recupera bozze DEMO nel Cloud.");
    }catch(_){draftVault=null;status("cloud","Archivio locale DEMO non disponibile.");}
  }
  async function recoverDemoDrafts(){
    if(!draftVault||!model.user)return alert("Nessuna memoria DEMO locale disponibile.");
    let found=0,restored=0;
    for(const key of ["clients","jobs","quotes"]){
      try{
        const pending=await draftVault.inspect(key);
        if(!pending)continue;
        found++;
        await bridge.load(key,{fresh:true});
        if(bridge.state(key).revision!==pending.revision){
          alert("Bozza "+key+" conservata. Oracle è cambiato: recupero bloccato per evitare sovrascritture.");
          continue;
        }
        if(!window.confirm("Recuperare e INVIARE su Oracle la bozza DEMO "+key+"? Verifica che non contenga duplicati."))continue;
        bridge.stage(key,pending.data);
        const saved=await bridge.commit(key);
        if(!saved.ok){alert("Conflitto "+key+": bozza locale conservata.");continue;}
        await draftVault.clear(key);
        model.cache.set(key,bridge.view(key));
        restored++;
        alert("Bozza DEMO "+key+" recuperata su Oracle.");
      }catch(err){alert("Recupero "+key+" non completato: "+err.message);}
    }
    if(!found)alert("Nessuna bozza DEMO da recuperare. I dati salvati sono già su Oracle.");
    else if(restored)status("cloud","Recuperate "+restored+" bozze DEMO. Apri la sezione interessata per vedere i dati.");
    // Stay in Cloud: recovery must not navigate away unexpectedly.
  }
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
      stat("sidebarUserRole","Oracle · test moduli");
      stat("sidebarAvatar",name.charAt(0).toUpperCase());
      stat("cloudUser",model.user?.email||"");
      stat("cloudStatus","Oracle (dati demo)");
      stat("cloudWorkspaceLabel",ROOT);
      stat("cloudInfo","Archivio dimostrativo: Clienti, Commesse e Preventivi DEMO.");
    } else if($("loginForm")) $("loginForm").hidden=false;
  }
  function locks(){
    const shell=document.querySelector(".app-shell");
    if(!shell)return;
    // Keep original appearance, but intercept all editing buttons and forms.
    shell.addEventListener("click",event=>{
      const btn=event.target.closest("button,a,input[type=file],label.filebtn");
      if(!btn)return;
      if(btn.matches(".nav[data-view], [data-go], #sidebarLogout, #addClient, #addJob, #addManual, #newQuote, #saveQuote, #qRows button, #recoverDemoDrafts"))return;
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
      if(input.type!=="hidden" && !["cName","jTitle","jClient","jCode","jSite","jStart","jEnd","jStatus","jValue","jNotes","qClient","qSubject","qSite","qValidity","qPayment","qDiscount","qVat"].includes(input.id))input.disabled=true;
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
      return key==="company"?{}:[];
    }
    const value=["clients","jobs","quotes","consuntivi","invoices","priceLists","entries"].includes(key)
      ?await bridge.load(key)
      :(await api.readSection(ROOT,key)).data;
    model.cache.set(key,value);
    return value;
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
      const dataset=Object.fromEntries(result);
      if(view==="commesse"||view==="preventivo")fillDemoClientOptions(dataset.clients||[],view==="commesse"?"jClient":"qClient");
      render(view,dataset);
      status(view,"Dati Oracle caricati. Consultazione di sola lettura.");
    }catch(err){
      if(epoch!==model.epoch)return;
      status(view,"Dati non disponibili: "+err.message);
    }
  }
  function fillDemoClientOptions(clients,elementId){
    const field=$(elementId);if(!field)return;
    const previous=field.value;
    field.replaceChildren();
    for(const client of list(clients)){
      if(!/^demo-cl-[a-z0-9-]+$/i.test(String(client.id||"")))continue;
      const option=document.createElement("option");
      option.value=client.id;
      option.textContent=client.name||"Cliente dimostrativo";
      field.append(option);
    }
    if([...field.options].some(option=>option.value===previous))field.value=previous;
  }
  function demoName(value){
    const name=String(value||"").trim().replace(/\s+/g," ");
    if(name.length>90||!/^DEMO[ \-]/i.test(name))
      throw Error("Usa un nome fittizio che inizi con DEMO e abbia massimo 90 caratteri.");
    return name;
  }
  async function saveDemoSection(key,newRecord,buttonId,view){
    if(ROOT!=="gestionale_sandbox_20261027"||!model.user||!["clients","jobs","quotes"].includes(key))
      throw Error("Salvataggio permesso soltanto nel laboratorio di prova.");
    const button=$(buttonId);
    if(!button||button.disabled)throw Error("Salvataggio già in corso.");
    button.disabled=true;
    try{
      const before=await section(key);
      if(!Array.isArray(before)||before.length>=50)
        throw Error("Sezione dimostrativa inattesa oppure massimo 50 righe raggiunto.");
      const updated=[...before,newRecord];
      bridge.stage(key,updated);
      if(draftVault)await draftVault.save(key,updated,bridge.state(key).revision);
      const result=await bridge.commit(key);
      if(result.conflict){
        // Never overwrite or silently discard a competing edit.
        alert("Conflitto tra schede: bozza DEMO non inviata. Esci e rientra per ricaricare; nessun dato sovrascritto.");
        return false;
      }
      if(draftVault)await draftVault.clear(key);
      model.cache.set(key,bridge.view(key));
      await open(view);
      return true;
    }finally{button.disabled=false;}
  }
  async function addDemoJob(){
    if(ROOT!=="gestionale_sandbox_20261027"||!model.user)return;
    try{
      const title=demoName($("jTitle").value);
      const clients=list(await section("clients"));
      const clientId=$("jClient").value;
      if(!clients.some(x=>x.id===clientId&&/^demo-cl-/i.test(String(x.id||""))))
        throw Error("Seleziona un cliente dimostrativo.");
      const value=Number($("jValue").value||0);
      if(!Number.isFinite(value)||value<0||value>100000)
        throw Error("Valore DEMO non valido.");
      const job={id:"demo-job-"+crypto.randomUUID(),title,clientId,
        code:"DEMO-"+String($("jCode").value||"TEST").slice(0,36),
        site:String($("jSite").value||"").slice(0,120),
        start:$("jStart").value,end:$("jEnd").value,
        status:$("jStatus").value,value,notes:String($("jNotes").value||"").slice(0,300)};
      const ok=await saveDemoSection("jobs",job,"addJob","commesse");
      if(ok){
        ["jTitle","jCode","jSite","jStart","jEnd","jValue","jNotes"].forEach(id=>$(id).value="");
        alert("Commessa DEMO salvata su Oracle.");
      }
    }catch(err){alert("Salvataggio commessa DEMO non eseguito: "+err.message);}
  }
  const demoLines=[];
  function quotePreview(){
    const discount=Number($("qDiscount").value||0),vat=Number($("qVat").value||0);
    const sub=demoLines.reduce((total,row)=>total+row.qty*row.price,0);
    const taxable=sub*(1-Math.max(0,Math.min(100,discount))/100);
    const tax=taxable*Math.max(0,Math.min(100,vat))/100;
    stat("qSub",eur(taxable));stat("qVatAmount",eur(tax));stat("qTotal",eur(taxable+tax));
    return {taxable,tax,total:taxable+tax};
  }
  function renderDemoQuoteLines(){
    const root=$("qRows");root.replaceChildren();
    for(const [index,row] of demoLines.entries()){
      const tr=document.createElement("tr");
      for(const key of ["code","description","unit","qty","price"]){
        const td=document.createElement("td"),input=document.createElement("input");
        input.value=row[key];input.dataset.field=key;input.dataset.index=String(index);
        input.setAttribute("aria-label","Voce DEMO "+key);
        if(key==="qty"||key==="price"){input.type="number";input.min="0";input.step="0.01";}
        input.addEventListener("input",()=>{
          const val=(key==="qty"||key==="price")?Number(input.value):input.value;
          row[key]=val;
          if(key==="qty"||key==="price"){
            const amount=tr.querySelector("[data-amount]");
            if(amount)amount.textContent=eur(row.qty*row.price);
            quotePreview();
          }
        });
        td.append(input);tr.append(td);
      }
      const total=document.createElement("td");total.dataset.amount="true";
      total.textContent=eur(row.qty*row.price);tr.append(total);
      const last=document.createElement("td"),remove=document.createElement("button");
      remove.type="button";remove.textContent="×";remove.className="mini danger";
      // Registration stays local to the demo UI, not backend.
      remove.addEventListener("click",()=>{demoLines.splice(index,1);renderDemoQuoteLines();});
      last.append(remove);tr.append(last);root.append(tr);
    }
    quotePreview();
  }
  function resetDemoQuote(){
    demoLines.splice(0);
    ["qSubject","qSite","qPayment"].forEach(id=>$(id).value="");
    $("qValidity").value="30";$("qDiscount").value="0";$("qVat").value="22";
    $("qNumber").value="DEMO-PREV-"+String(Date.now());
    renderDemoQuoteLines();
  }
  async function addDemoQuote(){
    if(ROOT!=="gestionale_sandbox_20261027"||!model.user)return;
    try{
      const subject=demoName($("qSubject").value);
      const clients=list(await section("clients"));
      const client=clients.find(x=>x.id===$("qClient").value&&/^demo-cl-/i.test(String(x.id||"")));
      if(!client)throw Error("Seleziona un cliente DEMO.");
      if(demoLines.length<1||demoLines.length>20)throw Error("Inserisci da 1 a 20 voci dimostrative.");
      const rows=demoLines.map(x=>({...x}));
      for(const row of rows){
        row.description=demoName(row.description);
        row.code="DEMO-"+String(row.code||"VOCE").slice(0,24);
        if(!Number.isFinite(row.qty)||row.qty<=0||row.qty>10000||
           !Number.isFinite(row.price)||row.price<0||row.price>100000)
          throw Error("Quantità o prezzo dimostrativo non validi.");
      }
      const discount=Number($("qDiscount").value||0),vatRate=Number($("qVat").value||0);
      if(!Number.isFinite(discount)||discount<0||discount>100||
         !Number.isFinite(vatRate)||vatRate<0||vatRate>100)
        throw Error("Percentuali sconto o IVA non valide.");
      const sub=rows.reduce((total,row)=>total+row.qty*row.price,0);
      const taxable=sub*(1-discount/100),tax=taxable*vatRate/100;
      const quote={id:"demo-q-"+crypto.randomUUID(),
        number:"DEMO-PREV-"+String(Date.now()),date:new Date().toLocaleDateString("it-IT"),
        clientId:client.id,clientName:client.name,client:{id:client.id,name:client.name},
        subject,site:String($("qSite").value||"").slice(0,120),
        validity:Math.max(1,Math.min(365,Number($("qValidity").value||30))),
        payment:String($("qPayment").value||"").slice(0,100),
        rows,discount,vatRate,subtotal:taxable,vat:tax,total:taxable+tax,status:"Bozza"};
      const ok=await saveDemoSection("quotes",quote,"saveQuote","preventivi");
      if(ok){resetDemoQuote();alert("Preventivo DEMO salvato su Oracle.");}
    }catch(err){alert("Salvataggio preventivo DEMO non eseguito: "+err.message);}
  }
  async function addDemoClient(){
    if(ROOT!=="gestionale_sandbox_20261027"||!model.user)return;
    const input=$("cName");if(!input)return;
    try{
      const name=demoName(input.value);
      const before=await section("clients");
      if(before.some(x=>String(x.name||"").trim().toLowerCase()===name.toLowerCase()))
        throw Error("Questo cliente DEMO esiste già.");
      const ok=await saveDemoSection("clients",{
        id:"demo-cl-"+crypto.randomUUID(),name,
        note:"Solo dati fittizi - laboratorio Oracle"
      },"addClient","clienti");
      if(ok){input.value="";alert("Cliente DEMO salvato su Oracle.");}
    }catch(err){alert("Salvataggio cliente DEMO non eseguito: "+err.message);}
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
      if(Object.keys(response.sections||{}).sort().join(",")!=="clients,consuntivi,entries,invoices,jobs,priceLists,quotes")
        throw Error("Questo ambiente non contiene soltanto le quattro sezioni demo previste.");
      if(!response.sections?.clients)throw Error("Archivio di prova non autorizzato");
      await bridge.initialize();
      model.user=user;model.sections=response.sections;
      model.cache.clear();
      authView(true);explain("");
      await initDraftVault(user);
      open("dashboard");
    }catch(err){
      try{await api.logout();}catch(_){}
      authView(false);
      explain("Accesso non riuscito: "+err.message,true);
    }finally{$("loginEmailButton").disabled=false;}
  }
  async function logout(){
    model.epoch+=1;model.user=null;model.sections=null;model.cache.clear();
    bridge.clear();draftVault=null;
    try{await api.logout();}catch(_){}
    authView(false);explain("");
  }
  function setup(){
    locks();
    // Same structure and styling; clarify that preview authentication is Oracle,
    // not the still-running Varga Cantieri/Firebase account.
    const title=document.querySelector(".login-brand-copy h1");
    if(title)title.textContent="Accesso Oracle di prova.";
    const explanation=document.querySelector(".login-brand-copy p:not(.login-kicker)");
    if(explanation)explanation.textContent="Usa le credenziali Oracle create per il collaudo. La grafica originale è identica e puoi salvare soltanto clienti dimostrativi.";
    const intro=document.querySelector(".login-intro");
    if(intro)intro.textContent="Usa l'account di prova Oracle.";
    const help=document.querySelector(".login-help");
    if(help)help.textContent="Archivio fittizio: puoi salvare Clienti, Commesse e Preventivi DEMO. Le altre funzioni restano disabilitate.";
    const form=$("loginForm");
    const cloud=$("cloudInfo");
    if(cloud){
      const recover=document.createElement("button");
      recover.type="button";recover.id="recoverDemoDrafts";
      recover.textContent="RECUPERA BOZZE DEMO";
      recover.addEventListener("click",recoverDemoDrafts);
      cloud.parentNode?.append(recover);
    }
    $("addClient")?.addEventListener("click",addDemoClient);
    $("addJob")?.addEventListener("click",addDemoJob);
    $("addManual")?.addEventListener("click",()=>{
      if(demoLines.length>=20)return alert("Massimo 20 voci DEMO.");
      demoLines.push({code:"VOCE",description:"DEMO Voce prova",unit:"cad",qty:1,price:10});
      renderDemoQuoteLines();
    });
    $("newQuote")?.addEventListener("click",resetDemoQuote);
    $("saveQuote")?.addEventListener("click",addDemoQuote);
    $("qDiscount")?.addEventListener("input",quotePreview);
    $("qVat")?.addEventListener("input",quotePreview);
    resetDemoQuote();
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
        "Disponibile solo nel Gestionale attuale. Qui sono ammessi solo Clienti, Commesse e Preventivi DEMO.",true));
    }
    if($("loginRemember"))$("loginRemember").checked=false;
    authView(false);
    explain("Laboratorio Oracle: grafica originale; test di salvataggio Clienti, Commesse e Preventivi, solo dati DEMO.");
    api.health().catch(()=>explain("API Oracle non raggiungibile.",true));
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",setup,{once:true});
  else setup();
})();
