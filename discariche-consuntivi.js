/* Consuntivi cumulativi per le commesse DISCARICHE, esclusa STR G. */
(function(){
'use strict';
const CATALOG=Array.isArray(window.DISCARICHE_CONSUNTIVO_CATALOG)?window.DISCARICHE_CONSUNTIVO_CATALOG:[];
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const N=v=>{const x=Number(String(v??'').replace(',','.'));return Number.isFinite(x)?x:0};
const norm=v=>String(v??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const money=v=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(N(v));
const today=()=>new Date().toISOString().slice(0,10);
const displayDate=v=>{const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}/${m[2]}/${m[1]}`:String(v||'')};
const uid=()=>crypto.randomUUID?.()||('disc-'+Date.now()+'-'+Math.random().toString(16).slice(2));
const jobText=j=>norm([j?.title,j?.code,j?.site,j?.name,j?.commessa].join(' '));
const isDiscariche=j=>{const text=jobText(j);return text.includes('discaric')&&!/(^| )str g($| )/.test(text)&&!text.includes('discarica hera ozzano')};
const currentJob=()=>((db.jobs||[]).find(j=>j.id===localStorage.getItem('vg_activeJobId'))||null);
const records=()=>{db.discaricheConsuntivi=Array.isArray(db.discaricheConsuntivi)?db.discaricheConsuntivi:[];return db.discaricheConsuntivi};
const blankLines=()=>CATALOG.map(x=>({...x,quantity:x.automatic?x.quantity:'',startDate:'',endDate:'',note:''}));
const calc=l=>N(l.quantity)*N(l.price); // Il modello Excel calcola Quantità x Prezzo capitolato.
const active=l=>Boolean(l.startDate&&l.endDate&&(l.automatic||N(l.quantity)>0));
let editing=null,lines=[];

function editableLines(record){
  if(!record)return blankLines();
  const saved=new Map((record.rows||[]).map(x=>[String(x.code),x]));
  return blankLines().map(x=>saved.has(x.code)?{...x,...saved.get(x.code),automatic:x.automatic,quantity:x.automatic?x.quantity:saved.get(x.code).quantity}:x);
}
function total(){return lines.filter(active).reduce((s,l)=>s+calc(l),0)}
function validate(){
  for(const l of lines){
    const touched=Boolean(l.startDate||l.endDate||(!l.automatic&&N(l.quantity)>0));
    if(!touched)continue;
    if(!l.startDate||!l.endDate)return `Completa data inizio e data fine per la voce ${l.code}.`;
    if(l.endDate<l.startDate)return `La data fine della voce ${l.code} non può precedere la data inizio.`;
    if(!l.automatic&&N(l.quantity)<=0)return `Inserisci la quantità per la voce ${l.code}.`;
  }
  return'';
}
function values(modal){const v=id=>String(modal.querySelector('#'+id)?.value||'').trim();return{plantName:v('discPlant'),comune:v('discComune'),odl:v('discOdl'),description:v('discDescription'),requester:v('discRequester'),generalNotes:v('discNotes')}}
function store(job,modal,status,extra={}){
  const error=validate();if(error){alert(error);return null}
  const f=values(modal),rows=lines.filter(active).map(x=>({...x,amount:calc(x)}));
  if(!f.plantName){alert('Inserisci il nome dell’impianto.');return null}
  const row={id:editing?.id||uid(),jobId:job.id,jobCode:job.code||'',jobName:job.title||'DISCARICHE',job:{id:job.id,title:job.title||'',code:job.code||''},...f,date:rows.map(x=>x.startDate).sort()[0]||today(),rows,total:rows.reduce((s,x)=>s+x.amount,0),status,createdAt:editing?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),...extra};
  const old=records().findIndex(x=>x.id===row.id);if(old>=0)records()[old]=row;else records().push(row);editing=row;save();return row;
}
function drawRows(modal){
  const q=norm(modal.querySelector('#discSearch')?.value),body=modal.querySelector('#discRows');
  body.innerHTML=lines.map((l,i)=>({l,i})).filter(({l})=>!q||norm([l.code,l.short,l.description].join(' ')).includes(q)).map(({l,i})=>`<tr data-index="${i}" class="${l.automatic?'disc-auto':''}"><td><strong>${E(l.code)}</strong></td><td><strong>${E(l.short)}</strong><div class="dep-desc">${E(l.description)}</div>${l.automatic?'<small class="dep-drive-ok">QUANTITÀ AUTOMATICA DAL TESTO ESTESO</small>':''}</td><td>${E(l.unit)}</td><td><input class="disc-q" type="number" min="0" step="0.01" value="${E(l.quantity)}" ${l.automatic?'readonly':''}></td><td>${money(l.price)}</td><td><input class="disc-start" type="date" value="${E(l.startDate)}"></td><td><input class="disc-end" type="date" value="${E(l.endDate)}"></td><td data-amount>${money(active(l)?calc(l):0)}</td><td><input class="disc-note" value="${E(l.note)}"></td></tr>`).join('');
  body.querySelectorAll('tr').forEach(tr=>{const l=lines[Number(tr.dataset.index)],sync=()=>{if(!l.automatic)l.quantity=tr.querySelector('.disc-q').value;l.startDate=tr.querySelector('.disc-start').value;l.endDate=tr.querySelector('.disc-end').value;l.note=tr.querySelector('.disc-note').value;tr.querySelector('[data-amount]').textContent=money(active(l)?calc(l):0);modal.querySelector('#discTotal').textContent=money(total())};tr.querySelectorAll('input').forEach(x=>x.oninput=sync)});
}
function history(job){
  const rows=records().filter(x=>x.jobId===job.id).slice().reverse();
  return rows.length?rows.map(r=>`<div class="dep-history-row"><div><strong>${E(r.plantName)}</strong><small>${r.rows.length} voci • ${money(r.total)} • ${E(r.status)}</small></div><div class="dep-actions"><button class="mini" data-disc-edit="${E(r.id)}">MODIFICA</button>${r.driveFileId?`<button class="mini" data-disc-pdf="${E(r.id)}">APRI PDF</button>`:''}<button class="mini danger" data-disc-delete="${E(r.id)}">ELIMINA</button></div></div>`).join(''):'<div class="vg-empty">Nessun consuntivo discariche creato.</div>';
}
function mount(host,job){
  if(!host||!isDiscariche(job))return;
  host.innerHTML=`<div class="panel dep-card"><div class="dep-card-head"><div><h2>Contabilità e consuntivi DISCARICHE</h2><div class="muted">A1–A6: compila soltanto le date; la quantità è automatica. B1–B12: compila quantità e date.</div></div><button class="primary" data-disc-new>+ NUOVO CONSUNTIVO</button></div><div class="dep-history">${history(job)}</div></div>`;
  host.querySelector('[data-disc-new]').onclick=()=>open(job);host.querySelectorAll('[data-disc-edit]').forEach(b=>b.onclick=()=>open(job,records().find(x=>x.id===b.dataset.discEdit)));host.querySelectorAll('[data-disc-delete]').forEach(b=>b.onclick=()=>remove(job,b.dataset.discDelete));host.querySelectorAll('[data-disc-pdf]').forEach(b=>b.onclick=()=>openPdf(records().find(x=>x.id===b.dataset.discPdf)));
}
function refreshHistory(job){const host=document.querySelector('[data-disc-cons-host]');if(host)mount(host,job)}
function inject(){
  const job=currentJob();if(!isDiscariche(job))return;
  const actions=document.querySelector('#jobWorkspace .vg-work-actions');if(actions&&!actions.querySelector('[data-disc-quick]')){const b=document.createElement('button');b.dataset.discQuick='1';b.textContent='+ CONSUNTIVO DISCARICHE';b.onclick=()=>open(job);actions.appendChild(b)}
  const pane=document.querySelector('#jobWorkspace [data-pane="accounting"]');if(!pane||pane.querySelector('[data-disc-cons-host]'))return;const h=document.createElement('div');h.dataset.discConsHost='1';pane.prepend(h);mount(h,job);
}
function open(job,record){
  editing=record||null;lines=editableLines(record);const modal=document.createElement('div');modal.className='dep-modal';modal.innerHTML=`<div class="dep-dialog"><div class="dep-dialog-head"><div><h1>${record?'Modifica':'Nuovo'} consuntivo DISCARICHE</h1><div class="muted">Il consuntivo include solo le righe compilate correttamente. STR G e Discarica Hera Ozzano sono escluse.</div></div><button class="ghost" data-close>CHIUDI</button></div><div class="dep-form"><label>Nome impianto<input id="discPlant" value="${E(record?.plantName||job.title||'')}"></label><label>Comune<input id="discComune" value="${E(record?.comune||'')}"></label><label>ODL<input id="discOdl" value="${E(record?.odl||'')}"></label><label>Richiedente intervento<input id="discRequester" value="${E(record?.requester||'Masini Giuseppe')}"></label><label class="wide">Descrizione intervento<input id="discDescription" value="${E(record?.description||'Sfalcio delle aree verdi')}"></label><label class="wide">Note generali<textarea id="discNotes">${E(record?.generalNotes||'')}</textarea></label></div><div class="inline"><input id="discSearch" placeholder="Cerca codice o lavorazione..."></div><div class="dep-table-wrap"><table class="dep-table"><thead><tr><th>Codice</th><th>Testo breve / esteso</th><th>U.M.</th><th>Quantità</th><th>Prezzo</th><th>Data inizio</th><th>Data fine</th><th>Importo</th><th>Note</th></tr></thead><tbody id="discRows"></tbody></table></div><div class="dep-total"><span>Totale intervento</span><span id="discTotal">${money(total())}</span></div><div class="dep-footer"><div id="discInfo" class="muted">Il PDF sarà archiviato nella cartella Contabilità della commessa.</div><div class="dep-actions"><button class="ghost" data-save>SALVA BOZZA</button><button class="primary" data-complete>COMPLETA, CREA PDF E ARCHIVIA SU DRIVE</button></div></div></div>`;document.body.appendChild(modal);drawRows(modal);modal.querySelector('[data-close]').onclick=()=>modal.remove();modal.querySelector('#discSearch').oninput=()=>drawRows(modal);modal.querySelector('[data-save]').onclick=()=>{if(store(job,modal,'Bozza')){modal.remove();refreshHistory(job)}};modal.querySelector('[data-complete]').onclick=()=>complete(job,modal);
}
async function loadPdfLib(){if(window.PDFLib)return window.PDFLib;if(!window.__discPdfPromise)window.__discPdfPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js';s.onload=()=>resolve(window.PDFLib);s.onerror=()=>reject(Error('Libreria PDF non disponibile'));document.head.appendChild(s)});return window.__discPdfPromise}
function safePdf(v){return String(v??'').replace(/[²]/g,'2').replace(/[–—]/g,'-').replace(/[’]/g,"'").replace(/[^\x20-\x7E\xA0-\xFF]/g,'')}
function wrap(font,text,size,width){const words=safePdf(text).replace(/\s+/g,' ').trim().split(' '),out=[];let line='';for(const w of words){const next=line?line+' '+w:w;if(font.widthOfTextAtSize(next,size)<=width)line=next;else{if(line)out.push(line);line=w}}if(line)out.push(line);return out}
async function makePdf(r){
  const {PDFDocument,StandardFonts,rgb}=await loadPdfLib(),pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold),W=841.92,H=595.32,margin=25,yellow=rgb(1,1,0),pale=rgb(.94,.94,.94),black=rgb(0,0,0);let page=pdf.addPage([W,H]),y=548;
  const txt=(t,x,yy,size=5.2,f=font)=>page.drawText(safePdf(t),{x,y:yy,size,font:f,color:black});const rect=(x,yy,w,h,fill=rgb(1,1,1))=>page.drawRectangle({x,y:yy,width:w,height:h,color:fill,borderColor:black,borderWidth:.6});const center=(t,x,yy,w,size=5.2,f=font)=>txt(t,x+(w-f.widthOfTextAtSize(safePdf(t),size))/2,yy,size,f);const cells=(t,x,yy,w,h,size=4.8,f=font)=>wrap(f,t,size,w-4).slice(0,Math.max(1,Math.floor((h-3)/5.5))).forEach((v,i)=>txt(v,x+2,yy+h-7-i*5.5,size,f));
  rect(margin,y,W-margin*2,12,yellow);center('TORNA AL INDEX',margin,y+3,W-margin*2,5,bold);y-=50;rect(margin,y,W-margin*2,50);txt('Avola Società Cooperativa',margin+8,y+36,9,bold);txt('Via Galliera, 14/a - 40013 Castel Maggiore (BO)',margin+8,y+24,6);txt('Tel. 051.701490 - E-mail: avolacoop@avolacoop.com',margin+8,y+13,6);txt('NOTE',margin+620,y+25,6,bold);y-=21;rect(margin,y,W-margin*2,21);txt('Contratto n.2670001725',margin+3,y+8,6,bold);txt('VALIDITA:',margin+280,y+8,6,bold);txt('TIPOLOGIA:',margin+480,y+8,6,bold);y-=22;rect(margin,y,W-margin*2,22);txt('NOME IMPIANTO:',margin+3,y+9,5.5,bold);txt(r.plantName,margin+105,y+8,6);txt('COMUNE:',margin+410,y+9,5.5,bold);txt(r.comune||'-',margin+455,y+8,6);txt('ODL:',margin+650,y+9,5.5,bold);txt(r.odl||'-',margin+680,y+8,6);y-=22;rect(margin,y,W-margin*2,22);txt('DESCRIZIONE INTERVENTO:',margin+3,y+9,5.5,bold);txt(r.description||'Sfalcio delle aree verdi',margin+150,y+8,6);y-=22;rect(margin,y,W-margin*2,22);txt('RICHIEDENTE INTERVENTO:',margin+3,y+9,5.5,bold);txt(r.requester||'-',margin+150,y+8,6);
  const widths=[48,100,215,39,49,50,43,57,58,58,69],heads=['Cod. Prest.','Testo breve','TESTO ESTESO','U.M.','Quantità','Prezzo','Ribasso','IMPORTO','DATA INIZIO','DATA FINE','NOTE'];y-=50;let x=margin;heads.forEach((h,i)=>{rect(x,y,widths[i],32,yellow);center(h,x,y+13,widths[i],4.6,bold);x+=widths[i]});
  for(const l of r.rows){const h=32;if(y-h<35){page=pdf.addPage([W,H]);y=H-45;x=margin;heads.forEach((hh,i)=>{rect(x,y,widths[i],30,yellow);center(hh,x,y+12,widths[i],4.6,bold);x+=widths[i]})}y-=h;x=margin;const vals=[l.code,l.short,l.description,l.unit,String(l.quantity),N(l.price).toLocaleString('it-IT',{minimumFractionDigits:2}),String(l.discount)+'% SI',money(l.amount),displayDate(l.startDate),displayDate(l.endDate),l.note];vals.forEach((v,i)=>{rect(x,y,widths[i],h,i===0?yellow:pale);if([0,3,4,5,6,7,8,9].includes(i))center(v,x,y+13,widths[i],4.5,i===0?bold:font);else cells(v,x,y,widths[i],h,4.4);x+=widths[i]})}
  rect(margin+545,y-18,158,16,yellow);txt('TOTALE INTERVENTO',margin+550,y-12,5.5,bold);txt(money(r.total),margin+650,y-12,5.5,bold);if(r.generalNotes)txt('NOTE: '+r.generalNotes,margin,y-30,5);pdf.setTitle('Consuntivo discariche - '+r.plantName);return new Blob([await pdf.save()],{type:'application/pdf'})
}
async function driveFolder(job){const root=await window.VargaMailBridgeCall('driveEnsureJob',{job:{id:job.id,title:job.title||'',code:job.code||''}}),list=await window.VargaMailBridgeCall('driveList',{job:{id:job.id,title:job.title||'',code:job.code||''},folderId:root.rootId}),found=(list.folders||[]).find(x=>norm(x.name)==='contabilita');return found?.id||(await window.VargaMailBridgeCall('driveCreateFolder',{job:{id:job.id,title:job.title||'',code:job.code||''},folderId:root.rootId,name:'Contabilita'})).id}
async function complete(job,modal){const btn=modal.querySelector('[data-complete]'),info=modal.querySelector('#discInfo');try{btn.disabled=true;let row=store(job,modal,'In elaborazione');if(!row)return;if(!row.rows.length)throw Error('Compila almeno una voce con quantità e date.');info.textContent='Creo il PDF e verifico i calcoli...';const blob=await makePdf(row),bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));if(typeof window.VargaMailBridgeCall!=='function')throw Error('Collegamento Apps Script/Drive non configurato.');info.textContent='Archivio il PDF su Google Drive...';const folderId=await driveFolder(job),name=`${row.date.replaceAll('-','')} - ${row.plantName} - consuntivo discariche.pdf`,out=await window.VargaMailBridgeCall('driveUpload',{job:row.job,folderId,name,mimeType:'application/pdf',base64:btoa(binary)});row=store(job,modal,'Completato',{driveFolderId:folderId,driveFileId:out.id,fileName:out.name,completedAt:new Date().toISOString()});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),30000);info.innerHTML='<span class="dep-drive-ok">Consuntivo completato e archiviato.</span>';setTimeout(()=>{modal.remove();inject()},700)}catch(e){console.error(e);info.innerHTML=`<span class="dep-drive-warn">${E(e.message||e)}</span>`}finally{btn.disabled=false}}
async function openPdf(record){try{const out=await window.VargaMailBridgeCall('driveGetFile',{job:record.job,fileId:record.driveFileId}),raw=atob(out.base64),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));window.open(url,'_blank');setTimeout(()=>URL.revokeObjectURL(url),60000)}catch(e){alert('Non è stato possibile aprire il PDF: '+(e.message||e))}}
async function remove(job,id){const record=records().find(x=>x.id===id);if(!record||!confirm('Eliminare questo consuntivo discariche?'))return;if(record.driveFileId&&typeof window.VargaMailBridgeCall==='function'){try{await window.VargaMailBridgeCall('driveTrash',{job:record.job,itemId:record.driveFileId,kind:'file'})}catch(e){console.warn('PDF Drive non eliminato',e)}}const i=records().findIndex(x=>x.id===id);records().splice(i,1);save();refreshHistory(job)}
const obs=new MutationObserver(inject);obs.observe(document.documentElement,{childList:true,subtree:true});setInterval(inject,1200);window.VargaDiscaricheConsuntivi={isDiscariche,open,makePdf,validate};
})();
