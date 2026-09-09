'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const L=process.env.QUOTE_PDF_LIB?require(process.env.QUOTE_PDF_LIB):require('pdf-lib');
const api=require('../preventivi-pdf-layout.js');
const bytes=fs.readFileSync(require('node:path').join(__dirname,'../assets/avola-preventivo-sidebar.png'));
const source=fs.readFileSync(require('node:path').join(__dirname,'../preventivi-pdf-integration.js'),'utf8');
const q={id:'q-test',number:'TEST',date:'09/09/2026',place:'Luogo prova',clientName:'Cliente prova',client:{name:'Cliente prova'},subject:'Prova',intro:'Verifica esportazione.',rows:[{code:'X1',description:'Voce sintetica',unit:'cad',qty:2,price:12.34}],subtotal:24.68,documentSeal:{mode:'none'}};
function setup(){
 const downloads=[],alerts=[],requests=[],events={},blobs=new Map();let seq=0;
 const actions={open:()=>1,excel:()=>2,finalize:()=>3};
 const document={head:{appendChild(){throw Error('Unexpected library download')}},createElement(tag){assert.equal(tag,'a');return {click(){downloads.push({name:this.download,blob:blobs.get(this.href)})}}},addEventListener(type,fn,capture){assert.equal(type,'click');assert.equal(capture,true);events[type]=fn}};
 const env={window:null,document,PDFLib:L,VargaQuotePdf:api,VargaQuoteActions:actions,db:{quotes:[q],priceLists:[]},collectQ:()=>q,printCurrent:()=>{},alert:m=>alerts.push(m),console:{error(){}},Blob,URL:{createObjectURL(blob){const key='blob:'+ ++seq;blobs.set(key,blob);return key},revokeObjectURL(key){blobs.delete(key)}},setTimeout:()=>{},fetch:async url=>{requests.push(url);return {ok:true,arrayBuffer:async()=>bytes}}};env.window=env;vm.createContext(env);vm.runInContext(source,env);return {env,downloads,alerts,requests,events,actions};
}
let checks=0;function pass(name){checks++;console.log('PASS',name)}
async function wait(test){for(let i=0;i<200;i++){if(test())return;await new Promise(r=>setTimeout(r,5))}throw Error('Download timeout')}
async function click(id,dataset,normal){const s=setup();let stopped=false,prevented=false;s.events.click({target:{closest:()=>({id,dataset})},preventDefault(){prevented=true},stopImmediatePropagation(){stopped=true}});await wait(()=>s.downloads.length||s.alerts.length);assert.equal(s.alerts.length,0);assert(stopped&&prevented);assert.equal(s.downloads.length,1);assert(s.downloads[0].name.endsWith(normal?'normale.pdf':'compilabile.pdf'));const d=await L.PDFDocument.load(await s.downloads[0].blob.arrayBuffer());assert.equal(d.getForm().getFields().length===0,normal);assert.equal(s.requests.length,1);}
(async()=>{
for(const [name,id,data,normal]of [['Current fillable','printQuote',{},false],['Current normal','normalPdfQuote',{},true],['Saved list fillable','',{avPdf:'q-test'},false],['Job fillable','',{quotePdf:'q-test'},false],['Job normal','',{quoteNormal:'q-test'},true]]){await click(id,data,normal);pass(name+' button routes to new renderer')}
let s=setup();await s.env.VargaQuoteActions.pdf('q-test');assert(s.downloads[0].name.endsWith('compilabile.pdf'));pass('Saved action API fillable');
s=setup();await s.env.VargaQuoteActions.normal('q-test');assert(s.downloads[0].name.endsWith('normale.pdf'));pass('Saved action API normal');
s=setup();await s.env.printCurrent();assert.equal(s.downloads.length,1);pass('Global printCurrent uses new renderer');
s=setup();assert.equal(s.env.VargaQuoteActions.open,s.actions.open);assert.equal(s.env.VargaQuoteActions.excel,s.actions.excel);assert.equal(s.env.VargaQuoteActions.finalize,s.actions.finalize);pass('Open Excel and finalize APIs preserved');
s=setup();await Promise.all([s.env.VargaQuotePdfDownload(q),s.env.VargaQuotePdfDownload(q)]);assert.equal(s.downloads.length,1);pass('Duplicate generation blocked');
s=setup();await s.env.VargaQuoteActions.normal('missing');assert.equal(s.downloads.length,0);assert.equal(s.alerts.length,1);pass('Missing quote does not produce blank PDF');
s=setup();s.env.fetch=async()=>({ok:false});assert.equal(await s.env.VargaQuotePdfDownload(q),false);assert.equal(s.alerts.length,1);s.env.fetch=async()=>({ok:true,arrayBuffer:async()=>bytes});assert.equal(await s.env.VargaQuotePdfDownload(q),true);pass('Asset load error visible and next retry works');
s=setup();s.events.click({target:{closest:()=>null},preventDefault(){throw Error('Other button intercepted')},stopImmediatePropagation(){throw Error('Other button intercepted')}});assert.equal(s.downloads.length,0);pass('Non PDF actions untouched');
s=setup();let sealMode;s.env.VargaUserDocumentAssets={drawOnPdf:async(pdf,page,choice,box)=>{sealMode=choice.mode;assert.equal(box.x,377.76)}};await s.env.VargaQuotePdfDownload({...q,documentSeal:{mode:'personal',ownerUid:'test'}},{flatten:true});assert.equal(sealMode,'personal');pass('Existing signature renderer and ownership choices retained');
console.log(checks+'/'+checks+' integration checks passed');fs.writeFileSync(require('node:path').join(__dirname,'../build/quote-output/integration-results.json'),JSON.stringify({checks,passed:checks,scope:'real PDF generation; DOM event and storage dependencies simulated'},null,2));
})().catch(error=>{console.error(error);process.exit(1)});
