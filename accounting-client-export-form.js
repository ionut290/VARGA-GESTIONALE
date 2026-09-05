/* Form obbligatorio prima di esportare la contabilità cliente. */
(function(){
'use strict';
if(window.VargaAccountingClientExportForm?.installed)return;

const t=v=>String(v??'').trim();
const norm=v=>t(v).toLocaleLowerCase('it-IT').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>{if(v==null||v==='')return null;if(typeof v==='number')return Number.isFinite(v)?v:null;let s=t(v).replace(/\s/g,'').replace(/€/g,'');const c=s.lastIndexOf(','),d=s.lastIndexOf('.');if(c>=0&&d>=0)s=c>d?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');else if(c>=0)s=s.replace(/\./g,'').replace(',','.');else if(d>=0&&s.length-d-1>2)s=s.replace(/\./g,'');const n=Number(s);return Number.isFinite(n)?n:null};
const money=v=>{const n=num(v);return n==null?'':new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:2}).format(n)};
const first=(o,names)=>{for(const wanted of names){const k=Object.keys(o||{}).find(x=>norm(x)===norm(wanted));if(k!=null&&o[k]!=null&&t(o[k])!=='')return o[k]}return''};
const slug=v=>t(v).replace(/[^a-z0-9_-]+/gi,'-').replace(/^-+|-+$/g,'')||'contabilita';

function jobPath(job){return t(job?.vcSourceId||job?.sourcePath||'')}
function selectedJob(){const id=document.getElementById('accountingJobSelect')?.value||'';return (db.jobs||[]).find(j=>j.id===id)||null}
function clientForJob(job){
  if(!job)return{};
  const byId=(db.clients||[]).find(c=>c.id===job.clientId);if(byId)return byId;
  const jn=norm(job.title||'');
  return (db.clients||[]).find(c=>c.name&&jn.includes(norm(c.name)))||{};
}
function sourceRows(job){
  const p=jobPath(job);if(!p)return[];
  return (db.vcRecords||[]).filter(r=>t(r.sourcePath).startsWith(p+'/lavorazioni/')).map((r,i)=>{
    const o=r.data||{};
    return{
      progressivo:first(o,['numeroProgressivoRiga','N.','numeroProgressivo'])||i+1,
      distretto:first(o,['distretto','Distretto']),
      idSap:first(o,['idSap','ID SAP','sap']),
      impianto:first(o,['denominazione','Denominazione Impianto','impianto','nome']),
      comune:first(o,['comune','Comune ubicazione Impianto']),
      indirizzo:first(o,['indirizzo','Via e civico di ubicazione Impianto','via']),
      voce:first(o,['codiceVocePrezzo','Voce di Riferimento Elenco Prezzi','voceRiferimentoElencoPrezzi','codicePrezzo']),
      quantita:first(o,['quantita','Quantità','qta']),
      frequenza:first(o,['frequenzaAnnua','Frequenza annua minima']),
      lavorazione:first(o,['tipologiaLavorazione','Tipologia di lavorazione / sfalcio','lavorazione']),
      um:first(o,['unitaMisura','u.m.','um']),
      prezzoBase:first(o,['prezzoBase','Unitario Base d’asta','prezzo base']),
      prezzoRibassato:first(o,['prezzoRibassato','RIBASSO / Prezzo unitario ribassato','prezzo ribassato']),
      totale:first(o,['totale','Totali','importo']),
      gpsY:first(o,['lat','latitude','gpsY','Coordinate GPS(Y)','Coordinate Y']),
      gpsX:first(o,['lng','lon','longitude','gpsX','Coordinate GPS(X)','Coordinate X']),
      cdc:first(o,['cdc','CDC','centroDiCosto','Centro di costo']),
      data:first(o,['dataEsecuzione','Data esecuzione','data']),
      ora:first(o,['oraEsecuzione','Ora esecuzione','ora']),
      operatore:first(o,['operatoreNome','Operatore','operatore']),
      note:first(o,['note','Note']),
      stato:first(o,['stato','Stato'])
    };
  }).filter(r=>norm(r.stato)==='fatto');
}
function datePeriod(rows){const d=rows.map(r=>t(r.data)).filter(Boolean).sort();return !d.length?'':d[0]===d[d.length-1]?d[0]:d[0]+' - '+d[d.length-1]}

function defaults(job){
  const c=clientForJob(job),a=db.company||{},rows=sourceRows(job);
  return{
    clientName:c.name||'',clientVat:c.vat||'',clientAddress:c.address||'',clientCity:c.city||'',clientEmail:c.email||'',clientPhone:c.phone||'',clientContact:c.contact||c.referente||'',
    companyName:a.name||'VARGA GESTIONALE',companyVat:a.vat||'',companyAddress:a.address||'',companyCity:a.city||'',companyEmail:a.email||'',companyPhone:a.phone||'',companyPec:a.pec||'',companyIban:a.iban||'',companyFooter:a.footer||'',
    documentTitle:'CONTABILITÀ LAVORI ESEGUITI',documentDate:new Date().toISOString().slice(0,10),documentNumber:'',subject:job?.title||'',contractCode:job?.code||'',site:job?.site||'',period:datePeriod(rows),notes:''
  };
}
function saved(job){try{return JSON.parse(localStorage.getItem('vg_accounting_export_'+job.id)||'{}')||{}}catch{return{}}}
function remember(job,data){try{localStorage.setItem('vg_accounting_export_'+job.id,JSON.stringify(data))}catch{}}

function injectStyle(){if(document.getElementById('vg-accounting-export-style'))return;const s=document.createElement('style');s.id='vg-accounting-export-style';s.textContent=`
.vg-export-backdrop{position:fixed;inset:0;background:rgba(10,28,20,.48);z-index:120000;display:flex;align-items:flex-start;justify-content:center;padding:28px;overflow:auto}.vg-export-modal{width:min(1080px,100%);background:#fff;border-radius:14px;box-shadow:0 20px 70px rgba(0,0,0,.25);padding:22px}.vg-export-modal h2{margin:0 0 4px}.vg-export-modal .hint{color:#607269;margin-bottom:18px}.vg-export-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.vg-export-block{border:1px solid #d8e3dd;border-radius:10px;padding:14px;background:#fbfdfc}.vg-export-block h3{margin:0 0 12px;font-size:16px}.vg-export-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px}.vg-export-fields label{font-size:11px;font-weight:700;color:#476056;display:flex;flex-direction:column;gap:4px}.vg-export-fields input,.vg-export-fields textarea{width:100%;padding:9px 10px;border:1px solid #cbd9d1;border-radius:7px;font:inherit;background:#fff}.vg-export-fields textarea{min-height:70px;resize:vertical}.vg-export-wide{grid-column:1/-1}.vg-export-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px;flex-wrap:wrap}.vg-export-required-note{margin-top:10px;padding:9px 11px;border-radius:8px;background:#eef8f2;color:#145c40;font-size:12px;font-weight:700}@media(max-width:800px){.vg-export-grid,.vg-export-fields{grid-template-columns:1fr}}
`;document.head.appendChild(s)}

function field(label,name,value,type='text',wide=false){return `<label class="${wide?'vg-export-wide':''}">${esc(label)}<input name="${esc(name)}" type="${type}" value="${esc(value)}"></label>`}
function textarea(label,name,value){return `<label class="vg-export-wide">${esc(label)}<textarea name="${esc(name)}">${esc(value)}</textarea></label>`}

function openForm(mode){
  const job=selectedJob();if(!job)return alert('Seleziona prima una commessa.');
  const rows=sourceRows(job);if(!rows.length)return alert('Nessuna riga FATTO da esportare.');
  injectStyle();const v={...defaults(job),...saved(job)};
  const wrap=document.createElement('div');wrap.className='vg-export-backdrop';
  wrap.innerHTML=`<div class="vg-export-modal"><h2>Dati contabilità cliente</h2><div class="hint">Controlla e completa i dati prima di generare il documento. I campi già presenti nel Gestionale sono precompilati.</div><form id="vgAccountingExportForm"><div class="vg-export-grid">
  <section class="vg-export-block"><h3>Dati cliente</h3><div class="vg-export-fields">${field('Ragione sociale / Cliente','clientName',v.clientName,'text',true)}${field('P.IVA / C.F.','clientVat',v.clientVat)}${field('Referente','clientContact',v.clientContact)}${field('Indirizzo','clientAddress',v.clientAddress,'text',true)}${field('Comune','clientCity',v.clientCity)}${field('Telefono','clientPhone',v.clientPhone)}${field('Email','clientEmail',v.clientEmail,'email',true)}</div></section>
  <section class="vg-export-block"><h3>Testata documento</h3><div class="vg-export-fields">${field('Titolo documento','documentTitle',v.documentTitle,'text',true)}${field('Data documento','documentDate',v.documentDate,'date')}${field('N. documento / Protocollo','documentNumber',v.documentNumber)}${field('Oggetto / Commessa','subject',v.subject,'text',true)}${field('Codice commessa / Contratto','contractCode',v.contractCode)}${field('Cantiere / Sede','site',v.site)}${field('Periodo lavorazioni','period',v.period,'text',true)}${textarea('Note testata','notes',v.notes)}</div></section>
  <section class="vg-export-block"><h3>Dati aziendali</h3><div class="vg-export-fields">${field('Ragione sociale','companyName',v.companyName,'text',true)}${field('P.IVA','companyVat',v.companyVat)}${field('Telefono','companyPhone',v.companyPhone)}${field('Indirizzo','companyAddress',v.companyAddress,'text',true)}${field('Comune','companyCity',v.companyCity)}${field('Email','companyEmail',v.companyEmail)}${field('PEC','companyPec',v.companyPec,'email',true)}${field('IBAN','companyIban',v.companyIban,'text',true)}${textarea('Piè di pagina','companyFooter',v.companyFooter)}</div></section>
  <section class="vg-export-block"><h3>Controllo documento</h3><p><strong>Commessa:</strong> ${esc(job.title||'')}</p><p><strong>Codice:</strong> ${esc(job.code||'')}</p><p><strong>Righe FATTO:</strong> ${rows.length}</p><p><strong>Periodo:</strong> ${esc(datePeriod(rows)||'—')}</p><div class="vg-export-required-note">La colonna “Voce riferimento elenco prezzi” sarà sempre presente nel documento esportato.</div></section>
  </div><div class="vg-export-actions"><button type="button" class="ghost" id="vgExportCancel">ANNULLA</button><button type="submit" class="primary">${mode==='excel'?'GENERA EXCEL CLIENTE':'GENERA PDF / STAMPA'}</button></div></form></div>`;
  document.body.appendChild(wrap);document.body.style.overflow='hidden';
  const close=()=>{wrap.remove();document.body.style.overflow=''};wrap.querySelector('#vgExportCancel').onclick=close;wrap.addEventListener('click',e=>{if(e.target===wrap)close()});
  wrap.querySelector('form').onsubmit=e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget).entries());remember(job,data);close();generate(mode,job,rows,data)};
}

