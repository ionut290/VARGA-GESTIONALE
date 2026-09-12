/* Riepilogo impianti per le commesse DEPURAZIONE e INRETE. */
(function(root){
'use strict';
const A=value=>Array.isArray(value)?value:[];
const N=value=>String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const E=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const database=()=>typeof db!=='undefined'?db:(root.db||{});
const jobText=job=>N([job?.title,job?.code,job?.site,job?.commessa,job?.nome].filter(Boolean).join(' '));
const doneStatus=value=>['fatto','completato','completa','terminato'].includes(N(value));

function family(job){
  const text=jobText(job);
  if(text.includes('depuraz'))return'DEPURAZIONE';
  if(/\binrete\b|\bin rete\b/.test(text))return'INRETE';
  return'';
}

function jobPath(job){return String(job?.vcSourceId||job?.sourcePath||'').replace(/\/$/,'')}
function activeRecord(record){return record&&record.deleted!==true&&record.operation!=='delete'&&!record.vcArchived}
function workRecords(job){
  const path=jobPath(job);
  if(!path)return[];
  return A(database().vcRecords).filter(record=>activeRecord(record)&&String(record.sourcePath||'').startsWith(path+'/lavorazioni/'));
}
function physicalRecords(job){
  const path=jobPath(job);
  if(!path)return[];
  return A(database().vcRecords).filter(record=>activeRecord(record)&&String(record.sourcePath||'').startsWith(path+'/impiantiFisici/'));
}
function matchesJob(plant,job){
  if(plant?.jobId===job.id||plant?.commessaId===job.id)return true;
  const path=jobPath(job),source=String(plant?.vcSourceId||plant?.sourcePath||'');
  if(path&&source.startsWith(path+'/'))return true;
  const terms=[job?.code,job?.title].map(N).filter(term=>term.length>=3),text=N([plant?.commessa,plant?.nomeCommessa,plant?.codiceCommessa].join(' '));
  return !!text&&terms.some(term=>text===term||(term.length>=5&&text.includes(term)));
}
function plantKey(data,fallback){
  return String(data?.impiantoId||data?.physicalPlantId||data?.idSap||data?.['ID SAP']||'').trim()||N([data?.denominazione,data?.nome,data?.impianto,data?.comune,data?.indirizzo].join('|'))||fallback;
}
function summaryFromWork(records){
  const groups=new Map();
  records.forEach((record,index)=>{
    const data=record.data||record,key=plantKey(data,String(record.sourcePath||record.id||index)),items=groups.get(key)||[];
    items.push(data);groups.set(key,items);
  });
  const total=groups.size,done=[...groups.values()].filter(items=>items.length&&items.every(item=>doneStatus(item.stato||item.status)||item.done===true)).length;
  return{total,done,todo:total-done,workItems:records.length};
}
function summaryFromPlants(plants){
  const unique=new Map();
  plants.forEach((plant,index)=>unique.set(plantKey(plant,String(plant?.vcSourceId||plant?.id||index)),plant));
  const rows=[...unique.values()],done=rows.filter(plant=>plant.done===true||doneStatus(plant.statoGenerale||plant.stato||plant.status)).length;
  return{total:rows.length,done,todo:rows.length-done,workItems:0};
}
function jobSummary(job){
  const works=workRecords(job);
  let count=works.length?summaryFromWork(works):null;
  if(!count){
    const physical=physicalRecords(job);
    count=physical.length?summaryFromPlants(physical.map(record=>record.data||record)):summaryFromPlants(A(database().vcImpianti).filter(plant=>matchesJob(plant,job)&&!plant.vcArchived));
  }
  return{jobId:job.id,title:job.title||job.nome||'Commessa',code:job.code||job.codice||'',family:family(job),...count,progress:count.total?Math.round(count.done/count.total*100):0};
}
function summaries(){
  return A(database().jobs).filter(job=>family(job)).map(jobSummary).sort((a,b)=>a.family.localeCompare(b.family,'it')||a.title.localeCompare(b.title,'it'));
}

async function ensureXlsx(){
  if(root.XLSX)return root.XLSX;
  if(root.__vgPlantXlsxPromise)return root.__vgPlantXlsxPromise;
  root.__vgPlantXlsxPromise=new Promise((resolve,reject)=>{
    if(typeof document==='undefined')return reject(new Error('Esportazione Excel disponibile solo nel browser'));
    const script=document.createElement('script');
    script.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    script.onload=()=>resolve(root.XLSX);
    script.onerror=()=>reject(new Error('Componente Excel non disponibile'));
    document.head.appendChild(script);
  });
  return root.__vgPlantXlsxPromise;
}
async function exportExcel(rows=summaries()){
  const XLSX=await ensureXlsx();
  const totals=rows.reduce((sum,row)=>({total:sum.total+row.total,done:sum.done+row.done,todo:sum.todo+row.todo}),{total:0,done:0,todo:0});
  const progress=totals.total?Math.round(totals.done/totals.total*100):0;
  const data=[
    ['SITUAZIONE IMPIANTI'],
    ['Riepilogo contabilità impianti DEPURAZIONE e INRETE'],
    [],
    ['Impianti totali','FATTI','DA FARE','Avanzamento'],
    [totals.total,totals.done,totals.todo,progress/100],
    [],
    ['Area','Commessa','Codice','Impianti fatti','Impianti da fare','Totale impianti','Avanzamento %'],
    ...rows.map(row=>[row.family,row.title,row.code||'',row.done,row.todo,row.total,row.progress/100])
  ];
  const sheet=XLSX.utils.aoa_to_sheet(data);
  sheet['!cols']=[{wch:16},{wch:34},{wch:22},{wch:16},{wch:18},{wch:17},{wch:17}];
  ['D5','G8'].forEach(()=>{});
  if(sheet.D5)sheet.D5.z='0%';
  for(let index=0;index<rows.length;index++){
    const cell=sheet[`G${8+index}`];
    if(cell)cell.z='0%';
  }
  sheet['!freeze']={xSplit:0,ySplit:7,topLeftCell:'A8',activePane:'bottomLeft',state:'frozen'};
  const workbook=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook,sheet,'Situazione impianti');
  const date=new Date().toISOString().slice(0,10);
  XLSX.writeFile(workbook,`Situazione-impianti-${date}.xlsx`,{compression:true});
}

function ensureStyles(){
  if(typeof document==='undefined'||document.getElementById('vgPlantProgressStyles'))return;
  const style=document.createElement('style');style.id='vgPlantProgressStyles';style.textContent=`
.vg-plant-summary-modal{position:fixed;inset:0;z-index:10120;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(15,23,42,.5)}.vg-plant-summary-modal[hidden]{display:none}.vg-plant-summary-card{width:min(1050px,97vw);max-height:90vh;overflow:auto;padding:20px;border-radius:18px;background:#fff;box-shadow:0 24px 70px rgba(0,0,0,.3)}.vg-plant-summary-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.vg-plant-summary-head h2{margin:0 0 4px}.vg-plant-summary-head p{margin:0;color:#667085}.vg-plant-summary-kpis{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:10px;margin:16px 0}.vg-plant-summary-kpi{padding:12px;border:1px solid #dfe7e2;border-radius:12px;background:#f8fbf9}.vg-plant-summary-kpi span{display:block;color:#667085;font-size:12px}.vg-plant-summary-kpi strong{display:block;margin-top:4px;font-size:22px}.vg-plant-summary-table-wrap{overflow:auto;border:1px solid #dfe7e2;border-radius:12px}.vg-plant-summary-table{width:100%;min-width:760px;border-collapse:collapse}.vg-plant-summary-table th,.vg-plant-summary-table td{padding:11px;border-bottom:1px solid #e6ece8;text-align:left}.vg-plant-summary-table th{background:#eaf4ee;color:#123b2c}.vg-plant-summary-bar{width:150px;height:8px;margin-top:5px;border-radius:99px;background:#e3e8e5;overflow:hidden}.vg-plant-summary-bar span{display:block;height:100%;background:#1d7a51}.vg-plant-summary-actions{display:flex;gap:8px;align-items:center}.vg-plant-summary-export{border:0;border-radius:8px;padding:8px 12px;background:#176b48;color:#fff;font-weight:800;cursor:pointer}.vg-plant-summary-export:disabled{opacity:.6;cursor:wait}.vg-plant-summary-open{border:0;border-radius:8px;padding:8px 11px;background:#176b48;color:#fff;font-weight:800;cursor:pointer}@media(max-width:700px){.vg-plant-summary-kpis{grid-template-columns:1fr 1fr}.vg-plant-summary-head{align-items:center;flex-direction:column}.vg-plant-summary-actions{width:100%;justify-content:flex-end;flex-wrap:wrap}}
  `;document.head.appendChild(style);
}
function close(){const modal=document.getElementById('vgPlantProgressModal');if(modal)modal.hidden=true}
function show(){
  ensureStyles();let modal=document.getElementById('vgPlantProgressModal');
  if(!modal){modal=document.createElement('div');modal.id='vgPlantProgressModal';modal.className='vg-plant-summary-modal';modal.hidden=true;document.body.appendChild(modal);modal.onclick=event=>{if(event.target===modal)close()}}
  const rows=summaries(),totals=rows.reduce((sum,row)=>({total:sum.total+row.total,done:sum.done+row.done,todo:sum.todo+row.todo}),{total:0,done:0,todo:0}),progress=totals.total?Math.round(totals.done/totals.total*100):0;
  modal.innerHTML=`<section class="vg-plant-summary-card"><div class="vg-plant-summary-head"><div><h2>Situazione impianti</h2><p>Riepilogo per commessa della contabilità impianti DEPURAZIONE e INRETE.</p></div><div class="vg-plant-summary-actions"><button class="vg-plant-summary-export" type="button" data-plant-summary-export>⬇ ESPORTA EXCEL</button><button class="ghost" type="button" data-plant-summary-close>CHIUDI</button></div></div><div class="vg-plant-summary-kpis"><div class="vg-plant-summary-kpi"><span>Impianti totali</span><strong>${totals.total}</strong></div><div class="vg-plant-summary-kpi"><span>FATTI</span><strong>${totals.done}</strong></div><div class="vg-plant-summary-kpi"><span>DA FARE</span><strong>${totals.todo}</strong></div><div class="vg-plant-summary-kpi"><span>Avanzamento</span><strong>${progress}%</strong></div></div>${rows.length?`<div class="vg-plant-summary-table-wrap"><table class="vg-plant-summary-table"><thead><tr><th>Area</th><th>Commessa</th><th>Fatti</th><th>Da fare</th><th>Totale</th><th>Avanzamento</th><th></th></tr></thead><tbody>${rows.map(row=>`<tr><td><b>${E(row.family)}</b></td><td><b>${E(row.title)}</b><div class="muted">${E(row.code||'Codice non assegnato')}</div></td><td>${row.done}</td><td>${row.todo}</td><td>${row.total}</td><td><b>${row.progress}%</b><div class="vg-plant-summary-bar"><span style="width:${row.progress}%"></span></div></td><td><button class="vg-plant-summary-open" type="button" data-plant-summary-job="${E(row.jobId)}">APRI</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="vg-empty">Nessuna commessa DEPURAZIONE o INRETE trovata.</div>'}</section>`;
  modal.querySelector('[data-plant-summary-close]').onclick=close;
  const exportButton=modal.querySelector('[data-plant-summary-export]');
  exportButton.onclick=async()=>{
    const oldText=exportButton.textContent;
    exportButton.disabled=true;exportButton.textContent='CREAZIONE EXCEL...';
    try{await exportExcel(rows)}catch(error){console.error(error);root.alert?.('Impossibile creare il file Excel. Controlla la connessione e riprova.')}finally{exportButton.disabled=false;exportButton.textContent=oldText}
  };
  modal.querySelectorAll('[data-plant-summary-job]').forEach(button=>button.onclick=()=>{close();root.VargaOpenJob?.(button.dataset.plantSummaryJob)});
  modal.hidden=false;
}
function makeButton(){const button=document.createElement('button');button.type='button';button.className='ghost';button.dataset.plantProgressSummary='';button.textContent='SITUAZIONE IMPIANTI';button.onclick=show;return button}
function installButtons(){
  if(typeof document==='undefined')return;
  const allJobs=document.querySelector('#vgDashboardJobs [data-go-jobs]');if(allJobs&&!allJobs.parentElement.querySelector('[data-plant-progress-summary]'))allJobs.before(makeButton());
  const newJob=document.getElementById('toggleJobsForm');if(newJob&&!newJob.parentElement.querySelector('[data-plant-progress-summary]'))newJob.before(makeButton());
}
if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installButtons);else installButtons();
  const observer=new MutationObserver(()=>{clearTimeout(observer._timer);observer._timer=setTimeout(installButtons,30)});observer.observe(document.documentElement,{childList:true,subtree:true});
}
root.VargaPlantProgressSummary={family,jobSummary,summaries,show,exportExcel};
})(globalThis);
