/* Centro richieste/segnalazioni ricevute via Gmail. Non invia mai risposte automatiche. */
(function(){
'use strict';
const appliedKey='vg_requestMailApplied';
const dismissedKey='vg_requestMailDismissed';
const requestEmailKey='vg_requestEmail';
const requestSettingsKey='vg_requestSettings';
const statuses=['Nuova','Da verificare','Presa in carico','Programmata','In lavorazione','Completata','Archiviata'];
db.requests=Array.isArray(db.requests)?db.requests:S.get('vg_requests',[]);
if(typeof save==='function'&&!save.__requestsPatched){
  const baseSave=save;
  save=function(opts={}){S.set('vg_requests',db.requests);return baseSave(opts)};
  save.__requestsPatched=true;
}
if(typeof cloudState==='function'&&!cloudState.__requestsPatched){
  const baseCloudState=cloudState;
  cloudState=function(){return Object.assign({},baseCloudState(),{requests:db.requests})};
  cloudState.__requestsPatched=true;
}
const getApplied=()=>{try{return new Set(JSON.parse(localStorage.getItem(appliedKey)||'[]'))}catch(_){return new Set()}};
const setApplied=s=>localStorage.setItem(appliedKey,JSON.stringify([...s].slice(-1000)));
const getDismissed=()=>{try{return new Set(JSON.parse(localStorage.getItem(dismissedKey)||'[]'))}catch(_){return new Set()}};
const setDismissed=s=>localStorage.setItem(dismissedKey,JSON.stringify([...s].slice(-1000)));
const html=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalize=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const call=(action,extra={})=>{
  if(typeof window.VargaMailBridgeCall!=='function')throw new Error('Configura prima il collegamento Gmail nella sezione Azienda.');
  return window.VargaMailBridgeCall(action,extra);
};
function requestEmail(){return String(localStorage.getItem(requestEmailKey)||db.company?.requestEmail||db.company?.mapEmail||db.company?.email||'').trim()}
function validEmail(value){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value||'').trim())}
function setBusy(button,busy,label){if(!button)return;button.disabled=busy;button.textContent=busy?'ATTENDI…':label}
function settings(){try{const value=JSON.parse(localStorage.getItem(requestSettingsKey)||'{}')||{};return{days:Number(db.company?.requestScanDays||value.days)||30,senderRules:Array.isArray(db.company?.requestSenderRules)?db.company.requestSenderRules:(Array.isArray(value.senderRules)?value.senderRules:[])}}catch(_){return{days:Number(db.company?.requestScanDays)||30,senderRules:Array.isArray(db.company?.requestSenderRules)?db.company.requestSenderRules:[]}}}
function saveSettings(value){localStorage.setItem(requestSettingsKey,JSON.stringify(value));db.company=db.company||{};db.company.requestScanDays=value.days;db.company.requestSenderRules=value.senderRules;save()}
function bridgePayload(){const value=settings();return{requestEmail:requestEmail(),requestScanDays:value.days,requestSenderRules:value.senderRules,jobs:(db.jobs||[]).map(j=>({id:j.id,title:j.title,code:j.code||'',site:j.site||''}))}}
function suggestedJob(receipt){
  const text=normalize([receipt.subject,receipt.bodyPreview,receipt.from].join(' '));
  return (db.jobs||[]).map(j=>({j,score:[j.code,j.title,j.site].filter(Boolean).reduce((n,v)=>n+(text.includes(normalize(v))?1:0),0)})).sort((a,b)=>b.score-a.score)[0];
}
function detectedPlant(receipt){
  const text=normalize([receipt.subject,receipt.bodyPreview].join(' '));
  return (db.vcImpianti||[]).map(p=>{const code=normalize(plantCode(p)),name=normalize(plantLabel(p));let score=0;if(code&&text.includes(code))score+=3;if(name.length>=5&&text.includes(name))score+=2;return{p,score}}).filter(x=>x.score).sort((a,b)=>b.score-a.score)[0]?.p||null;
}
function detectedWorkDate(receipt){
  const text=normalize([receipt.subject,receipt.bodyPreview].join(' '));
  const re=/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](20\d{2})/g;let match;
  while((match=re.exec(text))){
    const context=text.slice(Math.max(0,match.index-60),match.index);
    if(!/(entro|per il|dal giorno|inizio lavori|avvio|programm|eseguire)/.test(context))continue;
    const day=Number(match[1]),month=Number(match[2]),year=Number(match[3]),date=new Date(Date.UTC(year,month-1,day));
    if(date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day)return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }
  return'';
}
function autoQuoteFromRequest(r){
  if(db.quotes.some(q=>q.sourceRequestId===r.id))return;
  const job=db.jobs.find(j=>j.id===r.jobId),clientId=job?.clientId||'',client=db.clients.find(c=>c.id===clientId),number=`PREV-${new Date().getFullYear()}-${String(db.quotes.length+1).padStart(4,'0')}`;
  db.quotes.push({id:uid(),sourceRequestId:r.id,number,date:new Date().toISOString().slice(0,10),clientId,clientName:client?.name||r.fromName||r.from,client:client||{},subject:r.subject,site:requestSite(r),rows:[{id:uid(),code:'',description:r.bodyPreview||r.subject,unit:'cad',qty:1,price:0}],subtotal:0,vat:0,total:0,vatRate:22,discount:0,validity:30,payment:'',status:'Bozza'});r.quoteNumber=number;
}
function autoOrganizeRequest(r){
  if(r.autoOrganizedAt)return;const now=new Date().toISOString();r.autoOrganizedAt=now;
  const actionable=['Richiesta intervento','Ordine di lavoro','Segnalazione','Richiesta preventivo'].includes(r.type);if(!actionable)return;
  const plant=detectedPlant(r);if(plant)r.plantId=plantId(plant);
  const workDate=detectedWorkDate(r);if(workDate){r.scheduledDate=workDate;r.dueDate=workDate}
  if(r.type==='Richiesta preventivo')autoQuoteFromRequest(r);
  else r.activity={createdAt:now,createdAutomatically:true,description:r.bodyPreview||r.subject,jobId:r.jobId||'',plantId:r.plantId||'',status:r.type==='Segnalazione'?'Aperta':'Da programmare'};
  const needsReview=!r.jobId||(!r.plantId&&r.type!=='Richiesta preventivo');
  r.autoCreated=true;r.needsReview=needsReview;r.status=needsReview?'Da verificare':workDate?'Programmata':'Presa in carico';
  if(workDate)addDeadlineFromRequest(r,{date:workDate,dueDate:workDate,jobId:r.jobId,plantId:r.plantId,notes:r.bodyPreview||r.subject});
}
async function importReceipts(){
  const result=await call('requestReceipts');
  const rows=Array.isArray(result?.requests)?result.requests:[];
  const applied=getApplied(),dismissed=getDismissed(),ack=[];let imported=0;
  rows.forEach(r=>{
    if(!r?.id)return;
    // La memoria "applied" può sopravvivere a un ripristino/sync che ha perso la
    // richiesta. In quel caso la email va reimportata. Solo una eliminazione
    // esplicita dell'utente (dismissed) deve impedirne il ritorno.
    if(dismissed.has(r.id)||db.requests.some(x=>x.sourceReceiptId===r.id)){ack.push(r.id);applied.add(r.id);return}
    const match=suggestedJob(r);
    const request={id:uid(),sourceReceiptId:r.id,source:'Gmail',gmailMessageId:r.gmailMessageId||'',gmailThreadId:r.gmailThreadId||'',from:r.from||'',fromName:r.fromName||'',subject:r.subject||'Email senza oggetto',bodyPreview:r.bodyPreview||'',emailDate:r.emailDate||'',receivedAt:r.archivedAt||new Date().toISOString(),type:r.type||'Comunicazione',priority:r.priority||'Normale',status:'Nuova',jobId:r.jobId||(match?.score?match.j.id:''),clientId:'',assignedTo:'',dueDate:'',attachmentNames:r.attachmentNames||[],files:r.files||[],notes:'',updatedAt:new Date().toISOString()};
    db.requests.push(request);autoOrganizeRequest(request);
    applied.add(r.id);ack.push(r.id);imported++;
  });
  if(imported)save();
  if(ack.length)await call('acknowledgeRequests',{requestIds:ack});
  setApplied(applied);render();
  return imported;
}
async function scan(){
  const info=document.getElementById('requestSyncInfo'),button=document.getElementById('checkRequestsNow'),email=requestEmail();
  try{
    if(!validEmail(email))throw new Error('Prima inserisci e salva un indirizzo email valido.');
    setBusy(button,true,'CONTROLLA EMAIL ADESSO');
    if(info)info.textContent='Controllo email in corso…';
    const out=await call('scanRequests',{...bridgePayload(),forcePeriod:true});
    const imported=await importReceipts();
    if(info)info.textContent=`Controllo completato: ${Number(out?.found||0)} email riconosciute, ${imported} nuove richieste importate.`;
  }catch(e){if(info)info.textContent='Errore: '+(e.message||e)}
  finally{setBusy(button,false,'CONTROLLA EMAIL ADESSO')}
}
function options(values,current){return values.map(v=>`<option${v===current?' selected':''}>${html(v)}</option>`).join('')}
function jobOptions(current){return '<option value="">Da assegnare</option>'+db.jobs.map(j=>`<option value="${html(j.id)}"${j.id===current?' selected':''}>${html((j.code?j.code+' — ':'')+j.title)}</option>`).join('')}
function plantLabel(p){return p?String(p.denominazione||p.name||p.nome||p.impianto||p.title||p.idSap||p.sap||'Impianto'):''}
function plantCode(p){return String(p?.idSap||p?.sap||p?.codice||p?.code||'')}
function plantId(p){return String(p?.sourceId||p?.vcSourceId||p?.id||plantCode(p)||plantLabel(p))}
function plantOptions(current){return '<option value="">Nessun impianto collegato</option>'+(db.vcImpianti||[]).slice().sort((a,b)=>plantLabel(a).localeCompare(plantLabel(b))).map(p=>`<option value="${html(plantId(p))}"${plantId(p)===current?' selected':''}>${html((plantCode(p)?plantCode(p)+' — ':'')+plantLabel(p))}</option>`).join('')}
function teamLabel(t){return String(t?.name||t?.nome||t?.title||t?.squadra||t?.caposquadra||'Squadra')}
function teamId(t){return String(t?.sourceId||t?.vcSourceId||t?.id||teamLabel(t))}
function teamOptions(current){return '<option value="">Da assegnare</option>'+(db.vcSquadre||[]).map(t=>`<option value="${html(teamId(t))}"${teamId(t)===current?' selected':''}>${html(teamLabel(t))}</option>`).join('')}
function selectedPlant(r){return (db.vcImpianti||[]).find(p=>plantId(p)===String(r.plantId||''))}
function requestSite(r){const p=selectedPlant(r);return plantLabel(p)||(db.jobs.find(j=>j.id===r.jobId)?.site||'')}
function ensureModal(){
  if(document.getElementById('requestWorkModal'))return;
  document.body.insertAdjacentHTML('beforeend',`<div id="requestWorkModal" class="request-modal" hidden><div class="request-modal-card"><div class="topline"><div><h2 id="requestWorkTitle">Gestisci richiesta</h2><p id="requestWorkMeta" class="muted"></p></div><button class="mini" id="requestWorkClose">CHIUDI</button></div><div class="request-work-grid"><label>Commessa<select id="requestWorkJob"></select></label><label>Impianto<select id="requestWorkPlant"></select></label><label>Data intervento<input id="requestWorkDate" type="date"></label><label>Squadra<select id="requestWorkTeam"></select></label><label>Stato<select id="requestWorkStatus">${statuses.map(x=>`<option>${x}</option>`).join('')}</select></label><label>Scadenza<input id="requestWorkDue" type="date"></label></div><label>Descrizione operativa<textarea id="requestWorkNotes" rows="5"></textarea></label><div class="request-work-actions"><button class="primary" data-request-action="intervention">CREA INTERVENTO</button><button class="ghost" data-request-action="quote">CREA PREVENTIVO</button><button class="ghost" data-request-action="report">CREA SEGNALAZIONE</button><button class="ghost" data-request-action="schedule">PROGRAMMA LAVORO</button><button class="ghost" data-request-action="navigate">NAVIGA</button><button class="ghost" data-request-action="draft">GENERA RISPOSTA</button><button class="ghost" data-request-action="workreport">CREA RAPPORTINO</button><button class="primary" data-request-action="complete">CHIUDI RICHIESTA</button></div><div id="requestDraftBox" class="request-draft" hidden><label>Bozza di risposta<textarea id="requestDraftText" rows="7"></textarea></label><div class="actions left"><button class="ghost" id="requestDraftCopy">COPIA BOZZA</button></div></div><p class="muted request-safety">Tutte le azioni restano in Varga Gestionale. Nessuna email viene inviata automaticamente e nessun dato viene scritto su Varga Cantieri.</p></div></div>`);
  document.getElementById('requestWorkClose').onclick=()=>document.getElementById('requestWorkModal').hidden=true;
  document.getElementById('requestWorkModal').onclick=e=>{if(e.target.id==='requestWorkModal')e.currentTarget.hidden=true};
  document.querySelectorAll('[data-request-action]').forEach(b=>b.onclick=()=>runAction(b.dataset.requestAction));
  document.getElementById('requestDraftCopy').onclick=async()=>{const value=document.getElementById('requestDraftText').value;try{await navigator.clipboard.writeText(value);alert('Bozza copiata.')}catch(_){document.getElementById('requestDraftText').select();document.execCommand('copy');alert('Bozza copiata.')}};
}
let activeRequestId='';
function modalValues(r){return{jobId:document.getElementById('requestWorkJob').value,plantId:document.getElementById('requestWorkPlant').value,date:document.getElementById('requestWorkDate').value,teamId:document.getElementById('requestWorkTeam').value,status:document.getElementById('requestWorkStatus').value,dueDate:document.getElementById('requestWorkDue').value,notes:document.getElementById('requestWorkNotes').value.trim()}}
function storeModal(r){Object.assign(r,modalValues(r),{updatedAt:new Date().toISOString()});save()}
function openManager(id){
  const r=db.requests.find(x=>x.id===id);if(!r)return;activeRequestId=id;ensureModal();
  document.getElementById('requestWorkTitle').textContent=r.subject||'Gestisci richiesta';
  document.getElementById('requestWorkMeta').textContent=[r.fromName||r.from,r.type,r.priority].filter(Boolean).join(' • ');
  document.getElementById('requestWorkJob').innerHTML=jobOptions(r.jobId);
  document.getElementById('requestWorkPlant').innerHTML=plantOptions(r.plantId);
  document.getElementById('requestWorkTeam').innerHTML=teamOptions(r.teamId);
  document.getElementById('requestWorkDate').value=r.scheduledDate||'';document.getElementById('requestWorkDue').value=r.dueDate||'';
  document.getElementById('requestWorkStatus').value=r.status||'Nuova';document.getElementById('requestWorkNotes').value=r.notes||r.bodyPreview||'';
  document.getElementById('requestDraftBox').hidden=true;document.getElementById('requestWorkModal').hidden=false;
}
window.VargaOpenRequest=openManager;
function addDeadlineFromRequest(r,v){if(!v.date&&!v.dueDate)return false;const existing=db.deadlines.find(x=>x.sourceRequestId===r.id);const d={id:existing?.id||uid(),sourceRequestId:r.id,title:r.subject||'Intervento da email',date:v.date||v.dueDate,type:'Commessa',notes:[jobName(v.jobId),requestSite({...r,...v}),v.notes].filter(Boolean).join(' • '),done:false};if(existing)Object.assign(existing,d);else db.deadlines.push(d);return true}
function makeQuote(r,v){const job=db.jobs.find(j=>j.id===v.jobId),clientId=job?.clientId||r.clientId||'',client=db.clients.find(c=>c.id===clientId);const existing=db.quotes.find(q=>q.sourceRequestId===r.id);if(existing){alert('Per questa email esiste già il preventivo '+existing.number+'.');nav('preventivi');return}const number=`PREV-${new Date().getFullYear()}-${String(db.quotes.length+1).padStart(4,'0')}`;db.quotes.push({id:uid(),sourceRequestId:r.id,number,date:new Date().toISOString().slice(0,10),clientId,clientName:client?.name||r.fromName||r.from,client:client||{},subject:r.subject,site:requestSite({...r,...v}),rows:[{id:uid(),code:'',description:v.notes||r.bodyPreview||r.subject,unit:'cad',qty:1,price:0}],subtotal:0,vat:0,total:0,vatRate:22,discount:0,validity:30,payment:'',status:'Bozza'});r.quoteNumber=number;r.status='Presa in carico';save();document.getElementById('requestWorkModal').hidden=true;nav('preventivi')}
function makeWorkReport(r,v){if(typeof window.openReportFromRequest==='function'){r.reportStartedAt=new Date().toISOString();storeModal(r);document.getElementById('requestWorkModal').hidden=true;window.openReportFromRequest({...r,...v,site:requestSite({...r,...v})});return}alert('Il modulo Rapportini non è ancora pronto. Ricarica la pagina e riprova.')}
function navigate(r,v){const p=(db.vcImpianti||[]).find(x=>plantId(x)===v.plantId);if(!p)return alert('Seleziona prima un impianto.');const lat=p.lat||p.latitude||p.latitudine||p.gpsY||p.coordinateY,lon=p.lng||p.lon||p.longitude||p.longitudine||p.gpsX||p.coordinateX,address=p.address||p.indirizzo||p.via||p.descrizioneVia||plantLabel(p);const target=lat&&lon?`${lat},${lon}`:address;if(!target)return alert('Questo impianto non contiene coordinate o indirizzo.');window.open('https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(target),'_blank','noopener')}
function draftText(r,v){const day=v.date?new Date(v.date+'T12:00:00').toLocaleDateString('it-IT'):'';return `Buongiorno ${r.fromName||''},\n\nabbiamo ricevuto la richiesta “${r.subject||''}” e l’abbiamo presa in carico.${day?' L’intervento è stato programmato per il '+day+'.':''}\n\nCordiali saluti`}
function runAction(action){
  const r=db.requests.find(x=>x.id===activeRequestId);if(!r)return;const v=modalValues(r);Object.assign(r,v);
  if(action==='intervention'){r.activity={createdAt:new Date().toISOString(),description:v.notes||r.bodyPreview,jobId:v.jobId,plantId:v.plantId,status:'Da programmare'};r.status='Presa in carico';save();alert('Intervento creato nel Gestionale.')}
  else if(action==='quote')makeQuote(r,v);
  else if(action==='report'){r.type='Segnalazione';r.activity={createdAt:new Date().toISOString(),description:v.notes||r.bodyPreview,jobId:v.jobId,plantId:v.plantId,status:'Aperta'};r.status='Presa in carico';save();alert('Segnalazione creata nel Gestionale.')}
  else if(action==='schedule'){if(!v.date)return alert('Scegli la data dell’intervento.');r.scheduledDate=v.date;r.assignedTeamId=v.teamId;r.status='Programmata';addDeadlineFromRequest(r,v);save();alert('Lavoro programmato e aggiunto alle scadenze.')}
  else if(action==='navigate')navigate(r,v);
  else if(action==='draft'){document.getElementById('requestDraftText').value=draftText(r,v);document.getElementById('requestDraftBox').hidden=false}
  else if(action==='workreport')makeWorkReport(r,v);
  else if(action==='complete'){r.status='Completata';r.completedAt=new Date().toISOString();const d=db.deadlines.find(x=>x.sourceRequestId===r.id);if(d)d.done=true;save();document.getElementById('requestWorkModal').hidden=true;alert('Richiesta completata e archiviata nello storico.')}
}
function render(){
  if(!document.getElementById('requestsList'))return;
  db.requests=Array.isArray(db.requests)?db.requests:[];
  const q=normalize(document.getElementById('requestSearch')?.value),sf=document.getElementById('requestStatusFilter')?.value||'',tf=document.getElementById('requestTypeFilter')?.value||'';
  document.getElementById('reqNew').textContent=db.requests.filter(x=>x.status==='Nuova').length;
  document.getElementById('reqUrgent').textContent=db.requests.filter(x=>x.priority==='Urgente'&&!['Completata','Archiviata'].includes(x.status)).length;
  document.getElementById('reqUnassigned').textContent=db.requests.filter(x=>!x.jobId&&!['Completata','Archiviata'].includes(x.status)).length;
  document.getElementById('reqWorking').textContent=db.requests.filter(x=>x.status==='In lavorazione').length;
  document.getElementById('reqDone').textContent=db.requests.filter(x=>x.status==='Completata').length;
  const rows=db.requests.filter(x=>(!sf||x.status===sf)&&(!tf||x.type===tf)&&(!q||normalize([x.from,x.subject,x.bodyPreview,x.type,jobName(x.jobId),x.notes].join(' ')).includes(q))).sort((a,b)=>String(b.emailDate||b.receivedAt).localeCompare(String(a.emailDate||a.receivedAt)));
  document.getElementById('requestsList').innerHTML=rows.length?rows.map(x=>{
    const pc=x.priority==='Urgente'?'priority-high':x.priority==='Alta'?'priority-medium':'priority-normal';
    const gmail=x.gmailThreadId?`<a class="mini linkbtn" target="_blank" rel="noopener" href="https://mail.google.com/mail/u/0/#all/${encodeURIComponent(x.gmailThreadId)}">APRI EMAIL</a>`:'';
    const files=(x.files||[]).map(f=>f.driveUrl?`<a class="mini linkbtn" target="_blank" rel="noopener" href="${html(f.driveUrl)}">${html(f.name||'ALLEGATO')}</a>`:'').join('');
    return `<div class="item request-card"><div class="item-main"><div class="item-title">${html(x.subject)} <span class="badge ${pc}">${html(x.priority)}</span> <span class="badge">${html(x.type)}</span></div><div class="item-sub">${html(x.fromName||x.from)} • ${html(new Date(x.emailDate||x.receivedAt).toLocaleString('it-IT'))}${x.attachmentNames?.length?' • '+x.attachmentNames.length+' allegati':''}${x.scheduledDate?' • programmata '+html(x.scheduledDate):''}</div><div class="item-sub request-body">${html(x.bodyPreview)}</div><div class="request-links">${gmail}${files}</div></div><div class="item-actions"><select class="request-select" data-request-status="${x.id}">${options(statuses,x.status)}</select><select class="request-select" data-request-job="${x.id}">${jobOptions(x.jobId)}</select><button class="mini primary" data-request-manage="${x.id}">GESTISCI</button><button class="mini danger" data-request-delete="${x.id}">ELIMINA</button></div></div>`;
  }).join(''):'<div class="empty">Nessuna richiesta trovata.</div>';
  bindRows();
}
function bindRows(){
  document.querySelectorAll('[data-request-status]').forEach(el=>el.onchange=()=>{const r=db.requests.find(x=>x.id===el.dataset.requestStatus);if(r){r.status=el.value;r.updatedAt=new Date().toISOString();save()}});
  document.querySelectorAll('[data-request-job]').forEach(el=>el.onchange=()=>{const r=db.requests.find(x=>x.id===el.dataset.requestJob);if(r){r.jobId=el.value;r.updatedAt=new Date().toISOString();save()}});
  document.querySelectorAll('[data-request-manage]').forEach(el=>el.onclick=()=>openManager(el.dataset.requestManage));
  document.querySelectorAll('[data-request-delete]').forEach(el=>el.onclick=()=>{if(!confirm('Eliminare questa richiesta dal gestionale?'))return;const request=db.requests.find(x=>x.id===el.dataset.requestDelete);if(request?.sourceReceiptId){const dismissed=getDismissed();dismissed.add(request.sourceReceiptId);setDismissed(dismissed)}db.requests=db.requests.filter(x=>x.id!==el.dataset.requestDelete);save()});
}
function activityKind(r){
  const kinds=[];
  if(r.activity?.status==='Aperta'||r.type==='Segnalazione'&&r.activity)kinds.push('Segnalazione');
  else if(r.activity)kinds.push('Intervento');
  if(r.quoteNumber)kinds.push('Preventivo');
  if(r.scheduledDate)kinds.push('Programmato');
  if(r.reportStartedAt)kinds.push('Rapportino');
  return kinds;
}
function compactActivityPreview(value){
  let text=String(value||'').replace(/\s+/g,' ').trim();
  const stops=['Cordiali saluti','Distinti saluti','Questo messaggio','DISCLAIMER','Rispetta l’ambiente'];
  const positions=stops.map(x=>text.toLowerCase().indexOf(x.toLowerCase())).filter(x=>x>80);
  if(positions.length)text=text.slice(0,Math.min(...positions)).trim();
  return text.length>260?text.slice(0,257).trimEnd()+'…':text;
}
function installActivityCenter(){
  if(document.getElementById('emailActivities'))return;
  const sidebar=document.querySelector('.sidebar'),requestNav=[...document.querySelectorAll('.nav')].find(x=>x.dataset.view==='richieste');
  const navButton=document.createElement('button');navButton.className='nav';navButton.dataset.view='emailActivities';navButton.textContent='Attività da email';requestNav?.insertAdjacentElement('afterend',navButton);navButton.onclick=()=>nav('emailActivities');
  const section=document.createElement('section');section.id='emailActivities';section.className='view';section.innerHTML=`<div class="topline"><div><h1>Attività da email</h1><p class="subtitle">Interventi, segnalazioni, preventivi, programmazioni e rapportini creati dalle email.</p></div><button class="ghost" id="emailActivitiesInbox">VAI ALLE EMAIL</button></div><div class="cards five"><div class="card"><span>Attività aperte</span><strong id="emailActOpen">0</strong></div><div class="card"><span>Interventi</span><strong id="emailActJobs">0</strong></div><div class="card"><span>Segnalazioni</span><strong id="emailActReports">0</strong></div><div class="card"><span>Programmate</span><strong id="emailActScheduled">0</strong></div><div class="card"><span>Completate</span><strong id="emailActDone">0</strong></div></div><div class="panel"><div class="email-activity-filters"><input id="emailActivitySearch" placeholder="Cerca attività, commessa, impianto..."><select id="emailActivityKind"><option value="">Tutti i tipi</option><option>Intervento</option><option>Segnalazione</option><option>Preventivo</option><option>Programmato</option><option>Rapportino</option></select><select id="emailActivityStatus"><option value="">Tutti gli stati</option>${statuses.map(x=>`<option>${x}</option>`).join('')}</select></div></div><div class="panel"><div id="emailActivitiesList" class="list"></div></div>`;
  document.querySelector('.main')?.appendChild(section);
  document.getElementById('emailActivitiesInbox').onclick=()=>nav('richieste');
  document.getElementById('emailActivitySearch').oninput=renderActivityCenter;document.getElementById('emailActivityKind').onchange=renderActivityCenter;document.getElementById('emailActivityStatus').onchange=renderActivityCenter;
}
function renderActivityCenter(){
  if(!document.getElementById('emailActivitiesList'))return;
  const created=(db.requests||[]).filter(r=>activityKind(r).length||r.status==='Completata');
  document.getElementById('emailActOpen').textContent=created.filter(r=>!['Completata','Archiviata'].includes(r.status)).length;
  document.getElementById('emailActJobs').textContent=created.filter(r=>activityKind(r).includes('Intervento')).length;
  document.getElementById('emailActReports').textContent=created.filter(r=>activityKind(r).includes('Segnalazione')).length;
  document.getElementById('emailActScheduled').textContent=created.filter(r=>r.scheduledDate).length;
  document.getElementById('emailActDone').textContent=created.filter(r=>r.status==='Completata').length;
  const q=normalize(document.getElementById('emailActivitySearch').value),kind=document.getElementById('emailActivityKind').value,status=document.getElementById('emailActivityStatus').value;
  const rows=created.filter(r=>(!kind||activityKind(r).includes(kind))&&(!status||r.status===status)&&(!q||normalize([r.subject,r.notes,r.bodyPreview,jobName(r.jobId),plantLabel(selectedPlant(r)),activityKind(r).join(' ')].join(' ')).includes(q))).sort((a,b)=>String(b.updatedAt||b.emailDate).localeCompare(String(a.updatedAt||a.emailDate)));
  const card=r=>{const kinds=activityKind(r),plant=selectedPlant(r),team=(db.vcSquadre||[]).find(t=>teamId(t)===String(r.assignedTeamId||r.teamId||'')),preview=compactActivityPreview(r.notes||r.activity?.description||r.bodyPreview||'');return `<div class="item email-activity-card"><div class="item-main"><div class="item-title">${html(r.subject||'Attività da email')} ${kinds.map(k=>`<span class="badge">${html(k)}</span>`).join(' ')}</div><div class="item-sub">${plant?html(plantLabel(plant))+' • ':''}${r.scheduledDate?html(r.scheduledDate)+' • ':''}${team?html(teamLabel(team))+' • ':''}<span class="badge ${r.needsReview?'priority-high':''}">${html(r.status||'Nuova')}</span></div><div class="item-sub email-activity-note">${html(preview)}</div></div><div class="item-actions"><button class="mini primary" data-email-activity-open="${html(r.id)}">APRI</button>${r.quoteNumber?`<button class="mini" data-email-activity-go="preventivi">PREVENTIVO</button>`:''}${r.scheduledDate?`<button class="mini" data-email-activity-go="scadenze">SCADENZA</button>`:''}${r.reportStartedAt?`<button class="mini" data-email-activity-go="rapportini">RAPPORTINO</button>`:''}</div></div>`};
  const groups=new Map();rows.forEach(r=>{const name=jobName(r.jobId)||'Senza commessa';if(!groups.has(name))groups.set(name,[]);groups.get(name).push(r)});
  document.getElementById('emailActivitiesList').innerHTML=rows.length?[...groups.entries()].map(([name,items])=>`<div class="email-activity-group"><div class="email-activity-group-title">${html(name)} · ${items.length} attività</div><div class="email-activity-group-list">${items.map(card).join('')}</div></div>`).join(''):'<div class="empty">Nessuna attività creata dalle email.</div>';
  document.querySelectorAll('[data-email-activity-open]').forEach(b=>b.onclick=()=>openManager(b.dataset.emailActivityOpen));document.querySelectorAll('[data-email-activity-go]').forEach(b=>b.onclick=()=>nav(b.dataset.emailActivityGo));
}
function renderSenderRules(){
  const box=document.getElementById('requestSenderRules'),select=document.getElementById('requestSenderJob');if(!box||!select)return;
  const value=settings();select.innerHTML='<option value="">Scegli la commessa</option>'+db.jobs.map(j=>`<option value="${html(j.id)}">${html((j.code?j.code+' — ':'')+j.title)}</option>`).join('');
  box.innerHTML=value.senderRules.length?value.senderRules.map(rule=>`<div class="item"><div class="item-main"><div class="item-title">${html(rule.email)}</div><div class="item-sub">Commessa: ${html(jobName(rule.jobId)||'Non disponibile')}</div></div><button class="mini danger" data-request-rule-delete="${html(rule.id)}">ELIMINA</button></div>`).join(''):'<div class="empty">Nessun mittente inserito: verranno considerate tutte le email riconosciute come richieste.</div>';
  box.querySelectorAll('[data-request-rule-delete]').forEach(button=>button.onclick=()=>{const next=settings();next.senderRules=next.senderRules.filter(rule=>rule.id!==button.dataset.requestRuleDelete);saveSettings(next);renderSenderRules()});
}
function install(){
  const email=document.getElementById('requestEmailInput');if(!email||email.dataset.ready)return;email.dataset.ready='1';email.value=requestEmail();const initial=settings();document.getElementById('requestPeriodDays').value=String(initial.days);
  const settingsBox=email.closest('.request-settings');if(settingsBox&&!document.getElementById('installRequestSchedule'))settingsBox.insertAdjacentHTML('beforeend','<button id="installRequestSchedule" class="primary">ATTIVA AUTOMATICO 05:00 / 15:00</button>');
  document.getElementById('installRequestSchedule').onclick=async()=>{const info=document.getElementById('requestSyncInfo'),button=document.getElementById('installRequestSchedule');try{setBusy(button,true,'ATTIVA AUTOMATICO 05:00 / 15:00');info.textContent='Attivazione controllo automatico…';await call('configure',bridgePayload());const out=await call('installRequestSchedule',bridgePayload());info.textContent=out?.active?'Controllo automatico attivo ogni giorno alle 05:00 e alle 15:00 (ora italiana).':'Il ponte non ha confermato entrambi gli orari.'}catch(e){const message=String(e?.message||e);info.textContent=/script\.scriptapp|getProjectTriggers|autorizzazione necessaria/i.test(message)?'Autorizzazione Google ancora necessaria: nell’editor Apps Script esegui una volta authorizeAndInstallRequestSchedule, consenti l’accesso e poi premi nuovamente questo pulsante.':'Impossibile attivare il controllo automatico: '+message}finally{setBusy(button,false,'ATTIVA AUTOMATICO 05:00 / 15:00')}};
  document.getElementById('saveRequestEmail').onclick=async()=>{
    const info=document.getElementById('requestSyncInfo'),button=document.getElementById('saveRequestEmail'),value=email.value.trim().toLowerCase();
    if(!validEmail(value)){info.textContent='Inserisci un indirizzo email valido.';email.focus();return}
    db.company=db.company||{};db.company.requestEmail=value;localStorage.setItem(requestEmailKey,value);const next=settings();next.days=Number(document.getElementById('requestPeriodDays').value)||30;saveSettings(next);email.value=value;
    info.textContent='Email salvata su questo dispositivo. Aggiornamento del ponte Gmail in corso…';setBusy(button,true,'SALVA EMAIL');
    try{await call('configure',bridgePayload());const schedule=await call('installRequestSchedule',bridgePayload());info.textContent=schedule?.active?'Impostazioni salvate. Controllo automatico attivo alle 05:00 e alle 15:00.':'Impostazioni salvate e ponte Gmail aggiornato.'}
    catch(e){info.textContent='Email salvata sul dispositivo, ma il ponte Gmail non ha risposto: '+(e.message||e)}
    finally{setBusy(button,false,'SALVA IMPOSTAZIONI')}
  };
  document.getElementById('addRequestSender').onclick=async()=>{const sender=document.getElementById('requestSenderEmail'),job=document.getElementById('requestSenderJob'),info=document.getElementById('requestSyncInfo'),address=sender.value.trim().toLowerCase();if(!validEmail(address)){info.textContent='Inserisci un indirizzo mittente valido.';sender.focus();return}if(!job.value){info.textContent='Scegli la commessa da collegare.';job.focus();return}const next=settings(),existing=next.senderRules.find(rule=>rule.email===address);if(existing)existing.jobId=job.value;else next.senderRules.push({id:uid(),email:address,jobId:job.value});saveSettings(next);sender.value='';job.value='';renderSenderRules();info.textContent='Mittente collegato alla commessa. Premi SALVA IMPOSTAZIONI per aggiornare anche Gmail.'};
  document.getElementById('checkRequestsNow').onclick=scan;
  ['requestStatusFilter','requestTypeFilter','requestSearch'].forEach(id=>document.getElementById(id).addEventListener(id==='requestSearch'?'input':'change',render));
  installActivityCenter();const oldRows=(db.requests||[]).filter(r=>!r.autoOrganizedAt);oldRows.forEach(autoOrganizeRequest);if(oldRows.length)save();renderSenderRules();render();renderActivityCenter();setTimeout(()=>importReceipts().catch(()=>{}),3500);setInterval(()=>importReceipts().catch(()=>{}),15*60*1000);
}
const baseRefresh=window.refresh;window.refresh=function(){baseRefresh();render();renderSenderRules();renderActivityCenter()};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
