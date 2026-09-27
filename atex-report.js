/* Verbale ATEX generato dalle stesse righe FATTO della contabilità INRETE gas. */
(function(){
'use strict';
const txt=v=>String(v??'').trim();
const norm=v=>txt(v).toLocaleLowerCase('it-IT').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const isApplicable=job=>/\bin\s*rete\b|\binrete\b/.test(norm([job?.title,job?.code].join(' ')));
function dateValue(value){
  const s=txt(value),it=s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/),iso=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return it?`${it[3]}-${it[2].padStart(2,'0')}-${it[1].padStart(2,'0')}`:iso?`${iso[1]}-${iso[2]}-${iso[3]}`:'';
}
function displayDate(value){const s=dateValue(value);return s?`${s.slice(8,10)}/${s.slice(5,7)}/${s.slice(0,4)}`:''}
function timeValue(value){const m=txt(value).match(/^(\d{1,2}):(\d{2})/);return m&&+m[1]<24&&+m[2]<60?`${m[1].padStart(2,'0')}:${m[2]}`:''}
function prepareRows(source){
  const sites=new Map();
  (source||[]).forEach((r,index)=>{
    const name=txt(r.impianto),comune=txt(r.comune),address=txt(r.indirizzo);
    // SAP and price codes describe accounting rows, not distinct physical plants.
    const key=name?`${norm(name)}|${norm(comune)}`:`missing:${index}`;
    const row={impianto:name,comune,indirizzo:address,data:dateValue(r.data),ora:timeValue(r.ora)};
    if(!sites.has(key)){sites.set(key,row);return}
    const prior=sites.get(key),stamp=r=>`${r.data||'9999-99-99'}T${r.ora||'99:99'}`;
    if(stamp(row)<stamp(prior)){prior.data=row.data;prior.ora=row.ora}
    if(!prior.indirizzo)prior.indirizzo=address;
  });
  return [...sites.values()];
}
function validate(rows){
  if(!rows.length)throw new Error('Nessun impianto FATTO per il verbale ATEX.');
  const bad=rows.findIndex(r=>!txt(r.impianto)||!dateValue(r.data)||!timeValue(r.ora));
  if(bad>=0)throw new Error(`Completa impianto, data e ora del rilievo ATEX alla riga ${bad+1}.`);
}
async function pdfLib(){
  if(window.PDFLib)return window.PDFLib;
  if(!window.__vargaAtexPdfPromise)window.__vargaAtexPdfPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';s.onload=()=>resolve(window.PDFLib);s.onerror=()=>reject(new Error('Componente PDF ATEX non disponibile'));document.head.appendChild(s)});
  return window.__vargaAtexPdfPromise;
}
async function createPdf(job,rows,form){
  validate(rows);
  const {PDFDocument,StandardFonts,rgb}=await pdfLib(),pdf=await PDFDocument.create();
  const regular=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink=rgb(.12,.2,.16),green=rgb(.06,.32,.22),line=rgb(.78,.84,.8),pale=rgb(.93,.97,.94);
  const W=842,H=595,margin=28,headY=452,rowH=22,perPage=14;
  // Standard PDF fonts support Latin-1; replace unsupported characters rather than abort export.
  const safe=v=>txt(v).replace(/[\u2010-\u2015]/g,'-').replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/[^\x20-\x7e\xa0-\xff]/g,'?');
  const fit=(v,font,size,width)=>{let s=safe(v);while(s&&font.widthOfTextAtSize(s,size)>width)s=s.slice(0,-1);return s===safe(v)?s:s.replace(/\s+$/,'')+'...'};
  const text=(page,v,x,y,size=9,font=regular,color=ink,max=1000)=>page.drawText(fit(v,font,size,max),{x,y,size,font,color});
  const cols=[28,50,184,277,412,473,523,587,654,814];
  const headers=['N.','Denominazione impianto','Comune','Via e civico','Data','Ora','Atmosfera / gas','Strumento','Firma operatore'];
  const pages=Math.ceil(rows.length/perPage);
  let signatureImage=null;
  if(form.documentSeal?.mode==='personal'){
    const url=window.VargaUserDocumentAssets?.resolveForHtml(form.documentSeal,{preset:''})?.signatureDataUrl||'';
    const match=txt(url).match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
    if(match){const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));signatureImage=match[1].toLowerCase()==='png'?await pdf.embedPng(bytes):await pdf.embedJpg(bytes)}
  }
  for(let p=0;p<pages;p++){
    const page=pdf.addPage([W,H]);
    text(page,'VERBALE DI VERIFICA STRUMENTALE DI ESPLOSIVITA - ZONE ATEX',margin,555,13,bold,green,785);
    text(page,`Commessa: ${job.title||''}`,margin,534,10,bold,ink,520);
    text(page,`Contratto: ${form.atexContract||'da indicare'}`,600,534,9,regular,ink,214);
    text(page,`Attivita: ${form.subject||job.title||''}   Periodo: ${form.period||''}`,margin,514,9,regular,ink,786);
    text(page,'Modello: ALTAIR 4X     Matricola: 406176',margin,489,9,bold,ink,400);
    text(page,`Scadenza calibrazione: ${form.atexCalibration||'________________'}`,440,489,9,regular,ink,365);
    page.drawRectangle({x:margin,y:headY,width:786,height:25,color:green});
    headers.forEach((h,i)=>text(page,h,cols[i]+3,headY+8,7,bold,rgb(1,1,1),cols[i+1]-cols[i]-6));
    const slice=rows.slice(p*perPage,(p+1)*perPage);
    slice.forEach((r,i)=>{
      const y=headY-(i+1)*rowH;
      if(i%2===0)page.drawRectangle({x:margin,y,width:786,height:rowH,color:pale});
      page.drawLine({start:{x:margin,y},end:{x:814,y},thickness:.4,color:line});
      const cells=[p*perPage+i+1,r.impianto,r.comune,r.indirizzo,displayDate(r.data),timeValue(r.ora),'NO','ALTAIR 4X',signatureImage?'':'____________'];
      cells.forEach((v,j)=>text(page,v,cols[j]+3,y+7,7.5,j===6?bold:regular,ink,cols[j+1]-cols[j]-6));
      if(signatureImage){const scale=Math.min(150/signatureImage.width,18/signatureImage.height);page.drawImage(signatureImage,{x:659,y:y+2,width:signatureImage.width*scale,height:signatureImage.height*scale})}
    });
    cols.forEach(x=>page.drawLine({start:{x,y:headY+25},end:{x,y:headY-slice.length*rowH},thickness:.4,color:line}));
    const foot=64;
    page.drawLine({start:{x:margin,y:foot+55},end:{x:814,y:foot+55},thickness:.7,color:line});
    text(page,'Operatore delle verifiche: Varga Ionel',margin,foot+40,9,bold);
    text(page,'Timbro impresa',443,foot+40,8,bold);
    text(page,'Firma',648,foot+40,8,bold);
    page.drawRectangle({x:440,y:foot-4,width:182,height:37,borderColor:line,borderWidth:.7});
    page.drawRectangle({x:645,y:foot-4,width:169,height:37,borderColor:line,borderWidth:.7});
    text(page,`Pagina ${p+1} di ${pages}`,730,24,8,regular,ink,84);
    // The selected personal assets are applied only in their dedicated footer boxes.
    if(p===pages-1&&form.documentSeal?.mode==='personal'){
      const assets=window.VargaUserDocumentAssets?.resolveForHtml(form.documentSeal,{preset:''});
      for(const [url,box] of [[assets?.stampDataUrl,{x:444,y:foot,width:174,height:29}],[assets?.signatureDataUrl,{x:650,y:foot,width:160,height:29}]]){
        const match=txt(url).match(/^data:image\/(png|jpe?g);base64,(.+)$/i);if(!match)continue;
        const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0)),img=match[1].toLowerCase()==='png'?await pdf.embedPng(bytes):await pdf.embedJpg(bytes);
        const scale=Math.min(box.width/img.width,box.height/img.height);
        page.drawImage(img,{x:box.x+(box.width-img.width*scale)/2,y:box.y+(box.height-img.height*scale)/2,width:img.width*scale,height:img.height*scale});
      }
    }
  }
  return await pdf.save();
}
async function download(job,rows,form,prefetched){
  const bytes=prefetched||await createPdf(job,rows,form),blob=new Blob([bytes],{type:'application/pdf'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=`Verbale-ATEX-${txt(job.title).replace(/[^a-z0-9_-]+/gi,'-')||'commessa'}.pdf`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
}
window.VargaAtexReport={isApplicable,prepareRows,validate,createPdf,download};
})();
