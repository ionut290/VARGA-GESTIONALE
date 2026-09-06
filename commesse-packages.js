/* Pacchetti nella vista commesse.
   Il raggruppamento e' solo visivo: ogni commessa conserva ID, codice e dati separati. */
(function(){
'use strict';
if(typeof db==='undefined')return;

const norm=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const jobText=job=>norm([job?.title,job?.code,job?.site,job?.commessa,job?.nome].filter(Boolean).join(' '));

const packages=[
  {
    id:'discariche',
    title:'DISCARICHE',
    emptyName:'discarica',
    description:'Ore, squadre, consuntivi e contabilita restano separati per ogni discarica.',
    matches:text=>text.includes('discaric')&&!text.includes('cadriano')&&!text.includes('ozzano')&&!(/\bstr\s*g\b/.test(text)||text.includes('strg')||text.includes('stradelli guelf'))
  },
  {
    id:'inrete',
    title:'INRETE',
    emptyName:'commessa INRETE',
    description:'INRETE Bologna, Modena e Ferrara, con codici e dati sempre separati.',
    matches:text=>/\binrete\b/.test(text)&&/\b(bologna|modena|ferrara)\b/.test(text)
  },
  {
    id:'varie',
    title:'VARIE',
    emptyName:'commessa',
    description:'Hera Ozzano, WTE, Vega Carburanti, STR G e Hera Cadriano.',
    matches:text=>text.includes('ozzano')||text.includes('vega carburanti')||text.includes('cadriano')||text.includes('stradelli guelf')||/\bstr\s*g\b/.test(text)||text.includes('strg')||(/\bwte\b/.test(text)&&/\b(mo|modena)\b/.test(text))
  },
  {
    id:'comune-bologna',
    title:'COMUNE BOLOGNA',
    emptyName:'commessa Comune Bologna',
    description:'Potature Abbattimenti e Sfalcio COBO, mantenute come commesse distinte.',
    matches:text=>text.includes('potature abbattimenti')||text.includes('pot abb')||text.includes('sfalcio cobo')||text.includes('cobo sfalcio')
  }
];

const packageJobs=spec=>(Array.isArray(db.jobs)?db.jobs:[]).filter(j=>spec.matches(jobText(j)));
const statusText=job=>job?.status||job?.stato||'Attiva';
let activePackage=null;
let observer=null;

function ensureStyles(){
  if(document.getElementById('vgCommessePackageStyles'))return;
  const style=document.createElement('style');
  style.id='vgCommessePackageStyles';
  style.textContent=`.vg-package-card{border:2px solid #287756;background:linear-gradient(180deg,#f3fbf7,#fff)}.vg-package-card .vg-job-code{color:#176b48;opacity:1}.vg-package-card h3{color:#153d2e}.vg-package-modal{position:fixed;inset:0;background:rgba(15,23,42,.46);z-index:10050;display:flex;align-items:center;justify-content:center;padding:18px}.vg-package-modal[hidden]{display:none}.vg-package-modal-card{background:#fff;width:min(920px,96vw);max-height:88vh;overflow:auto;border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,.28);padding:20px}.vg-package-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:15px}.vg-package-modal-head h2{margin:0 0 4px}.vg-package-modal-head p{margin:0;color:#667085}.vg-package-close{border:1px solid #d0d5dd;background:#fff;border-radius:9px;padding:8px 11px;font-weight:800;cursor:pointer}.vg-package-list{display:grid;gap:10px}.vg-package-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;border:1px solid #dfe6e2;border-radius:12px;padding:13px 14px;background:#fff}.vg-package-row-code{font-size:12px;font-weight:900;color:#176b48;letter-spacing:.04em}.vg-package-row-title{font-weight:900;margin-top:2px}.vg-package-row-meta{font-size:12px;color:#667085;margin-top:4px}.vg-package-open{border:0;background:#176b48;color:#fff;border-radius:9px;padding:9px 13px;font-weight:900;cursor:pointer}@media(max-width:620px){.vg-package-row{grid-template-columns:1fr}.vg-package-open{width:100%}}`;
  document.head.appendChild(style);
}

function ensureModal(){
  let modal=document.getElementById('vgCommessePackageModal');
  if(modal)return modal;
  modal=document.createElement('div');
  modal.id='vgCommessePackageModal';
  modal.className='vg-package-modal';
  modal.hidden=true;
  modal.innerHTML='<div class="vg-package-modal-card"><div class="vg-package-modal-head"><div><h2></h2><p></p></div><button type="button" class="vg-package-close">CHIUDI</button></div><div class="vg-package-list"></div></div>';
  document.body.appendChild(modal);
  modal.querySelector('.vg-package-close').onclick=closeModal;
  modal.onclick=e=>{if(e.target===modal)closeModal()};
  return modal;
}

function closeModal(){
  const modal=document.getElementById('vgCommessePackageModal');
  if(modal)modal.hidden=true;
  activePackage=null;
}

function openJob(id){
  closeModal();
  if(typeof window.VargaOpenJob==='function')window.VargaOpenJob(id);
}

function showPackage(spec){
  activePackage=spec;
  const jobs=packageJobs(spec).slice().sort((a,b)=>String(a.title||'').localeCompare(String(b.title||''),'it'));
  const modal=ensureModal();
  modal.querySelector('h2').textContent='Pacchetto '+spec.title;
  modal.querySelector('.vg-package-modal-head p').textContent=spec.description;
  const list=modal.querySelector('.vg-package-list');
  list.innerHTML=jobs.length?jobs.map(j=>`<div class="vg-package-row"><div><div class="vg-package-row-code">${esc(j.code||'Codice non assegnato')}</div><div class="vg-package-row-title">${esc(j.title||spec.emptyName)}</div><div class="vg-package-row-meta">${esc([j.site,statusText(j)].filter(Boolean).join(' • '))}</div></div><button type="button" class="vg-package-open" data-vg-package-open="${esc(j.id)}">APRI</button></div>`).join(''):'<div class="vg-empty">Nessuna commessa nel pacchetto.</div>';
  list.querySelectorAll('[data-vg-package-open]').forEach(button=>button.onclick=()=>openJob(button.dataset.vgPackageOpen));
  modal.hidden=false;
}

function packageCard(spec,count){
  const wrapper=document.createElement('div');
  wrapper.innerHTML=`<div class="vg-job-card vg-package-card" data-vg-package-card="${esc(spec.id)}"><div class="vg-job-code">PACCHETTO COMMESSE</div><h3>${esc(spec.title)}</h3><div class="vg-job-meta">${count} commesse raggruppate • codici e dati separati</div><div class="vg-job-bottom"><span class="badge">ATTIVE</span><span class="vg-job-open">APRI PACCHETTO →</span></div><div class="vg-job-meta" style="margin-top:10px">${esc(spec.description)}</div></div>`;
  const card=wrapper.firstElementChild;
  card.onclick=()=>showPackage(spec);
  return card;
}

function groupGrid(grid){
  if(!grid)return;
  grid.querySelectorAll('[data-vg-package-card],[data-vg-discariche-package]').forEach(card=>card.remove());
  const cards=[...grid.querySelectorAll('[data-open-job]')];
  cards.forEach(card=>card.style.display='');
  const byId=new Map(cards.map(card=>[String(card.dataset.openJob),card]));
  const alreadyGrouped=new Set();
  const anchor=grid.firstChild;
  packages.forEach(spec=>{
    const jobs=packageJobs(spec).filter(job=>!alreadyGrouped.has(String(job.id)));
    const visibleJobs=jobs.filter(job=>byId.has(String(job.id)));
    if(!visibleJobs.length)return;
    jobs.forEach(job=>alreadyGrouped.add(String(job.id)));
    visibleJobs.forEach(job=>byId.get(String(job.id)).style.display='none');
    grid.insertBefore(packageCard(spec,jobs.length),anchor);
  });
}

function applyGrouping(){
  if(observer)observer.disconnect();
  ensureStyles();
  groupGrid(document.getElementById('vgJobGrid'));
  groupGrid(document.querySelector('#vgDashboardJobs .vg-job-grid'));
  if(observer)observer.observe(document.documentElement,{childList:true,subtree:true});
}

const baseRefresh=window.refresh;
if(typeof baseRefresh==='function')window.refresh=function(){const out=baseRefresh.apply(this,arguments);setTimeout(applyGrouping,0);return out};
observer=new MutationObserver(()=>{clearTimeout(observer._timer);observer._timer=setTimeout(applyGrouping,30)});
observer.observe(document.documentElement,{childList:true,subtree:true});
setTimeout(applyGrouping,0);
window.VargaOpenJobPackage=id=>{const spec=packages.find(item=>item.id===id);if(spec)showPackage(spec)};
})();