function docHtml(job,rows,f){
  const total=rows.reduce((s,r)=>s+(num(r.totale)||0),0);
  const unitPrice=r=>num(r.prezzoRibassato)!=null?r.prezzoRibassato:r.prezzoBase;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(f.documentTitle||'Contabilità')} ${esc(job.title||'')}</title><style>@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#17241e;margin:0;font-size:9.5px}.head{display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid #146c4a;padding-bottom:10px;margin-bottom:12px}.company strong{font-size:19px;color:#0f5137}.company,.client{line-height:1.45}.doc-title{text-align:right}.doc-title h1{font-size:19px;margin:0 0 5px;color:#0f5137}.blocks{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}.box{border:1px solid #d6e1db;padding:9px;background:#f7faf8}.box b{display:block;color:#50665b;font-size:8.5px;text-transform:uppercase;margin-bottom:2px}.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px}.meta>div{border:1px solid #d8e3dd;padding:7px;background:#fbfdfc}.meta b{display:block;font-size:8px;text-transform:uppercase;color:#607269;margin-bottom:3px}table{border-collapse:collapse;width:100%;table-layout:fixed}th{background:#0f5137;color:#fff;padding:6px 4px;text-align:left;font-size:8px}td{border:1px solid #d9e1dc;padding:5px 4px;vertical-align:top;word-break:break-word}th:nth-child(1){width:3%}th:nth-child(2){width:6%}th:nth-child(3){width:13%}th:nth-child(4){width:8%}th:nth-child(5){width:10%}th:nth-child(6){width:13%}th:nth-child(7){width:11%}th:nth-child(8){width:4%}th:nth-child(9){width:5%}th:nth-child(10){width:7%}th:nth-child(11){width:7%}th:nth-child(12){width:7%}th:nth-child(13){width:6%}.num{text-align:right;white-space:nowrap}.total{margin:14px 0 0 auto;width:310px;border-top:3px solid #0f5137;padding-top:8px;display:flex;justify-content:space-between;font-size:15px;font-weight:bold}.notes{margin-top:10px;border-top:1px solid #d8e3dd;padding-top:8px}.foot{margin-top:14px;border-top:1px solid #cfd9d3;padding-top:7px;color:#65736c;font-size:8.5px;white-space:pre-line}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>
  <div class="head"><div class="company"><strong>${esc(f.companyName)}</strong><br>${esc(f.companyAddress)} ${esc(f.companyCity)}<br>${f.companyVat?'P.IVA '+esc(f.companyVat):''}${f.companyEmail?'<br>'+esc(f.companyEmail):''}${f.companyPhone?' · '+esc(f.companyPhone):''}${f.companyPec?'<br>PEC '+esc(f.companyPec):''}</div><div class="doc-title"><h1>${esc(f.documentTitle)}</h1>${f.documentNumber?'N. '+esc(f.documentNumber)+'<br>':''}${f.documentDate?esc(f.documentDate):''}</div></div>
  <div class="blocks"><div class="box"><b>Cliente</b><strong>${esc(f.clientName||'')}</strong><br>${esc(f.clientAddress||'')} ${esc(f.clientCity||'')}<br>${f.clientVat?'P.IVA/C.F. '+esc(f.clientVat):''}${f.clientEmail?'<br>'+esc(f.clientEmail):''}${f.clientPhone?' · '+esc(f.clientPhone):''}${f.clientContact?'<br>Referente: '+esc(f.clientContact):''}</div><div class="box"><b>Documento</b><strong>${esc(f.subject||job.title||'')}</strong><br>${f.contractCode?'Codice/Contratto: '+esc(f.contractCode):''}${f.site?'<br>Cantiere/Sede: '+esc(f.site):''}${f.period?'<br>Periodo: '+esc(f.period):''}</div></div>
  <div class="meta"><div><b>Commessa</b>${esc(job.title||'')}</div><div><b>Codice commessa</b>${esc(job.code||f.contractCode||'—')}</div><div><b>Righe eseguite</b>${rows.length}</div><div><b>Totale lavori</b>${money(total)}</div></div>
  <table><thead><tr><th>N.</th><th>ID SAP</th><th>Impianto</th><th>Comune</th><th>Via e civico</th><th>Voce riferimento elenco prezzi</th><th>Tipologia lavorazione</th><th>U.M.</th><th>Quantità</th><th>Prezzo unitario</th><th>Totale</th><th>Data</th><th>Note</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.progressivo)}</td><td>${esc(r.idSap)}</td><td>${esc(r.impianto)}</td><td>${esc(r.comune)}</td><td>${esc(r.indirizzo)}</td><td><strong>${esc(r.voce)}</strong></td><td>${esc(r.lavorazione)}</td><td>${esc(r.um)}</td><td class="num">${esc(r.quantita)}</td><td class="num">${money(unitPrice(r))}</td><td class="num">${money(r.totale)}</td><td>${esc(r.data)}${r.ora?' '+esc(r.ora):''}</td><td>${esc(r.note)}</td></tr>`).join('')}</tbody></table>
  <div class="total"><span>TOTALE LAVORI ESEGUITI</span><span>${money(total)}</span></div>${f.notes?`<div class="notes"><strong>Note:</strong> ${esc(f.notes)}</div>`:''}<div class="foot">${esc(f.companyFooter||'')}${f.companyIban?'\nIBAN: '+esc(f.companyIban):''}</div></body></html>`;
}
async function generate(mode,job,rows,data){if(mode==='excel'&&window.VargaInreteAccountingExport?.isInrete(job)){try{await window.VargaInreteAccountingExport.generate(job,rows,data)}catch(err){alert(err?.message||'Esportazione INRETE non riuscita.')}return}const html=docHtml(job,rows,data);if(mode==='excel'){const blob=new Blob(['\ufeff'+html],{type:'application/vnd.ms-excel;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`Contabilita-Cliente-${slug(job.title)}.xls`;a.click();URL.revokeObjectURL(a.href);return}const w=window.open('','_blank');if(!w)return alert('Consenti i popup per generare il PDF.');w.document.open();w.document.write(html);w.document.close();setTimeout(()=>{w.focus();w.print()},350)}

function intercept(e){const b=e.target?.closest?.('#accountingExcel,#accountingPdf');if(!b)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();openForm(b.id==='accountingExcel'?'excel':'pdf')}
document.addEventListener('click',intercept,true);
window.VargaAccountingClientExportForm={installed:true,openForm,generate,sourceRows};
})();
