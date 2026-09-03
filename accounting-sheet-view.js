/* Vista foglio contabile completo per commessa Varga Cantieri. */
(function(){
  'use strict';

  const accountingState={jobId:'',query:''};
  const clean=v=>String(v??'').trim();
  const n=v=>{
    if(v===''||v==null)return null;
    if(typeof v==='number')return Number.isFinite(v)?v:null;
    let s=String(v).trim().replace(/\s/g,'').replace(/€/g,'');
    if(!s)return null;
    const comma=s.lastIndexOf(','),dot=s.lastIndexOf('.');
    if(comma>=0&&dot>=0){
      if(comma>dot)s=s.replace(/\./g,'').replace(',','.');
      else s=s.replace(/,/g,'');
    }else if(comma>=0){
      s=s.replace(/\./g,'').replace(',','.');
    }else if(dot>=0){
      const decimals=s.length-dot-1;
      if(decimals>2)s=s.replace(/\./g,'');
    }
    const x=Number(s);return Number.isFinite(x)?x:null;
  };
  const money=v=>{const x=n(v);return x==null?'':new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(x)};
  const normLocal=v=>clean(v).toLocaleLowerCase('it').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const first=(o,names)=>{for(const name of names){const key=Object.keys(o||{}).find(k=>normLocal(k)===normLocal(name));if(key!=null&&o[key]!=null&&clean(o[key])!=='')return o[key]}return''};
  const escLocal=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function commessaPath(job){return clean(job?.vcSourceId)||clean(job?.sourcePath)||''}
  function isWorkRecord(r,path){const p=clean(r?.sourcePath);return !!path&&p.startsWith(path+'/lavorazioni/')}
  function workRows(job){const path=commessaPath(job);return (db.vcRecords||[]).filter(r=>isWorkRecord(r,path)).map(r=>({...(r.data||{}),_sourcePath:r.sourcePath,_id:r.id||''}));}
  function jobsWithAccounting(){return (db.jobs||[]).filter(j=>commessaPath(j)).slice().sort((a,b)=>clean(a.title).localeCompare(clean(b.title),'it',{sensitivity:'base'}));}
  function rowModel(r,index){
    return {
      progressivo:first(r,['numeroProgressivoRiga','N.','numeroProgressivo'])||index+1,
      distretto:first(r,['distretto','Distretto']),idSap:first(r,['idSap','ID SAP','sap']),impianto:first(r,['denominazione','Denominazione Impianto','impianto','nome']),
      comune:first(r,['comune','Comune ubicazione Impianto']),indirizzo:first(r,['indirizzo','Via e civico di ubicazione Impianto','via']),codice:first(r,['codiceVocePrezzo','Voce di Riferimento Elenco Prezzi','codicePrezzo']),
      quantita:first(r,['quantita','Quantità','qta']),frequenza:first(r,['frequenzaAnnua','Frequenza annua minima']),lavorazione:first(r,['tipologiaLavorazione','Tipologia di lavorazione / sfalcio','lavorazione']),um:first(r,['unitaMisura','u.m.','um']),
      prezzoBase:first(r,['prezzoBase','Unitario Base d’asta','prezzo base']),prezzoRibassato:first(r,['prezzoRibassato','RIBASSO / Prezzo unitario ribassato','prezzo ribassato']),totale:first(r,['totale','Totali','importo']),
      data:first(r,['dataEsecuzione','Data esecuzione','data']),ora:first(r,['oraEsecuzione','Ora esecuzione','ora']),operatore:first(r,['operatoreNome','Operatore','operatore']),note:first(r,['note','Note']),stato:first(r,['stato','Stato'])
    };
  }
  const textForSearch=m=>normLocal(Object.values(m).join(' '));

  function exportSelectedCsv(){
    const job=(db.jobs||[]).find(j=>j.id===accountingState.jobId);if(!job)return;
    const rows=workRows(job).map(rowModel),headers=['N.','Distretto','ID SAP','Denominazione Impianto','Comune','Via e civico','Voce Elenco Prezzi','Quantità','Frequenza annua minima','Tipologia lavorazione','U.M.','Prezzo base','Prezzo ribassato','Totale','Data esecuzione','Ora esecuzione','Operatore','Note','Stato'],fields=['progressivo','distretto','idSap','impianto','comune','indirizzo','codice','quantita','frequenza','lavorazione','um','prezzoBase','prezzoRibassato','totale','data','ora','operatore','note','stato'];
    const out=[headers,...rows.map(r=>fields.map(k=>r[k]))].map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+out],{type:'text/csv;charset=utf-8'}));a.download=`Contabilita-${clean(job.title).replace(/[^a-z0-9_-]+/gi,'-')||'commessa'}.csv`;a.click();URL.revokeObjectURL(a.href);
  }

  function renderAccountingSheet(){
    const section=document.getElementById('consuntivi');if(!section)return;
    if(!section.dataset.accountingSheetReady){
      section.dataset.accountingSheetReady='1';section.innerHTML=`<div class="topline"><div><h1>Contabilità per commessa</h1><p class="subtitle">Seleziona una commessa e visualizza il foglio contabile completo collegato in Gestione Commesse.</p></div></div><div class="panel accounting-picker"><label>COMMESSA<select id="accountingJobSelect"></select></label><input id="accountingSearch" placeholder="Cerca nel foglio: impianto, ID SAP, comune, voce, operatore..."><button id="accountingExport" class="ghost">ESPORTA FOGLIO CSV</button></div><div id="accountingSummary" class="cards"></div><div class="panel accounting-sheet-panel"><div id="accountingSheet"></div></div>`;
      const style=document.createElement('style');style.textContent=`.accounting-picker{display:grid;grid-template-columns:minmax(260px,1fr) minmax(260px,1fr) auto;gap:10px;align-items:end}.accounting-picker label{margin:0}.accounting-picker select,.accounting-picker input{width:100%}.accounting-sheet-panel{padding:0;overflow:hidden}.accounting-table-wrap{overflow:auto;max-height:calc(100vh - 285px)}.accounting-table{border-collapse:separate;border-spacing:0;width:max-content;min-width:100%;font-size:12px}.accounting-table th,.accounting-table td{padding:8px 9px;border-right:1px solid #dfe7e2;border-bottom:1px solid #dfe7e2;vertical-align:top;white-space:nowrap;background:#fff}.accounting-table th{position:sticky;top:0;z-index:3;background:#eef5f1;font-weight:800;color:#123b2c;text-align:left}.accounting-table th:first-child,.accounting-table td:first-child{position:sticky;left:0;z-index:2;background:#f8fbf9}.accounting-table th:first-child{z-index:4;background:#e8f2ec}.accounting-table tr.done td{background:#f4faf6}.accounting-table tr.done td:first-child{background:#edf7f0}.accounting-state{font-weight:800}.accounting-empty{padding:28px;text-align:center;color:#64736b}@media(max-width:900px){.accounting-picker{grid-template-columns:1fr}.accounting-table-wrap{max-height:calc(100vh - 380px)}}`;document.head.appendChild(style);
      section.querySelector('#accountingJobSelect').addEventListener('change',e=>{accountingState.jobId=e.target.value;renderAccountingSheet()});section.querySelector('#accountingSearch').addEventListener('input',e=>{accountingState.query=e.target.value;renderAccountingSheet()});section.querySelector('#accountingExport').addEventListener('click',exportSelectedCsv);
    }
    const jobs=jobsWithAccounting();if(!accountingState.jobId||!jobs.some(j=>j.id===accountingState.jobId))accountingState.jobId=jobs[0]?.id||'';const select=section.querySelector('#accountingJobSelect'),current=accountingState.jobId;select.innerHTML=jobs.length?jobs.map(j=>`<option value="${escLocal(j.id)}" ${j.id===current?'selected':''}>${escLocal(j.title||'Commessa')} ${j.code?'— '+escLocal(j.code):''}</option>`).join(''):'<option value="">Nessuna commessa disponibile</option>';section.querySelector('#accountingSearch').value=accountingState.query;
    const job=jobs.find(j=>j.id===current),models=job?workRows(job).map(rowModel):[],q=normLocal(accountingState.query),rows=q?models.filter(r=>textForSearch(r).includes(q)):models,done=models.filter(r=>normLocal(r.stato)==='fatto').length,totalDone=models.filter(r=>normLocal(r.stato)==='fatto').reduce((sum,r)=>sum+(n(r.totale)||0),0);
    section.querySelector('#accountingSummary').innerHTML=job?`<div class="card"><span>Commessa</span><strong class="small">${escLocal(job.title||'')}</strong></div><div class="card"><span>Righe contabili</span><strong>${models.length}</strong></div><div class="card"><span>FATTO</span><strong>${done}</strong></div><div class="card"><span>Totale FATTO</span><strong class="small">${money(totalDone)}</strong></div>`:'';
    const target=section.querySelector('#accountingSheet');if(!job){target.innerHTML='<div class="accounting-empty">Nessuna commessa collegata.</div>';return}if(!models.length){target.innerHTML=`<div class="accounting-empty">Nessuna riga trovata in <strong>${escLocal(commessaPath(job))}/lavorazioni</strong>.</div>`;return}
    const cols=[['progressivo','N.'],['distretto','Distretto'],['idSap','ID SAP'],['impianto','Denominazione Impianto'],['comune','Comune'],['indirizzo','Via e civico'],['codice','Voce Elenco Prezzi'],['quantita','Quantità'],['frequenza','Freq. annua'],['lavorazione','Tipologia lavorazione'],['um','U.M.'],['prezzoBase','Prezzo base'],['prezzoRibassato','Prezzo ribassato'],['totale','Totale'],['data','Data esecuzione'],['ora','Ora'],['operatore','Operatore'],['note','Note'],['stato','Stato']],moneyKeys=new Set(['prezzoBase','prezzoRibassato','totale']);
    target.innerHTML=`<div class="accounting-table-wrap"><table class="accounting-table"><thead><tr>${cols.map(([,label])=>`<th>${label}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr class="${normLocal(r.stato)==='fatto'?'done':''}">${cols.map(([key])=>`<td${key==='stato'?' class="accounting-state"':''}>${escLocal(moneyKeys.has(key)?money(r[key]):r[key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${rows.length?'':'<div class="accounting-empty">Nessuna riga corrisponde alla ricerca.</div>'}`;
  }
  const originalRefresh=window.refresh;if(typeof originalRefresh==='function')window.refresh=function(){originalRefresh.apply(this,arguments);renderAccountingSheet()};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',renderAccountingSheet);else renderAccountingSheet();
})();