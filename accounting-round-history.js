/* Storico giri contabili archiviati da Varga Cantieri. */
(function(){
  'use strict';
  const clean=v=>String(v??'').trim();
  const norm=v=>clean(v).toLocaleLowerCase('it').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const euro=v=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(Number(v)||0);

  function roundHeaders(){
    return (db.vcRecords||[]).filter(r=>/^commesse\/[^/]+\/giriContabili\/[^/]+$/.test(clean(r.sourcePath))).map(r=>({...(r.data||{}),_sourcePath:r.sourcePath,_roundId:r.id||clean(r.sourcePath).split('/').pop(),_commessaId:clean(r.sourcePath).split('/')[1]})).sort((a,b)=>(Number(b.numeroGiro)||0)-(Number(a.numeroGiro)||0));
  }
  function roundRows(round){
    const prefix=`${round._sourcePath}/lavorazioni/`;
    return (db.vcRecords||[]).filter(r=>clean(r.sourcePath).startsWith(prefix)).map(r=>({...(r.data||{}),_sourcePath:r.sourcePath}));
  }
  function first(o,names){for(const name of names){const k=Object.keys(o||{}).find(key=>norm(key)===norm(name));if(k&&o[k]!=null&&clean(o[k])!=='')return o[k]}return''}
  function rowModel(r){return{idSap:first(r,['idSap','ID SAP']),impianto:first(r,['denominazione','Denominazione Impianto','impianto','nome']),comune:first(r,['comune']),lavorazione:first(r,['tipologiaLavorazione','lavorazione']),quantita:first(r,['quantita','Quantità']),um:first(r,['unitaMisura','um']),prezzo:first(r,['prezzoRibassato','prezzoBase']),totale:first(r,['totale','importo']),data:first(r,['dataEsecuzione','data']),operatore:first(r,['operatoreNome','operatore']),note:first(r,['note']),stato:first(r,['stato'])}}
  const doneRows=round=>roundRows(round).map(rowModel).filter(r=>norm(r.stato)==='fatto');
  function dateOnly(value){const d=new Date(value||Date.now());return Number.isNaN(d.getTime())?'':d.toLocaleDateString('it-IT')}
  function safeName(v){return clean(v).replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,' ').trim()||'Commessa'}

  function calendarUrl(title,date,details){
    const d=new Date(date||Date.now());if(Number.isNaN(d.getTime()))return'#';
    const start=new Date(d);start.setHours(9,0,0,0);const end=new Date(start);end.setHours(10,0,0,0);
    const fmt=x=>x.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text='+encodeURIComponent(title)+'&dates='+fmt(start)+'%2F'+fmt(end)+'&details='+encodeURIComponent(details||'')+'&sf=true&output=xml';
  }

  async function updateRound(round,patch){
    if(typeof cloudStore==='undefined'||!cloudStore)throw Error('Firebase non disponibile. Accedi al Cloud.');
    await cloudStore.doc(round._sourcePath).set({...patch,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
    Object.assign(round,patch);
    const raw=(db.vcRecords||[]).find(r=>r.sourcePath===round._sourcePath);if(raw)Object.assign(raw.data||(raw.data={}),patch);
    if(typeof save==='function')save();
  }
  async function markAccountingSent(round){
    if(!confirm(`Confermi che la contabilità del Giro ${round.numeroGiro} è stata inviata?`))return;
    const now=new Date(),mapDue=new Date(now);mapDue.setDate(mapDue.getDate()+Number(round.mapReminderDays||7));
    await updateRound(round,{stato:'MAP_IN_ATTESA',accountingSentAt:now.toISOString(),mapStatus:'NON_RICEVUTO',mapDueAt:mapDue.toISOString()});
    renderRounds();
  }
  async function markMapReceived(round){
    const ref=prompt('Riferimento MAP (facoltativo):',round.mapReference||'');if(ref===null)return;
    await updateRound(round,{stato:'CHIUSO_DEFINITIVAMENTE',mapStatus:'RICEVUTO',mapReceivedAt:new Date().toISOString(),mapReference:ref});
    renderRounds();
  }

  function clientHtml(round,rows){
    const company=db.company||{},total=rows.reduce((s,r)=>s+(Number(r.totale)||0),0),companyName=company.name||'VARGA GESTIONALE';
    return `<!doctype html><html><head><meta charset="utf-8"><title>Contabilità ${esc(round.commessaNome)}</title><style>body{font-family:Arial,sans-serif;color:#17231d;margin:28px}h1{margin:0;color:#123b2c}.meta{margin:18px 0;padding:14px;border:1px solid #cbd9d1}table{border-collapse:collapse;width:100%;font-size:11px}th,td{border:1px solid #d6dfda;padding:6px;text-align:left}th{background:#123b2c;color:#fff}.num{text-align:right}.total{font-size:18px;font-weight:700;text-align:right;margin-top:16px}@media print{body{margin:8mm}}</style></head><body><h1>${esc(companyName)}</h1><div>${esc(company.address||'')} ${esc(company.city||'')}</div><div class="meta"><strong>CONTABILITÀ LAVORI ESEGUITI</strong><br>Cliente / Commessa: ${esc(round.commessaNome||'')}<br>Codice: ${esc(round.codiceCommessa||'')}<br>Giro: ${esc(round.numeroGiro||'')}<br>Chiuso il: ${esc(dateOnly(round.closedAtIso||round.closedAt))}</div><table><thead><tr><th>ID SAP</th><th>Impianto</th><th>Comune</th><th>Lavorazione</th><th>Q.tà</th><th>U.M.</th><th>Prezzo</th><th>Totale</th><th>Data</th><th>Note</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.idSap)}</td><td>${esc(r.impianto)}</td><td>${esc(r.comune)}</td><td>${esc(r.lavorazione)}</td><td>${esc(r.quantita)}</td><td>${esc(r.um)}</td><td class="num">${euro(r.prezzo)}</td><td class="num">${euro(r.totale)}</td><td>${esc(r.data)}</td><td>${esc(r.note)}</td></tr>`).join('')}</tbody></table><div class="total">TOTALE LAVORI ESEGUITI: ${euro(total)}</div></body></html>`;
  }
  function csv(round,rows){
    const headers=['ID SAP','Impianto','Comune','Lavorazione','Quantità','U.M.','Prezzo','Totale','Data','Operatore','Note'];
    const values=rows.map(r=>[r.idSap,r.impianto,r.comune,r.lavorazione,r.quantita,r.um,r.prezzo,r.totale,r.data,r.operatore,r.note]);
    return '\ufeff'+[headers,...values].map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\n');
  }
  async function writeTextFile(dir,name,text,type='text/plain'){
    const f=await dir.getFileHandle(name,{create:true}),w=await f.createWritable();await w.write(new Blob([text],{type}));await w.close();
  }
  async function archiveFolder(round){
    if(!window.showDirectoryPicker)throw Error('Usa Chrome o Edge su PC per il salvataggio automatico in cartella.');
    let root=null;
    try{if(typeof getHandle==='function')root=await getHandle()}catch(_){ }
    if(!root)root=await showDirectoryPicker({mode:'readwrite'});
    let perm=await root.queryPermission({mode:'readwrite'});if(perm!=='granted')perm=await root.requestPermission({mode:'readwrite'});if(perm!=='granted')throw Error('Permesso cartella non concesso.');
    const main=await root.getDirectoryHandle('Varga Gestionale',{create:true});const accounting=await main.getDirectoryHandle('Contabilita',{create:true});const job=await accounting.getDirectoryHandle(safeName(round.commessaNome),{create:true});const giro=await job.getDirectoryHandle(`Giro-${String(round.numeroGiro||0).padStart(2,'0')}`,{create:true});
    const rows=doneRows(round),base=`Contabilita-${safeName(round.commessaNome)}-Giro-${String(round.numeroGiro||0).padStart(2,'0')}`;
    await writeTextFile(giro,base+'.html',clientHtml(round,rows),'text/html;charset=utf-8');
    await writeTextFile(giro,base+'.csv',csv(round,rows),'text/csv;charset=utf-8');
    await writeTextFile(giro,'Archivio-giro.json',JSON.stringify({round,rows:roundRows(round)},null,2),'application/json');
    await updateRound(round,{localArchiveSavedAt:new Date().toISOString(),localArchiveFolder:`Varga Gestionale/Contabilita/${safeName(round.commessaNome)}/Giro-${String(round.numeroGiro||0).padStart(2,'0')}`});
    alert('Giro archiviato nella cartella scelta. Se la cartella è dentro Google Drive per desktop, verrà sincronizzato automaticamente anche su Drive.');
    renderRounds();
  }

  function ensurePanel(){
    const section=document.getElementById('consuntivi');if(!section||document.getElementById('accountingRoundsPanel'))return;
    const panel=document.createElement('div');panel.id='accountingRoundsPanel';panel.className='panel';panel.style.marginBottom='14px';
    const anchor=section.querySelector('.accounting-picker')||section.firstElementChild;anchor?.insertAdjacentElement('afterend',panel);
    panel.addEventListener('click',async e=>{const b=e.target.closest('button[data-round-action]');if(!b)return;const round=roundHeaders().find(r=>r._sourcePath===b.dataset.path);if(!round)return;try{b.disabled=true;if(b.dataset.roundAction==='sent')await markAccountingSent(round);if(b.dataset.roundAction==='map')await markMapReceived(round);if(b.dataset.roundAction==='folder')await archiveFolder(round);}catch(err){alert(err.message||err)}finally{b.disabled=false}});
  }
  function renderRounds(){
    ensurePanel();const panel=document.getElementById('accountingRoundsPanel');if(!panel)return;const rounds=roundHeaders();
    if(!rounds.length){panel.innerHTML='<h3>Giri contabili</h3><p class="muted">Nessun giro archiviato. In Varga Cantieri usa “Chiudi giro e archivia” prima di svuotare la commessa.</p>';return}
    panel.innerHTML=`<h3 style="margin-top:0">Giri contabili archiviati</h3><p class="muted">Ogni giro resta separato anche quando la commessa viene svuotata e riutilizzata.</p><div style="display:grid;gap:9px">${rounds.map(r=>{const sent=!!r.accountingSentAt,map=norm(r.mapStatus)==='ricevuto',accCal=calendarUrl(`Inviare contabilità - ${r.commessaNome} - Giro ${r.numeroGiro}`,r.accountingDueAt,`Varga Gestionale: inviare la contabilità del Giro ${r.numeroGiro} della commessa ${r.commessaNome}.`),mapCal=calendarUrl(`Controllare MAP - ${r.commessaNome} - Giro ${r.numeroGiro}`,r.mapDueAt||r.accountingDueAt,`Verificare se è stato ricevuto il MAP relativo alla contabilità del Giro ${r.numeroGiro} - ${r.commessaNome}.`);return `<div style="border:1px solid #d9e3dd;border-radius:10px;padding:11px"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><strong>${esc(r.commessaNome)} — Giro ${esc(r.numeroGiro)}</strong><div class="muted">${esc(dateOnly(r.closedAtIso||r.closedAt))} · ${esc(r.doneRows||0)} FATTO · ${euro(r.totalAmount)}</div><div><b>${esc((r.stato||'CONTABILITA_DA_INVIARE').replaceAll('_',' '))}</b>${r.localArchiveSavedAt?' · 📁 archiviato':''}</div></div><div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center"><button class="ghost" data-round-action="folder" data-path="${esc(r._sourcePath)}">📁 ARCHIVIA CARTELLA</button>${!sent?`<button class="ghost" data-round-action="sent" data-path="${esc(r._sourcePath)}">CONTABILITÀ INVIATA</button><a class="ghost" target="_blank" rel="noopener" href="${esc(accCal)}">📅 PROMEMORIA CONTABILITÀ</a>`:''}${sent&&!map?`<button class="ghost" data-round-action="map" data-path="${esc(r._sourcePath)}">MAP RICEVUTO</button><a class="ghost" target="_blank" rel="noopener" href="${esc(mapCal)}">📅 PROMEMORIA MAP</a>`:''}${map?'<span>✅ Chiuso</span>':''}</div></div></div>`}).join('')}</div>`;
  }
  const observer=new MutationObserver(()=>{if(document.getElementById('consuntivi'))renderRounds()});observer.observe(document.body,{childList:true,subtree:true});
  window.addEventListener('hashchange',()=>setTimeout(renderRounds,50));setTimeout(renderRounds,250);
})();
