/* Avola PDF layout: measurements in PDF points, top-origin coordinates.
 * No client data, credentials, signatures or font files are shipped here.
 * An optional clean letterhead PDF can retain the typography supplied by the user.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VargaAvolaLayout=api})(typeof window==='undefined'?globalThis:window,function(){
'use strict';
const CELL_X=[153.18,205.68,409.68,472.20,517.20],CELL_W=[41.7,193.2,51.72,34.2,51.72];
const G=Object.freeze({width:595.27559,height:841.88976,left:147.42,right:574.68,placeY:79.32,clientX:374.16,clientY:96.60,titleY:147.42,subjectY:182.58,introY:230.64,tableY:277.44,headerH:20.58,rowMinH:40.02,cols:[147.48,199.98,403.98,466.44,511.44,574.68],totalY:485.58});
const GREEN=[0,107/255,60/255],LIGHT=[244/255,247/255,245/255],GREY=[166/255,166/255,166/255],BLACK=[0,0,0],WHITE=[1,1,1];
const clean=v=>String(v??'').replace(/\r\n?/g,'\n').replace(/\t/g,'    ');
function num(value){if(typeof value==='number'){if(!Number.isFinite(value))throw Error('Valore numerico non valido nel preventivo.');return value}let s=String(value??'0').replace(/[€\s]/g,'');if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');const n=Number(s);if(!Number.isFinite(n))throw Error('Valore numerico non valido: '+value);return n}
const money=v=>'€ '+new Intl.NumberFormat('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2,useGrouping:'always'}).format(num(v));
function unitPrice(v){const n=num(v);return '€ '+new Intl.NumberFormat('it-IT',{minimumFractionDigits:2,maximumFractionDigits:12,useGrouping:'always'}).format(n)}
const quantity=v=>new Intl.NumberFormat('it-IT',{maximumFractionDigits:12,useGrouping:'always'}).format(num(v));
const dateText=q=>q.date||String(q.dateIso||'').replace(/^(\d{4})-(\d{2})-(\d{2})$/,'$3/$2/$1');
function wrap(value,width,measure,firstWidth=width){
 const lines=[];for(const paragraph of clean(value).split('\n')){let line='',limit=lines.length?width:firstWidth;const words=paragraph.trim().split(/ +/);for(let word of words){if(!word)continue;const proposed=line?line+' '+word:word;if(measure(proposed)<=limit+0.001){line=proposed;continue}if(line){lines.push(line);line='';limit=width}while(word&&measure(word)>limit+0.001){let count=1;while(count<word.length&&measure(word.slice(0,count+1))<=limit)count++;lines.push(word.slice(0,count));word=word.slice(count);limit=width}line=word}lines.push(line)}return lines.length?lines:[''];
}
function planQuote(q,measure){
 if(!q||!Array.isArray(q.rows)||!q.rows.length)throw Error('Inserisci almeno una voce nel preventivo.');
 if(q.rows.length>10000)throw Error('Troppo numerose le voci per un unico preventivo PDF.');
 const pages=[],flow=[];let page,pageIndex=0;
 const text=(label,value,x,y,width,size=9,style='regular',align='left',lineHeight=size*1.15,lines=null,firstIndent=0)=>{
  const rows=lines||wrap(value,width,t=>measure(t,size,style));
  const block={type:'text',label,value:clean(value),x,y,width,size,style,align,lineHeight,lines:rows,firstIndent};page.push(block);return y+(rows.length-1)*lineHeight;
 };
 const rect=(x,y,width,height,fill,border=false)=>page.push({type:'rect',x,y,width,height,fill,border});
 function newPage(){page=[];pages.push(page);pageIndex++;if(pageIndex>1)text('continuazione',`OFFERTA ${clean(q.number)} del ${dateText(q)} — segue`,G.left,79.32,G.right-G.left,9,'bold');}
 function header(y){for(let i=0;i<5;i++)rect(G.cols[i],y,G.cols[i+1]-G.cols[i],G.headerH,GREEN,true);const labels=['Codice','Descrizione','Prezzo\nunitario','Quantità','Importo'];labels.forEach((v,i)=>text('intestazione',v,CELL_X[i],y+(i===2?7.74:12.72),CELL_W[i],7.5,'bold','center',9.9,clean(v).split('\n')));return y+G.headerH}
 newPage();
 text('luogo_data',`${q.place||'Castel Maggiore'}, il ${dateText(q)}`,G.left,G.placeY,220,9);
 const c=q.client||{},clientLines=[c.name||q.clientName||'',c.address||'',[c.cap,c.city,c.province].filter(Boolean).join(' ')].filter(Boolean);
 text('spettabile','Spett.le',G.clientX,G.clientY,198,9,'bold');
 let cy=106.92;for(let i=0;i<clientLines.length;i++){cy=text('cliente_'+i,clientLines[i],G.clientX,cy,G.right-G.clientX,9,'regular','left',10.38)+10.38}
 const titleY=Math.max(G.titleY,cy+9.36),shift=titleY-G.titleY;
 const titleEnd=text('titolo',`OFFERTA ${clean(q.number)} del ${dateText(q)}`,G.left,titleY,G.right-G.left,10.5,'bold');
 const subjectY=Math.max(G.subjectY+shift,titleEnd+35.16),subject=wrap(q.subject||'',G.right-G.left,t=>measure(t,10.02,'regular'),G.right-G.left-56.1);
 text('oggetto_etichetta','OGGETTO:',G.left,subjectY,56.1,10.02,'bold');
 const subjectEnd=text('oggetto',q.subject||'',G.left,subjectY,G.right-G.left,10.02,'regular','left',16.5,subject,56.1);
 const introY=Math.max(G.introY+shift,subjectEnd+15.06);
 const introEnd=text('introduzione',q.intro||'',G.left,introY,G.right-G.left,8.52,'regular','left',9.78);
 if(subjectEnd>700||introEnd>730)throw Error('Oggetto o introduzione troppo lungo per il frontespizio. Riduci questi campi; le descrizioni delle lavorazioni possono proseguire su più pagine.');
 let y=Math.max(G.tableY+shift,introEnd+37.02);
 if(y>610){newPage();y=112.2}
 y=header(y);
 (q.rows||[]).forEach((row,rowIndex)=>{
  const descriptions=wrap(row.description||'',193.2,t=>measure(t,7.5,'regular'));
  const u=clean(row.unit).trim(),values=[clean(row.code),null,unitPrice(row.price)+(u?'/'+u:''),quantity(row.qty)+(u?' '+u:''),money(num(row.qty)*num(row.price))];
  const cells=values.map((v,i)=>v==null?descriptions:wrap(v,CELL_W[i],t=>measure(t,7.5,i===4?'bold':'regular')));
  let offset=0,part=0,maxLines=Math.max(...cells.map(a=>a.length));
  while(offset<maxLines){
   const available=Math.floor((730-y-14.16)/8.64);
   if(available<3){newPage();y=header(112.2);continue}
   const count=Math.min(maxLines-offset,available),height=Math.max(G.rowMinH,count*8.64+14.10);
   for(let i=0;i<5;i++){
    rect(G.cols[i],y,G.cols[i+1]-G.cols[i],height,rowIndex%2?LIGHT:WHITE,true);
    const lines=cells[i].slice(offset,offset+count);if(!lines.length)continue;
    const baseY=i===1?y+7.8:y+height/2+3.15-(lines.length-1)*4.32;
    text(`riga_${rowIndex+1}_${i}_${part}`,lines.join('\n'),CELL_X[i],baseY,CELL_W[i],7.5,i===4?'bold':'regular',i===1?'left':'center',8.64,lines);
   }
   flow.push({page:pageIndex,row:rowIndex,y,height,part});y+=height;offset+=count;part++;
   if(offset<maxLines){newPage();y=header(112.2)}
  }
 });
 const reference=q.reference||'Riferimento economico: voci e prezzi unitari del prezzario riportati nella documentazione tecnica ricevuta.';
 const refLines=wrap(reference,G.right-G.left,t=>measure(t,7.5,'italic'));
 let totalY=Math.max(pageIndex===1?G.totalY:0,y+10.86+(refLines.length-1)*8.64+56.64);
 // Keep the reference, total and document seal together on the last page.
 if(totalY+140>814){newPage();y=112.2;totalY=y+10.86+(refLines.length-1)*8.64+56.64}
 text('riferimento',reference,G.left,y+10.86,G.right-G.left,7.5,'italic','left',8.64,refLines);
 text('totale_etichetta','TOTALE OFFERTA (IVA ESCLUSA)',G.left,totalY,G.right-G.left,10.5,'bold');
 const base=q.rows.reduce((a,r)=>a+num(r.qty)*num(r.price),0),total=q.subtotal??q.total??base*(1-num(q.discount||0)/100);
 text('totale',money(total),G.left,totalY+14.94,G.right-G.left,11.52,'bold');
 text('oneri','(oneri della sicurezza inclusi)',G.left,totalY+25.98,G.right-G.left,7.98,'italic');
 const seal={x:377.76,y:G.height-(totalY+43.62)-98.88,width:188.64,height:98.88};
 return {pages,flow,seal,geometry:G,total:num(total)};
}
async function build(q,options){
 const {PDFLib:L,sidebarBytes,template,drawSeal,editable=false}=options||{};
 if(!L?.PDFDocument)throw Error('Libreria PDF non disponibile.');
 const pdf=await L.PDFDocument.create(),fonts={regular:await pdf.embedFont(L.StandardFonts.Helvetica),bold:await pdf.embedFont(L.StandardFonts.HelveticaBold),italic:await pdf.embedFont(L.StandardFonts.HelveticaOblique)};
 const names={regular:'VR',bold:'VB',italic:'VI'},original={regular:'AR',bold:'AB',italic:'AI'},warnings=new Set();
 let master=null;if(template){if(template.type!=='varga-avola-template'||template.version!==1)throw Error('Modello Avola non valido.');master=await L.PDFDocument.load(template.pdfBase64,{updateMetadata:false});if(master.getPageCount()!==1)throw Error('Il modello deve contenere una sola pagina.');}
 const metrics=template?.metrics||{};
 function runs(value,size,style){
  const out=[];let current=null;for(const ch of clean(value)){
   const m=metrics[original[style]]?.[ch];let name,encoded,width;
   if(m){name=original[style];encoded=Number(m[0]).toString(16).padStart(4,'0');width=Number(m[1])*size/1000}
   else{if(master)warnings.add(ch);name=names[style];try{encoded=fonts[style].encodeText(ch).asString();width=fonts[style].widthOfTextAtSize(ch,size)}catch(_){throw Error('Carattere non supportato nel PDF: '+ch+'. Correggi il testo oppure usa un carattere equivalente.')}}
   if(current?.name===name){current.encoded+=encoded;current.width+=width}else{current={name,encoded,width};out.push(current)}
  }return out;
 }
 const measure=(text,size,style)=>runs(text,size,style).reduce((s,r)=>s+r.width,0);
 const plan=planQuote(q,measure);let sidebar;if(!master){if(!sidebarBytes)throw Error('Carta intestata non disponibile.');sidebar=await pdf.embedPng(sidebarBytes)}
 const form=editable?pdf.getForm():null;let fieldIndex=0,lastPage;
 const n=v=>L.PDFNumber.of(v),op=(k,args=[])=>L.PDFOperator.of(k,args);
 function textOperators(block,originX=0,originY=0,color=BLACK){
  const out=[op('q'),op('rg',color.map(n))];
  block.lines.forEach((line,index)=>{
   const indent=index===0?block.firstIndent||0:0,available=block.width-indent;
   let x=block.x-originX+indent;const width=measure(line,block.size,block.style);
   if(block.align==='center')x+=(available-width)/2;else if(block.align==='right')x+=available-width;
   const y=G.height-block.y-index*block.lineHeight-originY;
   for(const r of runs(line,block.size,block.style)){
    out.push(op('BT'),op('Tf',[L.PDFName.of(r.name),n(block.size)]),op('Tm',[n(1),n(0),n(0),n(1),n(x),n(y)]),op('Tj',[L.PDFHexString.of(r.encoded)]),op('ET'));x+=r.width;
   }
  });out.push(op('Q'));return out;
 }
 for(let i=0;i<plan.pages.length;i++){
  const page=master?(await pdf.copyPages(master,[0]))[0]:pdf.addPage([G.width,G.height]);if(master)pdf.addPage(page);lastPage=page;
  if(!master)page.drawImage(sidebar,{x:0,y:G.height-841.38,width:140.58,height:841.38});
  const fontResources=page.node.normalizedEntries().Font;
  Object.entries(fonts).forEach(([style,font])=>fontResources.set(L.PDFName.of(names[style]),font.ref));
  for(const block of plan.pages[i]){
   if(block.type==='rect'){
    page.drawRectangle({x:block.x+.36,y:G.height-block.y-block.height+.36,width:block.width-.72,height:block.height-.72,color:L.rgb(...block.fill),borderColor:L.rgb(...GREY),borderWidth:block.border ? .72 : 0});continue;
   }
   const isHeader=block.label==='intestazione',color=isHeader?WHITE:BLACK;
   if(!editable||isHeader||['oggetto_etichetta','spettabile','continuazione','totale_etichetta','oneri'].includes(block.label))page.pushOperators(...textOperators(block,0,0,color));
   else{
    const x=block.x,y=G.height-(block.y+(block.lines.length-1)*block.lineHeight+3),height=(block.lines.length-1)*block.lineHeight+block.size+6;
    const field=form.createTextField(`${block.label}_${i+1}_${++fieldIndex}`);field.setText(block.value);if(block.lines.length>1)field.enableMultiline();field.setAlignment(block.align==='center'?L.TextAlignment.Center:block.align==='right'?L.TextAlignment.Right:L.TextAlignment.Left);
    field.addToPage(page,{x,y,width:block.width,height,borderWidth:0,font:fonts[block.style],textColor:L.rgb(...BLACK)});field.setFontSize(block.size);
    const stream=pdf.context.flateStream(textOperators(block,x,y,color).map(o=>o.toString()).join('\n'),{Type:'XObject',Subtype:'Form',BBox:[0,0,block.width,height],Resources:{Font:fontResources}});
    field.acroField.getWidgets()[0].setNormalAppearance(pdf.context.register(stream));form.markFieldAsClean(field.ref);
   }
  }
 }
 if(drawSeal)await drawSeal(pdf,lastPage,plan.seal);
 pdf.setTitle('Offerta '+clean(q.number));pdf.setAuthor('Avola Società Cooperativa');pdf.setCreator('Varga Gestionale — modello Avola');
 const viewer=pdf.catalog.getOrCreateViewerPreferences();viewer.setPrintScaling(L.PrintScaling.None);
 return {bytes:await pdf.save({updateFieldAppearances:false}),plan,warnings:[...warnings]};
}
return {build,planQuote,wrap,unitPrice,money,geometry:G};
});
