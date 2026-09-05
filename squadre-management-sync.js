// Creazione squadre in Varga Gestionale, compatibile con le collezioni originali di Varga Cantieri.
(function installSquadreManagementSync(){
  'use strict';

  const STORAGE_KEY='vg_pendingSquadreV1';
  const byId=id=>document.getElementById(id);
  const text=value=>String(value??'').trim();
  const safe=value=>typeof esc==='function'?esc(value):text(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const normalized=value=>text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const split=value=>text(value).split(/[,;|\n]+/).map(text).filter(Boolean);
  const unique=values=>{const seen=new Set();return values.filter(value=>{const key=normalized(value);if(!key||seen.has(key))return false;seen.add(key);return true})};
  const tomorrow=()=>{const date=new Date();date.setDate(date.getDate()+1);return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`};
  let draftRows=[];
  let busy=false;

  function readPending(){
    try{const value=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');return Array.isArray(value)?value:[]}catch(_){return[]}
  }
  function writePending(rows){localStorage.setItem(STORAGE_KEY,JSON.stringify(rows||[]))}
  function isAdmin(){return window.cloudUserRole==='admin'}
  function commessaId(job){
    const path=text(job?.vcSourceId);
    const match=path.match(/^commesse\/([^/]+)$/);
    return match?match[1]:text(job?.sourceId);
  }
  function eligibleJobs(){return (db.jobs||[]).filter(job=>commessaId(job)&&text(job.status).toLowerCase()!=='terminata').sort((a,b)=>text(a.title).localeCompare(text(b.title),'it'))}
  function personName(person){return text(person?.nomeCompleto||person?.displayName||person?.nomeOperatore||person?.name||`${person?.nome||''} ${person?.cognome||''}`)}
  function people(){return unique((db.vcUtenti||[]).map(personName).filter(Boolean)).sort((a,b)=>a.localeCompare(b,'it'))}
  function vehicles(){
    const records=(db.vcRecords||[]).filter(record=>text(record.rootCollection)==='mezzi').map(record=>record.data||record);
    return unique(records.map(vehicle=>text(vehicle.nId||vehicle.nome||vehicle.targa||vehicle.id)).filter(Boolean)).sort((a,b)=>a.localeCompare(b,'it'));
  }
  function signature(row){
    return [normalized(row?.caposquadra),unique(split(row?.personale)).map(normalized).sort().join('|'),unique(split(row?.mezzi)).map(normalized).sort().join('|')].join('__');
  }
  function setStatus(message,type=''){
    const node=byId('vgSquadreStatus');if(!node)return;node.textContent=message;node.className=`vg-squad-status${type?' '+type:''}`;
  }
  function sourceRowsFor(dateKey,jobId){
    const path=`squadreStorico/${dateKey}__${jobId}`;
    const record=(db.vcRecords||[]).find(item=>text(item.sourcePath)===path);
    const fallback=(db.vcSquadre||[]).find(item=>text(item.vcSourceId||item.sourcePath)===path);
    const data=record?.data||fallback||{};
    return Array.isArray(data.squadre)?data.squadre:[];
  }
  function currentSelection(){
    const job=(db.jobs||[]).find(item=>item.id===byId('vgSquadreJob')?.value);
    return{job,jobId:commessaId(job),dateKey:text(byId('vgSquadreDate')?.value)};
  }
  function emptyRow(){return{id:crypto.randomUUID(),caposquadra:'',personale:'',mezzi:'',orario:'',orarioFine:'',senzaPausaPranzo:false,note:''}}
  function readFormRows(){
    return Array.from(document.querySelectorAll('#vgSquadreRows .vg-squad-row')).map(node=>({
      id:node.dataset.rowId||crypto.randomUUID(),
      caposquadra:text(node.querySelector('[data-field="caposquadra"]')?.value),
      personale:unique(split(node.querySelector('[data-field="personale"]')?.value)).join(', '),
      mezzi:unique(split(node.querySelector('[data-field="mezzi"]')?.value)).join(', '),
      orario:text(node.querySelector('[data-field="orario"]')?.value),
      orarioFine:text(node.querySelector('[data-field="orarioFine"]')?.value),
      senzaPausaPranzo:Boolean(node.querySelector('[data-field="senzaPausaPranzo"]')?.checked),
      note:text(node.querySelector('[data-field="note"]')?.value)
    })).filter(row=>row.caposquadra||row.personale||row.mezzi||row.orario||row.orarioFine||row.note);
  }
  function rowMarkup(row,index){
    return `<div class="vg-squad-row" data-row-id="${safe(row.id||crypto.randomUUID())}"><div class="vg-squad-row-head"><strong>Squadra ${index+1}</strong><button class="mini danger" type="button" data-remove-row>RIMUOVI</button></div><div class="vg-squad-row-fields"><label>Caposquadra<input data-field="caposquadra" list="vgSquadrePeople" value="${safe(row.caposquadra)}" placeholder="Nome caposquadra"></label><label>Operatori<input data-field="personale" list="vgSquadrePeople" value="${safe(row.personale)}" placeholder="Separa più nomi con una virgola"></label><label>Mezzi<input data-field="mezzi" list="vgSquadreVehicles" value="${safe(row.mezzi)}" placeholder="Separa più mezzi con una virgola"></label><label class="vg-squad-check"><input data-field="senzaPausaPranzo" type="checkbox"${row.senzaPausaPranzo?' checked':''}> Senza pausa pranzo</label><label>Ora inizio<input data-field="orario" type="time" value="${safe(row.orario)}"></label><label>Ora fine<input data-field="orarioFine" type="time" value="${safe(row.orarioFine)}"></label><label class="wide">Note<textarea data-field="note" rows="2" placeholder="Note squadra">${safe(row.note)}</textarea></label></div></div>`;
  }
  function renderRows(){
    const node=byId('vgSquadreRows');if(!node)return;if(!draftRows.length)draftRows=[emptyRow()];node.innerHTML=draftRows.map(rowMarkup).join('');
    node.querySelectorAll('[data-remove-row]').forEach(button=>button.onclick=()=>{draftRows=readFormRows().filter(row=>row.id!==button.closest('.vg-squad-row')?.dataset.rowId);renderRows()});
  }
  function refreshLists(){
    const peopleList=byId('vgSquadrePeople');if(peopleList)peopleList.innerHTML=people().map(name=>`<option value="${safe(name)}"></option>`).join('');
    const vehicleList=byId('vgSquadreVehicles');if(vehicleList)vehicleList.innerHTML=vehicles().map(name=>`<option value="${safe(name)}"></option>`).join('');
    const select=byId('vgSquadreJob');if(select){const old=select.value;select.innerHTML='<option value="">Seleziona commessa</option>'+eligibleJobs().map(job=>`<option value="${safe(job.id)}">${safe(job.title)}${job.code?' — '+safe(job.code):''}</option>`).join('');if([...select.options].some(option=>option.value===old))select.value=old}
  }
  function renderSaved(){
    const node=byId('vgSquadreSaved');if(!node)return;const {jobId,dateKey}=currentSelection();if(!jobId||!dateKey){node.innerHTML='<div class="empty">Scegli commessa e giorno.</div>';return}
    const synced=sourceRowsFor(dateKey,jobId);const pending=readPending().filter(item=>item.commessaId===jobId&&item.dateKey===dateKey).flatMap(item=>item.squadre||[]);
    const rows=[...pending.map(row=>({...row,_pending:true})),...synced.map(row=>({...row,_pending:false}))];
    node.innerHTML=rows.length?rows.map((row,index)=>`<div class="item"><div class="item-main"><div class="item-title">Squadra ${index+1} · ${safe(row.caposquadra||'Senza caposquadra')}</div><div class="item-sub">${safe(row.personale||'Nessun operatore')}${row.mezzi?' • '+safe(row.mezzi):''}${row.orario||row.orarioFine?' • '+safe(row.orario||'--:--')+'–'+safe(row.orarioFine||'--:--'):''}${row.note?' • '+safe(row.note):''}</div></div><span class="badge ${row._pending?'vg-squad-pending':'vg-squad-origin'}">${row._pending?'DA SINCRONIZZARE':safe(row.createdFrom==='Varga Gestionale'?'GESTIONALE':'VARGA CANTIERI')}</span></div>`).join(''):'<div class="empty">Nessuna squadra per questa commessa e questo giorno.</div>';
  }
  function render(){
    refreshLists();renderRows();renderSaved();const admin=isAdmin();const form=byId('vgSquadreEditor');if(form)form.hidden=!admin;const info=byId('vgSquadrePermission');if(info)info.textContent=admin?'Puoi preparare più squadre e sincronizzarle con Varga Cantieri.':'Solo gli amministratori possono creare o sincronizzare le squadre.';const pendingCount=readPending().length;if(pendingCount)setStatus(`${pendingCount} ${pendingCount===1?'composizione':'composizioni'} in attesa di sincronizzazione.`,'warn');
  }
  function saveDraft(){
    if(!isAdmin())return setStatus('Solo gli amministratori possono creare le squadre.','error');
    const {job,jobId,dateKey}=currentSelection();if(!job||!jobId)return setStatus('Seleziona una commessa già collegata a Varga Cantieri.','error');if(!dateKey)return setStatus('Seleziona il giorno della squadra.','error');
    const rows=readFormRows();if(!rows.length)return setStatus('Inserisci almeno una squadra.','error');
    const duplicate=new Set();for(const row of rows){const key=signature(row);if(duplicate.has(key))return setStatus('Hai inserito due squadre identiche. Controlla caposquadra e operatori.','error');duplicate.add(key)}
    const pending=readPending().filter(item=>!(item.commessaId===jobId&&item.dateKey===dateKey));pending.push({id:crypto.randomUUID(),commessaId:jobId,commessaNome:job.title,dateKey,squadre:rows,createdAt:new Date().toISOString()});writePending(pending);draftRows=[emptyRow()];renderRows();renderSaved();setStatus(`Bozza salvata: ${rows.length} ${rows.length===1?'squadra':'squadre'} da sincronizzare.`,'warn');
  }
  async function findRemoteConflicts(entries){
    const byDate=new Map();entries.forEach(entry=>{if(!byDate.has(entry.dateKey))byDate.set(entry.dateKey,[]);byDate.get(entry.dateKey).push(entry)});const messages=[];
    for(const [dateKey,dateEntries] of byDate){
      const shared=await cloudStore.collection('sharedStaticViews').doc(`squadre__${dateKey}`).get();const compositions=shared.exists&&Array.isArray(shared.data()?.payload?.squadre)?shared.data().payload.squadre:[];const occurrences=[];compositions.forEach(data=>(Array.isArray(data.squadre)?data.squadre:[]).forEach(row=>occurrences.push({commessaId:text(data.commessaId)||text(data.id).split('__').slice(1).join('__'),commessaNome:text(data.commessaNome)||'Commessa',row})));
      const drafts=dateEntries.flatMap(entry=>(entry.squadre||[]).map(row=>({commessaId:entry.commessaId,commessaNome:entry.commessaNome,row})));
      for(const current of drafts){const members=unique([current.row.caposquadra,...split(current.row.personale)]);const means=unique(split(current.row.mezzi));for(const other of [...occurrences,...drafts]){if(other===current||other.commessaId===current.commessaId)continue;const otherMembers=unique([other.row.caposquadra,...split(other.row.personale)]).map(normalized);const otherMeans=unique(split(other.row.mezzi)).map(normalized);members.filter(name=>otherMembers.includes(normalized(name))).forEach(name=>messages.push(`${name} è già in ${other.commessaNome}`));means.filter(name=>otherMeans.includes(normalized(name))).forEach(name=>messages.push(`Il mezzo ${name} è già in ${other.commessaNome}`))}}
    }
    return unique(messages);
  }
  function mergeRows(remoteRows,pendingRows){
    const result=(remoteRows||[]).map(row=>({...row}));const knownIds=new Map(result.map((row,index)=>[text(row.vargaGestionaleId),index]).filter(([id])=>id));const knownSignatures=new Set(result.map(signature));let added=0,updated=0;
    for(const row of pendingRows||[]){const syncId=text(row.vargaGestionaleId||row.id)||crypto.randomUUID();const next={caposquadra:text(row.caposquadra),personale:unique(split(row.personale)).join(', '),mezzi:unique(split(row.mezzi)).join(', '),impianti:'',impiantiDettagli:[],note:text(row.note),orario:text(row.orario),orarioFine:text(row.orarioFine),senzaPausaPranzo:Boolean(row.senzaPausaPranzo),conflittiConfermati:{operatori:[],mezzi:[]},conflittoOperatoreConfermato:false,conflittoMezzoConfermato:false,vargaGestionaleId:syncId,createdFrom:'Varga Gestionale'};const position=knownIds.get(syncId);if(position!=null){result[position]={...result[position],...next};updated++;continue}if(knownSignatures.has(signature(next)))continue;result.push(next);knownIds.set(syncId,result.length-1);knownSignatures.add(signature(next));added++}
    return{rows:result,added,updated};
  }
  function upsertLocalRecord(path,root,id,data){
    const record={sourcePath:path,rootCollection:root,id,data,syncedAt:new Date().toISOString()};const index=(db.vcRecords||[]).findIndex(item=>text(item.sourcePath)===path);if(index>=0)db.vcRecords[index]=record;else db.vcRecords.push(record);const flat={...data,id,vcSourceId:path,vcRootCollection:root};const squadIndex=(db.vcSquadre||[]).findIndex(item=>text(item.vcSourceId||item.sourcePath)===path);if(squadIndex>=0)db.vcSquadre[squadIndex]=flat;else db.vcSquadre.push(flat);
  }
  async function syncPending({silent=false}={}){
    if(busy)return{synced:0,added:0,updated:0};const entries=readPending();if(!entries.length){if(!silent)setStatus('Non ci sono nuove squadre da sincronizzare.');return{synced:0,added:0,updated:0}}if(!isAdmin())throw Error('Solo gli amministratori possono sincronizzare le squadre.');if(!cloudStore||!cloudUser)throw Error('Accedi al Cloud con lo stesso account di Varga Cantieri.');
    busy=true;setStatus('Controllo squadre e conflitti in corso...');try{
      const conflicts=await findRemoteConflicts(entries);if(conflicts.length&&!window.confirm(`ATTENZIONE\n\n${conflicts.slice(0,8).join('\n')}\n\nVuoi assegnare comunque queste squadre?`)){setStatus('Sincronizzazione annullata: modifica le persone o i mezzi in conflitto.','warn');return{synced:0,added:0,updated:0,cancelled:true}}
      let added=0,updated=0;for(const entry of entries){const currentRef=cloudStore.collection('squadreCommesse').doc(entry.commessaId);const historyRef=cloudStore.collection('squadreStorico').doc(`${entry.dateKey}__${entry.commessaId}`);let savedPayload=null;await cloudStore.runTransaction(async transaction=>{const snapshot=await transaction.get(historyRef);const remote=snapshot.exists&&Array.isArray(snapshot.data()?.squadre)?snapshot.data().squadre:[];const merged=mergeRows(remote,entry.squadre);added+=merged.added;updated+=merged.updated;savedPayload={commessaId:entry.commessaId,commessaNome:entry.commessaNome,riferimentoData:entry.dateKey,dateKey:entry.dateKey,squadre:merged.rows,existingSquadreCountBeforeSave:remote.length,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:cloudUser.email||'',updatedByUid:cloudUser.uid,updatedFrom:'Varga Gestionale'};transaction.set(currentRef,savedPayload,{merge:true});transaction.set(historyRef,savedPayload,{merge:true})});const localPayload={...savedPayload,updatedAt:new Date().toISOString()};upsertLocalRecord(`squadreCommesse/${entry.commessaId}`,'squadreCommesse',entry.commessaId,localPayload);upsertLocalRecord(`squadreStorico/${entry.dateKey}__${entry.commessaId}`,'squadreStorico',`${entry.dateKey}__${entry.commessaId}`,localPayload)}
      writePending([]);save({skipCloud:true});renderSaved();if(typeof refreshVcCounts==='function')refreshVcCounts();setStatus(`Sincronizzazione completata: ${added} nuove squadre${updated?`, ${updated} aggiornate`:''}.`);return{synced:entries.length,added,updated};
    }finally{busy=false}
  }
  function install(){
    const side=document.querySelector('.sidebar-nav'),main=document.querySelector('.main');if(!side||!main||byId('squadreGestione'))return;const anchor=document.querySelector('.nav[data-view="cantieriSync"]');const button=document.createElement('button');button.className='nav';button.dataset.view='squadreGestione';button.textContent='👥 Organizzazione squadre';button.onclick=()=>{nav('squadreGestione');render()};anchor?.insertAdjacentElement('beforebegin',button);
    const section=document.createElement('section');section.id='squadreGestione';section.className='view';section.innerHTML=`<div class="topline vg-squad-head"><div><h1>Organizzazione squadre</h1><p class="subtitle">Prepara le squadre nel gestionale e inviale alla stessa organizzazione usata da Varga Cantieri.</p></div><div class="actions"><button id="vgSquadreSync" class="primary" type="button">SINCRONIZZA CON VARGA CANTIERI</button></div></div><p id="vgSquadrePermission" class="muted"></p><div id="vgSquadreStatus" class="vg-squad-status">Nessuna modifica in attesa.</div><div id="vgSquadreEditor"><div class="panel"><div class="vg-squad-grid"><label>Commessa<select id="vgSquadreJob"></select></label><label>Giorno<input id="vgSquadreDate" type="date"></label></div><div id="vgSquadreRows"></div><div class="actions left"><button id="vgSquadreAddRow" class="ghost" type="button">+ AGGIUNGI SQUADRA</button><button id="vgSquadreSaveDraft" class="primary" type="button">SALVA BOZZA</button></div></div></div><div class="panel"><h2>Squadre del giorno</h2><p class="muted">Le squadre blu provengono dai dati sincronizzati; quelle gialle sono ancora solo nel gestionale.</p><div id="vgSquadreSaved" class="vg-squad-list"></div></div><datalist id="vgSquadrePeople"></datalist><datalist id="vgSquadreVehicles"></datalist>`;main.appendChild(section);
    byId('vgSquadreDate').value=tomorrow();byId('vgSquadreJob').onchange=renderSaved;byId('vgSquadreDate').onchange=renderSaved;byId('vgSquadreAddRow').onclick=()=>{draftRows=readFormRows();draftRows.push(emptyRow());renderRows()};byId('vgSquadreSaveDraft').onclick=saveDraft;byId('vgSquadreSync').onclick=()=>syncPending().catch(error=>setStatus(`Sincronizzazione non riuscita: ${error.message||error}`,'error'));
    const fullSync=byId('syncVcNow');if(fullSync&&typeof fullSync.onclick==='function'){const original=fullSync.onclick;fullSync.onclick=async function(event){try{await syncPending({silent:true})}catch(error){const info=byId('vcSyncInfo');if(info)info.textContent=`Squadre non sincronizzate: ${error.message||error}`;return}return original.call(this,event)}}
    render();
  }
  window.VargaSquadreSync={syncPending,render,pendingCount:()=>readPending().length,mergeRows};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
