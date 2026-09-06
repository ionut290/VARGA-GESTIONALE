/* Preventivi e consuntivi dedicati a Hera Cadriano, basati sulla matrice AVOLA C14. */
(function(){
'use strict';
const CATALOG=Array.isArray(window.CADRIANO_DOCUMENT_CATALOG)?window.CADRIANO_DOCUMENT_CATALOG:[];
const JOB_ID='HGSbSp7CQ5W08rS1RQ0R';
const JOB_CODE='28013';
const E=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const N=value=>{const number=Number(String(value??'').replace(',','.'));return Number.isFinite(number)?number:0};
const money=value=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(N(value));
const today=()=>new Date().toISOString().slice(0,10);
const displayDate=value=>{const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return match?`${match[3]}/${match[2]}/${match[1]}`:String(value||'')};
const normalize=value=>String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
const uid=()=>crypto.randomUUID?.()||`cad-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const typeLabel=type=>type==='preventivo'?'Preventivo':'Consuntivo';
const currentJob=()=>((db.jobs||[]).find(job=>job.id===localStorage.getItem('vg_activeJobId'))||null);
const isCadriano=job=>Boolean(job&&(String(job.id)===JOB_ID||String(job.code)===JOB_CODE||normalize([job.title,job.site].join(' ')).includes('cadriano')));
const records=()=>{db.cadrianoDocuments=Array.isArray(db.cadrianoDocuments)?db.cadrianoDocuments:[];return db.cadrianoDocuments};
const blankLines=()=>CATALOG.map(row=>({...row,quantity:''}));
const selected=lines=>lines.filter(row=>N(row.quantity)>0);
const total=lines=>selected(lines).reduce((sum,row)=>sum+N(row.quantity)*N(row.price),0);
let editing=null;
let lines=[];

function addStyle(){
  if(document.getElementById('cadrianoDocumentStyle'))return;
  const style=document.createElement('style');
  style.id='cadrianoDocumentStyle';
  style.textContent=`
  .cad-card{border:2px solid #d9d500;background:#fffef0;margin-bottom:14px}.cad-card-head{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}.cad-card-head h2{margin:0}.cad-actions{display:flex;gap:7px;flex-wrap:wrap}.cad-history-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;padding:11px 0;border-top:1px solid #e7e2a4}.cad-history-row small{display:block;color:#667085;margin-top:3px}.cad-modal{position:fixed;inset:0;background:rgba(9,32,23,.72);z-index:100004;display:flex;align-items:flex-start;justify-content:center;padding:18px;overflow:auto}.cad-dialog{background:#f7f8f7;border-radius:16px;width:min(1450px,100%);min-height:calc(100vh - 36px);padding:18px;box-shadow:0 20px 60px rgba(0,0,0,.25)}.cad-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.cad-head h1{margin:0}.cad-form{display:grid;grid-template-columns:minmax(220px,360px) 1fr;gap:12px;margin:14px 0}.cad-fixed{border:1px solid #dce5df;border-radius:10px;background:#fff;padding:10px 12px}.cad-fixed strong{display:block}.cad-table-wrap{border:1px solid #d8e2dc;border-radius:10px;overflow:auto;max-height:58vh;background:#fff}.cad-table{border-collapse:separate;border-spacing:0;min-width:1080px;width:100%;font-size:11px}.cad-table th,.cad-table td{padding:8px;border-right:1px solid #777;border-bottom:1px solid #777;vertical-align:top}.cad-table th{position:sticky;top:0;background:#fff900;color:#111;z-index:2}.cad-table td:first-child,.cad-table td:nth-child(5){background:#fff900;font-weight:900}.cad-table .cad-description{min-width:330px;white-space:normal}.cad-table input{width:90px;min-height:36px}.cad-total{display:flex;justify-content:flex-end;gap:18px;font-size:19px;font-weight:900;margin:13px 0}.cad-footer{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}.cad-ok{color:#08723d;font-weight:800}.cad-warn{color:#9a6113;font-weight:800}@media(max-width:760px){.cad-modal{padding:0}.cad-dialog{min-height:100vh;border-radius:0;padding:12px}.cad-form{grid-template-columns:1fr}.cad-history-row{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

function editableLines(record){
  if(!record)return blankLines();
  const saved=new Map((record.rows||[]).map(row=>[String(row.code),row]));
  return blankLines().map(row=>saved.has(row.code)?{...row,quantity:saved.get(row.code).quantity}:row);
}

function history(job,type){
  const rows=records().filter(row=>row.jobId===job.id&&row.type===type).slice().reverse();
  if(!rows.length)return `<div class="vg-empty">Nessun ${typeLabel(type).toLowerCase()} Hera Cadriano creato.</div>`;
  return rows.map(row=>`<div class="cad-history-row"><div><strong>${E(typeLabel(type))} del ${E(displayDate(row.date))}</strong><small>${row.rows.length} voci • ${money(row.total)} • ${E(row.status||'Bozza')}</small></div><div class="cad-actions"><button class="mini" data-cad-edit="${E(row.id)}">MODIFICA</button>${row.driveFileId?`<button class="mini" data-cad-open="${E(row.id)}">APRI PDF</button>`:''}<button class="mini danger" data-cad-delete="${E(row.id)}">ELIMINA</button></div></div>`).join('');
}

function mount(host,job,type){
  host.innerHTML=`<div class="panel cad-card"><div class="cad-card-head"><div><h2>${E(typeLabel(type))} Hera Cadriano</h2><div class="muted">Matrice AVOLA C14: inserisci soltanto la data e le quantità.</div></div><button class="primary" data-cad-new="${E(type)}">+ CREA ${E(typeLabel(type).toUpperCase())}</button></div><div>${history(job,type)}</div></div>`;
  host.querySelector('[data-cad-new]').onclick=()=>open(job,type);
  host.querySelectorAll('[data-cad-edit]').forEach(button=>button.onclick=()=>{const record=records().find(row=>row.id===button.dataset.cadEdit);open(job,record.type,record)});
  host.querySelectorAll('[data-cad-open]').forEach(button=>button.onclick=()=>openStoredPdf(records().find(row=>row.id===button.dataset.cadOpen)));
  host.querySelectorAll('[data-cad-delete]').forEach(button=>button.onclick=()=>removeRecord(job,records().find(row=>row.id===button.dataset.cadDelete)));
}

function inject(){
  const job=currentJob();
  if(!isCadriano(job))return;
  document.querySelectorAll('#jobWorkspace [data-job-action="quote"]').forEach(button=>button.style.display='none');
  const actions=document.querySelector('#jobWorkspace .vg-work-actions');
  if(actions&&!actions.querySelector('[data-cad-quick="preventivo"]')){
    for(const type of ['preventivo','consuntivo']){
      const button=document.createElement('button');
      button.dataset.cadQuick=type;
      button.textContent=`+ CREA ${typeLabel(type).toUpperCase()}`;
      button.onclick=()=>open(job,type);
      actions.appendChild(button);
    }
  }
  const targets=[['quotes','preventivo'],['accounting','consuntivo']];
  for(const [paneName,type] of targets){
    const pane=document.querySelector(`#jobWorkspace [data-pane="${paneName}"]`);
    if(!pane||pane.querySelector(`[data-cad-host="${type}"]`))continue;
    const host=document.createElement('div');host.dataset.cadHost=type;pane.prepend(host);mount(host,job,type);
  }
}

function open(job,type,record=null){
  editing=record;
  lines=editableLines(record);
  const modal=document.createElement('div');
  modal.className='cad-modal';
  modal.innerHTML=`<div class="cad-dialog"><div class="cad-head"><div><h1>${record?'Modifica':'Nuovo'} ${E(typeLabel(type).toLowerCase())} Hera Cadriano</h1><div class="muted">Il modello, le voci, i prezzi e la firma Depurazione sono già impostati.</div></div><button class="ghost" data-close>CHIUDI</button></div><div class="cad-form"><label>Data<input id="cadDate" type="date" value="${E(record?.date||today())}"></label><div class="cad-fixed"><strong>Impianto di depurazione c/o stabilimento Granarolo – Cadriano (BO)</strong><span>Richiedente intervento: ZEROUAL WASSIM</span></div></div><div class="cad-table-wrap"><table class="cad-table"><thead><tr><th>Cod.</th><th>Testo breve</th><th>Testo esteso</th><th>U.M.</th><th>Quantità</th><th>Prezzo</th><th>Ribasso</th><th>Prezzo netto</th><th>Importo</th></tr></thead><tbody>${lines.map((row,index)=>`<tr data-index="${index}"><td>${E(row.code)}</td><td>${E(row.short)}</td><td class="cad-description">${E(row.description)}</td><td>${E(row.unit)}</td><td><input class="cad-quantity" type="number" min="0" step="0.01" value="${E(row.quantity)}"></td><td>${money(row.price)}</td><td>NO</td><td>${money(row.price)}</td><td data-amount>${N(row.quantity)>0?money(N(row.quantity)*N(row.price)):'—'}</td></tr>`).join('')}</tbody></table></div><div class="cad-total"><span>TOTALE INTERVENTO</span><span id="cadTotal">${money(total(lines))}</span></div><div class="cad-footer"><div id="cadInfo" class="muted">Il PDF definitivo verrà archiviato nella cartella ${type==='preventivo'?'Preventivi':'Contabilita'} della commessa.</div><div class="cad-actions"><button class="ghost" data-save>SALVA BOZZA</button><button class="primary" data-complete>COMPLETA, CREA PDF E ARCHIVIA SU DRIVE</button></div></div></div>`;
  document.body.appendChild(modal);
  modal.querySelector('[data-close]').onclick=()=>modal.remove();
  modal.querySelectorAll('tbody tr').forEach(tr=>{tr.querySelector('.cad-quantity').oninput=event=>{const row=lines[Number(tr.dataset.index)];row.quantity=event.target.value;tr.querySelector('[data-amount]').textContent=N(row.quantity)>0?money(N(row.quantity)*N(row.price)):'—';modal.querySelector('#cadTotal').textContent=money(total(lines))}});
  modal.querySelector('[data-save]').onclick=()=>saveDraft(job,type,modal);
  modal.querySelector('[data-complete]').onclick=()=>complete(job,type,modal);
}

function store(job,type,modal,status,extra={}){
  const date=modal.querySelector('#cadDate')?.value||'';
  if(!date){alert('Inserisci la data.');return null}
  const rows=selected(lines).map(row=>({...row,amount:N(row.quantity)*N(row.price)}));
  if(!rows.length){alert('Inserisci almeno una quantità.');return null}
  const record={...(editing||{}),id:editing?.id||uid(),jobId:job.id,jobCode:job.code||JOB_CODE,jobName:job.title||'Hera Cadriano',job:{id:job.id,title:job.title||'Hera Cadriano',code:job.code||JOB_CODE},type,date,plantName:'Impianto di depurazione c/o stabilimento Granarolo – Cadriano (BO)',comune:'CADRIANO',requester:'ZEROUAL WASSIM',rows,total:rows.reduce((sum,row)=>sum+row.amount,0),status,createdAt:editing?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),...extra};
  const index=records().findIndex(row=>row.id===record.id);if(index>=0)records()[index]=record;else records().push(record);editing=record;save();return record;
}

async function saveDraft(job,type,modal){
  const info=modal.querySelector('#cadInfo'),record=store(job,type,modal,'Bozza');if(!record)return;
  try{info.textContent='Salvo la bozza nella cartella BOZZE...';await window.VargaDriveLifecycle?.saveDraft(record,job,`${typeLabel(type)} Hera Cadriano`);save();info.innerHTML='<span class="cad-ok">Bozza salvata su Drive.</span>'}catch(error){info.innerHTML=`<span class="cad-warn">Bozza salvata nel Gestionale, ma Drive non ha risposto: ${E(error.message||error)}</span>`}
}

async function pdfLib(){
  if(window.PDFLib)return window.PDFLib;
  if(!window.__cadrianoPdfPromise)window.__cadrianoPdfPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js';script.onload=()=>resolve(window.PDFLib);script.onerror=()=>reject(Error('Libreria PDF non disponibile'));document.head.appendChild(script)});
  return window.__cadrianoPdfPromise;
}
function safePdf(value){return String(value??'').replace(/[–—]/g,'-').replace(/[’]/g,"'").replace(/[^ -~ -ÿ€]/g,'')}
function wrap(font,text,size,width){const words=safePdf(text).replace(/\s+/g,' ').trim().split(' '),result=[];let line='';for(const word of words){const next=line?`${line} ${word}`:word;if(font.widthOfTextAtSize(next,size)<=width)line=next;else{if(line)result.push(line);line=word}}if(line)result.push(line);return result}

async function makePdf(record){
  const {PDFDocument,StandardFonts,rgb}=await pdfLib(),pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold),page=pdf.addPage([841.92,595.32]);
  const yellow=rgb(1,1,0),white=rgb(1,1,1),black=rgb(0,0,0),pale=rgb(.96,.96,.96),margin=24,width=793.92;
  const text=(value,x,y,size=5.2,face=font)=>page.drawText(safePdf(value),{x,y,size,font:face,color:black});
  const rect=(x,y,w,h,fill=white)=>page.drawRectangle({x,y,width:w,height:h,color:fill,borderColor:black,borderWidth:.65});
  const center=(value,x,y,w,size=5.2,face=font)=>text(value,x+(w-face.widthOfTextAtSize(safePdf(value),size))/2,y,size,face);
  const right=(value,x,y,w,size=5.2,face=font)=>text(value,x+w-face.widthOfTextAtSize(safePdf(value),size)-3,y,size,face);
  const cellText=(value,x,y,w,h,size=4.2,face=font,max=7)=>wrap(face,value,size,w-5).slice(0,max).forEach((line,index)=>text(line,x+2,y+h-6-index*5,size,face));
  const euro=value=>`${N(value).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})} €`;
  rect(margin,574,width,11,yellow);center(`${typeLabel(record.type).toUpperCase()} HERA CADRIANO`,margin,577,width,5,bold);
  rect(margin,523,width,51);center('Avola Società Cooperativa',margin+60,561,320,6,bold);center('Via Galliera, 14/a - 40013 Castel Maggiore (Bo)',margin+60,552,320,5);center('Tel. 051.701490 - Fax 051.703504',margin+60,543,320,5);center('E-mail: avolacoop@avolacoop.com',margin+60,534,320,5);text('NOTE',margin+530,550,5,bold);
  try{if(window.VARGA_DEPURAZIONE_STAMP_JPG){const stamp=await pdf.embedJpg(window.VARGA_DEPURAZIONE_STAMP_JPG);page.drawImage(stamp,{x:margin+650,y:526,width:112,height:42})}}catch(error){console.warn('Firma Depurazione non inserita',error)}
  rect(margin,505,width,18);text(record.type==='preventivo'?`OFF. 26-AM del ${displayDate(record.date)}`:`CONSUNTIVO SU OFF. 26-AM del ${displayDate(record.date)}`,margin+2,512,5.3,bold);text("VALIDITA':",margin+250,512,5,bold);text('TIPOLOGIA:',margin+470,512,5,bold);
  rect(margin,487,width,18);text('NOME IMPIANTO:',margin+2,494,5,bold);text(record.plantName,margin+168,494,5.2);text('COMUNE:',margin+530,494,5,bold);text('CADRIANO',margin+575,494,5.2);text('ODL:',margin+690,494,5,bold);
  rect(margin,469,width,18);text('DESCRIZIONE INTERVENTO:',margin+2,476,5,bold);text(typeLabel(record.type)+' manutenzione del verde',margin+168,476,5.2);
  rect(margin,448,width,21);text('RICHIEDENTE INTERVENTO:',margin+2,456,5,bold);text('ZEROUAL WASSIM',margin+168,456,5.2);
  rect(margin,427,width,21);text('DATA RICHIESTA',margin+2,435,5,bold);text(displayDate(record.date),margin+105,435,5.2);text('DATA INIZIO LAVORI',margin+355,435,5,bold);text(record.type==='consuntivo'?displayDate(record.date):'',margin+455,435,5.2);text('DATA FINE LAVORI',margin+590,435,5,bold);text(record.type==='consuntivo'?displayDate(record.date):'',margin+690,435,5.2);
  rect(margin+497,410,182,17,yellow);center('TOTALE INTERVENTO',margin+497,416,110,5,bold);right(euro(record.total),margin+607,416,72,5,bold);
  const widths=[75,103,188,40,46,55,35,50,72,60,69],headers=['Cod. Prest. Est.','Testo breve','TESTO ESTESO','U.M.','Quantita','Prezzo Capitolato','% Ribasso','Ribasso Si/No','Prezzo NETTO','IMPORTO','NOTE / ATTIVITA'];let y=375,x=margin;
  headers.forEach((header,index)=>{rect(x,y,widths[index],35,yellow);cellText(header,x,y,widths[index],35,4.2,bold,5);x+=widths[index]});
  const saved=new Map(record.rows.map(row=>[row.code,row]));
  for(const source of CATALOG){const row=saved.get(source.code),height=58;y-=height;x=margin;const values=[source.code,source.short,source.description,source.unit,row?String(row.quantity):'',euro(source.price),'','NO',euro(source.price),row?euro(row.amount):'',''];values.forEach((value,index)=>{rect(x,y,widths[index],height,index===0||index===4?yellow:pale);if([0,3,4,5,6,7,8,9].includes(index))center(value,x,y+25,widths[index],4.3,index===0?bold:font);else cellText(value,x,y,widths[index],height,index===2?3.8:4.1,index===1?bold:font,index===2?10:8);x+=widths[index]})}
  pdf.setTitle(`${typeLabel(record.type)} Hera Cadriano - ${displayDate(record.date)}`);return new Blob([await pdf.save()],{type:'application/pdf'});
}

async function complete(job,type,modal){
  const button=modal.querySelector('[data-complete]'),info=modal.querySelector('#cadInfo');
  try{button.disabled=true;let record=store(job,type,modal,'In elaborazione');if(!record)return;info.textContent='Creo il PDF con firma e timbro Depurazione...';const blob=await makePdf(record),name=`${record.date.replaceAll('-','')} - ${typeLabel(type)} - Hera Cadriano.pdf`,link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),30000);record=store(job,type,modal,'Completato - Drive in attesa',{fileName:name,completedAt:new Date().toISOString(),drivePending:true});if(!window.VargaDriveLifecycle)throw Error('Collegamento Drive non configurato');info.textContent='PDF creato. Archivio il definitivo su Drive...';const out=await window.VargaDriveLifecycle.upload(job,type==='preventivo'?'Preventivi':'Contabilita',name,blob,record.driveFileId);record=store(job,type,modal,'Completato',{driveFileId:out.id,fileName:out.name,drivePending:false});await window.VargaDriveLifecycle.removeDraft(record,job);save();info.innerHTML='<span class="cad-ok">PDF archiviato su Drive; la bozza è stata eliminata.</span>';setTimeout(()=>{modal.remove();refreshHosts(job)},1500)}catch(error){console.error(error);info.innerHTML=`<span class="cad-warn">Il PDF è stato scaricato; archiviazione Drive in attesa: ${E(error.message||error)}</span>`}finally{button.disabled=false}
}

