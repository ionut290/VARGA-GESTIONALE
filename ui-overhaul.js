(function(){
'use strict';

const $=id=>document.getElementById(id);

function addStyles(){
  if($('vgUiOverhaulStyle'))return;
  const style=document.createElement('style');
  style.id='vgUiOverhaulStyle';
  style.textContent=`
    :root{--vg-sidebar:245px}
    body{overflow-x:hidden}.main{max-width:none;min-width:0}.page-actions{margin-bottom:18px}.page-actions .subtitle{margin-bottom:0}
    .sidebar{scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.22) transparent}.sidebar-nav{padding-bottom:12px}.vg-nav-label{pointer-events:none}
    .nav:focus-visible,button:focus-visible,a:focus-visible{outline:3px solid #84d4a8;outline-offset:2px}
    .panel>.topline:first-child{flex-wrap:wrap}.item-title{overflow-wrap:anywhere}.item-actions{flex:0 0 auto}
    .card[data-vg-target]{cursor:pointer;transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease}.card[data-vg-target]:hover{transform:translateY(-2px);border-color:#a9cdbb;box-shadow:0 8px 22px rgba(20,50,35,.09)}
    .vg-round-not-started{display:flex;align-items:center;min-height:74px;padding:16px 18px;border:1px solid #d8c184;border-radius:14px;background:#fff8e8;color:#6f520b}
    .vg-round-not-started div{display:grid;gap:5px}.vg-round-not-started span{font-size:13px;color:#795f1e}
    #jobsFormPanel[hidden]{display:none!important}.vg-job-card{min-height:168px}.vg-job-card .vg-job-meta:empty{display:none}
    body.verde-bologna-page-open{overflow:hidden}
    @media(min-width:1500px){.main{padding-left:36px;padding-right:36px}.vg-job-grid{grid-template-columns:repeat(4,minmax(250px,1fr))}}
    @media(max-width:850px){:root{--vg-sidebar:180px}.topline{align-items:flex-start;flex-wrap:wrap}.topline>.primary,.topline>.ghost{max-width:100%}.item{align-items:flex-start}.item-actions{max-width:42%}}
    @media(max-width:640px){
      .app-shell{display:block}.sidebar{position:relative;inset:auto;width:100%;height:auto;max-height:none;padding:14px 12px}.brand{padding:2px 6px 12px;font-size:20px}.sidebar-nav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px}.nav{margin:0;padding:10px;font-size:13px}.vg-nav-label{grid-column:1/-1;padding:14px 8px 4px}.sidebar-account{margin-top:10px}.main{width:100%;margin-left:0;padding:16px}.cards,.cards.five,.grid2,.formgrid{grid-template-columns:1fr}.card{padding:14px}.card strong{font-size:24px}.topline{display:grid}.topline>button{width:100%}.item{display:grid}.item-actions{max-width:none;justify-content:flex-start}.vg-job-grid{grid-template-columns:1fr}.vg-tabs{top:0;margin:0 -16px;padding:8px 16px;background:#f4f6f5}.email-activity-group-title{top:0}.verde-bologna-page{z-index:21000}
    }
  `;
  document.head.appendChild(style);
}

function accessibleFields(root=document){
  root.querySelectorAll('input,select,textarea').forEach(field=>{
    if(field.type==='hidden'||field.getAttribute('aria-label')||field.closest('label'))return;
    const label=field.placeholder||field.title||field.name||field.id;
    if(label)field.setAttribute('aria-label',String(label).replace(/([a-z])([A-Z])/g,'$1 $2'));
  });
  root.querySelectorAll('button').forEach(button=>{
    if(button.getAttribute('aria-label')||button.textContent.trim())return;
    const label=button.title||button.dataset.view||button.id;
    if(label)button.setAttribute('aria-label',label);
  });
}

function organizeMenu(){
  const navBox=document.querySelector('.sidebar-nav');if(!navBox)return;
  navBox.querySelectorAll('.vg-nav-label').forEach(x=>x.remove());
  const entries=[
    ['Lavoro',['dashboard','emailActivities','commesse','scadenze']],
    ['Gestione',['clienti','preventivi','prezzari','documenti','rapportini']],
    ['Economia',['consuntivi','fatture','spese']],
    ['Strumenti',['openVargaCantieriDesktop','eggsNextBoard','open-verde-bologna-btn','squadreGestione','cantieriSync']],
    ['Impostazioni',['cloud','azienda','backup']]
  ];
  const find=key=>navBox.querySelector(`.nav[data-view="${key}"]`)||$(key);
  entries.forEach(([label,keys])=>{
    const nodes=keys.map(find).filter(Boolean).filter(x=>!x.classList.contains('vg-hidden-nav'));
    if(!nodes.length)return;
    const heading=document.createElement('div');heading.className='vg-nav-label';heading.textContent=label;navBox.appendChild(heading);
    nodes.forEach(node=>navBox.appendChild(node));
  });
}

function improveDashboard(){
  const targets={kPrev:'preventivi',kCli:'clienti',kJobs:'commesse',kDue:'fatture',kDead:'scadenze'};
  Object.entries(targets).forEach(([id,view])=>{
    const value=$(id),card=value&&value.closest('.card');
    if(!card||card.dataset.vgTarget)return;
    card.dataset.vgTarget=view;card.tabIndex=0;card.setAttribute('role','button');
    card.setAttribute('aria-label',`${card.textContent.trim()}. Apri la sezione`);
    const open=()=>{const button=document.querySelector(`.nav[data-view="${view}"]`);if(button)button.click()};
    card.addEventListener('click',open);
    card.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open()}});
  });
}

function improveLabels(){
  const names={dashboard:'Home',emailActivities:'Attività da email',commesse:'Commesse',scadenze:'Scadenze e attività',clienti:'Clienti',preventivi:'Preventivi',prezzari:'Prezzari',documenti:'Documenti',rapportini:'Rapportini',consuntivi:'Consuntivi e contabilità',fatture:'Fatture e incassi',spese:'Spese',cantieriSync:'Sincronizza Varga Cantieri',cloud:'Cloud e utenti',azienda:'Dati azienda',backup:'Backup'};
  Object.entries(names).forEach(([view,label])=>{const button=document.querySelector(`.nav[data-view="${view}"]`);if(button)button.textContent=label});
}

function improveTables(){
  document.querySelectorAll('table').forEach(table=>{
    if(table.closest('.table-wrap,.vg-account-wrap'))return;
    const parent=table.parentElement;if(!parent)return;
    const wrap=document.createElement('div');wrap.className='table-wrap';parent.insertBefore(wrap,table);wrap.appendChild(table);
  });
}

function run(){addStyles();improveLabels();organizeMenu();improveDashboard();accessibleFields();improveTables()}

run();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>window.setTimeout(run,0),{once:true});
window.setTimeout(run,700);
const observer=new MutationObserver(records=>{
  const added=records.some(r=>r.addedNodes.length);if(!added)return;
  window.clearTimeout(window.__vgUiTimer);window.__vgUiTimer=window.setTimeout(()=>{accessibleFields();improveTables()},80);
});
observer.observe(document.body,{childList:true,subtree:true});
})();
