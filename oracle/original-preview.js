"use strict";
/* Original Varga Gestionale markup + original CSS; Oracle-only read-only bridge.
 * NEVER executes original Firebase or storage code, never writes to any endpoint.
 * This preview deliberately stays separate from the production app.
 */
(function(){
  const ROOT="gestionale_cantieri_sync_20261027";
  const api=new window.VGOraclePilot();
  const $=id=>document.getElementById(id);
  const model={user:null,sections:null,cache:new Map(),epoch:0};
  const routes={
    dashboard:["quotes","clients","jobs","invoices","deadlines","vcRecords"],
    richieste:["requests","dismissedRequestReceiptIds"],preventivo:["clients","priceLists","entries","company"],
    preventivi:["quotes"],clienti:["clients","priceLists"],
    commesse:["jobs","clients","requests","deadlines","documents","cadrianoDocuments","vcImpianti"],cantieriSync:["vcCommesse","vcImpianti","vcOre","vcRecords","vcSquadre","vcUtenti","vcSegnalazioni","rapportini","cantieriRows","documents","cadrianoDocuments"],
    consuntivi:["consuntivi","depurazioneConsuntivi","discaricheConsuntivi","wteModenaConsuntivi","economicEntries"],prezzari:["priceLists","entries","priceCatalog"],
    fatture:["invoices","clients"],spese:["expenses","jobs"],
    scadenze:["deadlines"],documenti:["documents","cadrianoDocuments","clients","jobs"],
    azienda:["company"],backup:[],cloud:[],
    firmaTimbro:[]
  };
  const OPTIONAL_SECTIONS=new Set(["dismissedRequestReceiptIds","entries","company",
    "vcSquadre","vcUtenti","vcSegnalazioni","rapportini","cantieriRows",
    "depurazioneConsuntivi","discaricheConsuntivi","wteModenaConsuntivi",
    "economicEntries","priceCatalog","cadrianoDocuments","requests",
    "deadlines","documents","vcImpianti"]);
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
      stat("cloudInfo","Copia candidata Oracle dei dati aggiornati. SOLA LETTURA, nessuna modifica consentita.");
    } else if($("loginForm")) $("loginForm").hidden=false;
  }
  function locks(){
    const shell=document.querySelector(".app-shell");
    if(!shell)return;
    // Keep original appearance, but intercept all editing buttons and forms.
    shell.addEventListener("click",event=>{
      const btn=event.target.closest("button,a,input[type=file],label.filebtn");
      if(!btn)return;
      if(btn.matches(".nav[data-view], [data-go], [data-oracle-view], [data-oracle-dismiss-welcome], .vg-nav-label, #sidebarLogout, #openVargaCantieriDesktop, #vgOraclePlantSummaryButton"))return;
      event.preventDefault();event.stopImmediatePropagation();
      if(btn.matches("a"))return;
      const context=btn.closest(".view");
      if(context)status(context.id,"Funzione disponibile dopo la migrazione completa a Oracle.");
    },true);
    shell.addEventListener("submit",event=>{
      event.preventDefault();event.stopImmediatePropagation();
    },true);
    shell.addEventListener("change",event=>{
      // Controls in the dynamic read-only explorer only filter cached records.
      if(event.target.closest("#vcRecordExplorer"))return;
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
    if(model.sections&&!Object.prototype.hasOwnProperty.call(model.sections,key)&&OPTIONAL_SECTIONS.has(key))return [];
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
  const normText=value=>String(value||"").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();
  const packageSpecs=[
    {id:"discariche",title:"DISCARICHE",description:"Ore, squadre, consuntivi e contabilita restano separati per ogni discarica.",match:t=>t.includes("discaric")&&!t.includes("cadriano")&&!t.includes("ozzano")&&!t.includes("strg")&&!t.includes("stradelli guelf")},
    {id:"inrete",title:"INRETE",description:"INRETE Bologna, Modena e Ferrara, con codici e dati sempre separati.",match:t=>/\binrete\b/.test(t)&&/\b(bologna|modena|ferrara)\b/.test(t)},
    {id:"varie",title:"VARIE",description:"Hera Ozzano, WTE, Vega Carburanti, STR G e Hera Cadriano.",match:t=>t.includes("ozzano")||t.includes("vega carburanti")||t.includes("cadriano")||t.includes("stradelli guelf")||/\bstr\s*g\b/.test(t)||t.includes("strg")||(/\bwte\b/.test(t)&&/\b(mo|modena)\b/.test(t))},
    {id:"comune-bologna",title:"COMUNE BOLOGNA",description:"Potature Abbattimenti e Sfalcio COBO, mantenute come commesse distinte.",match:t=>t.includes("potature abbattimenti")||t.includes("pot abb")||t.includes("sfalcio cobo")||t.includes("cobo sfalcio")}
  ];
  function jobText(job){return normText([job?.title,job?.code,job?.site,job?.commessa,job?.nome].filter(Boolean).join(" "));}
  function textMatchesJob(value,job){const text=normText(value),terms=[job?.code,job?.title].map(normText).filter(term=>term.length>=3);return !!text&&terms.some(term=>text===term||(term.length>=5&&text.includes(term)));}
  function configureCommessePreview(){
    const view=$("commesse");if(!view||$("vgJobGrid"))return;
    const scene=view.querySelector(":scope > .vg-view-scene");
    const head=document.createElement("div");head.className="topline vg-commesse-head";
    const intro=document.createElement("div"),title=document.createElement("h1"),subtitle=document.createElement("p");
    title.textContent="Commesse";subtitle.className="subtitle";subtitle.textContent="Cerca e apri una commessa oppure creane una nuova.";
    intro.append(title,subtitle);head.append(intro);if(scene)head.append(scene);
    const actions=document.createElement("div");actions.className="vg-commesse-actions";
    const plants=document.createElement("button");plants.id="vgOraclePlantSummaryButton";plants.className="ghost";plants.type="button";plants.textContent="SITUAZIONE IMPIANTI";plants.addEventListener("click",showPlantSummary);
    const create=document.createElement("button");create.className="primary";create.type="button";create.textContent="+ NUOVA COMMESSA";
    actions.append(plants,create);head.append(actions);
    const panel=document.createElement("section");panel.className="panel vg-commesse-panel";
    const toolbar=document.createElement("div");toolbar.className="vg-job-list-toolbar";
    const search=document.createElement("input");search.id="vgJobSearch";search.type="search";search.placeholder="Cerca commessa, codice, cliente, cantiere...";search.setAttribute("aria-label",search.placeholder);
    toolbar.append(search);const grid=document.createElement("div");grid.id="vgJobGrid";grid.className="vg-job-grid";panel.append(toolbar,grid);
    view.replaceChildren(head,panel);search.addEventListener("input",()=>renderCommesseRecords());
  }
  function renderCommesseRecords(){
    const grid=$("vgJobGrid");if(!grid)return;
    const jobs=list(model.cache.get("jobs")),clients=list(model.cache.get("clients"));
    const q=normText($("vgJobSearch")?.value||"");
    const matches=jobs.filter(job=>!q||normText([job.title,job.code,job.site,clientsName(job.clientId,clients)].join(" ")).includes(q));
    const grouped=new Set(),cards=[];
    for(const spec of packageSpecs){
      const group=jobs.filter(job=>spec.match(jobText(job))&&!grouped.has(String(job.id)));
      const visible=group.filter(job=>matches.includes(job));if(!visible.length)continue;
      group.forEach(job=>grouped.add(String(job.id)));
      const card=document.createElement("article");card.className="vg-job-card vg-package-card";card.tabIndex=0;
      const code=document.createElement("div");code.className="vg-job-code";code.textContent="PACCHETTO COMMESSE";
      const name=document.createElement("h3");name.textContent=spec.title;
      const meta=document.createElement("div");meta.className="vg-job-meta";meta.textContent=group.length+" commesse raggruppate • codici e dati separati";
      const bottom=document.createElement("div");bottom.className="vg-job-bottom";
      const badge=document.createElement("span");badge.className="badge";badge.textContent="ATTIVE";
      const open=document.createElement("span");open.className="vg-job-open";open.textContent="APRI PACCHETTO →";bottom.append(badge,open);
      const description=document.createElement("div");description.className="vg-job-meta";description.style.marginTop="10px";description.textContent=spec.description;
      card.append(code,name,meta,bottom,description);card.addEventListener("click",()=>showCommessePackage(spec,group,clients));
      card.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();showCommessePackage(spec,group,clients);}});cards.push(card);
    }
    for(const job of matches){
      if(grouped.has(String(job.id)))continue;
      const card=document.createElement("article");card.className="vg-job-card";card.tabIndex=0;
      const code=document.createElement("div");code.className="vg-job-code";code.textContent=String(job.code||"Codice non assegnato");
      const name=document.createElement("h3");name.textContent=String(job.title||"Commessa");
      const client=clientsName(job.clientId,clients),site=String(job.site||"");
      const meta=document.createElement("div");meta.className="vg-job-meta";meta.textContent=[client&&normText(client)!==normText(job.title)?client:"",site].filter(Boolean).join(" • ");
      const bottom=document.createElement("div");bottom.className="vg-job-bottom";
      const badge=document.createElement("span");badge.className="badge";badge.textContent=String(job.status||job.stato||"-");
      const open=document.createElement("span");open.className="vg-job-open";open.textContent="APRI →";bottom.append(badge,open);
      const requests=list(model.cache.get("requests")).filter(row=>row.jobId===job.id||(!row.jobId&&textMatchesJob([row.subject,row.bodyPreview].join(" "),job)));
      const deadlines=list(model.cache.get("deadlines")).filter(row=>row.jobId===job.id||textMatchesJob([row.title,row.notes].join(" "),job));
      const documents=[...list(model.cache.get("documents")),...list(model.cache.get("cadrianoDocuments"))].filter(row=>row.jobId===job.id);
      const countline=document.createElement("div");countline.className="vg-job-meta";countline.style.marginTop="10px";
      countline.textContent=requests.filter(row=>!["Completata","Archiviata"].includes(row.status)).length+" richieste • "+deadlines.filter(row=>!row.done).length+" scadenze • "+documents.length+" documenti"+(job.vcSyncStatus?" • "+job.vcSyncStatus:"");
      card.append(code,name);if(meta.textContent)card.append(meta);card.append(bottom,countline);
      card.addEventListener("click",()=>showReadonlyJob(job));card.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();showReadonlyJob(job);}});cards.push(card);
    }
    grid.replaceChildren();if(!cards.length){const empty=document.createElement("div");empty.className="vg-empty";empty.textContent="Nessuna commessa trovata.";grid.append(empty);}else grid.append(...cards);
  }
  function createReadonlyModal(id,className,innerClass,titleText,subtitleText){
    let modal=$(id);if(!modal){modal=document.createElement("div");modal.id=id;modal.className=className;modal.hidden=true;const card=document.createElement("section");card.className=innerClass;const head=document.createElement("div");head.className="vg-package-modal-head";const text=document.createElement("div"),title=document.createElement("h2"),subtitle=document.createElement("p"),close=document.createElement("button");title.textContent=titleText;subtitle.textContent=subtitleText;close.className="vg-package-close";close.type="button";close.textContent="CHIUDI";close.addEventListener("click",()=>{modal.hidden=true;});text.append(title,subtitle);head.append(text,close);const content=document.createElement("div");content.className="vg-package-list";card.append(head,content);modal.append(card);modal.addEventListener("click",event=>{if(event.target===modal)modal.hidden=true;});document.body.append(modal);}return modal;
  }
  function showCommessePackage(spec,jobs,clients){
    const modal=createReadonlyModal("vgOracleCommessePackage","vg-package-modal","vg-package-modal-card","Pacchetto "+spec.title,spec.description),content=modal.querySelector(".vg-package-list");content.replaceChildren();
    const sorted=jobs.slice().sort((a,b)=>String(a.title||"").localeCompare(String(b.title||""),"it"));
    if(!sorted.length){const empty=document.createElement("div");empty.className="vg-empty";empty.textContent="Nessuna commessa nel pacchetto.";content.append(empty);}
    for(const job of sorted){const row=document.createElement("div");row.className="vg-package-row";const info=document.createElement("div"),code=document.createElement("div"),title=document.createElement("div"),meta=document.createElement("div");code.className="vg-package-row-code";code.textContent=String(job.code||"Codice non assegnato");title.className="vg-package-row-title";title.textContent=String(job.title||"Commessa");meta.className="vg-package-row-meta";meta.textContent=[job.site,job.status||job.stato||"Attiva"].filter(Boolean).join(" • ");info.append(code,title,meta);const open=document.createElement("button");open.className="vg-package-open";open.type="button";open.textContent="APRI";open.addEventListener("click",()=>{modal.hidden=true;showReadonlyJob(job);});row.append(info,open);content.append(row);}
    modal.hidden=false;
  }
  function showReadonlyJob(job){
    const modal=createReadonlyModal("vgOracleJobDetails","vg-package-modal","vg-package-modal-card","Commessa · "+String(job.title||""),"Scheda Oracle in consultazione di sola lettura."),content=modal.querySelector(".vg-package-list");content.replaceChildren();
    const pre=document.createElement("pre");pre.className="vg-job-json";try{pre.textContent=JSON.stringify(job,null,2);}catch(_){pre.textContent=String(job);}content.append(pre);modal.hidden=false;
  }
  function showPlantSummary(){
    const jobs=list(model.cache.get("jobs")).filter(job=>/depuraz|\binrete\b/.test(jobText(job))),plants=list(model.cache.get("vcImpianti"));
    const rows=jobs.map(job=>{const linked=plants.filter(plant=>plant.jobId===job.id||plant.commessaId===job.id||normText([plant.commessa,plant.nomeCommessa,plant.codiceCommessa].join(" ")).includes(normText(job.code||job.title)));const done=linked.filter(plant=>plant.done===true||["fatto","completato","completa","terminato"].includes(normText(plant.statoGenerale||plant.stato||plant.status))).length;return{job,linked,done};});
    const modal=createReadonlyModal("vgOraclePlantSummary","vg-plant-summary-modal","vg-plant-summary-card","Situazione impianti","Riepilogo Oracle · consultazione di sola lettura."),content=modal.querySelector(".vg-package-list");content.replaceChildren();
    const total=rows.reduce((n,row)=>n+row.linked.length,0),done=rows.reduce((n,row)=>n+row.done,0),summary=document.createElement("p");summary.className="muted";summary.textContent="Impianti: "+total+" · Fatti: "+done+" · Da fare: "+(total-done);content.append(summary);
    for(const row of rows){const item=document.createElement("div");item.className="vg-package-row";const name=document.createElement("strong"),meta=document.createElement("span");name.textContent=String(row.job.title||"Commessa");meta.textContent=row.done+" fatti · "+(row.linked.length-row.done)+" da fare · "+row.linked.length+" totali";item.append(name,meta);content.append(item);}
    if(!rows.length){const empty=document.createElement("div");empty.className="vg-empty";empty.textContent="Nessuna commessa DEPURAZIONE o INRETE trovata.";content.append(empty);}modal.hidden=false;
  }
  function render(view,data){
    const get=k=>list(data[k]);
    const combine=keys=>keys.flatMap(key=>get(key).map(row=>
      row&&typeof row==="object"&&!Array.isArray(row)?{...row,_oracleSource:key}:{id:key+"-"+String(row),value:row,_oracleSource:key}));
    if(view==="dashboard"){
      const jobs=get("jobs"),invoices=get("invoices"),deadlines=get("deadlines");
      window.VGOraclePreviewData={jobs,clients:get("clients"),priceLists:get("priceLists"),deadlines,vcRecords:get("vcRecords")};
      window.dispatchEvent(new Event("vg-oracle-preview-data"));
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
      renderCommesseRecords();
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
      fillList("documentsList",combine(["documents","cadrianoDocuments"]),x=>[
        x.name||x.nome||"Documento",(x.category||x.categoria||"")+" · "+clientsName(x.clientId,clients),x.driveUrl?"Documento Drive":""]);
    } else if(view==="prezzari"){
      const prices=get("priceLists");
      const entries=get("entries").length?get("entries"):get("priceCatalog");
      fillList("entriesList",entries.slice(-300).reverse(),x=>[
        (x.code||"")+" — "+(x.description||""),
        (prices.find(p=>p.id===x.priceListId)?.name||"")+" · "+(x.unit||""),
        eur(x.price)],300);
    } else if(view==="cantieriSync"){
      stat("vcCountCommesse",get("vcCommesse").length);
      stat("vcCountImpianti",get("vcImpianti").length);
      stat("vcCountOre",get("vcOre").length+get("rapportini").length);
      stat("vcCountRecords",get("vcRecords").length);
      stat("vcImported",get("vcRecords").length);
      stat("vcCountDocs",get("documents").length+get("cadrianoDocuments").length);
      const collections=["vcCommesse","vcImpianti","vcSquadre","vcOre","rapportini","vcRecords","vcUtenti","vcSegnalazioni","cantieriRows"]
        .filter(key=>Object.prototype.hasOwnProperty.call(model.sections,key))
        .map(key=>({name:key,count:get(key).length}));
      fillList("vcRowsList",collections,x=>[x.name,
        x.name==="vcOre"||x.name==="rapportini"?"Ore lavorate e rapportini":"Raccolta Cantieri",
        x.count+" documenti"]);
      renderCantieriRecords("vcCommesse");
    } else if(view==="consuntivi"){
      const rows=combine(["consuntivi","depurazioneConsuntivi","discaricheConsuntivi","wteModenaConsuntivi","economicEntries"]);
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
    const target=$(view);
    if(!target)return;
    if(!model.user){
      explain("Accesso Oracle necessario prima di aprire "+view+".",true);
      return;
    }
    model.epoch+=1;
    const epoch=model.epoch;
    document.querySelectorAll(".view").forEach(x=>{const active=x.id===view;x.classList.toggle("active-view",active);x.style.display=active?"block":"none";});
    if(view==="cantieriSync" && location.hash!=="#cantieriSync")history.replaceState(null,"","#cantieriSync");
    document.querySelectorAll(".nav[data-view]").forEach(x=>x.classList.toggle("active",x.dataset.view===view));
    $("openVargaCantieriDesktop")?.classList.toggle("active",view==="cantieriSync");
    const needed=routes[view]||[];
    if(view==="cantieriSync"){
      if($("vcSyncInfo"))$("vcSyncInfo").textContent="Sezione Varga Cantieri aperta · caricamento riepilogo Oracle…";
      stat("vcLastSync","Caricamento…");
    }
    if(!needed.length)return;
    status(view,"Caricamento dati dall'archivio PostgreSQL…");
    try{
      const result=await Promise.all(needed.map(async k=>[k,await section(k)]));
      if(epoch!==model.epoch)return;
      render(view,Object.fromEntries(result));
      if(view==="cantieriSync"){
        try{
          const summary=await api.request("workspaces/"+api.validWorkspace(ROOT)+"/cantieri-stage/summary");
          if(epoch!==model.epoch)return;
          const rows=summary.collections||[];
          const count=name=>rows.filter(x=>x.name===name).reduce((n,x)=>n+Number(x.count||0),0);
          const total=rows.reduce((n,x)=>n+Number(x.count||0),0);
          const current=rows.filter(x=>x.snapshot==="current_sync").reduce((n,x)=>n+Number(x.count||0),0);
          const historical=Math.max(0,total-current);
          stat("vcPending",current);
          stat("vcLastSync",current?"Sorgente Oracle sincronizzata":"Sincronizzazione non ancora eseguita");
          if($("vcSyncInfo"))$("vcSyncInfo").textContent=
            "Oracle: "+current.toLocaleString("it-IT")+" documenti dalla sorgente corrente; "+
            count("commesse").toLocaleString("it-IT")+" commesse, "+
            count("impianti").toLocaleString("it-IT")+" impianti, "+
            count("oreReports").toLocaleString("it-IT")+" rapporti ore; "+
            get("vcSquadre").length.toLocaleString("it-IT")+" squadre e "+
            get("rapportini").length.toLocaleString("it-IT")+" rapportini nel workspace. "+
            historical.toLocaleString("it-IT")+" documenti storici conservati per revisione.";
          const sourceRows=[...rows.map(x=>({
            name:x.name,snapshot:x.snapshot,count:x.count
          })),...["vcCommesse","vcImpianti","vcSquadre","vcOre","rapportini","vcRecords","vcUtenti","vcSegnalazioni","cantieriRows"]
            .filter(key=>Object.prototype.hasOwnProperty.call(model.sections,key))
            .map(key=>({name:key,snapshot:"workspace",count:list(model.cache.get(key)).length}))];
          fillList("vcRowsList",sourceRows,x=>[x.name,
            x.snapshot==="current_sync"?"Sorgente corrente":x.snapshot==="workspace"?"Dati del Gestionale":"Archivio storico "+x.snapshot,
            x.count+" documenti"],100);
          renderCantieriRecords($("vcRecordCollection")?.value||"vcCommesse");
        }catch(error){
          if($("vcSyncInfo"))$("vcSyncInfo").textContent=
            "Archivio staging non disponibile: "+error.message;
        }
      }
      status(view,"Dati Oracle caricati. Consultazione di sola lettura.");
    }catch(err){
      if(epoch!==model.epoch)return;
      if(view==="cantieriSync" && $("vcSyncInfo"))$("vcSyncInfo").textContent="Impossibile caricare i dati: "+err.message;
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
      open(location.hash==="#cantieriSync"?"cantieriSync":"dashboard");
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
  function configureCantieriOraclePanel(){
    const view=$("cantieriSync");
    if(!view)return;
    const subtitle=view.querySelector(".subtitle");
    if(subtitle)subtitle.textContent="Consultazione dei documenti Cantieri importati su Oracle. Aggiornamento automatico non ancora attivo.";
    const legacyIds=["vcEndpoint","saveVcEndpoint","vcFile","vcFullFile","syncVcNow"];
    for(const id of legacyIds){
      const element=$(id);
      if(!element)continue;
      const wrapper=element.closest("label.filebtn")||element;
      wrapper.hidden=true;
      wrapper.style.display="none";
    }
    const form=view.querySelector(".formgrid");
    if(form){form.hidden=true;form.style.display="none";}
    const panel=Array.from(view.querySelectorAll(".panel")).find(x=>x.querySelector("#vcSyncInfo"));
    if(panel){
      const title=panel.querySelector("h2");
      if(title)title.textContent="Sorgente dati Oracle · consultazione";
      const description=panel.querySelector("p.muted");
      if(description)description.textContent="Dati aziendali in archivio separato: le 30 sezioni del Gestionale non vengono sovrascritte. Non sono necessarie importazioni manuali in questa anteprima.";
    }
    const labels=view.querySelectorAll(".cards .card span");
    for(const label of labels){
      if(label.textContent.trim()==="Da verificare")label.textContent="Documenti nello staging Oracle";
      if(label.textContent.trim()==="Ultima sincronizzazione")label.textContent="Fotografia sorgente";
    }
    const rowsTitle=$("vcRowsList")?.closest(".panel")?.querySelector("h2");
    if(rowsTitle)rowsTitle.textContent="Raccolte importate da Varga Cantieri";
    const explorer=document.createElement("section");
    explorer.className="panel";explorer.id="vcRecordExplorer";
    const title=document.createElement("h2");title.textContent="Esplora i record Cantieri";
    const intro=document.createElement("p");intro.className="muted";
    intro.textContent="Ricerca locale nei dati già caricati da Oracle. I campi sono mostrati come archiviati, senza modificarli.";
    const controls=document.createElement("div");controls.className="formgrid";
    const collection=document.createElement("select");collection.id="vcRecordCollection";collection.setAttribute("aria-label","Raccolta Cantieri");
    for(const [key,label] of [["vcCommesse","Commesse"],["vcImpianti","Impianti"],["vcOre","Ore lavorate"],["rapportini","Rapportini"],["vcSquadre","Squadre"],["vcUtenti","Operatori"],["vcSegnalazioni","Segnalazioni"],["vcRecords","Record importati"],["cantieriRows","Righe importate"]]){
      const option=document.createElement("option");option.value=key;option.textContent=label;collection.append(option);
    }
    const search=document.createElement("input");search.id="vcRecordSearch";search.type="search";search.placeholder="Cerca nei campi dei record";search.setAttribute("aria-label","Cerca nei record Cantieri");
    const results=document.createElement("div");results.id="vcRecordResults";results.className="list";results.setAttribute("aria-live","polite");
    controls.append(collection,search);explorer.append(title,intro,controls,results);view.append(explorer);
    collection.addEventListener("change",()=>renderCantieriRecords(collection.value));
    search.addEventListener("input",()=>renderCantieriRecords(collection.value));
  }
  function renderCantieriRecords(key){
    const target=$("vcRecordResults");if(!target)return;
    const raw=model.cache.get(key);
    const rows=Array.isArray(raw)?raw:raw&&typeof raw==="object"?Object.entries(raw).map(([id,value])=>value&&typeof value==="object"?{id,...value}:{id,value}):[];
    const query=String($("vcRecordSearch")?.value||"").trim().toLocaleLowerCase("it");
    const matches=rows.filter(row=>!query||JSON.stringify(row).toLocaleLowerCase("it").includes(query));
    target.replaceChildren();
    if(!matches.length){const empty=document.createElement("div");empty.className="empty";empty.textContent="Nessun record corrispondente.";target.append(empty);return;}
    const fragment=document.createDocumentFragment();
    for(const [index,row] of matches.slice(0,100).entries()){
      const item=document.createElement("details");item.className="item";
      const summary=document.createElement("summary");summary.className="item-title";
      const source=row&&typeof row==="object"?row:{};
      const headline=source.codice||source.code||source.commessa||source.titolo||source.title||source.nome||source.name||source.id||"Record "+(index+1);
      summary.textContent=String(headline);
      const body=document.createElement("pre");body.className="item-sub";
      let serialized;try{serialized=JSON.stringify(row,null,2);}catch(_){serialized=String(row);}
      body.textContent=(serialized||String(row)).slice(0,12000);
      item.append(summary,body);fragment.append(item);
    }
    target.append(fragment);
    if(matches.length>100){const note=document.createElement("p");note.className="muted";note.textContent="Visualizzati i primi 100 risultati; restringi la ricerca per trovare altri record.";target.append(note);}
  }
  function setup(){
    // Handle safe navigation and dashboard links before the read-only editing lock.
    // Only known routes can be opened; these links never write to Oracle.
    document.querySelector(".app-shell")?.addEventListener("click",event=>{
      const link=event.target.closest('#openVargaCantieriDesktop, .nav[data-view="cantieriSync"], [data-oracle-view]');
      if(!link)return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if(!model.user){
        const panel=$("loginScreen");
        if(panel){panel.hidden=false;panel.setAttribute("aria-hidden","false");}
        explain("Accedi con le credenziali Oracle per aprire la sezione.",true);
        return;
      }
      const requestedView=link.dataset.oracleView || "cantieriSync";
      if(!Object.prototype.hasOwnProperty.call(routes,requestedView))return;
      open(requestedView);
      // A visible breadcrumb helps distinguish navigation from stalled loading.
      if(requestedView==="cantieriSync" && $("vcSyncInfo") && !$("vcSyncInfo").textContent.trim())
        $("vcSyncInfo").textContent="Schermata aperta. Lettura dei documenti Cantieri da Oracle…";
    },true);
    locks();
    configureCantieriOraclePanel();
    configureCommessePreview();
    // Expose the original Cantieri navigation control in the Oracle-only preview.
    const cantieriButton=$("openVargaCantieriDesktop");
    if(cantieriButton){
      cantieriButton.hidden=false;
      cantieriButton.removeAttribute("hidden");
      cantieriButton.style.display="block";
      cantieriButton.textContent="🏗️ Varga Cantieri · Oracle";
    }
    const syncNav=document.querySelector('.nav[data-view="cantieriSync"]');
    if(syncNav){
      syncNav.hidden=false;
      syncNav.style.display="block";
      syncNav.textContent="↻ Dati e sincronizzazione Cantieri";
    }
    // Same structure and styling; clarify that preview authentication is Oracle,
    // not the still-running Varga Cantieri/Firebase account.
    const title=document.querySelector(".login-brand-copy h1");
    if(title)title.textContent="Accesso Oracle di prova.";
    const explanation=document.querySelector(".login-brand-copy p:not(.login-kicker)");
    if(explanation)explanation.textContent="Usa le credenziali Oracle create per il collaudo. La grafica originale è mantenuta; le modifiche sono disabilitate.";
    const intro=document.querySelector(".login-intro");
    if(intro)intro.textContent="Usa l'account di prova Oracle.";
    const help=document.querySelector(".login-help");
    if(help)help.textContent="In questo ambiente di prova sono disponibili solo accesso Oracle e consultazione dati. Per lavorare normalmente utilizza il Gestionale attuale.";
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
    // Diagnostic navigation direct link after authentication only, without bypassing authorization.
    window.addEventListener("hashchange",()=>{
      if(location.hash==="#cantieriSync" && model.user)open("cantieriSync");
    });
    authView(false);
    explain("Anteprima Oracle: stessa grafica, accesso separato e dati in sola lettura.");
    api.health().catch(()=>explain("API Oracle non raggiungibile.",true));
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",setup,{once:true});
  else setup();
})();
