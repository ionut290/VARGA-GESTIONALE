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
  const {PDFDocument,StandardFonts,rgb}=await pdfLib();
  const response=await fetch(`assets/atex-blank-template.png.b64?v=${encodeURIComponent(window.VG_BUILD||'1')}`);
  if(!response.ok)throw new Error('Modello originale del verbale ATEX non disponibile.');
  const encoded=(await response.text()).replace(/\s/g,''),templateBytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
  const pdf=await PDFDocument.create(),templateImage=await pdf.embedPng(templateBytes);
  const regular=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold),italic=await pdf.embedFont(StandardFonts.HelveticaBoldOblique);
  const black=rgb(0,0,0),red=rgb(.9,0,0),border=rgb(.38,.38,.38),H=1081.75,perPage=28,pages=Math.ceil(rows.length/perPage),rowTop=261.1,rowHeight=26.625;
  const safe=v=>txt(v).replace(/[\u2010-\u2015]/g,'-').replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/[^\x20-\x7e\xa0-\xff]/g,'?');
  const fit=(v,font,size,width)=>{const full=safe(v);let s=full;while(s&&font.widthOfTextAtSize(s,size)>width-3)s=s.slice(0,-1);return s===full?s:s.replace(/\s+$/,'')+'...'};
  const text=(page,v,x,top,size=10,font=regular,width=1000,color=black)=>page.drawText(fit(v,font,size,width),{x,y:H-top,size,font,color});
  const centered=(page,v,left,right,top,size=12,font=italic,color=black)=>{const s=fit(v,font,size,right-left),w=font.widthOfTextAtSize(s,size);text(page,s,left+(right-left-w)/2,top,size,font,right-left,color)};
  const image=async url=>{const m=txt(url).match(/^data:image\/(png|jpe?g);base64,(.+)$/i);if(!m)return null;const bytes=Uint8Array.from(atob(m[2]),c=>c.charCodeAt(0));return m[1].toLowerCase()==='png'?pdf.embedPng(bytes):pdf.embedJpg(bytes)};
  const drawFit=(page,img,box)=>{if(!img)return;const scale=Math.min(box.width/img.width,box.height/img.height);page.drawImage(img,{x:box.x+(box.width-img.width*scale)/2,y:box.y+(box.height-img.height*scale)/2,width:img.width*scale,height:img.height*scale})};
  const assets=form.documentSeal?.mode==='personal'?window.VargaUserDocumentAssets?.resolveForHtml(form.documentSeal,{preset:''}):null;
  const signature=await image(assets?.signatureDataUrl),stamp=await image(assets?.stampDataUrl);
  for(let p=0;p<pages;p++){
    const page=pdf.addPage([1530.98,H]);
    page.drawImage(templateImage,{x:0,y:0,width:1530.98,height:H});
    text(page,`Verbale Rilievo ATEX - ${job.title||'INRETE'}`,98,35,12,regular,650);
    text(page,displayDate(form.documentDate)||'',1370,35,12,regular,125);
    text(page,`Contratto n. ${form.atexContract||'__________'}`,75,68,12,italic,570);
    const subject=`RILIEVI ESEGUITI IN OCCASIONE DELL'ATTIVITA' DI  " ${form.subject||job.title||''} " - ${job.title||'INRETE'}`;
    centered(page,subject,295,1230,128,11,italic);
    if(form.period)text(page,form.period,1235,128,11,italic,240,red);
    text(page,'Marca  ___________________',1059,185,10,regular,176);
    text(page,'Modello  ALTAIR 4X',1059,208,10,regular,176);
    text(page,'Matricola  406176',1059,231,10,regular,176);
    text(page,`Scadenza Calibrazione  ${form.atexCalibration?displayDate(form.atexCalibration):'________'}`,1059,253,9,regular,178);
    rows.slice(p*perPage,(p+1)*perPage).forEach((r,i)=>{
      const top=rowTop+i*rowHeight,baseline=top+18;
      text(page,p*perPage+i+1,40,baseline,10,regular,20);
      text(page,r.impianto,63,baseline,10,regular,228);
      text(page,r.comune,296,baseline,10,regular,156);
      text(page,r.indirizzo,457,baseline,10,regular,162);
      text(page,displayDate(r.data),655,baseline,11,regular,111);
      text(page,timeValue(r.ora),808,baseline,11,regular,87);
      centered(page,'X',975,1056,baseline,12,bold);
      text(page,'ALTAIR 4X / 406176',1059,baseline,9,regular,184);
      if(signature)drawFit(page,signature,{x:1251,y:H-(top+24),width:242,height:20});
      else text(page,'Varga Ionel  __________________',1250,baseline,10,regular,244);
    });
    text(page,`Pagina ${p+1} di ${pages}`,38,1054,11,regular,180);
    text(page,'Timbro impresa',1058,1020,9,bold,177);
    text(page,'Firma',1252,1020,9,bold,240);
    page.drawRectangle({x:1056,y:H-1065,width:185,height:38,borderColor:border,borderWidth:.7});
    page.drawRectangle({x:1248,y:H-1065,width:250,height:38,borderColor:border,borderWidth:.7});
    if(p===pages-1){drawFit(page,stamp,{x:1059,y:H-1063,width:179,height:34});drawFit(page,signature,{x:1252,y:H-1063,width:242,height:34})}
  }
  pdf.setTitle(`Verbale ATEX - ${job.title||'INRETE'}`);
  return await pdf.save();
}
async function download(job,rows,form,prefetched){
  const bytes=prefetched||await createPdf(job,rows,form),blob=new Blob([bytes],{type:'application/pdf'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=`Verbale-ATEX-${txt(job.title).replace(/[^a-z0-9_-]+/gi,'-')||'commessa'}.pdf`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
}
window.VargaAtexReport={isApplicable,prepareRows,validate,createPdf,download};
})();
