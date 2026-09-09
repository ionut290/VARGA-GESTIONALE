// Routes the existing PDF buttons/actions to the measured Avola renderer.
// No changes to quote values, price lists, cloud data or signature ownership checks.
(function(){
'use strict';
if(!window.VargaQuotePdf||typeof db==='undefined')return;
let generating=false,loading=null;
function loadLibrary(){
 if(window.PDFLib)return Promise.resolve();
 if(loading)return loading;
 loading=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';s.onload=()=>window.PDFLib?resolve():reject(Error('Libreria PDF non caricata.'));s.onerror=()=>reject(Error('Connessione al modulo PDF non riuscita. Riprova.'));document.head.appendChild(s)}).catch(error=>{loading=null;throw error});return loading;
}
function referenceText(q){
 if(typeof q.referenceText==='string')return q.referenceText;
 const names=(q.priceListIds||[]).map(id=>(db.priceLists||[]).find(p=>p.id===id)?.name).filter(Boolean);
 if(names.length===1)return `Riferimento economico: voci e prezzi unitari del prezzario ${names[0]}.`;
 if(names.length>1)return `Riferimento economico: voci e prezzi unitari dei prezzari selezionati (${names.join(', ')}).`;
 return 'Riferimento economico: voci e prezzi unitari del prezzario riportati nella documentazione tecnica ricevuta.';
}
const safeName=value=>String(value||'preventivo').replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,' ').trim();
async function download(q,{flatten=false}={}){
 if(generating)return;generating=true;
 try{
  if(!q||!Array.isArray(q.rows)||!q.rows.length)throw Error('Inserisci almeno una voce nel preventivo.');
  const quote=JSON.parse(JSON.stringify(q));
  await loadLibrary();
  const response=await fetch('assets/avola-preventivo-sidebar.png?v=20260904-letterhead-v6',{cache:'force-cache'});
  if(!response.ok)throw Error('Carta intestata non disponibile. Ricarica il Gestionale.');
  const userAssets=window.VargaUserDocumentAssets;
  const result=await window.VargaQuotePdf.generate(quote,{
   PDFLib:window.PDFLib,flatten,sidebarBytes:await response.arrayBuffer(),referenceText:referenceText(quote),
   drawSeal:userAssets&&quote.documentSeal?.mode!=='none'?async(pdf,page,box)=>userAssets.drawOnPdf(pdf,page,quote.documentSeal,{preset:window.VARGA_DEPURAZIONE_STAMP_JPG||'',...box}):undefined
  });
  const url=URL.createObjectURL(new Blob([result.bytes],{type:'application/pdf'})),a=document.createElement('a');a.href=url;a.download=`Offerta-${safeName(quote.number)}-${safeName(quote.clientName||quote.client?.name)}-${flatten?'normale':'compilabile'}.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  return true;
 }catch(error){console.error('Generazione PDF Avola',error);alert('Non riesco a creare il PDF: '+(error.message||error));return false}
 finally{generating=false}
}
function saved(id,flatten){const q=(db.quotes||[]).find(x=>x.id===id);if(!q){alert('Preventivo non trovato.');return Promise.resolve(false)}return download(q,{flatten})}
printCurrent=function(){return download(collectQ(),{flatten:false})};
window.VargaQuoteActions={...(window.VargaQuoteActions||{}),pdf:id=>saved(id,false),normal:id=>saved(id,true)};
// Capture avoids the older closure-based onclick installed again by refresh().
// Only PDF actions are intercepted; Excel and other document types are unchanged.
document.addEventListener('click',event=>{
 const b=event.target?.closest?.('#printQuote,#normalPdfQuote,[data-av-pdf],[data-quote-pdf],[data-quote-normal]');if(!b)return;
 event.preventDefault();event.stopImmediatePropagation();if(generating)return;
 if(b.id==='printQuote'||b.id==='normalPdfQuote')download(collectQ(),{flatten:b.id==='normalPdfQuote'});
 else{const id=b.dataset.avPdf||b.dataset.quotePdf||b.dataset.quoteNormal;saved(id,!!b.dataset.quoteNormal)}
},true);
window.VargaQuotePdfDownload=download;
})();
