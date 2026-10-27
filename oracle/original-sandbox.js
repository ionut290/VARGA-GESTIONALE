"use strict";
/* Original Gestionale HTML/CSS on Oracle. This independent test page writes
 * ONLY to an isolated workspace containing four synthetic sections.
 * Never loads Firebase or the real business workspace. */
(function(){
  const ROOT="gestionale_sandbox_20261027";
  const DEMO_WRITE_KEYS=["clients","jobs","quotes","invoices","priceLists","entries","expenses","deadlines","documents","company"];
  const api=new window.VGOraclePilot();
  const bridge=new window.VGOracleSectionBridge.SectionBridge({
    client:api,workspace:ROOT,keys:["clients","jobs","quotes","consuntivi","invoices","priceLists","entries","expenses","deadlines","documents","requests","vcCommesse","vcImpianti","vcOre","vcRecords","company"],writable:true
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
      for(const key of DEMO_WRITE_KEYS){
        if(await draftVault.inspect(key))pending.push(key);
      }
      if(pending.length)status("cloud","Bozze DEMO locali da verificare: "+pending.join(", ")+". Usa Recupera bozze DEMO nel Cloud.");
    }catch(_){draftVault=null;status("cloud","Archivio locale DEMO non disponibile.");}
  }
  async function recoverDemoDrafts(){
    if(!draftVault||!model.user)return alert("Nessuna memoria DEMO locale disponibile.");
    let found=0,restored=0;
    for(const key of DEMO_WRITE_KEYS){
      try{
        const pending=await draftVault.inspect(key);
        if(!pending)continue;
        found++;
        await bridge.load(key,{fresh:true});
        if(bridge.state(key).revision!==pending.revision){
          alert("Bozza "+key+" conservata. Oracle Ã¨ cambiato: recupero bloccato per evitare sovrascritture.");
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
    if(!found)alert("Nessuna bozza DEMO da recuperare. I dati salvati sono giÃ  su Oracle.");
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
  const eur=n=>"â‚¬ "+Number(n||0).toLocaleString("it-IT",
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
      stat("sidebarUserRole","Oracle Â· test moduli");
      stat("sidebarAvatar",name.charAt(0).toUpperCase());
      stat("cloudUser",model.user?.email||"");
      stat("cloudStatus","Oracle (dati demo)");
      stat("cloudWorkspaceLabel",ROOT);
      stat("cloudInfo","Archivio dimostrativo: dati sintetici DEMO isolati dal Gestionale aziendale.");
    } else if($("loginForm")) $("loginForm").hidden=false;
  }
  function locks(){
    const shell=document.querySelector(".app-shell");
    if(!shell)return;
    // Keep original appearance, but intercept all editing buttons and forms.
    shell.addEventListener("click",event=>{
      const btn=event.target.closest("button,a,input[type=file],label.filebtn");
      if(!btn)return;
      if(btn.matches(".nav[data-view], [data-go], #sidebarLogout, #addClient, #addJob, #addManual, #newQuote, #saveQuote, #qRows button, #addInvoice, #addPriceList, #addEntry, #addExpense, #addDeadline, #addDocument, #saveCompany, #exportConsCsv, #recoverDemoDrafts"))return;
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
      if(input.type!=="hidden" && !["cName","jTitle","jClient","jCode","jSite","jStart","jEnd","jStatus","jValue","jNotes","qClient","qSubject","qSite","qValidity","qPayment","qDiscount","qVat","fNumber","fClient","fDate","fDue","fAmount","fStatus","fNotes","plName","ePL","eCode","eDesc","eUnit","ePrice","xDate","xSupplier","xCategory","xAmount","xJob","xNotes","dTitle","dJob","dType","dDate","dTime","dPriority","dAssignee","dNotes","docName","docCategory","docClient","docJob","docNotes","aName","aVat","aAddress","aCity","aPhone","aEmail","aPec","aIban","aFooter"].includes(input.id))input.disabled=true;
    }
  }
  function status(view,msg){
    // No banners or extra UI elements: the original appearance stays unchanged.
    if($("cloudInfo"))$("cloudInfo").textContent="Collaudo Oracle Â· "+msg;
  }
  async function section(key){
    if(!model.user)throw Error("Sessione assente");
    if(key==="migrationReview")throw Error("Sezione storica non disponibile in anteprima");
    if(model.cache.has(key))return model.cache.get(key);
    if(!model.sections||!Object.prototype.hasOwnProperty.call(model.sections,key)){
      return key==="company"?{}:[];
    }
    const value=["clients","jobs","quotes","consuntivi","invoices","priceLists","entries","expenses","deadlines","documents","requests","vcCommesse","vcImpianti","vcOre","vcRecords","company"].includes(key)
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
        x=>[x.title,(x.date||"")+" Â· "+(x.type||""),""]);
    } else if(view==="clienti"){
      const prices=get("priceLists");
      fillList("clientsList",get("clients"),x=>[
        x.name,(x.vat||"")+" "+(x.city||"")+" "+(x.email||""),
        prices.find(p=>p.id===x.priceListId)?.name||""]);
    } else if(view==="commesse"){
      const clients=get("clients");
      fillList("jobsList",get("jobs"),x=>[
        (x.code||"")+" "+(x.title||x.name||""),
        clientsName(x.clientId,clients)+" Â· "+(x.site||"")+" Â· "+(x.status||""),
        eur(x.value)]);
    } else if(view==="preventivi"){
      fillList("quotesList",get("quotes"),x=>[
        (x.number||"")+" â€” "+(x.subject||"Preventivo"),
        (x.clientName||"")+" Â· "+(x.date||"")+" Â· "+(x.status||"Bozza"),
        eur(x.total)]);
    } else if(view==="fatture"){
      const clients=get("clients");
      fillList("invoicesList",get("invoices"),x=>[
        x.number||"Documento",
        clientsName(x.clientId,clients)+" Â· Scadenza "+(x.due||"-"),
        eur(x.amount)]);
    } else if(view==="spese"){
      fillList("expensesList",get("expenses"),x=>[
        (x.supplier||"")+" â€” "+(x.category||"Spesa"),x.date||"",eur(x.amount)]);
    } else if(view==="scadenze"){
      const rows=get("deadlines").slice().sort((a,b)=>String(a.date).localeCompare(String(b.date)));
      fillList("deadlinesList",rows,x=>[
        x.title,(x.date||"")+" Â· "+(x.type||""),x.done?"Fatta":"Aperta"]);
    } else if(view==="documenti"){
      const clients=get("clients");
      fillList("documentsList",get("documents"),x=>[
        x.name,(x.category||"")+" Â· "+clientsName(x.clientId,clients),x.driveUrl?"Documento Drive":""]);
    } else if(view==="prezzari"){
      const prices=get("priceLists");
      fillList("entriesList",get("entries").slice(-300).reverse(),x=>[
        (x.code||"")+" â€” "+(x.description||""),
        (prices.find(p=>p.id===x.priceListId)?.name||"")+" Â· "+(x.unit||""),
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
      const state=String($("consFilter")?.value||"").toLowerCase();
      const search=String($("consSearch")?.value||"").trim().toLowerCase();
      const filtered=rows.filter(x=>(!state||statusValue(x)===state.toLowerCase())&&
        (!search||["title","description","commessa","impianto","operatore","idSap","id"]
          .some(k=>String(x[k]||"").toLowerCase().includes(search))));
      fillList("consList",filtered.slice(-200).reverse(),x=>[
        x.title||x.description||x.commessa||"Consuntivo",
        (x.date||x.data||"")+" Â· "+(x.status||""),
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
    status(view,"Caricamento dati dall'archivio PostgreSQLâ€¦");
    try{
      const result=await Promise.all(needed.map(async k=>[k,await section(k)]));
      if(epoch!==model.epoch)return;
      const dataset=Object.fromEntries(result);
      if(view==="commesse"||view==="preventivo")fillDemoClientOptions(dataset.clients||[],view==="commesse"?"jClient":"qClient");
      if(view==="fatture")fillDemoClientOptions(dataset.clients||[],"fClient");
      if(view==="prezzari")fillDemoPriceListOptions(dataset.priceLists||[]);
      if(view==="spese")fillDemoJobOptions(dataset.jobs||[],"xJob","Nessuna commessa");
      if(view==="scadenze")fillDemoJobOptions(dataset.jobs||[],"dJob","Nessuna commessa");
      if(view==="documenti"){
        fillDemoClientOptions(dataset.clients||[],"docClient",true);
        fillDemoJobOptions(dataset.jobs||[],"docJob","Nessuna commessa");
      }
      render(view,dataset);
      status(view,"Dati Oracle caricati. Consultazione di sola lettura.");
    }catch(err){
      if(epoch!==model.epoch)return;
      status(view,"Dati non disponibili: "+err.message);
    }
  }
  async function refreshDemoConsuntivi(){
    if(!model.user)return;
    await open("consuntivi");
  }
  function exportDemoConsuntivi(){
    if(!model.user||ROOT!=="gestionale_sandbox_20261027")return;
    const rows=list(model.cache.get("consuntivi"));
    const cols=["id","title","description","commessa","status","date","total"];
    const safe=v=>{
      const value=String(v??"").replace(/[\\r\\n]/g," ").replace(/"/g,'""');
      return '"'+(/^[=+@-]/.test(value)?"'"+value:value)+'"';
    };
    const csv=[cols.join(";"),...rows.map(x=>cols.map(k=>safe(x[k])).join(";"))].join("\\r\\n");
    const blob=new Blob(["\\uFEFF",csv],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download="consuntivi-demo-oracle.csv";
    a.click();URL.revokeObjectURL(url);
  }
  function fillDemoClientOptions(clients,elementId,allowBlank=false){
    const field=$(elementId);if(!field)return;
    const previous=field.value;
    field.replaceChildren();
    if(allowBlank){const blank=document.createElement("option");blank.value="";blank.textContent="Nessun cliente";field.append(blank);}
    for(const client of list(clients)){
      if(!/^demo-cl-[a-z0-9-]+$/i.test(String(client.id||"")))continue;
      const option=document.createElement("option");
      option.value=client.id;
      option.textContent=client.name||"Cliente dimostrativo";
      field.append(option);
    }
    if([...field.options].some(option=>option.value===previous))field.value=previous;
  }
  function fillDemoJobOptions(jobs,elementId,blankLabel){
    const field=$(elementId);if(!field)return;
    const previous=field.value;field.replaceChildren();
    const blank=document.createElement("option");blank.value="";blank.textContent=blankLabel;field.append(blank);
    for(const job of list(jobs)){
      if(!/^demo-job-[a-z0-9-]+$/i.test(String(job.id||"")))continue;
      const option=document.createElement("option");option.value=job.id;
      option.textContent=[job.code,job.title||job.name].filter(Boolean).join(" â€” ");field.append(option);
    }
    if([...field.options].some(option=>option.value===previous))field.value=previous;
  }
  function demoName(value){
    ó­-¢G§²ÚîÆ­yĞ€€€€€€l‰©Q¥Ñ±”ˆ°‰©½‘”ˆ°‰©M¥Ñ”ˆ°‰©MÑ…ÉĞˆ°‰©¹ˆ°‰©Y…±Õ”ˆ°‰©9½Ñ•Ì‰t¹™½É… ¡¥ôø¡¥¤¹Ù…±Õ”ôˆˆ¤ì(€€€€€€€…±•ÉĞ ‰½µµ•ÍÍ„5<Í…±Ù…Ñ„ÍÔ=É…±”¸ˆ¤ì(€€€€€ô(€€€õ…Ñ ¡•ÉÈ¥í…±•ÉĞ ‰M…±Ù…Ñ…¥¼½µµ•ÍÍ„5<¹½¸•Í•Õ¥Ñ¼è€ˆ­•ÉÈ¹µ•ÍÍ…”¤íô(€ô(€½¹ÍĞ‘•µ½1¥¹•Ìõmtì(€™Õ¹Ñ¥½¸ÅÕ½Ñ•AÉ•Ù¥•Ü ¥ì(€€€½¹ÍĞ‘¥Í½Õ¹Ğõ9Õµ‰•È  ‰Å¥Í½Õ¹Ğˆ¤¹Ù…±Õ•ñğÀ¤±Ù…Ğõ9Õµ‰•È  ‰ÅY…Ğˆ¤¹Ù…±Õ•ñğÀ¤ì(€€€½¹ÍĞÍÕˆõ‘•µ½1¥¹•Ì¹É•‘Õ” ¡Ñ½Ñ…°±É½Ü¤ôùÑ½Ñ…°­É½Ü¹ÅÑä©É½Ü¹ÁÉ¥”°À¤ì(€€€½¹ÍĞÑ…á…‰±”õÍÕˆ¨ Äµ5…Ñ ¹µ…à À±5…Ñ ¹µ¥¸ ÄÀÀ±‘¥Í½Õ¹Ğ¤¤¼ÄÀÀ¤ì(€€€½¹ÍĞÑ…àõÑ…á…‰±”©5…Ñ ¹µ…à À±5…Ñ ¹µ¥¸ ÄÀÀ±Ù…Ğ¤¤¼ÄÀÀì(€€€ÍÑ…Ğ ‰ÅMÕˆˆ±•ÕÈ¡Ñ…á…‰±”¤¤íÍÑ…Ğ ‰ÅY…Ñµ½Õ¹Ğˆ±•ÕÈ¡Ñ…à¤¤íÍÑ…Ğ ‰ÅQ½Ñ…°ˆ±•ÕÈ¡Ñ…á…‰±”­Ñ…à¤¤ì(€€€É•ÑÕÉ¸íÑ…á…‰±”±Ñ…à±Ñ½Ñ…°éÑ…á…‰±”­Ñ…áôì(€ô(€™Õ¹Ñ¥½¸É•¹‘•É•µ½EÕ½Ñ•1¥¹•Ì ¥ì(€€€½¹ÍĞÉ½½Ğô ‰ÅI½İÌˆ¤íÉ½½Ğ¹É•Á±…•¡¥±‘É•¸ ¤ì(€€€™½È¡½¹ÍĞm¥¹‘•à±É½İt½˜‘•µ½1¥¹•Ì¹•¹ÑÉ¥•Ì ¤¥ì(€€€€€½¹ÍĞÑÈõ‘½Õµ•¹Ğ¹É•…Ñ•±•µ•¹Ğ ‰ÑÈˆ¤ì(€€€€€™½È¡½¹ÍĞ­•ä½˜l‰½‘”ˆ°‰‘•ÍÉ¥ÁÑ¥½¸ˆ°‰Õ¹¥Ğˆ°‰ÅÑäˆ°‰ÁÉ¥”‰t¥ì(€€€€€€€½¹ÍĞÑõ‘½Õµ•¹Ğ¹É•…Ñ•±•µ•¹Ğ ‰Ñˆ¤±¥¹ÁÕĞõ‘½Õµ•¹Ğ¹É•…Ñ•±•µ•¹Ğ ‰¥¹ÁÕĞˆ¤ì(€€€€€€€¥¹ÁÕĞ¹Ù…±Õ”õÉ½İm­•åtí¥¹ÁÕĞ¹‘…Ñ…Í•Ğ¹™¥•±õ­•äí¥¹ÁÕĞ¹‘…Ñ…Í•Ğ¹¥¹‘•àõMÑÉ¥¹œ¡¥¹‘•à¤ì(€€€€€€€¥¹ÁÕĞ¹Í•ÑÑÑÉ¥‰ÕÑ” ‰…É¥„µ±…‰•°ˆ°‰Y½”5<€ˆ­­•ä¤ì(€€€€€€€¥˜¡­•äôôô‰ÅÑä‰ññ­•äôôô‰ÁÉ¥”ˆ¥í¥¹ÁÕĞ¹ÑåÁ”ô‰¹Õµ‰•Èˆí¥¹ÁÕĞ¹µ¥¸ôˆÀˆí¥¹ÁÕĞ¹ÍÑ•ÀôˆÀ¸ÀÄˆíô(€€€€€€€¥¹ÁÕĞ¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰¥¹ÁÕĞˆ° ¤ôùì(€€€€€€€€€½¹ÍĞÙ…°ô¡­•äôôô‰ÅÑä‰ññ­•äôôô‰ÁÉ¥”ˆ¤ı9Õµ‰•È¡¥¹ÁÕĞ¹Ù…±Õ”¤é¥¹ÁÕĞ¹Ù…±Õ”ì(€€€€€€€€€É½İm­•åtõÙ…°ì(€€€€€€€€€¥˜¡­•äôôô‰ÅÑä‰ññ­•äôôô‰ÁÉ¥”ˆ¥ì(€€€€€€€€€€€½¹ÍĞ…µ½Õ¹ĞõÑÈ¹ÅÕ•ÉåM•±•Ñ½È ‰m‘…Ñ„µ…µ½Õ¹Ñtˆ¤ì(€€€€€€€€€€€¥˜¡…µ½Õ¹Ğ¥…µ½Õ¹Ğ¹Ñ•áÑ½¹Ñ•¹Ğõ•ÕÈ¡É½Ü¹ÅÑä©É½Ü¹ÁÉ¥”¤ì(€€€€€€€€€€€ÅÕ½Ñ•AÉ•Ù¥•Ü ¤ì(€€€€€€€€€ô(€€€€€€€ô¤ì(€€€€€€€Ñ¹…ÁÁ•¹¡¥¹ÁÕĞ¤íÑÈ¹…ÁÁ•¹¡Ñ¤ì(€€€€€ô(€€€€€½¹ÍĞÑ½Ñ…°õ‘½Õµ•¹Ğ¹É•…Ñ•±•µ•¹Ğ ‰Ñˆ¤íÑ½Ñ…°¹‘…Ñ…Í•Ğ¹…µ½Õ¹Ğô‰ÑÉÕ”ˆì(€€€€€Ñ½Ñ…°¹Ñ•áÑ½¹Ñ•¹Ğõ•ÕÈ¡É½Ü¹ÅÑä©É½Ü¹ÁÉ¥”¤íÑÈ¹…ÁÁ•¹¡Ñ½Ñ…°¤ì(€€€€€½¹ÍĞ±…ÍĞõ‘½Õµ•¹Ğ¹É•…Ñ•±•µ•¹Ğ ‰Ñˆ¤±É•µ½Ù”õ‘½Õµ•¹Ğ¹É•…Ñ•±•µ•¹Ğ ‰‰ÕÑÑ½¸ˆ¤ì(€€€€€É•µ½Ù”¹ÑåÁ”ô‰‰ÕÑÑ½¸ˆíÉ•µ½Ù”¹Ñ•áÑ½¹Ñ•¹Ğô‹\ˆíÉ•µ½Ù”¹±…ÍÍ9…µ”ô‰µ¥¹¤‘…¹•Èˆì(€€€€€€¼¼I•¥ÍÑÉ…Ñ¥½¸ÍÑ…åÌ±½…°Ñ¼Ñ¡”‘•µ¼U$°¹½Ğ‰…­•¹¸(€€€€€É•µ½Ù”¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰±¥¬ˆ° ¤ôùí‘•µ½1¥¹•Ì¹ÍÁ±¥”¡¥¹‘•à°Ä¤íÉ•¹‘•É•µ½EÕ½Ñ•1¥¹•Ì ¤íô¤ì(€€€€€±…ÍĞ¹…ÁÁ•¹¡É•µ½Ù”¤íÑÈ¹…ÁÁ•¹¡±…ÍĞ¤íÉ½½Ğ¹…ÁÁ•¹¡ÑÈ¤ì(€€€ô(€€€ÅÕ½Ñ•AÉ•Ù¥•Ü ¤ì(€ô(€™Õ¹Ñ¥½¸É•Í•Ñ•µ½EÕ½Ñ” ¥ì(€€€‘•µ½1¥¹•Ì¹ÍÁ±¥” À¤ì(€€€l‰ÅMÕ‰©•Ğˆ°‰ÅM¥Ñ”ˆ°‰ÅA…åµ•¹Ğ‰t¹™½É… ¡¥ôø¡¥¤¹Ù…±Õ”ôˆˆ¤ì(€€€€ ‰ÅY…±¥‘¥Ñäˆ¤¹Ù…±Õ”ôˆÌÀˆì ‰Å¥Í½Õ¹Ğˆ¤¹Ù…±Õ”ôˆÀˆì ‰ÅY…Ğˆ¤¹Ù…±Õ”ôˆÈÈˆì(€€€€ ‰Å9Õµ‰•Èˆ¤¹Ù…±Õ”ô‰5<µAIX´ˆ­MÑÉ¥¹œ¡…Ñ”¹¹½Ü ¤¤ì(€€€É•¹‘•É•µ½EÕ½Ñ•1¥¹•Ì ¤ì(€ô(€…Íå¹Œ™Õ¹Ñ¥½¸…‘‘•µ½EÕ½Ñ” ¥ì(€€€¥˜¡I==P„ôô‰•ÍÑ¥½¹…±•}Í…¹‘‰½á|ÈÀÈØÄÀÈÜ‰ñğ…µ½‘•°¹ÕÍ•È¥É•ÑÕÉ¸ì(€€€ÑÉåì(€€€€€½¹ÍĞÍÕ‰©•Ğõ‘•µ½9…µ”  ‰ÅMÕ‰©•Ğˆ¤¹Ù…±Õ”¤ì(€€€€€½¹ÍĞ±¥•¹ÑÌõ±¥ÍĞ¡…İ…¥ĞÍ•Ñ¥½¸ ‰±¥•¹ÑÌˆ¤¤ì(€€€€€½¹ÍĞ±¥•¹Ğõ±¥•¹ÑÌ¹™¥¹¡àôùà¹¥ôôô ‰Å±¥•¹Ğˆ¤¹Ù…±Õ”˜˜½y‘•µ¼µ°´½¤¹Ñ•ÍĞ¡MÑÉ¥¹œ¡à¹¥‘ñğˆˆ¤¤¤ì(€€€€€¥˜ …±¥•¹Ğ¥Ñ¡É½ÜÉÉ½È ‰M•±•é¥½¹„Õ¸±¥•¹Ñ”5<¸ˆ¤ì(€€€€€¥˜¡‘•µ½1¥¹•Ì¹±•¹Ñ ğÅññ‘•µ½1¥¹•Ì¹±•¹Ñ øÈÀ¥Ñ¡É½ÜÉÉ½È ‰%¹Í•É¥Í¤‘„€Ä„€ÈÀÙ½¤‘¥µ½ÍÑÉ…Ñ¥Ù”¸ˆ¤ì(€€€€€½¹ÍĞÉ½İÌõ‘•µ½1¥¹•Ì¹µ…À¡àôø¡ì¸¸¹áô¤¤ì(€€€€€™½È¡½¹ÍĞÉ½Ü½˜É½İÌ¥ì(€€€€€€€É½Ü¹‘•ÍÉ¥ÁÑ¥½¸õ‘•µ½9…µ”¡É½Ü¹‘•ÍÉ¥ÁÑ¥½¸¤ì(€€€€€€€É½Ü¹½‘”ô‰5<´ˆ­MÑÉ¥¹œ¡É½Ü¹½‘•ñğ‰Y=ˆ¤¹Í±¥” À°ÈĞ¤ì(€€€€€€€¥˜ …9Õµ‰•È¹¥Í¥¹¥Ñ”¡É½Ü¹ÅÑä¥ññÉ½Ü¹ÅÑäğôÁññÉ½Ü¹ÅÑäøÄÀÀÀÁñğ(€€€€€€€€€€€…9Õµ‰•È¹¥Í¥¹¥Ñ”¡É½Ü¹ÁÉ¥”¥ññÉ½Ü¹ÁÉ¥”ğÁññÉ½Ü¹ÁÉ¥”øÄÀÀÀÀÀ¤(€€€€€€€€€Ñ¡É½ÜÉÉ½È ‰EÕ…¹Ñ¥Ó€¼ÁÉ•éé¼‘¥µ½ÍÑÉ…Ñ¥Ù¼¹½¸Ù…±¥‘¤¸ˆ¤ì(€€€€€ô(€€€€€½¹ÍĞ‘¥Í½Õ¹Ğõ9Õµ‰•È  ‰Å¥Í½Õ¹Ğˆ¤¹Ù…±Õ•ñğÀ¤±Ù…ÑI…Ñ”õ9Õµ‰•È  ‰ÅY…Ğˆ¤¹Ù…±Õ•ñğÀ¤ì(€€€€€¥˜ …9Õµ‰•È¹¥Í¥¹¥Ñ”¡‘¥Í½Õ¹Ğ¥ññ‘¥Í½Õ¹ĞğÁññ‘¥Í½Õ¹ĞøÄÀÁñğ(€€€€€€€€€…9Õµ‰•È¹¥Í¥¹¥Ñ”¡Ù…ÑI…Ñ”¥ññÙ…ÑI…Ñ”ğÁññÙ…ÑI…Ñ”øÄÀÀ¤(€€€€€€€Ñ¡É½ÜÉÉ½È ‰A•É•¹ÑÕ…±¤Í½¹Ñ¼¼%Y¹½¸Ù…±¥‘”¸ˆ¤ì(€€€€€½¹ÍĞÍÕˆõÉ½İÌ¹É•‘Õ” ¡Ñ½Ñ…°±É½Ü¤ôùÑ½Ñ…°­É½Ü¹ÅÑä©É½Ü¹ÁÉ¥”°À¤ì(€€€€€½¹ÍĞÑ…á…‰±”õÍÕˆ¨ Äµ‘¥Í½Õ¹Ğ¼ÄÀÀ¤±Ñ…àõÑ…á…‰±”©Ù…ÑI…Ñ”¼ÄÀÀì(€€€€€½¹ÍĞÅÕ½Ñ”õí¥è‰‘•µ¼µÄ´ˆ­ÉåÁÑ¼¹É…¹‘½µUU% ¤°(€€€€€€€¹Õµ‰•Èè‰5<µAIX´ˆ­MÑÉ¥¹œ¡…Ñ”¹¹½Ü ¤¤±‘…Ñ”é¹•Ü…Ñ” ¤¹Ñ½1½…±•…Ñ•MÑÉ¥¹œ ‰¥Ğµ%Pˆ¤°(€€€€€€€±¥•¹Ñ%é±¥•¹Ğ¹¥±±¥•¹Ñ9…µ”é±¥•¹Ğ¹¹…µ”±±¥•¹Ğéí¥é±¥•¹Ğ¹¥±¹…µ”é±¥•¹Ğ¹¹…µ•ô°(€€€€€€€ÍÕ‰©•Ğ±Í¥Ñ”éMÑÉ¥¹œ  ‰ÅM¥Ñ”ˆ¤¹Ù…±Õ•ñğˆˆ¤¹Í±¥” À°ÄÈÀ¤°(€€€€€€€Ù…±¥‘¥Ñäé5…Ñ ¹µ…à Ä±5…Ñ ¹µ¥¸ ÌØÔ±9Õµ‰•È  ‰ÅY…±¥‘¥Ñäˆ¤¹Ù…±Õ•ñğÌÀ¤¤¤°(€€€€€€€Á…åµ•¹ĞéMÑÉ¥¹œ  ‰ÅA…åµ•¹Ğˆ¤¹Ù…±Õ•ñğˆˆ¤¹Í±¥” À°ÄÀÀ¤°(€€€€€€€É½İÌ±‘¥Í½Õ¹Ğ±Ù…ÑI…Ñ”±ÍÕ‰Ñ½Ñ…°éÑ…á…‰±”±Ù…ĞéÑ…à±Ñ½Ñ…°éÑ…á…‰±”­Ñ…à±ÍÑ…ÑÕÌè‰	½éé„‰ôì(€€€€€½¹ÍĞ½¬õ…İ…¥ĞÍ…Ù••µ½M•Ñ¥½¸ ‰ÅÕ½Ñ•Ìˆ±ÅÕ½Ñ”°‰Í…Ù•EÕ½Ñ”ˆ°‰ÁÉ•Ù•¹Ñ¥Ù¤ˆ¤ì(€€€€€¥˜¡½¬¥íÉ•Í•Ñ•µ½EÕ½Ñ” ¤í…±•ÉĞ ‰AÉ•Ù•¹Ñ¥Ù¼5<Í…±Ù…Ñ¼ÍÔ=É…±”¸ˆ¤íô(€€€õ…Ñ ¡•ÉÈ¥í…±•ÉĞ ‰M…±Ù…Ñ…¥¼ÁÉ•Ù•¹Ñ¥Ù¼5<¹½¸•Í•Õ¥Ñ¼è€ˆ­•ÉÈ¹µ•ÍÍ…”¤íô(€ô(€…Íå¹Œ™Õ¹Ñ¥½¸…‘‘•µ½%¹Ù½¥” ¥ì(€€€¥˜¡I==P„ôô‰•ÍÑ¥½¹…±•}Í…¹‘‰½á|ÈÀÈØÄÀÈÜ‰ñğ…µ½‘•°¹ÕÍ•È¥É•ÑÕÉ¸ì(€€€ÑÉåì(€€€€€½¹ÍĞÙ…±¥‘…Ñ¥½¸õİ¥¹‘½Ü¹Y=É…±•½Õ¹Ñ¥¹•µ¼ì(€€€€€¥˜ …Ù…±¥‘…Ñ¥½¸¥Ñ¡É½ÜÉÉ½È ‰Y…±¥‘…é¥½¹”5<¹½¸‘¥ÍÁ½¹¥‰¥±”¸ˆ¤ì(€€€€€½¹ÍĞ±¥•¹ÑÌõ±¥ÍĞ¡…İ…¥ĞÍ•Ñ¥½¸ ‰±¥•¹ÑÌˆ¤¤ì(€€€€€½¹ÍĞ±¥•¹Ñ%ô ‰™±¥•¹Ğˆ¤¹Ù…±Õ”ì(€€€€€¥˜ …±¥•¹ÑÌ¹Í½µ”¡àôùà¹¥ôôõ±¥•¹Ñ%˜˜½y‘•µ¼µ°´½¤¹Ñ•ÍĞ¡MÑÉ¥¹œ¡à¹¥‘ñğˆˆ¤¤¤¤(€€€€€€€Ñ¡É½ÜÉÉ½È ‰M•±•é¥½¹„Õ¸±¥•¹Ñ”5<¸ˆ¤ì(€€€€€½¹ÍĞ‘…Ñ„õÙ…±¥‘…Ñ¥½¸¹¥¹Ù½¥”¡í¹Õµ‰•Èè ‰™9Õµ‰•Èˆ¤¹Ù…±Õ”±±¥•¹Ñ%°(€€€€€€€…µ½Õ¹Ğè ‰™µ½Õ¹Ğˆ¤¹Ù…±Õ”±‘…Ñ”è ‰™…Ñ”ˆ¤¹Ù…±Õ”±‘Õ”è ‰™Õ”ˆ¤¹Ù…±Õ•ô¤ì(€€€€€½¹ÍĞÉ•½Éõì¸¸¹‘…Ñ„±¥è‰‘•µ¼µ¥¹Ù½¥”´ˆ­ÉåÁÑ¼¹É…¹‘½µUU% ¤°(€€€€€€€¹½Ñ•ÌéMÑÉ¥¹œ  ‰™9½Ñ•Ìˆ¤¹Ù…±Õ•ñğˆˆ¤¹Í±¥” À°ÈÔÀ¥ôì(€€€€€¥˜¡±¥ÍĞ¡…İ…¥ĞÍ•Ñ¥½¸ ‰¥¹Ù½¥•Ìˆ¤¤¹Í½µ”¡àôùà¹¹Õµ‰•ÈôôõÉ•½É¹¹Õµ‰•È¤¤(€€€€€€€Ñ¡É½ÜÉÉ½È ‰9Õµ•É¼™…ÑÑÕÉ„5<§€•Í¥ÍÑ•¹Ñ”¸ˆ¤ì(€€€€€½¹ÍĞ½¬õ…İ…¥ĞÍ…Ù••µ½M•Ñ¥½¸ ‰¥¹Ù½¥•Ìˆ±É•½É°‰…‘‘%¹Ù½¥”ˆ°‰™…ÑÑÕÉ”ˆ¤ì(€€€€€¥˜¡½¬¥ì ‰™9Õµ‰•Èˆ¤¹Ù…±Õ”ôˆˆì ‰™µ½Õ¹Ğˆ¤¹Ù…±Õ”ôˆˆì ‰™9½Ñ•Ìˆ¤¹Ù…±Õ”ôˆˆì(€€€€€€€…±•ÉĞ ‰½Õµ•¹Ñ¼5<Í…±Ù…Ñ¼ÍÔ=É…±”¸9½¸ƒ Õ¹„™…ÑÑÕÉ„™¥Í…±”¸ˆ¤íô(€€€õ…Ñ ¡•ÉÈ¥í…±•ÉĞ ‰½Õµ•¹Ñ¼5<¹½¸Í…±Ù…Ñ¼è€ˆ­•ÉÈ¹µ•ÍÍ…”¤íô(€ô(€…Íå¹Œ™Õ¹Ñ¥½¸…‘‘•µ½AÉ¥•1¥ÍĞ ¥ì(€€€¥˜¡I==P„ôô‰•ÍÑ¥½¹…±•}Í…¹‘‰½á|ÈÀÈØÄÀÈÜ‰ñğ…µ½‘•°¹ÕÍ•È¥É•ÑÕÉ¸ì(€€€ÑÉåì(€€€€€½¹ÍĞ¹…µ”õ‘•µ½9…µ”  ‰Á±9…µ”ˆ¤¹Ù…±Õ”¤ì(€€€€€¥˜¡±¥ÍĞ¡…İ…¥ĞÍ•Ñ¥½¸ ‰ÁÉ¥•1¥ÍÑÌˆ¤¤¹Í½µ”¡àôùà¹¹…µ”ü¹Ñ½1½İ•É…Í” ¤ôôõ¹…µ”¹Ñ½1½İ•É…Í” ¤¤¤(€€€€€€€Ñ¡É½ÜÉÉ½È ‰AÉ•éé…É¥¼5<§€ÁÉ•Í•¹Ñ”¸ˆ¤ì(€€€€€½¹ÍĞ¥Ñ•´õí¥è‰‘•µ¼µÁ°´ˆ­ÉåÁÑ¼¹É…¹‘½µUU% ¤±¹…µ•ôì(€€€€€½¹ÍĞ½¬õ…İ…¥ĞÍ…Ù••µ½M•Ñ¥½¸ ‰ÁÉ¥•1¥ÍÑÌˆ±¥Ñ•´°‰…‘‘AÉ¥•1¥ÍĞˆ°‰ÁÉ•éé…É¤ˆ¤ì(€€€€€¥˜¡½¬¥ì ‰Á±9…µ”ˆ¤¹Ù…±Õ”ôˆˆí…±•ÉĞ ‰AÉ•éé…É¥¼5<Í…±Ù…Ñ¼ÍÔ=É…±”¸ˆ¤íô(€€€õ…Ñ ¡•ÉÈ¥í…±•ÉĞ ‰AÉ•éé…É¥¼5<¹½¸Í…±Ù…Ñ¼è€ˆ­•ÉÈ¹µ•ÍÍ…”¤íô(€ô(€…Íå¹Œ™Õ¹Ñ¥½¸…‘‘•µ½AÉ¥•¹ÑÉä ¥ì(€€€¥˜¡I==P„ôô‰•ÍÑ¥½¹…±•}Í…¹‘‰½á|ÈÀÈØÄÀÈÜ‰ñğ…µ½‘•°¹ÕÍ•È¥É•ÑÕÉ¸ì(€€€ÑÉåì(€€€€€½¹ÍĞÁÉ¥•1¥ÍÑ%ô ‰•A0ˆ¤¹Ù…±Õ”ì(€€€€€¥˜ …±¥ÍĞ¡…İ…¥ĞÍ•Ñ¥½¸ ‰ÁÉ¥•1¥ÍÑÌˆ¤¤¹Í½µ”¡àôùà¹¥ôôõÁÉ¥•1¥ÍÑ%˜˜½y‘•µ¼µÁ°´½¤¹Ñ•ÍĞ¡à¹¥¤¤¤(€€€€€€€Ñ¡É½ÜÉÉ½È ‰M•±•é¥½¹„Õ¸ÁÉ•éé…É¥¼5<¸ˆ¤ì(€€€€€½¹ÍĞÙ…±¥õİ¥¹‘½Ü¹Y=É…±•½Õ¹Ñ¥¹•µ¼¹ÁÉ¥•¹ÑÉä¡ì(€€€€€€€½‘”è ‰•½‘”ˆ¤¹Ù…±Õ”±‘•ÍÉ¥ÁÑ¥½¸è ‰••ÍŒˆ¤¹Ù…±Õ”°(€€€€€€€Õ¹¥Ğè ‰•U¹¥Ğˆ¤¹Ù…±Õ”±ÁÉ¥”è ‰•AÉ¥”ˆ¤¹Ù…±Õ•ô¤ì(€€€€€½¹ÍĞ•á¥ÍÑ¥¹œõ±¥ÍĞ¡…İ…¥ĞÍ•Ñ¥½¸ ‰•¹ÑÉ¥•Ìˆ¤¤ì(€€€€€¥˜¡•á¥ÍÑ¥¹œ¹Í½µ”¡àôùà¹ÁÉ¥•1¥ÍÑ%ôôõÁÉ¥•1¥ÍÑ%˜™à¹½‘”ôôõÙ…±¥¹½‘”¤¤(€€€€€€€Ñ¡É½ÜÉÉ½È ‰½‘¥”ÁÉ•éé¼5<§€ÁÉ•Í•¹Ñ”¸ˆ¤ì(€€€€€½¹ÍĞ½¬õ…İ…¥ĞÍ…Ù••µ½M•Ñ¥½¸ ‰•¹ÑÉ¥•Ìˆ±ì¸¸¹Ù…±¥±¥è‰‘•µ¼µ•¹ÑÉä´ˆ­ÉåÁÑ¼¹É…¹‘½µUU% ¤±ÁÉ¥•1¥ÍÑ%‘ô°‰…‘‘¹ÑÉäˆ°‰ÁÉ•éé…É¤ˆ¤ì(€€€€€¥˜¡½¬¥íl‰•½‘”ˆ°‰••ÍŒˆ°‰•U¹¥Ğˆ°‰•AÉ¥”‰t¹™½É… ¡¥ôø¡¥¤¹Ù…±Õ”ôˆˆ¤ì(€€€€€€€…±•ÉĞ ‰Y½”5<Í…±Ù…Ñ„ÍÔ=É…±”¸ˆ¤íô(€€€õ…Ñ ¡•ÉÈ¥í…±•ÉĞ ‰Y½”5<¹½¸Í…±Ù…Ñ„è€ˆ­•ÉÈ¹µ•ÍÍ…”¤íô(€ô(€…Íå¹Œ™Õ¹Ñ¥½¸…‘‘•µ½áÁ•¹Í” ¥ì(€€€¥˜¡I==P„ôô‰•ÍÑ¥½¹…±•}Í…¹‘‰½á|ÈÀÈØÄÀÈÜ‰ñğ…µ½‘•°¹ÕÍ•È¥É•ÑÕÉ¸ì(€€€ÑÉåì(€€€€€½¹ÍĞÙ…±¥‘…Ñ¥½¸õİ¥¹‘½Ü¹Y=É…±•	ÕÍ¥¹•ÍÍ•µ¼ì(€€€€€¥˜ …Ù…±¥‘…Ñ¥½¸¥Ñ¡É½ÜÉÉ½È ‰Y…±¥‘…é¥½¹”5<¹½¸‘¥ÍÁ½¹¥‰¥±”¸ˆ¤ì(€€€€€½¹ÍĞÉ•½ÉõÙ…±¥‘…Ñ¥½¸¹•áÁ•¹Í”¡í‘…Ñ”è ‰á…Ñ”ˆ¤¹Ù…±Õ”±ÍÕÁÁ±¥•Èè ‰áMÕÁÁ±¥•Èˆ¤¹Ù…±Õ”°(€€€€€€€…Ñ•½Éäè ‰á…Ñ•½Éäˆ¤¹Ù…±Õ”±…µ½Õ¹Ğè ‰áµ½Õ¹Ğˆ¤¹Ù…±Õ”±©½‰%è ‰á)½ˆˆ¤¹Ù…±Õ”°(€€€€€€€¹½Ñ•Ìè ‰á9½Ñ•Ìˆ¤¹Ù…±Õ•ô¤ì(€€€€€¥˜¡É•½É¹©½‰%˜˜…±¥ÍĞ¡…İ…¥ĞÍ•Ñ¥½¸ ‰©½‰Ìˆ¤¤¹Í½µ”¡©½ˆôù©½ˆ¹¥ôôõÉ•½É¹©½‰%˜˜½y‘•µ¼µ©½ˆ´½¤¹Ñ•ÍĞ¡©½ˆ¹¥¤¤¤(€€€€€€€Ñ¡É½ÜÉÉ½È ‰1„ÍÁ•Í„‘•Ù”É¥™•É¥ÉÍ¤„Õ¹„½µµ•ÍÍ„5<•Í¥ÍÑ•¹Ñ”¸ˆ¤ì(€€€€€½¹ÍĞ½¬õ…İ…¥ĞÍ…Ù••µ½M•Ñ¥½¸ ‰•áÁ•¹Í•Ìˆ±ì¸¸¹É•½É±¥è‰‘•µ¼µ•áÀ´ˆ­ÉåÁÑ¼¹É…¹‘½µUU% ¥ô°‰…‘‘áÁ•¹Í”ˆ°‰ÍÁ•Í”ˆ¤ì(€€€€€¥˜¡½¬¥íl‰á…Ñ”ˆ°‰áMÕÁÁ±¥•Èˆ°‰á…Ñ•½Éäˆ°‰áµ½Õ¹Ğˆ°‰á9½Ñ•Ì‰t¹™½É… ¡¥ôø¡¥¤¹Ù…±Õ”ôˆˆ¤í…±•ÉĞ ‰MÁ•Í„5<Í…±Ù…Ñ„ÍÔ=É…±”¸ˆ¤íô(€€€õ…Ñ ¡•ÉÈ¥í…±•ÉĞ ‰MÁ•Í„5<¹½¸Í…±Ù…Ñ„è€ˆ­•ÉÈ¹µ•ÍÍ…”¤íô(€ô(€…Íå¹Œ™Õ¹Ñ¥½¸…‘‘•µ½•…‘±¥¹” ¥ì(€€€¥˜¡I==P„ôô‰•ÍÑ¥½¹…±•}Í…¹‘‰½á|ÈÀÈØÄÀÈÜ‰ñğ…µ½‘•°¹ÕÍ•È¥É•ÑÕÉ¸ì(€€€ÑÉåì(€€€€€½¹ÍĞÙ…±¥‘…Ñ¥½¸õİ¥¹‘½Ü¹Y=É…±•	ÕÍ¥¹•ÍÍ•µ¼ì(€€€€€¥˜ …Ù…±¥‘…Ñ¥½¸¥Ñ¡É½ÜÉÉ½È ‰Y…±¥‘…é¥½¹”5<¹½¸‘¥ÍÁ½¹¥‰¥±”¸ˆ¤ì(€€€€€½¹ÍĞÉ•½ÉõÙ…±¥‘…Ñ¥½¸¹‘•…‘±¥¹”¡íÑ¥Ñ±”è ‰‘Q¥Ñ±”ˆ¤¹Ù…±Õ”±‘…Ñ”è ‰‘…Ñ”ˆ¤¹Ù…±Õ”°(€€€€€€€Ñ¥µ”è ‰‘Q¥µ”ˆ¤¹Ù…±Õ”±ÑåÁ”è ‰‘QåÁ”ˆ¤¹Ù…±Õ”±ÁÉ¥½É¥Ñäè ‰‘AÉ¥½É¥Ñäˆ¤¹Ù…±Õ”°(€€€€€€€…ÍÍ¥¹•”è ‰‘ÍÍ¥¹•”ˆ¤¹Ù…±Õ”±©½‰%è ‰‘)½ˆˆ¤¹Ù…±Õ”±¹½Ñ•Ìè ‰‘9½Ñ•Ìˆ¤¹Ù…±Õ”°(€€€€€€€…±•¹‘…É¹…‰±•é™…±Í•ô¤ì(€€€€€¥˜¡É•½É¹©½‰%˜˜…±¥ÍĞ¡…İ…¥ĞÍ•Ñ¥½¸ ‰©½‰Ìˆ¤¤¹Í½µ”¡©½ˆôù©½ˆ¹¥ôôõÉ•½É¹©½‰%˜˜½y‘•µ¼µ©½ˆ´½¤¹Ñ•ÍĞ¡©½ˆ¹¥¤¤¤(€€€€€€€Ñ¡É½ÜÉÉ½È ‰3Še…ÑÑ¥Ù¥Ó€‘•Ù”É¥™•É¥ÉÍ¤„Õ¹„½µµ•ÍÍ„5<•Í¥ÍÑ•¹Ñ”¸ˆ¤ì(€€€€€½¹ÍĞ½¬õ…İ…¥ĞÍ…Ù••µ½M•Ñ¥½¸ ‰‘•…‘±¥¹•Ìˆ±ì¸¸¹É•½É±¥è‰‘•µ¼µ‘•…´ˆ­ÉåÁÑ¼¹É…¹‘½µUU% ¤°(€€€€€€€É•…Ñ•‘Ğé¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¥ô°‰…‘‘•…‘±¥¹”ˆ°‰Í…‘•¹é”ˆ¤ì(€€€€€¥˜¡½¬¥íl‰‘Q¥Ñ±”ˆ°‰‘…Ñ”ˆ°‰‘9½Ñ•Ìˆ°‰‘ÍÍ¥¹•”‰t¹™½É… ¡¥ôø¡¥¤¹Ù…±Õ”ôˆˆ¤í…±•ÉĞ ‰ÑÑ¥Ù¥Ó€5<Í…±Ù…Ñ„ÍÔ=É…±”¸9•ÍÍÕ¸•Ù•¹Ñ¼½½±”…±•¹‘…Èƒ ÍÑ…Ñ¼É•…Ñ¼¸ˆ¤íô(€€€õ…Ñ ¡•ÉÈ¥í…±•ÉĞ ‰ÑÑ¥Ù¥Ó€5<¹½¸Í…±Ù…Ñ„è€ˆ­•ÉÈ¹µ•ÍÍ…”¤íô(€ô(€…Íå¹Œ™Õ¹Ñ¥½¸…‘‘•µ½½Õµ•¹Ğ ¥ì(€€€¥˜¡I==P„ôô‰•ÍÑ¥½¹…±•}Í…¹‘‰½á|ÈÀÈØÄÀÈÜ‰ñğ…µ½‘•°¹ÕÍ•È¥É•ÑÕÉ¸ì(€€€ÑÉåì(€€€€€½¹ÍĞÙ…±¥‘…Ñ¥½¸õİ¥¹‘½Ü¹Y=É…±•	ÕÍ¥¹•ÍÍ•µ¼ì(€€€€€¥˜ …Ù…±¥‘…Ñ¥½¸¥Ñ¡É½ÜÉÉ½È ‰Y…±¥‘…é¥½¹”5<¹½¸‘¥ÍÁ½¹¥‰¥±”¸ˆ¤ì(€€€€€½¹ÍĞÉ•½ÉõÙ…±¥‘…Ñ¥½¸¹‘½Õµ•¹ÑI•½É¡í¹…µ”è ‰‘½9…µ”ˆ¤¹Ù…±Õ”±…Ñ•½Éäè ‰‘½…Ñ•½Éäˆ¤¹Ù…±Õ”°(€€€€€€€±¥•¹Ñ%è ‰‘½±¥•¹Ğˆ¤¹Ù…±Õ”±©½‰%è ‰‘½)½ˆˆ¤¹Ù…±Õ”±‘É¥Ù•UÉ°èˆˆ±¹½Ñ•Ìè ‰‘½9½Ñ•Ìˆ¤¹Ù…±Õ•ô¤ì(€€€€€¥˜¡É•½É¹±¥•¹Ñ%˜˜…±¥ÍĞ¡…İ…¥ĞÍ•Ñ¥½¸ ‰±¥•¹ÑÌˆ¤¤¹Í½µ”¡±¥•¹Ğôù±¥•¹Ğ¹¥ôôõÉ•½É¹±¥•¹Ñ%˜˜½y‘•µ¼µ°´½¤¹Ñ•ÍĞ¡±¥•¹Ğ¹¥¤¤¤(€€€€€€€Ñ¡É½ÜÉÉ½È ‰%°‘½Õµ•¹Ñ¼‘•Ù”É¥™•É¥ÉÍ¤„Õ¸±¥•¹Ñ”5<•Í¥ÍÑ•¹Ñ”¸ˆ¤ì(€€€€€¥˜¡É•½É¹©½‰%˜˜…±¥ÍĞ¡…İ…¥ĞÍ•Ñ¥½¸ ‰©½‰Ìˆ¤¤¹Í½µ”¡©½ˆôù©½ˆ¹¥ôôõÉ•½É¹©½‰%˜˜½y‘•µ¼µ©½ˆ´½¤¹Ñ•ÍĞ¡©½ˆ¹¥¤¤¤(€€€€€€€Ñ¡É½ÜÉÉ½È ‰%°‘½Õµ•¹Ñ¼‘•Ù”É¥™•É¥ÉÍ¤„Õ¹„½µµ•ÍÍ„5<•Í¥ÍÑ•¹Ñ”¸ˆ¤ì(€€€€€½¹ÍĞ½¬õ…İ…¥ĞÍ…Ù••µ½M•Ñ¥½¸ ‰‘½Õµ•¹ÑÌˆ±ì¸¸¹É•½É±¥è‰‘•µ¼µ‘½Œ´ˆ­ÉåÁÑ¼¹É…¹‘½µUU% ¤°(€€€€€€€‘…Ñ”é¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤±…‘‘•‘	äè‰5<UÑ•¹Ñ”‰ô°‰…‘‘½Õµ•¹Ğˆ°‰‘½Õµ•¹Ñ¤ˆ¤ì(€€€€€¥˜¡½¬¥íl‰‘½9…µ”ˆ°‰‘½9½Ñ•Ì‰t¹™½É… ¡¥ôø¡¥¤¹Ù…±Õ”ôˆˆ¤í…±•ÉĞ ‰½Õµ•¹Ñ¼5<Í…±Ù…Ñ¼¸9•ÍÍÕ¸™¥±”¼½±±•…µ•¹Ñ¼É¥Ù”ƒ ÍÑ…Ñ¼…É¥…Ñ¼¸ˆ¤íô(€€€õ…Ñ ¡•ÉÈ¥í…±•ÉĞ ‰½Õµ•¹Ñ¼5<¹½¸Í…±Ù…Ñ¼è€ˆ­•ÉÈ¹µ•ÍÍ…”¤íô(€ô(€…Íå¹Œ™Õ¹Ñ¥½¸Í…Ù••µ½½µÁ…¹ä ¥ì(€€€¥˜¡I==P„ôô‰•ÍÑ¥½¹…±•}Í…¹‘‰½á|ÈÀÈØÄÀÈÜ‰ñğ…µ½‘•°¹ÕÍ•È¥É•ÑÕÉ¸ì(€€€ÑÉåì(€€€€€½¹ÍĞÙ…±¥‘…Ñ¥½¸õİ¥¹‘½Ü¹Y=É…±•	ÕÍ¥¹•ÍÍ•µ¼ì(€€€€€¥˜ …Ù…±¥‘…Ñ¥½¸¥Ñ¡É½ÜÉÉ½È ‰Y…±¥‘…é¥½¹”5<¹½¸‘¥ÍÁ½¹¥‰¥±”¸ˆ¤ì(€€€€€½¹ÍĞÁÉ½™¥±”õÙ…±¥‘…Ñ¥½¸¹½µÁ…¹ä¡í¹…µ”è ‰…9…µ”ˆ¤¹Ù…±Õ”±Ù…Ğè ‰…Y…Ğˆ¤¹Ù…±Õ”°(€€€€€€€…‘‘É•ÍÌè ‰…‘‘É•ÍÌˆ¤¹Ù…±Õ”±¥Ñäè ‰…¥Ñäˆ¤¹Ù…±Õ”±Á¡½¹”è ‰…A¡½¹”ˆ¤¹Ù…±Õ”°(€€€€€€€•µ…¥°è ‰…µ…¥°ˆ¤¹Ù…±Õ”±Á•Œè ‰…A•Œˆ¤¹Ù…±Õ”±¥‰…¸è ‰…%‰…¸ˆ¤¹Ù…±Õ”°(€€€€€€€™½½Ñ•Èè ‰…½½Ñ•Èˆ¤¹Ù…±Õ•ô¤ì(€€€€€½¹ÍĞ½¬õ…İ…¥ĞÍ…Ù••µ½M•Ñ¥½¸ ‰½µÁ…¹äˆ±ÁÉ½™¥±”°‰Í…Ù•½µÁ…¹äˆ°‰…é¥•¹‘„ˆ¤ì(€€€€€¥˜¡½¬¥…±•ÉĞ ‰…Ñ¤…é¥•¹‘„5<Í…±Ù…Ñ¤ÍÔ=É…±”¸ˆ¤ì(€€€õ…Ñ ¡•ÉÈ¥í…±•ÉĞ ‰…Ñ¤…é¥•¹‘„5<¹½¸Í…±Ù…Ñ¤è€ˆ­•ÉÈ¹µ•ÍÍ…”¤íô(€ô(€™Õ¹Ñ¥½¸™¥±±•µ½AÉ¥•1¥ÍÑ=ÁÑ¥½¹Ì¡ÁÉ¥•Ì¥ì(€€€½¹ÍĞ™¥•±ô ‰•A0ˆ¤í¥˜ …™¥•±¥É•ÑÕÉ¸ì(€€€½¹ÍĞ½±õ™¥•±¹Ù…±Õ”í™¥•±¹É•Á±…•¡¥±‘É•¸ ¤ì(€€€™½È¡½¹ÍĞÁÉ¥”½˜±¥ÍĞ¡ÁÉ¥•Ì¤¥ì(€€€€€¥˜ „½y‘•µ¼µÁ°´½¤¹Ñ•ÍĞ¡MÑÉ¥¹œ¡ÁÉ¥”¹¥‘ñğˆˆ¤¤¥½¹Ñ¥¹Õ”ì(€€€€€½¹ÍĞ½ÁÑ¥½¸õ‘½Õµ•¹Ğ¹É•…Ñ•±•µ•¹Ğ ‰½ÁÑ¥½¸ˆ¤ì(€€€€€½ÁÑ¥½¸¹Ù…±Õ”õÁÉ¥”¹¥í½ÁÑ¥½¸¹Ñ•áÑ½¹Ñ•¹ĞõÁÉ¥”¹¹…µ”í™¥•±¹…ÁÁ•¹¡½ÁÑ¥½¸¤ì(€€€ô(€€€¥˜¡l¸¸¹™¥•±¹½ÁÑ¥½¹Ít¹Í½µ”¡àôùà¹Ù…±Õ”ôôõ½±¤¥™¥•±¹Ù…±Õ”õ½±ì(€ô(€…Íå¹Œ™Õ¹Ñ¥½¸…‘‘•µ½±¥•¹Ğ ¥ì(€€€¥˜¡I==P„ôô‰•ÍÑ¥½¹…±•}Í…¹‘‰½á|ÈÀÈØÄÀÈÜ‰ñğ…µ½‘•°¹ÕÍ•È¥É•ÑÕÉ¸ì(€€€½¹ÍĞ¥¹ÁÕĞô ‰9…µ”ˆ¤í¥˜ …¥¹ÁÕĞ¥É•ÑÕÉ¸ì(€€€ÑÉåì(€€€€€½¹ÍĞ¹…µ”õ‘•µ½9…µ”¡¥¹ÁÕĞ¹Ù…±Õ”¤ì(€€€€€½¹ÍĞ‰•™½É”õ…İ…¥ĞÍ•Ñ¥½¸ ‰±¥•¹ÑÌˆ¤ì(€€€€€¥˜¡‰•™½É”¹Í½µ”¡àôùMÑÉ¥¹œ¡à¹¹…µ•ñğˆˆ¤¹ÑÉ¥´ ¤¹Ñ½1½İ•É…Í” ¤ôôõ¹…µ”¹Ñ½1½İ•É…Í” ¤¤¤(€€€€€€€Ñ¡É½ÜÉÉ½È ‰EÕ•ÍÑ¼±¥•¹Ñ”5<•Í¥ÍÑ”§€¸ˆ¤ì(€€€€€½¹ÍĞ½¬õ…İ…¥ĞÍ…Ù••µ½M•Ñ¥½¸ ‰±¥•¹ÑÌˆ±ì(€€€€€€€¥è‰‘•µ¼µ°´ˆ­ÉåÁÑ¼¹É…¹‘½µUU% ¤±¹…µ”°(€€€€€€€¹½Ñ”è‰M½±¼‘…Ñ¤™¥ÑÑ¥é¤€´±…‰½É…Ñ½É¥¼=É…±”ˆ(€€€€€ô°‰…‘‘±¥•¹Ğˆ°‰±¥•¹Ñ¤ˆ¤ì(€€€€€¥˜¡½¬¥í¥¹ÁÕĞ¹Ù…±Õ”ôˆˆí…±•ÉĞ ‰±¥•¹Ñ”5<Í…±Ù…Ñ¼ÍÔ=É…±”¸ˆ¤íô(€€€õ…Ñ ¡•ÉÈ¥í…±•ÉĞ ‰M…±Ù…Ñ…¥¼±¥•¹Ñ”5<¹½¸•Í•Õ¥Ñ¼è€ˆ­•ÉÈ¹µ•ÍÍ…”¤íô(€ô(€…Íå¹Œ™Õ¹Ñ¥½¸±½¥¸¡•Ù•¹Ğ¥ì(€€€•Ù•¹Ğ¹ÁÉ•Ù•¹Ñ•™…Õ±Ğ ¤ì(€€€½¹ÍĞ•µ…¥°ô ‰±½¥¹µ…¥°ˆ¤¹Ù…±Õ”¹ÑÉ¥´ ¤±Á…ÍÍİ½Éô ‰±½¥¹A…ÍÍİ½Éˆ¤¹Ù…±Õ”ì(€€€€ ‰±½¥¹A…ÍÍİ½Éˆ¤¹Ù…±Õ”ôˆˆì(€€€€ ‰±½¥¹µ…¥±	ÕÑÑ½¸ˆ¤¹‘¥Í…‰±•õÑÉÕ”ì(€€€•áÁ±…¥¸ ‰Y•É¥™¥„…•ÍÍ¼=É…±—Š˜ˆ¤ì(€€€ÑÉåì(€€€€€½¹ÍĞÕÍ•Èõ…İ…¥Ğ…Á¤¹±½¥¸¡•µ…¥°±Á…ÍÍİ½É¤ì(€€€€€½¹ÍĞÉ•ÍÁ½¹Í”õ…İ…¥Ğ…Á¤¹µ…¹¥™•ÍĞ¡I==P¤ì(€€€€€½¹ÍĞÉ•ÅÕ¥É•‘•µ¼õl‰±¥•¹ÑÌˆ°‰½¹ÍÕ¹Ñ¥Ù¤ˆ°‰•¹ÑÉ¥•Ìˆ°‰¥¹Ù½¥•Ìˆ°‰©½‰Ìˆ°‰ÁÉ¥•1¥ÍÑÌˆ°‰ÅÕ½Ñ•Ìˆ°‰•áÁ•¹Í•Ìˆ°‰‘•…‘±¥¹•Ìˆ°‰‘½Õµ•¹ÑÌˆ°‰É•ÅÕ•ÍÑÌˆ°‰Ù½µµ•ÍÍ”ˆ°‰Ù%µÁ¥…¹Ñ¤ˆ°‰Ù=É”ˆ°‰ÙI•½É‘Ìˆ°‰½µÁ…¹ä‰tì(€€€€€½¹ÍĞµ¥ÍÍ¥¹•µ¼õÉ•ÅÕ¥É•‘•µ¼¹™¥±Ñ•È¡­•äôø…=‰©•Ğ¹ÁÉ½Ñ½ÑåÁ”¹¡…Í=İ¹AÉ½Á•ÉÑä¹…±°¡É•ÍÁ½¹Í”¹Í•Ñ¥½¹Íññíô±­•ä¤¤ì(€€€€€¥˜¡É•ÍÁ½¹Í”¹İ½É­ÍÁ…”„ôõI==Qññµ¥ÍÍ¥¹•µ¼¹±•¹Ñ ¤(€€€€€€€Ñ¡É½ÜÉÉ½È ‰É¡¥Ù¥¼5<¹½¸½µÁ…Ñ¥‰¥±”¸M•é¥½¹¤µ…¹…¹Ñ¤è€ˆ¬¡µ¥ÍÍ¥¹•µ¼¹©½¥¸ ˆ°€ˆ¥ñğ‰¹•ÍÍÕ¹„ˆ¤¬ˆìİ½É­ÍÁ…”Ù•É¥™¥…Ñ¼è€ˆ­MÑÉ¥¹œ¡É•ÍÁ½¹Í”¹İ½É­ÍÁ…”ôôõI==P¤¤ì(€€€€€¥˜ …É•ÍÁ½¹Í”¹Í•Ñ¥½¹Ìü¹±¥•¹ÑÌ¥Ñ¡É½ÜÉÉ½È ‰É¡¥Ù¥¼‘¤ÁÉ½Ù„¹½¸…ÕÑ½É¥éé…Ñ¼ˆ¤ì(€€€€€…İ…¥Ğ‰É¥‘”¹¥¹¥Ñ¥…±¥é” ¤ì(€€€€€µ½‘•°¹ÕÍ•ÈõÕÍ•Èíµ½‘•°¹Í•Ñ¥½¹ÌõÉ•ÍÁ½¹Í”¹Í•Ñ¥½¹Ìì(€€€€€µ½‘•°¹…¡”¹±•…È ¤ì(€€€€€…ÕÑ¡Y¥•Ü¡ÑÉÕ”¤í•áÁ±…¥¸ ˆˆ¤ì(€€€€€…İ…¥Ğ¥¹¥ÑÉ…™ÑY…Õ±Ğ¡ÕÍ•È¤ì(€€€€€½Á•¸ ‰‘…Í¡‰½…Éˆ¤ì(€€€õ…Ñ ¡•ÉÈ¥ì(€€€€€ÑÉåí…İ…¥Ğ…Á¤¹±½½ÕĞ ¤íõ…Ñ ¡|¥íô(€€€€€…ÕÑ¡Y¥•Ü¡™…±Í”¤ì(€€€€€•áÁ±…¥¸ ‰•ÍÍ¼¹½¸É¥ÕÍ¥Ñ¼è€ˆ­•ÉÈ¹µ•ÍÍ…”±ÑÉÕ”¤ì(€€€õ™¥¹…±±åì ‰±½¥¹µ…¥±	ÕÑÑ½¸ˆ¤¹‘¥Í…‰±•õ™…±Í”íô(€ô(€…Íå¹Œ™Õ¹Ñ¥½¸±½½ÕĞ ¥ì(€€€µ½‘•°¹•Á½ ¬ôÄíµ½‘•°¹ÕÍ•Èõ¹Õ±°íµ½‘•°¹Í•Ñ¥½¹Ìõ¹Õ±°íµ½‘•°¹…¡”¹±•…È ¤ì(€€€‰É¥‘”¹±•…È ¤í‘É…™ÑY…Õ±Ğõ¹Õ±°ì(€€€ÑÉåí…İ…¥Ğ…Á¤¹±½½ÕĞ ¤íõ…Ñ ¡|¥íô(€€€…ÕÑ¡Y¥•Ü¡™…±Í”¤í•áÁ±…¥¸ ˆˆ¤ì(€ô(€™Õ¹Ñ¥½¸Í•ÑÕÀ ¥ì(€€€±½­Ì ¤ì(€€€€¼¼M…µ”ÍÑÉÕÑÕÉ”…¹ÍÑå±¥¹œì±…É¥™äÑ¡…ĞÁÉ•Ù¥•Ü…ÕÑ¡•¹Ñ¥…Ñ¥½¸¥Ì=É…±”°(€€€€¼¼¹½ĞÑ¡”ÍÑ¥±°µÉÕ¹¹¥¹œY…É„…¹Ñ¥•É¤½¥É•‰…Í”…½Õ¹Ğ¸(€€€½¹ÍĞÑ¥Ñ±”õ‘½Õµ•¹Ğ¹ÅÕ•ÉåM•±•Ñ½È ˆ¹±½¥¸µ‰É…¹µ½Áä Äˆ¤ì(€€€¥˜¡Ñ¥Ñ±”¥Ñ¥Ñ±”¹Ñ•áÑ½¹Ñ•¹Ğô‰•ÍÍ¼=É…±”‘¤ÁÉ½Ù„¸ˆì(€€€½¹ÍĞ•áÁ±…¹…Ñ¥½¸õ‘½Õµ•¹Ğ¹ÅÕ•ÉåM•±•Ñ½È ˆ¹±½¥¸µ‰É…¹µ½ÁäÀé¹½Ğ ¹±½¥¸µ­¥­•È¤ˆ¤ì(€€€¥˜¡•áÁ±…¹…Ñ¥½¸¥•áÁ±…¹…Ñ¥½¸¹Ñ•áÑ½¹Ñ•¹Ğô‰UÍ„±”É•‘•¹é¥…±¤=É…±”É•…Ñ”Á•È¥°½±±…Õ‘¼¸1„É…™¥„½É¥¥¹…±”ƒ ¥‘•¹Ñ¥„ì±”ÍÉ¥ÑÑÕÉ”Í½¹¼±¥µ¥Ñ…Ñ”„‘…Ñ¤5<¸ˆì(€€€½¹ÍĞ¥¹ÑÉ¼õ‘½Õµ•¹Ğ¹ÅÕ•ÉåM•±•Ñ½È ˆ¹±½¥¸µ¥¹ÑÉ¼ˆ¤ì(€€€¥˜¡¥¹ÑÉ¼¥¥¹ÑÉ¼¹Ñ•áÑ½¹Ñ•¹Ğô‰UÍ„°…½Õ¹Ğ‘¤ÁÉ½Ù„=É…±”¸ˆì(€€€½¹ÍĞ¡•±Àõ‘½Õµ•¹Ğ¹ÅÕ•ÉåM•±•Ñ½È ˆ¹±½¥¸µ¡•±Àˆ¤ì(€€€¥˜¡¡•±À¥¡•±À¹Ñ•áÑ½¹Ñ•¹Ğô‰É¡¥Ù¥¼™¥ÑÑ¥é¥¼èÁÕ½¤ÁÉ½Ù…É”¤µ½‘Õ±¤½¸‘…Ñ¤5<¸É¥Ù”°…±•¹‘…È°•µ…¥°”¥¹Ñ•É…é¥½¹¤•ÍÑ•É¹”É•ÍÑ…¹¼‘¥Í…ÑÑ¥Ù…Ñ¤¸ˆì(€€€½¹ÍĞ™½É´ô ‰±½¥¹½É´ˆ¤ì(€€€½¹ÍĞ±½Õô ‰±½Õ‘%¹™¼ˆ¤ì(€€€¥˜¡±½Õ¥ì(€€€€€½¹ÍĞÉ•½Ù•Èõ‘½Õµ•¹Ğ¹É•…Ñ•±•µ•¹Ğ ‰‰ÕÑÑ½¸ˆ¤ì(€€€€€É•½Ù•È¹ÑåÁ”ô‰‰ÕÑÑ½¸ˆíÉ•½Ù•È¹¥ô‰É•½Ù•É•µ½É…™ÑÌˆì(€€€€€É•½Ù•È¹Ñ•áÑ½¹Ñ•¹Ğô‰IUAI	=ii5<ˆì(€€€€€É•½Ù•È¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰±¥¬ˆ±É•½Ù•É•µ½É…™ÑÌ¤ì(€€€€€±½Õ¹Á…É•¹Ñ9½‘”ü¹…ÁÁ•¹¡É•½Ù•È¤ì(€€€ô(€€€€ ‰…‘‘±¥•¹Ğˆ¤ü¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰±¥¬ˆ±…‘‘•µ½±¥•¹Ğ¤ì(€€€€ ‰…‘‘)½ˆˆ¤ü¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰±¥¬ˆ±…‘‘•µ½)½ˆ¤ì(€€€€ ‰…‘‘%¹Ù½¥”ˆ¤ü¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰±¥¬ˆ±…‘‘•µ½%¹Ù½¥”¤ì(€€€€ ‰…‘‘AÉ¥•1¥ÍĞˆ¤ü¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰±¥¬ˆ±…‘‘•µ½AÉ¥•1¥ÍĞ¤ì(€€€€ ‰…‘‘¹ÑÉäˆ¤ü¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰±¥¬ˆ±…‘‘•µ½AÉ¥•¹ÑÉä¤ì(€€€€ ‰…‘‘áÁ•¹Í”ˆ¤ü¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰±¥¬ˆ±…‘‘•µ½áÁ•¹Í”¤ì(€€€€ ‰…‘‘•…‘±¥¹”ˆ¤ü¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰±¥¬ˆ±…‘‘•µ½•…‘±¥¹”¤ì(€€€€ ‰…‘‘½Õµ•¹Ğˆ¤ü¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰±¥¬ˆ±…‘‘•µ½½Õµ•¹Ğ¤ì(€€€€ ‰Í…Ù•½µÁ…¹äˆ¤ü¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰±¥¬ˆ±Í…Ù••µ½½µÁ…¹ä¤ì(€€€€ ‰½¹Í¥±Ñ•Èˆ¤ü¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰¡…¹”ˆ±É•™É•Í¡•µ½½¹ÍÕ¹Ñ¥Ù¤¤ì(€€€€ ‰½¹ÍM•…É ˆ¤ü¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰¥¹ÁÕĞˆ±É•™É•Í¡•µ½½¹ÍÕ¹Ñ¥Ù¤¤ì(€€€€ ‰•áÁ½ÉÑ½¹ÍÍØˆ¤ü¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰±¥¬ˆ±•áÁ½ÉÑ•µ½½¹ÍÕ¹Ñ¥Ù¤¤ì(€€€€ ‰…‘‘5…¹Õ…°ˆ¤ü¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰±¥¬ˆ° ¤ôùì(€€€€€¥˜¡‘•µ½1¥¹•Ì¹±•¹Ñ øôÈÀ¥É•ÑÕÉ¸…±•ÉĞ ‰5…ÍÍ¥µ¼€ÈÀÙ½¤5<¸ˆ¤ì(€€€€€‘•µ½1¥¹•Ì¹ÁÕÍ ¡í½‘”è‰Y=ˆ±‘•ÍÉ¥ÁÑ¥½¸è‰5<Y½”ÁÉ½Ù„ˆ±Õ¹¥Ğè‰…ˆ±ÅÑäèÄ±ÁÉ¥”èÄÁô¤ì(€€€€€É•¹‘•É•µ½EÕ½Ñ•1¥¹•Ì ¤ì(€€€ô¤ì(€€€€ ‰¹•İEÕ½Ñ”ˆ¤ü¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰±¥¬ˆ±É•Í•Ñ•µ½EÕ½Ñ”¤ì(€€€€ ‰Í…Ù•EÕ½Ñ”ˆ¤ü¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰±¥¬ˆ±…‘‘•µ½EÕ½Ñ”¤ì(€€€€ ‰Å¥Í½Õ¹Ğˆ¤ü¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰¥¹ÁÕĞˆ±ÅÕ½Ñ•AÉ•Ù¥•Ü¤ì(€€€€ ‰ÅY…Ğˆ¤ü¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰¥¹ÁÕĞˆ±ÅÕ½Ñ•AÉ•Ù¥•Ü¤ì(€€€É•Í•Ñ•µ½EÕ½Ñ” ¤ì(€€€™½É´¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰ÍÕ‰µ¥Ğˆ±±½¥¸¤ì(€€€™½È¡½¹ÍĞ‰ÕÑÑ½¸½˜‘½Õµ•¹Ğ¹ÅÕ•ÉåM•±•Ñ½É±° ˆ¹¹…Ùm‘…Ñ„µÙ¥•İtˆ¤¥ì(€€€€€‰ÕÑÑ½¸¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰±¥¬ˆ° ¤ôù½Á•¸¡‰ÕÑÑ½¸¹‘…Ñ…Í•Ğ¹Ù¥•Ü¤¤ì(€€€ô(€€€™½È¡½¹ÍĞ‰ÕÑÑ½¸½˜‘½Õµ•¹Ğ¹ÅÕ•ÉåM•±•Ñ½É±° ‰m‘…Ñ„µ½tˆ¤¥ì(€€€€€‰ÕÑÑ½¸¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰±¥¬ˆ° ¤ôù½Á•¸¡‰ÕÑÑ½¸¹‘…Ñ…Í•Ğ¹¼¤¤ì(€€€ô(€€€€ ‰Í¥‘•‰…É1½½ÕĞˆ¤ü¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰±¥¬ˆ±±½½ÕĞ¤ì(€€€€¼¼½½±”°É•½Ù•Éä…¹É•¥ÍÑÉ…Ñ¥½¸É•µ…¥¸Ù¥ÍÕ…±±ä¥¹Ñ…Ğ‰ÕĞ‘¥Í…‰±•¥¸Ñ¡¥Ì(€€€€¼¼ÁÉ•Ù¥•Ü¸Q¡•äµÕÍĞ‰”¥µÁ±•µ•¹Ñ•‰•™½É”…¸=É…±”µ½¹±äÁÉ½‘ÕÑ¥½¸ÕÑ½Ù•È¸(€€€™½È¡½¹ÍĞ¥½˜l‰±½¥¹½½±•	ÕÑÑ½¸ˆ°‰™½É½ÑA…ÍÍİ½Éˆ°‰É•…Ñ•1½¥¹½Õ¹Ğ‰t¥ì(€€€€€€¡¥¤ü¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰±¥¬ˆ° ¤ôù•áÁ±…¥¸ (€€€€€€€€‰EÕ•ÍÑ„™Õ¹é¥½¹”¹½¸ƒ …¹½É„…ÑÑ¥Ù„¹•°±…‰½É…Ñ½É¥¼=É…±”5<¸9•ÍÍÕ¹„µ½‘¥™¥„ƒ ÍÑ…Ñ„•Í•Õ¥Ñ„¸ˆ±ÑÉÕ”¤¤ì(€€€ô(€€€¥˜  ‰±½¥¹I•µ•µ‰•Èˆ¤¤ ‰±½¥¹I•µ•µ‰•Èˆ¤¹¡•­•õ™…±Í”ì(€€€…ÕÑ¡Y¥•Ü¡™…±Í”¤ì(€€€•áÁ±…¥¸ ‰1…‰½É…Ñ½É¥¼=É…±”èÉ…™¥„½É¥¥¹…±”ìµ½‘Õ±¤‘¤ÁÉ½Ù„½¸‘…Ñ¤5<¸9•ÍÍÕ¸‘…Ñ¼…é¥•¹‘…±”¼Í•ÉÙ¥é¥¼•ÍÑ•É¹¼Ù¥•¹”µ½‘¥™¥…Ñ¼¸ˆ¤ì(€€€…Á¤¹¡•…±Ñ  ¤¹…Ñ   ¤ôù•áÁ±…¥¸ ‰A$=É…±”¹½¸É…¥Õ¹¥‰¥±”¸ˆ±ÑÉÕ”¤¤ì(€ô(€¥˜¡‘½Õµ•¹Ğ¹É•…‘åMÑ…Ñ”ôôô‰±½…‘¥¹œˆ¥‘½Õµ•¹Ğ¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ‰=5½¹Ñ•¹Ñ1½…‘•ˆ±Í•ÑÕÀ±í½¹”éÑÉÕ•ô¤ì(€•±Í”Í•ÑÕÀ ¤ì)ô¤ ¤ì(