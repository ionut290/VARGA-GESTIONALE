/* Modifica mittenti/commesse nel Centro Richieste. */
(function(){
'use strict';
const SETTINGS_KEY='vg_requestSettings';
function readSettings(){
  let local={};
  try{local=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')||{}}catch(_){local={}}
  const senderRules=Array.isArray(window.db?.company?.requestSenderRules)?window.db.company.requestSenderRules:(Array.isArray(local.senderRules)?local.senderRules:[]);
  const days=Number(window.db?.company?.requestScanDays||local.days)||30;
  return{days,senderRules};
}
function writeSettings(value){
  try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(value))}catch(_){ }
  if(window.db){window.db.company=window.db.company||{};window.db.company.requestScanDays=value.days;window.db.company.requestSenderRules=value.senderRules}
  if(typeof window.save==='function')window.save();
}
function validEmail(value){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value||'').trim())}
function resetEdit(){
  const add=document.getElementById('addRequestSender');
  if(add){delete add.dataset.editRuleId;add.textContent='AGGIUNGI'}
}
function enhance(){
  const box=document.getElementById('requestSenderRules'),add=document.getElementById('addRequestSender');
  if(!box||!add)return;
  box.querySelectorAll('[data-request-rule-delete]').forEach(del=>{
    if(del.parentElement?.querySelector('[data-request-rule-edit]'))return;
    const edit=document.createElement('button');
    edit.type='button';edit.className='mini ghost';edit.textContent='MODIFICA';
    edit.dataset.requestRuleEdit=del.dataset.requestRuleDelete||'';
    del.insertAdjacentElement('beforebegin',edit);
  });
}
function beginEdit(id){
  const value=readSettings(),rule=value.senderRules.find(x=>String(x.id)===String(id));
  if(!rule)return;
  const email=document.getElementById('requestSenderEmail'),job=document.getElementById('requestSenderJob'),add=document.getElementById('addRequestSender');
  if(!email||!job||!add)return;
  email.value=rule.email||'';job.value=rule.jobId||'';add.dataset.editRuleId=String(rule.id);add.textContent='SALVA MODIFICA';email.focus();
}
function saveEdit(event){
  const add=document.getElementById('addRequestSender');
  if(!add?.dataset.editRuleId)return;
  event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
  const email=document.getElementById('requestSenderEmail'),job=document.getElementById('requestSenderJob'),info=document.getElementById('requestSyncInfo');
  const address=String(email?.value||'').trim().toLowerCase(),jobId=String(job?.value||'');
  if(!validEmail(address)){if(info)info.textContent='Inserisci un indirizzo mittente valido.';email?.focus();return}
  if(!jobId){if(info)info.textContent='Scegli la commessa da collegare.';job?.focus();return}
  const value=readSettings(),rule=value.senderRules.find(x=>String(x.id)===String(add.dataset.editRuleId));
  if(!rule){resetEdit();return}
  const duplicate=value.senderRules.find(x=>x!==rule&&String(x.email||'').toLowerCase()===address);
  if(duplicate){if(info)info.textContent='Questo indirizzo email è già presente.';email?.focus();return}
  rule.email=address;rule.jobId=jobId;writeSettings(value);
  email.value='';job.value='';resetEdit();
  if(info)info.textContent='Mittente aggiornato. Premi SALVA IMPOSTAZIONI per aggiornare anche Gmail.';
  if(typeof window.refresh==='function')window.refresh();
  setTimeout(enhance,0);
}
function install(){
  document.addEventListener('click',e=>{
    const edit=e.target.closest?.('[data-request-rule-edit]');if(edit){e.preventDefault();beginEdit(edit.dataset.requestRuleEdit)}
  });
  const add=document.getElementById('addRequestSender');if(add)add.addEventListener('click',saveEdit,true);
  const box=document.getElementById('requestSenderRules');if(box)new MutationObserver(enhance).observe(box,{childList:true,subtree:true});
  enhance();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
