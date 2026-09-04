/* Centro richieste/segnalazioni ricevute via Gmail. Non invia mai risposte automatiche. */
(function(){
'use strict';
const appliedKey='vg_requestMailApplied';
const requestEmailKey='vg_requestEmail';
const requestSettingsKey='vg_requestSettings';
const statuses=['Nuova','Presa in carico','Programmata','In lavorazione','Completata','Archiviata'];
const getApplied=()=>{try{return new Set(JSON.parse(localStorage.getItem(appliedKey)||'[]'))}catch(_){return new Set()}};
const setApplied=s=>localStorage.setItem(appliedKey,JSON.stringify([...s].slice(-1000)));
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
  const applied=getApplied(),ack=[];let imported=0;
  rows.forEach(r=>{
    if(!r?.id)return;
    if(applied.has(r.id)||db.requests.some(x=>x.sourceReceiptId===r.id)){ack.push(r.id);applied.add(r.id);return}
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
    return `<div class="item request-card"><div class="item-main"><div class="item-title">${html(x.subject)} <span class="badge ${pc}">${html(x.priority)}</span> <span class="badge">${html(x.type)}</span></div><div class="item-sub">${html(x.fromName||x.from)} • ${html(new Date(x.emailDate||x.receivedAt).toLocaleString('it-IT'))}${x.attachmentNames?.length?' • '+x.attachmentNames.length+' allegati':''}</div><div class="item-sub request-body">${html(x.bodyPreview)}</div><div class="request-links">${gmail}${files}</div></div><div class="item-actions"><select class="request-select" data-request-status="${x.id}">${options(statuses,x.status)}</select><select class="request-select" data-request-job="${x.id}">${jobOptions(x.jobId)}</select><button class="mini danger" data-request-delete="${x.id}">ELIMINA</button></div></div>`;
  }).join(''):'<div class="empty">Nessuna richiesta trovata.</div>';
  bindRows();
}
function bindRows(){
  document.querySelectorAll('[data-request-status]').forEach(el=>el.onchange=()=>{const r=db.requests.find(x=>x.id===el.dataset.requestStatus);if(r){r.status=el.value;r.updatedAt=new Date().toISOString();save()}});
  document.querySelectorAll('[data-request-job]').forEach(el=>el.onchange=()=>{const r=db.requests.find(x=>x.id===el.dataset.requestJob);if(r){r.jobId=el.value;r.updatedAt=new Date().toISOString();save()}});
  document.querySelectorAll('[data-request-delete]').forEach(el=>el.onclick=()=>{if(!confirm('Eliminare questa richiesta dal gestionale?'))return;db.requests=db.requests.filter(x=>x.id!==el.dataset.requestDelete);save()});
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
