/* Avola quote layout, measured in PDF points from the supplied reference.
 * One renderer for normal and fillable PDFs; no dependence on browser print CSS.
 * Page content uses standard PDF Helvetica unless caller supplies embedded fonts.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VargaQuotePdf=api})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const G=Object.freeze({width:595.2756,height:841.8898,left:147.42,right:574.68,sidebar:140.58,placeY:79.32,clientX:374.16,clientY:96.6,titleY:147.42,subjectY:182.58,tableY:277.44,headerHeight:21.3,rowMin:40.08,border:.72,columns:[147.48,199.98,403.98,466.44,511.44,573.96],centres:[174.03,302.28,435.54,489.3,543.06]});
const clean=v=>String(v??'').replace(/\r\n?/g,'\n').replace(/\t/g,'    ');
function numeric(value,label){const n=Number(value??0);if(!Number.isFinite(n))throw Error(label+' non valido.');return n}
function amount(value,max=2){return '€ '+new Intl.NumberFormat('it-IT',{minimumFractionDigits:2,maximumFractionDigits:max,useGrouping:'always'}).format(numeric(value,'Importo'))}
function unitPrice(row){const u=clean(row.unit).trim();return amount(row.price,10)+(u?'/'+u:'')}
function quantity(row){const u=clean(row.unit).trim();return new Intl.NumberFormat('it-IT',{maximumFractionDigits:10,useGrouping:'always'}).format(numeric(row.qty,'Quantità'))+(u?' '+u:'')}
function dateOf(q){if(q.date)return clean(q.date);const s=clean(q.dateIso),m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?m[3]+'/'+m[2]+'/'+m[1]:s}
// Wrap on measured glyph widths. Long tokens are split rather than clipped.
function wrap(value,width,font,size,firstWidth=width){
 if(width<=0||firstWidth<=0)throw Error('Larghezza testo non valida.');
 const lines=[];let first=true;
 for(const paragraph of clean(value).split('\n')){
  if(!paragraph){lines.push('');first=false;continue}
  let line='';for(const word of paragraph.split(/ +/).filter(Boolean)){
   let remaining=word;
   if(line&&font.widthOfTextAtSize(line+' '+remaining,size)<=(first?firstWidth:width)+.001){line+=' '+remaining;continue}
   if(line){lines.push(line);first=false;line=''}
   while(remaining&&font.widthOfTextAtSize(remaining,size)>(first?firstWidth:width)+.001){
    let part='';for(const ch of remaining){if(font.widthOfTextAtSize(part+ch,size)>(first?firstWidth:width)+.001)break;part+=ch}
    if(!part)throw Error('Il testo non entra nella colonna: '+remaining.slice(0,20));
    lines.push(part);remaining=remaining.slice(part.length);first=false;
   }line=remaining;
  }lines.push(line);first=false;
 }return lines;
}
async function generate(q,options={}){
 const L=options.PDFLib||(typeof window!=='undefined'?window.PDFLib:null);if(!L)throw Error('Libreria PDF non disponibile.');
 if(!Array.isArray(q?.rows)||!q.rows.length)throw Error('Inserisci almeno una voce nel preventivo.');
 const {PDFDocument,StandardFonts,rgb,PDFName,PDFBool}=L;
 const pdf=await PDFDocument.create();pdf.setTitle('Offerta '+clean(q.number));pdf.setCreator('Varga Gestionale — modello Avola v129');
 const fonts=options.fonts?await options.fonts(pdf):{regular:await pdf.embedFont(StandardFonts.Helvetica),bold:await pdf.embedFont(StandardFonts.HelveticaBold),italic:await pdf.embedFont(StandardFonts.HelveticaOblique)};
 const form=pdf.getForm(),black=rgb(0,0,0),white=rgb(1,1,1),green=rgb(0,107/255,60/255),border=rgb(166/255,166/255,166/255),stripe=rgb(244/255,247/255,245/255);
 let sidebar=[];
 if(options.letterheadParts){for(const p of options.letterheadParts){sidebar.push({...p,image:await (p.kind==='jpg'?pdf.embedJpg(p.bytes):pdf.embedPng(p.bytes))})}}
 else if(options.sidebarBytes){sidebar=[{image:await pdf.embedPng(options.sidebarBytes),x:0,top:0,width:G.sidebar,height:841.38}]}
 else throw Error('Carta intestata non disponibile.');
 const layout={pages:[],geometry:G,fields:[],rows:[],font:fonts.regular.name};let page,record,pageNo=0,seq=0;
 function addPage(){page=pdf.addPage([G.width,G.height]);pageNo++;record={page:pageNo,text:[],rects:[]};layout.pages.push(record);for(const p of sidebar)page.drawImage(p.image,{x:p.x||0,y:G.height-p.top-p.height,width:p.width,height:p.height});return page}
 function rect(x,top,width,height,color){if(top<0||top+height>G.height+.001)throw Error('Rettangolo oltre il foglio.');page.drawRectangle({x,y:G.height-top-height,width,height,color});record.rects.push({x,top,width,height})}
 function put(text,x,y,size=9,font=fonts.regular,color=black){if(!text)return;if(y>G.height-20||y<size)throw Error('Testo oltre i margini del foglio.');const value=clean(text);font.encodeText(value);page.drawText(value,{x,y:G.height-y,size,font,color});record.text.push({text:value,x,y,size,width:font.widthOfTextAtSize(value,size)})}
 function field(name,lines,x,top,width,height,size,font=fonts.regular,align='left',baseline=top+size){
  const positions=Array.isArray(lines)?lines:[{text:clean(lines),x,y:baseline}];
  positions.forEach(p=>{if(p.y>G.height-20||p.y<size||p.x+font.widthOfTextAtSize(p.text,size)>G.right+.8)throw Error('Testo oltre i margini del modello: '+p.text.slice(0,24));font.encodeText(p.text);record.text.push({text:p.text,x:p.x,y:p.y,size,width:font.widthOfTextAtSize(p.text,size)})});
  if(options.flatten!==false){positions.forEach(p=>page.drawText(p.text,{x:p.x,y:G.height-p.y,size,font,color:black}));return}
  const f=form.createTextField(name+'_'+pageNo+'_'+(++seq)),value=positions.map(p=>p.text).join('\n');f.setText(value);if(positions.length>1)f.enableMultiline();
  f.setAlignment(align==='center'?L.TextAlignment.Center:L.TextAlignment.Left);
  f.addToPage(page,{x,y:G.height-top-height,width,height,borderWidth:0,textColor:black,font});f.setFontSize(size);
  // Explicit appearance stream: default multiline widgets shrink/reflow and do
  // not reproduce measured baselines. The form and normal paths use same lines.
  f.updateAppearances(font,()=>{
   const operators=[L.pushGraphicsState(),L.beginText(),L.setFillingRgbColor(0,0,0),L.setFontAndSize(font.name,size)];
   for(const p of positions)operators.push(L.setTextMatrix(1,0,0,1,p.x-x,top+height-p.y),L.showText(font.encodeText(p.text)));
   operators.push(L.endText(),L.popGraphicsState());return operators;
  });
  for(const w of f.acroField.getWidgets())w.setFlags(4); // visible and printable
  form.markFieldAsClean(f.ref);layout.fields.push({name:f.getName(),page:pageNo,x,top,width,height,value});
 }
 function linesAt(value,x,y,width,size,font,leading,name){const lines=wrap(value,width,font,size);const points=lines.map((text,i)=>({text,x,y:y+i*leading}));field(name,points,x,y-size,width,(lines.length-1)*leading+size+3,size,font);return points[points.length-1].y}
 function centered(value,col,y,size,font,name,top,height){const a=G.columns[col]+G.border+3,b=G.columns[col+1]-3;const lines=wrap(value,b-a,font,size),lead=8.64;const positions=lines.map((text,i)=>({text,x:G.centres[col]-font.widthOfTextAtSize(text,size)/2,y:y+(i-(lines.length-1)/2)*lead}));field(name,positions,a,top+1,b-a,height-2,size,font,'center')}
 function header(top){
  rect(G.columns[0],top,G.right-G.columns[0],G.headerHeight,border);
  for(let i=0;i<5;i++)rect(G.columns[i]+G.border,top+G.border,G.columns[i+1]-G.columns[i]-G.border,G.headerHeight-2*G.border,green);
  ['Codice','Descrizione','Prezzo','Quantità','Importo'].forEach((s,i)=>{const t=i===2?['Prezzo','unitario']:[s];t.forEach((text,j)=>put(text,G.centres[i]-fonts.bold.widthOfTextAtSize(text,7.5)/2,top+(i===2?7.74+j*9.9:12.72),7.5,fonts.bold,white))});return top+G.headerHeight;
 }
 function continuation(){addPage();put('OFFERTA '+clean(q.number)+' del '+dateOf(q),G.left,79.32,10.5,fonts.bold);return header(103.32)}
 addPage();
 linesAt((q.place||'Castel Maggiore')+', il '+dateOf(q),G.left,G.placeY,G.right-G.left,9,fonts.regular,10.38,'luogo_data');
 put('Spett.le',G.clientX,G.clientY,9,fonts.bold);
 const c=q.client||{},clientLines=[c.name||q.clientName||'',c.address||'',[c.cap,c.city,c.province].filter(Boolean).join(' ')].filter(Boolean);
 let cy=G.clientY+10.32;clientLines.forEach((line,i)=>{cy=linesAt(line,G.clientX,cy,G.right-G.clientX,9,fonts.regular,10.38,'cliente_'+i)+10.38});
 const titleY=Math.max(G.titleY,cy+9.36);linesAt('OFFERTA '+clean(q.number)+' del '+dateOf(q),G.left,titleY,G.right-G.left,10.5,fonts.bold,12.6,'titolo_offerta');
 const subjectY=G.subjectY+(titleY-G.titleY),subjectFirstX=203.52;
 put('OGGETTO:',G.left,subjectY,10.02,fonts.bold);
 const slines=wrap(q.subject||'',G.right-G.left,fonts.regular,10.02,G.right-subjectFirstX),subjectPositions=slines.map((text,i)=>({text,x:i?G.left:subjectFirstX,y:subjectY+i*16.5}));
 // A multiline subject uses one field per visual line. The label is never hidden
 // under a field's white appearance. Full subject remains in the app record.
 subjectPositions.forEach((p,i)=>field('oggetto_'+(i+1),p.text,p.x,p.y-10.02,G.right-p.x,13.5,10.02,fonts.regular,'left',p.y));
 const introY=subjectPositions.at(-1).y+15.06,introEnd=linesAt(q.intro||'',G.left,introY,G.right-G.left,8.52,fonts.regular,9.78,'introduzione');
 let y=Math.max(G.tableY,introEnd+37.02);if(y>610)throw Error('Oggetto o introduzione troppo lunghi per l’intestazione del modello. Riduci il testo o suddividi l’offerta.');y=header(y);
 for(let index=0;index<q.rows.length;index++){
  const r=q.rows[index],descs=wrap(r.description||'',193.2,fonts.regular,7.5),values=[clean(r.code),'',unitPrice(r),quantity(r),amount(numeric(r.qty,'Quantità')*numeric(r.price,'Prezzo'))];
  let remaining=descs.slice(),part=0;
  do{
   if(y+G.rowMin>742)y=continuation();
   const maxLines=Math.max(1,Math.floor((742-y-14.16)/8.64));let take=Math.min(remaining.length,maxLines);
   // Ordinary rows stay intact; only rows taller than a fresh page are split.
   const otherHeight=Math.max(...[0,2,3,4].map(i=>wrap(values[i],G.columns[i+1]-G.columns[i]-G.border-6,i===4?fonts.bold:fonts.regular,7.5).length*8.64+10));if(otherHeight>638)throw Error('Codice o importo troppo lungo: correggi la voce nel Gestionale.');const wholeHeight=Math.max(G.rowMin,remaining.length*8.64+14.16,otherHeight);
   if(wholeHeight<=638&&y+wholeHeight>742){y=continuation();take=remaining.length}
   const visible=remaining.splice(0,take),height=Math.max(G.rowMin,visible.length*8.64+14.16,otherHeight),bg=index%2?stripe:white;
   rect(G.columns[0],y,G.right-G.columns[0],height,border);
   for(let i=0;i<5;i++)rect(G.columns[i]+G.border,y,G.columns[i+1]-G.columns[i]-G.border,height-G.border,bg);
   const positions=visible.map((text,i)=>({text,x:205.68,y:y+7.08+i*8.64}));field('descrizione_riga_'+(index+1)+'_'+part,positions,205.68,y+0.15,193.2,height-1.2,7.5);
   [0,2,3,4].forEach(i=>{const v=i===0?values[i]:(part===0?values[i]:'');centered(v,i,y+height/2+2.4,7.5,i===4?fonts.bold:fonts.regular,['codice','descrizione','prezzo','quantita','importo'][i]+'_riga_'+(index+1)+'_'+part,y,height)});
   layout.rows.push({page:pageNo,index,part,top:y,height});y+=height;part++;
  }while(remaining.length);
 }
 const reference=clean(options.referenceText??q.referenceText??'Riferimento economico: voci e prezzi unitari del prezzario riportati nella documentazione tecnica ricevuta.'),rlines=wrap(reference,G.right-G.left,fonts.italic,7.5);
 const footerHeight=10.02+(rlines.length-1)*8.64+56.64+26+17.64+(options.drawSeal?98.88:0);
 if(y+footerHeight>795){addPage();put('OFFERTA '+clean(q.number)+' del '+dateOf(q),G.left,79.32,10.5,fonts.bold);y=103.32}
 const refEnd=linesAt(reference,G.left,y+10.02,G.right-G.left,7.5,fonts.italic,8.64,'riferimento_economico');
 const totalY=Math.max(refEnd+56.64,pageNo===1?485.58:0);put('TOTALE OFFERTA (IVA ESCLUSA)',G.left,totalY,10.5,fonts.bold);
 field('totale_offerta',amount(q.subtotal??q.total??0),G.left,totalY+14.94-11.52,250,15,11.52,fonts.bold,'left',totalY+14.94);
 put('(oneri della sicurezza inclusi)',G.left,totalY+25.98,7.98,fonts.italic);
 const sealBox={x:377.76,y:G.height-(totalY+43.62)-98.88,width:188.64,height:98.88};
 if(options.drawSeal)await options.drawSeal(pdf,page,sealBox);
 if(options.flatten===false){form.acroForm.dict.set(PDFName.of('NeedAppearances'),PDFBool.False)}
 const prefs=pdf.catalog.getOrCreateViewerPreferences();prefs.setPrintScaling(L.PrintScaling.None);
 const bytes=await pdf.save({updateFieldAppearances:false});return {bytes,layout};
}
return Object.freeze({generate,geometry:G,wrap,amount,unitPrice,quantity});
});
