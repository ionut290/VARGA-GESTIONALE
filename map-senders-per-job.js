/* Configurazione mittenti MAP per singola commessa. */
(function(){
'use strict';
const c=v=>String(v??'').trim();
const e=v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const validEmail=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
function parseList(v){return [...new Set(String(v||'').split(/[\n,;]+/).map(x=>x.trim().toLowerCase()).filter(Boolean))]}
function install(){
 const s=document.getElementById('commesse'); if(!s||document.getElementById('mapSendersPanel'))return;
 const panel=document.createElement('div'); panel.id='mapSendersPanel'; panel.className='panel'; panel.innerHTML=`<h2>Mittenti MAP autorizzati per commessa</h2><p class="muted">Per ogni commessa puoi indicare uno o più indirizzi email dai quali può arrivare il MAP. Il controllo MAP userà solo questi mittenti e solo dopo l'invio della contabilità.</p><div class="formgrid"><select id="mapJobSelect"></select><textarea id="mapSenderEmails" rows="4" placeholder="Un indirizzo per riga, es. nome@azienda.it"></textarea><button id="saveMapSenders" class="primary">SALVA MITTENTI MAP</button></div><div id="mapSenderInfo" class="muted" style="margin-top:8px"></div>`;
 const jobsPanel=document.getElementById('jobsList')?.closest('.panel'); if(jobsPanel)jobsPanel.insertAdjacentElement('beforebegin',panel); else s.appendChild(panel);
 const sel=document.getElementById('mapJobSelect'), ta=document.getElementById('mapSenderEmails'), info=document.getElementById('mapSenderInfo');
 function fill(){const current=sel.value;sel.innerHTML='<option value="">Seleziona commessa</option>'+db.jobs.slice().sort((a,b)=>c(a.title).localeCompare(c(b.title),'it')).map(j=>`<option value="${e(j.id)}">${e(j.title)}${j.code?' — '+e(j.code):''}</option>`).join('');if(current&&db.jobs.some(j=>j.id===current))sel.value=current;load()}
 function load(){const j=db.jobs.find(x=>x.id===sel.value);ta.value=(j?.mapSenderEmails||[]).join('\n');info.textContent=j?(j.mapSenderEmails?.length?`${j.mapSenderEmails.length} mittente/i configurato/i per ${j.title}.`:`Nessun mittente MAP configurato per ${j.title}.`):'Seleziona una commessa.'}
 sel.addEventListener('change',load);
 document.getElementById('saveMapSenders').addEventListener('click',()=>{const j=db.jobs.find(x=>x.id===sel.value);if(!j)return alert('Seleziona una commessa.');const arr=parseList(ta.value),bad=arr.filter(x=>!validEmail(x));if(bad.length)return alert('Indirizzi email non validi:\n'+bad.join('\n'));j.mapSenderEmails=arr;j.mapSenderUpdatedAt=new Date().toISOString();save();info.textContent=`Salvati ${arr.length} mittente/i MAP per ${j.title}.`;});
 window.addEventListener('vg-jobs-changed',fill);setInterval(()=>{if(sel.options.length!==db.jobs.length+1)fill()},2000);fill();
}
function getSendersForRound(round){const job=db.jobs.find(j=>j.vcSourceId&&round?._path?.startsWith(j.vcSourceId+'/'))||db.jobs.find(j=>c(j.title).toLowerCase()===c(round?.commessaNome).toLowerCase());return job?.mapSenderEmails||[]}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();setTimeout(install,300);window.VargaMapSenders={getSendersForRound,parseList};
})();
