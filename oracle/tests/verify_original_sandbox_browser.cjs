"use strict";
/* DOM-free-ish end-to-end simulation of the ACTUAL original-sandbox.js.
 * Node.js builtin VM only; fake Oracle server persists in memory, checks revisions.
 * No HTTP calls, VM access, secrets, Docker, Firebase or real browser storage.
 */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const script=fs.readFileSync(path.join(__dirname,"..","original-sandbox.js"),"utf8");
const SectionModule=require("../section-bridge.js");
const BusinessValidation=require("../business-demo-validation.js");
const demo="gestionale_sandbox_20261027";
const clone=x=>structuredClone(x);
class Elem{
  constructor(id="",tag="div"){
    this.id=id;this.tag=tag;this.value="";this.hidden=false;this.disabled=false;
    this.listeners=new Map();this.attrs=new Map();this.childNodes=[];
    this.dataset={};this.style={};this.options=this.childNodes;
    this._text="";this.className="";
    const values=new Set();
    this.classList={add:(...x)=>x.forEach(a=>values.add(a)),
      remove:(...x)=>x.forEach(a=>values.delete(a)),
      toggle:(a,p)=>{if(p===undefined?p:!!p)values.add(a);else values.delete(a);},
      contains:a=>values.has(a)};
  }
  set textContent(x){this._text=String(x);this.childNodes=[];this.options=this.childNodes}
  get textContent(){return this._text}
  addEventListener(name,handler){this.listeners.set(name,handler)}
  click(){const f=this.listeners.get("click");assert.ok(f,"missing click listener: "+this.id);return f({preventDefault(){}})}
  setAttribute(k,v){this.attrs.set(k,String(v))}
  getAttribute(k){return this.attrs.get(k)}
  append(...x){this.childNodes.push(...x.flatMap(a=>a.id==="fragment"?a.childNodes:[a]));this.options=this.childNodes}
  replaceChildren(...x){this.childNodes=x.flatMap(a=>a.id==="fragment"?a.childNodes:[a]);this.options=this.childNodes}
  querySelector(){return null}
  querySelectorAll(){return []}
  insertAdjacentElement(){}
  closest(){return null}
  get children(){return this.childNodes}
}
const ids=["loginLoading","loginForm","loginEmail","loginPassword","loginEmailButton",
  "loginMessage","loginRemember","loginGoogleButton","forgotPassword",
  "createLoginAccount","sidebarUserName","sidebarUserRole","sidebarAvatar",
  "cloudInfo","cloudUser","cloudStatus","cloudWorkspaceLabel","sidebarLogout",
  "kPrev","kCli","kJobs","kDue","kDead","dashDeadlines",
  "clientsList","jobsList","quotesList","invoicesList","expensesList",
  "deadlinesList","documentsList","entriesList","vcCountCommesse",
  "vcCountImpianti","vcCountOre","vcCountRecords","vcImported","consList",
  "cPending","cApproved","cPosted","requestsList","reqNew","reqUrgent",
  "reqUnassigned","reqWorking","reqDone",
  "aName","aVat","aAddress","aCity","aPhone","aEmail","aPec","aIban","aFooter",
  "cName","addClient","jTitle","jClient","jCode","jSite","jStart","jEnd",
  "jStatus","jValue","jNotes","addJob","qClient","qSubject","qSite",
  "qValidity","qPayment","qDiscount","qVat","qSub","qVatAmount",
  "qTotal","qRows","qNumber","addManual","newQuote","saveQuote",
  "xDate","xSupplier","xCategory","xAmount","xJob","xNotes","addExpense",
  "dTitle","dJob","dType","dDate","dTime","dPriority","dAssignee","dNotes","dCalendar","addDeadline",
  "docName","docCategory","docClient","docJob","docDriveUrl","docNotes","addDocument","saveCompany"];
const elements=new Map(ids.map(id=>[id,new Elem(id)]));
const $=id=>{assert.ok(elements.has(id),"unknown element "+id);return elements.get(id)};
const views=["dashboard","clienti","commesse","preventivo","preventivi",
  "richieste","consuntivi","prezzari","fatture","spese","scadenze",
  "documenti","azienda","backup","cloud","cantieriSync"];
