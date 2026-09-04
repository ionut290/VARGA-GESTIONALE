/* Centro richieste/segnalazioni ricevute via Gmail. Non invia mai risposte automatiche. */
(function(){
'use strict';
const appliedKey='vg_requestMailApplied';
const dismissedKey='vg_requestMailDismissed';
const requestEmailKey='vg_requestEmail';
const requestSettingsKey='vg_requestSettings';
const statuses=['Nuova','Presa in carico','Programmata','In lavorazione','Completata','Archiviata'];
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
    db.requests.push({id:uid(),sourceReceiptId:r.id,source:'Gmail',gmailMessageId:r.gmailMessageId||'',gmailThreadId:r.gmailThreadId||'',from:r.from||'',fromName:r.fromName||'',subject:r.subject||'Email senza oggetto',bodyPreview:r.bodyPreview||'',emailDate:r.emailDate||'',receivedAt:r.archivedAt||new Date().toISOString(),type:r.type||'Comunicazione',priority:r.priority||'Normale',status:'Nuova',jobId:r.jobId||(match?.score?match.j.id:''),clientId:'',assignedTo:'',dueDate:'',attachmentNames:r.attachmentNames||[],files:r.files||[],notes:'',updatedAt:new Date().toISOString()});
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
function addDeadlineFromRequest(r,v){if(!v.date&&!v.dueDate)return false;const existing=db.deadlines.find(x=>x.sourceRequestId===r.id);const d={id:existing?.id||uid(),sourceRequestId:r.id,title:r.subject||'Intervento da email',date:v.date||v.dueDate,type:'Commessa',notes:[jobName(v.jobId),requestSite({...r,...v}),v.notes].filter(Boolean).join(' • '),done:false};if(existing)Object.assign(existing,d);else db.deadlines.push(d);return true}
function makeQuote(r,v){const job=db.jobs.find(j=>j.id===v.jobId),clientId=job?.clientId||r.clientId||'',client=db.clients.find(c=>c.id===clientId);const existing=db.quotes.find(q=>q.sourceRequestId===r.id);if(existing){alert('Per questa email esiste già il preventivo '+existing.number+'.');nav('preventivi');return}const number=`PREV-${new Date().getFullYear()}-${String(db.quotes.length+1).padStart(4,'0')}`;db.quotes.push({id:uid(),sourceRequestId:r.id,number,date:new Date().toISOString().slice(0,10),clientId,clientName:client?.name||r.fromName||r.from,client:client||{},subject:r.subject,site:requestSite({...r,...v}),rows:[{id:uid(),code:'',description:v.notes||r.bodyPreview||r.subject,unit:'cad',qty:1,price:0}],subtotal:0,vat:0,total:0,vatRate:22,discount:0,validity:30,payment:'',status:'Bozza'});r.quoteNumber=number;r.status='Presa in carico';save();document.getElementById('requestWorkModal').hidden=true;nav('preventivi')}
function makeWorkReport(r,v){if(typeof window.openReportFromRequest==='function'){storeModal(r);document.getElementById('requestWorkModal').hidden=true;window.openReportFromRequest({...r,...v,site:requestSite({...r,...v})});return}alert('Il modulo Rapportini non è ancora pronto. Ricarica la pagina e riprova.')}
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
function renderSenderRules(){
  const box=document.getElementById('requestSenderRules'),select=document.getElementById('requestSenderJob');if(!box||!select)return;
  const value=settings();select.innerHTML='<option value="">Scegli la commessa</option>'+db.jobs.map(j=>`<option value="${html(j.id)}">${html((j.code?j.code+' — ':'')+j.title)}</option>`).join('');
  box.innerHTML=value.senderRules.length?value.senderRules.map(rule=>`<div class="item"><div class="item-main"><div class="item-title">${html(rule.email)}</div><div class="item-sub">Commessa: ${html(jobName(rule.jobId)||'Non disponibile')}</div></div><button class="mini danger" data-request-rule-delete="${html(rule.id)}">ELIMINA</button></div>`).join(''):'<div class="empty">Nessun mittente inserito: verranno considerate tutte le email riconosciute come richieste.</div>';
  box.querySelectorAll('[data-request-rule-delete]').forEach(button=>button.onclick=()=>{const next=settings();next.senderRules=next.senderRules.filter(rule=>rule.id!==button.dataset.requestRuleDelete);saveSettings(next);renderSenderRules()});
}
function install(){
  const email=document.getElementById('requestEmailInput');if(!email||email.dataset.ready)return;email.dataset.ready='1';email.value=requestEmail();const initial=settings();document.getElementById('requestPeriodDays').value=String(initial.days);
  document.getElementById('saveRequestEmail').onclick=async()=>{
    const info=document.getElementById('requestSyncInfo'),button=document.getElementById('saveRequestEmail'),value=email.value.trim().toLowerCase();
    if(!validEmail(value)){info.textContent='Inserisci un indirizzo email valido.';email.focus();return}
    db.company=db.company||{};db.company.requestEmail=value;localStorage.setItem(requestEmailKey,value);const next=settings();next.days=Number(document.getElementById('requestPeriodDays').value)||30;saveSettings(next);email.value=value;
    info.textContent='Email salvata su questo dispositivo. Aggiornamento del ponte Gmail in corso…';setBusy(button,true,'SALVA EMAIL');
    try{await call('configure',bridgePayload());info.textContent='Impostazioni salvate e ponte Gmail aggiornato correttamente.'}
    catch(e){info.textContent='Email salvata sul dispositivo, ma il ponte Gmail non ha risposto: '+(e.message||e)}
    finally{setBusy(button,false,'SALVA IMPOSTAZIONI')}
  };
  document.getElementById('addRequestSender').onclick=async()=>{const sender=document.getElementById('requestSenderEmail'),job=document.getElementById('requestSenderJob'),info=document.getElementById('requestSyncInfo'),address=sender.value.trim().toLowerCase();if(!validEmail(address)){info.textContent='Inserisci un indirizzo mittente valido.';sender.focus();return}if(!job.value){info.textContent='Scegli la commessa da collegare.';job.focus();return}const next=settings(),existing=next.senderRules.find(rule=>rule.email===address);if(existing)existing.jobId=job.value;else next.senderRules.push({id:uid(),email:address,jobId:job.value});saveSettings(next);sender.value='';job.value='';renderSenderRules();info.textContent='Mittente collegato alla commessa. Premi SALVA IMPOSTAZIONI per aggiornare anche Gmail.'};
  document.getElementById('checkRequestsNow').onclick=scan;
  ['requestStatusFilter','requestTypeFilter','requestSearch'].forEach(id=>document.getElementById(id).addEventListener(id==='requestSearch'?'input':'change',render));
  renderSenderRules();render();setTimeout(()=>importReceipts().catch(()=>{}),3500);setInterval(()=>importReceipts().catch(()=>{}),15*60*1000);
}
const baseRefresh=window.refresh;window.refresh=function(){baseRefresh();render();renderSenderRules()};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
