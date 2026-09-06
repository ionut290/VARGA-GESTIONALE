/* Instradamento email per PACCHETTO DISCARICHE.
   Il mittente può essere collegato una sola volta al pacchetto; ogni email viene poi
   assegnata alla singola commessa discarica riconosciuta da codice/nome/testo.
   CADRIANO e STR G restano esclusi dal pacchetto. */
(function(){
'use strict';
const PACKAGE_ID='__DISCARICHE_PACKAGE__';
const SETTINGS_KEY='vg_requestSettings';
const norm=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stop=new Set(['discarica','discariche','hera','herambiente','reti','rete','gruppo','impianto','impianti','commessa','servizio','servizi','area','sito','siti','gestione']);

function isDiscarica(job){
  const text=norm([job?.title,job?.code,job?.site,job?.commessa,job?.nome].filter(Boolean).join(' '));
  if(!text.includes('discaric'))return false;
  if(text.includes('cadriano'))return false;
  if(/\bstr\s*g\b/.test(text)||text.includes('strg'))return false;
  return true;
}
function packageJobs(){return (Array.isArray(window.db?.jobs)?window.db.jobs:[]).filter(isDiscarica)}
function readSettings(){
  let local={};try{local=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')||{}}catch(_){local={}}
  const senderRules=Array.isArray(window.db?.company?.requestSenderRules)?window.db.company.requestSenderRules:(Array.isArray(local.senderRules)?local.senderRules:[]);
  return{days:Number(window.db?.company?.requestScanDays||local.days)||30,senderRules};
}
function extractEmail(value){const s=String(value||'').trim().toLowerCase(),m=s.match(/<([^>]+@[^>]+)>/);return (m?m[1]:s).trim()}
function senderUsesPackage(request){
  const email=extractEmail(request?.from||request?.fromEmail||'');
  if(!email)return false;
  return readSettings().senderRules.some(r=>String(r?.jobId||'')===PACKAGE_ID&&extractEmail(r?.email||'')===email);
}
function tokens(v){return norm(v).split(/\s+/).filter(x=>x.length>=4&&!stop.has(x))}
function scoreJob(job,text){
  const nt=norm(text),code=norm(job?.code),title=norm(job?.title),site=norm(job?.site),name=norm(job?.nome||job?.commessa);
  let score=0,direct=false;
  if(code&&code.length>=3&&nt.includes(code)){score+=120;direct=true}
  for(const phrase of [title,site,name])if(phrase&&phrase.length>=5&&nt.includes(phrase)){score+=45;direct=true}
  const all=[...new Set([...tokens(job?.title),...tokens(job?.site),...tokens(job?.nome),...tokens(job?.commessa)])];
  all.forEach(t=>{if(nt.includes(t))score+=t.length>=8?10:6});
  return{score,direct};
}
function detectJob(request){
  const text=[request?.subject,request?.bodyPreview,request?.notes,(request?.attachmentNames||[]).join(' '),(request?.files||[]).map(f=>f?.name||'').join(' ')].join(' ');
  const ranked=packageJobs().map(job=>({job,...scoreJob(job,text)})).sort((a,b)=>b.score-a.score);
  const best=ranked[0],second=ranked[1];
  if(!best||best.score<10)return null;
  if(!best.direct&&second&&best.score-second.score<6)return null;
  if(second&&best.score===second.score)return null;
  return best.job;
}
function routeRequest(r){
  if(!r||!senderUsesPackage(r))return false;
  const target=detectJob(r),old=String(r.jobId||'');
  if(target){
    r.jobId=target.id;r.packageJobId=PACKAGE_ID;r.packageResolvedAt=new Date().toISOString();r.packageResolvedCode=target.code||'';r.packageResolvedTitle=target.title||'';r.needsReview=false;
    if(r.activity)r.activity.jobId=target.id;
    if(r.status==='Da verificare'&&r.plantId)r.status='Presa in carico';
  }else{
    r.jobId='';r.packageJobId=PACKAGE_ID;r.packageResolvedAt='';r.packageResolvedCode='';r.packageResolvedTitle='';r.needsReview=true;
    if(r.activity)r.activity.jobId='';
    if(!['Completata','Archiviata'].includes(r.status))r.status='Da verificare';
  }
  return old!==String(r.jobId||'');
}
function routeAll(){
  let changed=false;(Array.isArray(window.db?.requests)?window.db.requests:[]).forEach(r=>{if(routeRequest(r))changed=true});return changed;
}
function ensurePackageOption(){
  const select=document.getElementById('requestSenderJob');if(!select)return;
  let opt=select.querySelector(`option[value="${PACKAGE_ID}"]`);
  if(!opt){opt=document.createElement('option');opt.value=PACKAGE_ID;opt.textContent='PACCHETTO DISCARICHE — instradamento automatico';select.insertBefore(opt,select.options[1]||null)}
}
function fixRuleLabels(){
  const box=document.getElementById('requestSenderRules');if(!box)return;
  const settings=readSettings();
  box.querySelectorAll('[data-request-rule-delete]').forEach(btn=>{
    const rule=settings.senderRules.find(r=>String(r.id)===String(btn.dataset.requestRuleDelete));if(!rule||String(rule.jobId)!==PACKAGE_ID)return;
    const item=btn.closest('.item'),sub=item?.querySelector('.item-sub');if(sub)sub.textContent='Commessa: PACCHETTO DISCARICHE — riconoscimento automatico';
  });
}
function enhanceUi(){ensurePackageOption();fixRuleLabels()}

const baseSave=window.save;
if(typeof baseSave==='function'&&!baseSave.__discaricheRouting){
  const wrapped=function(){routeAll();return baseSave.apply(this,arguments)};wrapped.__discaricheRouting=true;window.save=wrapped;
}
const baseRefresh=window.refresh;
if(typeof baseRefresh==='function'&&!baseRefresh.__discaricheRouting){
  const wrapped=function(){const changed=routeAll();const out=baseRefresh.apply(this,arguments);setTimeout(enhanceUi,0);if(changed)console.info('Instradamento PACCHETTO DISCARICHE aggiornato');return out};wrapped.__discaricheRouting=true;window.refresh=wrapped;
}
const obs=new MutationObserver(()=>{clearTimeout(obs._t);obs._t=setTimeout(enhanceUi,20)});obs.observe(document.documentElement,{subtree:true,childList:true});
setInterval(()=>{const changed=routeAll();if(changed&&typeof window.save==='function')window.save();enhanceUi()},2500);
setTimeout(()=>{const changed=routeAll();enhanceUi();if(changed&&typeof window.save==='function')window.save()},300);
window.VargaDiscaricheMailRouting=Object.freeze({PACKAGE_ID,detectJob,routeAll,packageJobs});
})();