function refreshHosts(job){document.querySelectorAll('[data-cad-host]').forEach(host=>mount(host,job,host.dataset.cadHost))}
async function openStoredPdf(record){try{const out=await window.VargaMailBridgeCall('driveGetFile',{job:record.job,fileId:record.driveFileId}),raw=atob(out.base64),bytes=new Uint8Array(raw.length);for(let index=0;index<raw.length;index++)bytes[index]=raw.charCodeAt(index);const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));window.open(url,'_blank');setTimeout(()=>URL.revokeObjectURL(url),60000)}catch(error){alert('Non è stato possibile aprire il PDF: '+(error.message||error))}}
async function removeRecord(job,record){if(!record||!confirm(`Eliminare questo ${typeLabel(record.type).toLowerCase()} Hera Cadriano?`))return;if(record.driveFileId&&typeof window.VargaMailBridgeCall==='function'){try{await window.VargaMailBridgeCall('driveTrash',{job:record.job,itemId:record.driveFileId,kind:'file'})}catch(error){console.warn('PDF Drive non eliminato',error)}}const index=records().findIndex(row=>row.id===record.id);if(index>=0)records().splice(index,1);save();refreshHosts(job)}

addStyle();new MutationObserver(inject).observe(document.documentElement,{childList:true,subtree:true});setInterval(inject,1200);window.VargaCadrianoDocuments={catalog:CATALOG,isCadriano,makePdf,open};
})();
