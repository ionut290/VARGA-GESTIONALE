// Modulo Rapportini di lavoro - Varga Gestionale
(function(){
  if(typeof db==='undefined'||typeof S==='undefined') return;
  db.rapportini=S.get('vg_rapportini',[]);

  // Integra i rapportini nel salvataggio locale e nello snapshot cloud senza toccare il core.
  if(typeof save==='function'&&!save.__rapportiniPatched){
    const baseSave=save;
    save=function(opts={}){S.set('vg_rapportini',db.rapportini);return baseSave(opts)};
    save.__rapportiniPatched=true;
  }
  if(typeof cloudState==='function'&&!cloudState.__rapportiniPatched){
    const baseCloudState=cloudState;
    cloudState=function(){return Object.assign({},baseCloudState(),{rapportini:db.rapportini})};
    cloudState.__rapportiniPatched=true;
  }

  function E(s){return typeof esc==='function'?esc(s):String(s??'')}
  function today(){return new Date().toISOString().slice(0,10)}
  function nextNumber(){
    const year=new Date().getFullYear();
    const nums=db.rapportini.filter(r=>String(r.date||'').startsWith(String(year))).map(r=>Number(String(r.number||'').replace(/\D/g,''))).filter(Number.isFinite);
    return String((nums.length?Math.max(...nums):0)+1).padStart(5,'0');
  }
  function unique(a){return [...new Set(a.filter(Boolean))]}

  const navBtn=document.createElement('button');
  navBtn.className='nav'; navBtn.dataset.view='rapportini'; navBtn.textContent='Rapportini di lavoro';
  const sidebar=document.querySelector('.sidebar');
  const anchor=[...document.querySelectorAll('.nav')].find(x=>x.dataset.view==='consuntivi');
  if(sidebar) sidebar.insertBefore(navBtn,anchor||null);

  const section=document.createElement('section');
  section.id='rapportini'; section.className='view';
  section.innerHTML=`
    <div class="topline"><div><h1>Rapportini di lavoro</h1><p class="subtitle">Compila, firma e genera il PDF nello stesso schema del rapportino cartaceo.</p></div><button class="primary" id="rpNew">+ NUOVO RAPPORTINO</button></div>
    <div class="cards five"><div class="card"><span>Totali</span><strong id="rpKTotal">0</strong></div><div class="card"><span>Bozze</span><strong id="rpKDraft">0</strong></div><div class="card"><span>Da firmare</span><strong id="rpKSign">0</strong></div><div class="card"><span>Completati</span><strong id="rpKDone">0</strong></div><div class="card"><span>Questo mese</span><strong id="rpKMonth">0</strong></div></div>
    <div class="panel"><h2>Compilazione</h2><div class="formgrid">
      <label>Numero<input id="rpNumber" readonly></label><label>Data<input id="rpDate" type="date"></label>
      <label>Cliente<select id="rpClient"></select></label><label>Commessa<select id="rpJob"></select></label>
      <label>Cantiere / luogo<input id="rpSite" placeholder="Es. HERA Via del Frullo"></label><label>Tipologia intervento<select id="rpType"><option>Manutenzione ordinaria</option><option>Manutenzione straordinaria</option></select></label>
      <label>N. operai squadra<input id="rpWorkers" type="number" min="0" value="0"></label><label>Ore squadra<input id="rpTeamHours" type="number" step="0.25" min="0"></label>
      <label>Inizio lavori<input id="rpStart" type="time"></label><label>Fine lavori<input id="rpEnd" type="time"></label>
    </div>
    <label>Descrizione lavori<textarea id="rpDescription" rows="5" placeholder="Descrizione delle lavorazioni eseguite..."></textarea></label>
    <div class="actions left"><button class="ghost" id="rpPrefill">PRECOMPILA DA VARGA CANTIERI</button></div></div>
    <div class="grid2">
      <div class="panel"><h2>Materiali d'uso</h2><textarea id="rpMaterials" rows="7" placeholder="Una riga per materiale, es. Terriccio | 3 sacchi"></textarea></div>
      <div class="panel"><h2>Mezzi con operatore</h2><textarea id="rpVehicles" rows="7" placeholder="Una riga per mezzo, es. Trattrice 60 HP con trinciatore | 4 ore"></textarea></div>
    </div>
    <div class="grid2">
      <div class="panel"><h2>Firma / timbro cliente</h2><input id="rpClientSignName" placeholder="Nome firmatario"><canvas id="rpClientSign" class="rp-sign" width="600" height="150"></canvas><button class="mini" id="rpClearClientSign">CANCELLA FIRMA</button></div>
      <div class="panel"><h2>Firma capo squadra</h2><input id="rpLeaderSignName" placeholder="Nome capo squadra"><canvas id="rpLeaderSign" class="rp-sign" width="600" height="150"></canvas><button class="mini" id="rpClearLeaderSign">CANCELLA FIRMA</button></div>
    </div>
    <div class="panel"><label>Note<textarea id="rpNotes" rows="3"></textarea></label><div class="actions"><button class="ghost" id="rpSaveDraft">SALVA BOZZA</button><button class="ghost" id="rpSaveSigned">SALVA DA FIRMARE</button><button class="primary" id="rpComplete">COMPLETA E GENERA PDF</button></div></div>
    <div class="panel"><div class="inline"><input id="rpSearch" placeholder="Cerca numero, cliente, commessa, cantiere..."><select id="rpStatusFilter"><option value="">Tutti gli stati</option><option>Bozza</option><option>Da firmare</option><option>Completato</option></select></div><div id="rpList" class="list" style="margin-top:12px"></div></div>`;
  document.querySelector('.main')?.appendChild(section);

  const st=document.createElement('style');
  st.textContent=`.rp-sign{width:100%;height:150px;border:1px solid #cfd5dc;border-radius:8px;background:white;touch-action:none;display:block;margin:10px 0}.rp-doc-actions{display:flex;gap:6px;flex-wrap:wrap}.rp-a4{font-family:Arial,sans-serif;color:#222}`;
  document.head.appendChild(st);

  navBtn.onclick=()=>nav('rapportini');

  function setupCanvas(id){
    const c=document.getElementById(id),ctx=c.getContext('2d');let drawing=false;
    function pos(ev){const r=c.getBoundingClientRect(),p=ev.touches?.[0]||ev;return{x:(p.clientX-r.left)*c.width/r.width,y:(p.clientY-r.top)*c.height/r.height}}
    function start(ev){drawing=true;const p=pos(ev);ctx.beginPath();ctx.moveTo(p.x,p.y);ev.preventDefault()}
    function move(ev){if(!drawing)return;const p=pos(ev);ctx.lineWidth=2;ctx.lineCap='round';ctx.lineTo(p.x,p.y);ctx.stroke();ev.preventDefault()}
    function end(){drawing=false}
    c.addEventListener('pointerdown',start);c.addEventListener('pointermove',move);window.addEventListener('pointerup',end);
    return {clear(){ctx.clearRect(0,0,c.width,c.height)},data(){try{return c.toDataURL('image/png')}catch{return''}},load(src){this.clear();if(!src)return;const im=new Image();im.onload=()=>ctx.drawImage(im,0,0,c.width,c.height);im.src=src}};
  }
  const sigClient=setupCanvas('rpClientSign'),sigLeader=setupCanvas('rpLeaderSign');
  document.getElementById('rpClearClientSign').onclick=()=>sigClient.clear();
  document.getElementById('rpClearLeaderSign').onclick=()=>sigLeader.clear();

  let editingId=null;
  function fillSelects(){
    const c=document.getElementById('rpClient'),j=document.getElementById('rpJob');
    const cv=c.value,jv=j.value;
    c.innerHTML='<option value="">Seleziona cliente</option>'+db.clients.map(x=>`<option value="${E(x.id)}">${E(x.name)}</option>`).join('');
    j.innerHTML='<option value="">Seleziona commessa</option>'+db.jobs.map(x=>`<option value="${E(x.id)}">${E((x.code?x.code+' - ':'')+x.title)}</option>`).join('');
    c.value=cv;j.value=jv;
  }
  function clearForm(){editingId=null;document.getElementById('rpNumber').value=nextNumber();document.getElementById('rpDate').value=today();document.getElementById('rpClient').value='';document.getElementById('rpJob').value='';for(const id of ['rpSite','rpTeamHours','rpStart','rpEnd','rpDescription','rpMaterials','rpVehicles','rpClientSignName','rpLeaderSignName','rpNotes'])document.getElementById(id).value='';document.getElementById('rpWorkers').value=0;document.getElementById('rpType').value='Manutenzione ordinaria';sigClient.clear();sigLeader.clear()}
  function formData(status){
    const clientId=document.getElementById('rpClient').value,jobId=document.getElementById('rpJob').value;
    return{id:editingId||uid(),number:document.getElementById('rpNumber').value||nextNumber(),date:document.getElementById('rpDate').value||today(),clientId,clientName:db.clients.find(x=>x.id===clientId)?.name||'',jobId,jobName:db.jobs.find(x=>x.id===jobId)?.title||'',jobCode:db.jobs.find(x=>x.id===jobId)?.code||'',site:document.getElementById('rpSite').value.trim(),type:document.getElementById('rpType').value,workers:Number(document.getElementById('rpWorkers').value||0),teamHours:Number(document.getElementById('rpTeamHours').value||0),start:document.getElementById('rpStart').value,end:document.getElementById('rpEnd').value,description:document.getElementById('rpDescription').value.trim(),materials:document.getElementById('rpMaterials').value.trim(),vehicles:document.getElementById('rpVehicles').value.trim(),clientSignName:document.getElementById('rpClientSignName').value.trim(),leaderSignName:document.getElementById('rpLeaderSignName').value.trim(),clientSignature:sigClient.data(),leaderSignature:sigLeader.data(),notes:document.getElementById('rpNotes').value.trim(),status,updatedAt:new Date().toISOString()};
  }
  function store(status,makePdf=false){
    const r=formData(status);const i=db.rapportini.findIndex(x=>x.id===r.id);if(i>=0)db.rapportini[i]=r;else db.rapportini.push(r);editingId=r.id;save();render();if(makePdf)printReport(r);else alert('Rapportino salvato.')
  }
  function edit(id){const r=db.rapportini.find(x=>x.id===id);if(!r)return;editingId=id;fillSelects();const map={rpNumber:r.number,rpDate:r.date,rpClient:r.clientId,rpJob:r.jobId,rpSite:r.site,rpType:r.type,rpWorkers:r.workers,rpTeamHours:r.teamHours,rpStart:r.start,rpEnd:r.end,rpDescription:r.description,rpMaterials:r.materials,rpVehicles:r.vehicles,rpClientSignName:r.clientSignName,rpLeaderSignName:r.leaderSignName,rpNotes:r.notes};Object.entries(map).forEach(([k,v])=>document.getElementById(k).value=v??'');sigClient.load(r.clientSignature);sigLeader.load(r.leaderSignature);nav('rapportini');window.scrollTo({top:0,behavior:'smooth'})}
  function remove(id){if(!confirm('Eliminare questo rapportino?'))return;db.rapportini=db.rapportini.filter(x=>x.id!==id);save();render();if(editingId===id)clearForm()}
  function prefill(){
    const jobId=document.getElementById('rpJob').value,job=db.jobs.find(x=>x.id===jobId);if(!job)return alert('Seleziona prima una commessa.');
    const terms=unique([job.title,job.code]).map(x=>String(x).toLowerCase());
    const rows=(db.consuntivi||[]).filter(x=>terms.some(t=>t&&[x.commessa,x.codiceCommessa].some(v=>String(v||'').toLowerCase().includes(t))));
    if(!rows.length)return alert('Non trovo attività Varga Cantieri collegate a questa commessa.');
    const latest=rows.sort((a,b)=>String(a.data||'').localeCompare(String(b.data||''))).slice(-30);
    document.getElementById('rpDescription').value=unique(latest.map(x=>[x.impianto,x.lavorazione].filter(Boolean).join(' — '))).join('\n');
    const ops=unique(latest.map(x=>x.operatore));document.getElementById('rpWorkers').value=ops.length;
    document.getElementById('rpTeamHours').value=latest.reduce((s,x)=>s+Number(x.ore||0),0)||'';
    if(!document.getElementById('rpSite').value)document.getElementById('rpSite').value=unique(latest.map(x=>x.impianto)).slice(0,3).join(', ');
    alert(`Precompilato da ${latest.length} attività di Varga Cantieri.`)
  }
  function lines(text){return E(text||'').split('\n').map(x=>`<div>${x||'&nbsp;'}</div>`).join('')}
  function printReport(r){
    const company=db.company||{};const companyName=company.name||'AVOLA SOCIETA’ COOPERATIVA';
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>Rapportino ${E(r.number)}</title><style>@page{size:A4;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#222;margin:0}.sheet{width:190mm;margin:auto;border:1px solid #777;font-size:10px}.grid{display:grid}.top{grid-template-columns:42% 38% 20%}.box{border-right:1px solid #777;border-bottom:1px solid #777;padding:5px;min-height:25px}.box:last-child{border-right:0}.company{font-size:9px}.company b{font-size:14px}.label{font-weight:700;color:#555;font-size:9px}.value{font-size:12px;margin-top:3px}.red{color:#d33;font-size:18px}.two{grid-template-columns:44% 56%}.work{min-height:235px}.materials{min-height:150px}.rowline{border-bottom:1px solid #ddd;padding:4px 0}.footer{grid-template-columns:32% 34% 34%}.sign{height:82px;text-align:center}.sign img{max-width:95%;max-height:55px}.title{font-size:13px;font-weight:700}.tot{font-size:12px}.checks{line-height:1.7}</style></head><body><div class="sheet">
    <div class="grid top"><div class="box company"><b>${E(companyName)}</b><br>${E(company.address||'Opere a verde e ripristino ambientale')}<br>${E(company.city||'')}</div><div class="box"><span class="label">CLIENTE</span><div class="value">${E(r.clientName)}</div><br><span class="label">CANTIERE</span><div>${E(r.site)}</div></div><div class="box"><span class="label">NUM.</span> <b class="red">${E(r.number)}</b><br><span class="label">DATA</span><div class="value">${E(r.date)}</div><div class="checks">☐ M. STRAORDINARIA<br>${r.type==='Manutenzione ordinaria'?'☒':'☐'} M. ORDINARIA</div></div></div>
    <div class="grid two"><div class="box work"><div class="title">MANODOPERA</div><p><span class="label">N. OPERAI (SQUADRA COMPLETA)</span> <b>${E(r.workers)}</b></p><p class="label">DESCRIZIONE LAVORI</p><div class="value">${lines(r.description)}</div><div style="margin-top:25px"><span class="label">INIZIO LAVORI GIORNO</span> ${E(r.start||'')} &nbsp;&nbsp; <span class="label">FINE</span> ${E(r.end||'')}</div><p class="tot"><b>TOTALE ORE SQUADRA: ${E(r.teamHours||'')}</b></p></div>
    <div><div class="box materials"><div class="title">MATERIALI D'USO</div><div style="margin-top:8px">${lines(r.materials)}</div></div><div class="box work"><div class="title">MEZZI CON OPERATORE</div><div style="margin-top:8px">${lines(r.vehicles)}</div><p style="margin-top:20px"><span class="label">NOTE</span><br>${lines(r.notes)}</p></div></div></div>
    <div class="grid footer"><div class="box"><b>TOTALE ORE SQUADRA COMPLETA</b><div class="value">${E(r.teamHours||'')}</div></div><div class="box sign"><b>FIRMA O TIMBRO CLIENTE</b><br>${r.clientSignature?`<img src="${r.clientSignature}">`:''}<div>${E(r.clientSignName||'')}</div></div><div class="box sign"><b>FIRMA CAPO SQUADRA</b><br>${r.leaderSignature?`<img src="${r.leaderSignature}">`:''}<div>${E(r.leaderSignName||'')}</div></div></div>
    </div><script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></body></html>`;
    const w=window.open('','_blank');if(!w)return alert('Il browser ha bloccato la finestra PDF. Abilita i popup e riprova.');w.document.open();w.document.write(html);w.document.close();
  }
  function render(){
    fillSelects();const arr=db.rapportini||[],m=today().slice(0,7);document.getElementById('rpKTotal').textContent=arr.length;document.getElementById('rpKDraft').textContent=arr.filter(x=>x.status==='Bozza').length;document.getElementById('rpKSign').textContent=arr.filter(x=>x.status==='Da firmare').length;document.getElementById('rpKDone').textContent=arr.filter(x=>x.status==='Completato').length;document.getElementById('rpKMonth').textContent=arr.filter(x=>String(x.date||'').startsWith(m)).length;
    const q=(document.getElementById('rpSearch').value||'').toLowerCase(),s=document.getElementById('rpStatusFilter').value;const rows=arr.filter(r=>(!s||r.status===s)&&(!q||[r.number,r.clientName,r.jobName,r.jobCode,r.site,r.description].join(' ').toLowerCase().includes(q))).slice().reverse();
    document.getElementById('rpList').innerHTML=rows.length?rows.map(r=>`<div class="item"><div class="item-main"><div class="item-title">Rapportino ${E(r.number)} — ${E(r.clientName||r.site||'')}</div><div class="item-sub">${E(r.date)} ${r.jobName?'• '+E(r.jobName):''} • <span class="badge">${E(r.status)}</span></div></div><div class="item-actions rp-doc-actions"><button class="mini" data-rp-edit="${E(r.id)}">Apri</button><button class="mini" data-rp-pdf="${E(r.id)}">PDF</button><button class="mini danger" data-rp-del="${E(r.id)}">Elimina</button></div></div>`).join(''):'<div class="empty">Nessun rapportino.</div>';
    document.querySelectorAll('[data-rp-edit]').forEach(b=>b.onclick=()=>edit(b.dataset.rpEdit));document.querySelectorAll('[data-rp-pdf]').forEach(b=>b.onclick=()=>{const r=db.rapportini.find(x=>x.id===b.dataset.rpPdf);if(r)printReport(r)});document.querySelectorAll('[data-rp-del]').forEach(b=>b.onclick=()=>remove(b.dataset.rpDel));
  }
  document.getElementById('rpNew').onclick=clearForm;document.getElementById('rpSaveDraft').onclick=()=>store('Bozza');document.getElementById('rpSaveSigned').onclick=()=>store('Da firmare');document.getElementById('rpComplete').onclick=()=>store('Completato',true);document.getElementById('rpPrefill').onclick=prefill;document.getElementById('rpSearch').oninput=render;document.getElementById('rpStatusFilter').onchange=render;
  document.getElementById('rpJob').onchange=()=>{const j=db.jobs.find(x=>x.id===document.getElementById('rpJob').value);if(j){document.getElementById('rpClient').value=j.clientId||'';if(!document.getElementById('rpSite').value)document.getElementById('rpSite').value=j.site||''}};
  clearForm();render();
})();