for(const id of views)elements.set(id,new Elem(id));
const navs=views.map(id=>{const e=new Elem("nav-"+id,"button");e.dataset.view=id;return e});
const shell=new Elem("shell"),loginBrand=new Elem("brand");
shell.querySelectorAll=()=>[]; // Browser-specific disabled inputs are tested by static safety guards.
const classes=[];
const body={classList:{add(){},remove(){},toggle(){}}};
const fakeDoc={
  readyState:"loading",
  onload:null,
  body,
  getElementById:id=>elements.get(id)||null,
  createElement:tag=>new Elem("",tag),
  createDocumentFragment:()=>new Elem("fragment"),
  addEventListener:(name,fn)=>{if(name==="DOMContentLoaded")fakeDoc.onload=fn},
  querySelector:s=>s===".app-shell"?shell:new Elem(s),
  querySelectorAll:s=>{
    if(s===".nav[data-view]"||s===".nav")return navs;
    if(s===".view")return views.map(id=>$(id));
    return [];
  }
};
  const db={
  clients:[{id:"demo-cl-01",name:"DEMO Existing"}],
  jobs:[{id:"demo-job-01",title:"DEMO Existing job",clientId:"demo-cl-01",status:"Da avviare",value:0}],
  quotes:[{id:"demo-q-01",subject:"DEMO Existing quote",clientName:"DEMO Existing",total:12}],
  consuntivi:[{id:"demo-c-01",title:"DEMO existing consuntivo"}],
  invoices:[],priceLists:[],entries:[],expenses:[],deadlines:[],documents:[],requests:[],
  vcCommesse:[],vcImpianti:[],vcOre:[],vcRecords:[],company:{}
};
const rev=Object.fromEntries(Object.keys(db).map(x=>[x,1]));
const writes=[],alerts=[];
const API=class{
  constructor(){this.revs={};this.token=null;}
  async health(){return {ready:true};}
  async login(email,password){
    assert.equal(email,"tester@example.com");
    assert.equal(password,"not-logged-password");
    this.token="demo";
    return {email,role:"admin",display_name:"Tester"};
  }
  async manifest(space){
    assert.equal(space,demo);
    return {workspace:space,sections:Object.fromEntries(Object.keys(db).map(x=>[x,{revision:rev[x],count:Array.isArray(db[x])?db[x].length:1}]))};
  }
  async readSection(space,key){
    assert.equal(space,demo);
    assert.ok(Object.hasOwn(db,key),"unexpected section "+key);
    this.revs[key]=rev[key];
    return {workspace:space,section:key,data:clone(db[key]),revision:rev[key]};
  }
  async saveSection(space,key,items){
    assert.equal(space,demo,"wrong workspace!");
    assert.ok(["clients","jobs","quotes","invoices","priceLists","entries","expenses","deadlines","documents","company"].includes(key),"writing unexpected section "+key);
    if(this.revs[key]!==rev[key]){
      const e=new Error("Revision conflict");e.status=409;throw e;
    }
    rev[key]++;
    this.revs[key]=rev[key];
    db[key]=clone(items);
    writes.push([space,key,clone(items)]);
    return {revision:rev[key]};
  }
  async logout(){this.token=null;}
};
  const ctx={window:{VGOraclePilot:API,VGOracleSectionBridge:SectionModule,VGOracleBusinessDemo:BusinessValidation},document:fakeDoc,crypto:{randomUUID:(()=>{let n=0;return()=>String(++n)})()},
  alert:msg=>alerts.push(String(msg)),console,
  Date,Number,Map,Array,Object,String,Math,RegExp,Promise,
};
vm.runInNewContext(script,ctx,{filename:"oracle/original-sandbox.js",timeout:2000});
assert.ok(fakeDoc.onload,"DOMContentLoaded callback missing");
fakeDoc.onload();
const flush=async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve))};
const nav=async key=>{const btn=navs.find(x=>x.dataset.view===key);assert.ok(btn);btn.click();await flush()};
const click=async key=>{$(key).click();await flush()};
(async()=>{
  $("loginEmail").value="tester@example.com";
  $("loginPassword").value="not-logged-password";
  await $("loginForm").listeners.get("submit")({preventDefault(){}});
  await flush();
  assert.equal($("kCli").textContent,"1");
  // Validation: cannot insert real-named client.
  await nav("clienti");
  $("cName").value="REAL Company Inc";
  await click("addClient");
  assert.equal(db.clients.length,1);
  assert.ok(alerts.some(x=>x.includes("DEMO")));
  // Clienti: create demo and reload original view.
  $("cName").value="DEMO Cliente prova";
  await click("addClient");
  assert.equal(db.clients.length,2);
  const client=db.clients.find(x=>x.name==="DEMO Cliente prova");
  assert.ok(client?.id.startsWith("demo-cl-"));
  assert.equal($("clientsList").children.length,2);
  // Commesse: link to the newly created client in the original selection.
  await nav("commesse");
  $("jTitle").value="DEMO Manutenzione verde";
  $("jClient").value=client.id;
  $("jCode").value="VERDE123";
  $("jValue").value="250";
  $("jStatus").value="Da avviare";
  await click("addJob");
  assert.equal(db.jobs.length,2);
  const job=db.jobs[1];
  assert.equal(job.title,"DEMO Manutenzione verde");
  assert.equal(job.clientId,client.id);
  assert.equal(job.value,250);
  assert.equal($("jobsList").children.length,2);
  // Preventivi: new manual row, correctly saved and computed.
  await nav("preventivo");
  $("qSubject").value="DEMO Preventivo giardinaggio";
  $("qClient").value=client.id;
  await click("addManual");
  assert.equal($("qRows").children.length,1);
  await click("saveQuote");
  assert.equal(db.quotes.length,2);
  const q=db.quotes[1];
  assert.equal(q.subject,"DEMO Preventivo giardinaggio");
  assert.equal(q.clientId,client.id);
  assert.equal(q.rows.length,1);
  assert.equal(q.rows[0].description,"DEMO Voce prova");
  assert.equal(q.total,12.2);
  // Spese: link only to an existing DEMO job; real supplier is rejected.
  await nav("spese");
  $("xDate").value="2026-10-27";$("xSupplier").value="DEMO Fornitore";
  $("xCategory").value="DEMO Materiali";$("xAmount").value="18.5";$("xJob").value=job.id;
  $("xNotes").value="DEMO materiale di prova";
  await click("addExpense");
  assert.equal(db.expenses.length,1);
  assert.equal(db.expenses[0].jobId,job.id);
  const writesBeforeInvalid=writes.length;
  $("xSupplier").value="Fornitore reale";
  await click("addExpense");
  assert.equal(writes.length,writesBeforeInvalid);

  // Scadenze: local DEMO record only; Google Calendar is never called.
  await nav("scadenze");
  $("dTitle").value="DEMO Controllo materiale";$("dDate").value="2026-10-30";
  $("dTime").value="08:30";$("dType").value="Attività";$("dPriority").value="Alta";
  $("dAssignee").value="DEMO Ufficio";$("dJob").value=job.id;$("dNotes").value="DEMO promemoria";
  await click("addDeadline");
  assert.equal(db.deadlines.length,1);
  assert.equal(db.deadlines[0].calendarEnabled,false);
  assert.equal(db.deadlines[0].jobId,job.id);

  // Document metadata only; no Drive URL or file upload reaches the API.
  await nav("documenti");
  $("docName").value="DEMO Contratto prova";$("docCategory").value="Contratto";
  $("docClient").value=client.id;$("docJob").value=job.id;
  $("docDriveUrl").value="https://drive.google.com/real-file";
  $("docNotes").value="DEMO documento sintetico";
  await click("addDocument");
  assert.equal(db.documents.length,1);
  assert.equal(db.documents[0].driveUrl,"");
  assert.equal(db.documents[0].clientId,client.id);
  assert.equal(db.documents[0].jobId,job.id);
  assert.equal(db.documents[0].addedBy,"DEMO Utente");

  // Company profile accepts only DEMO values and stores a single object revision.
  await nav("azienda");
  $("aName").value="Azienda reale";
  await click("saveCompany");
  assert.equal(writes.at(-1)[1],"documents");
  $("aName").value="DEMO Azienda prova";
  $("aVat").value="DEMO CF FITTIZIO";
  await click("saveCompany");
  assert.equal(db.company.name,"DEMO Azienda prova");
  assert.equal(writes.at(-1)[1],"company");
  assert.ok(writes.every(([space])=>space===demo));
  assert.deepEqual(writes.map(x=>x[1]),["clients","jobs","quotes","expenses","deadlines","documents","company"]);
  assert.ok(!writes.some(x=>x[0]!=="gestionale_sandbox_20261027"));
  assert.ok(alerts.some(x=>x.includes("Preventivo DEMO salvato")));
  // No real business archive or other module ever received a write.
  console.log("SUCCESSO: UI originale mock salva 7 sezioni esclusivamente DEMO: Clienti, Commesse, Preventivi, Spese, Scadenze, Documenti e Azienda.");
})().catch(err=>{console.error(err);process.exitCode=1;});
