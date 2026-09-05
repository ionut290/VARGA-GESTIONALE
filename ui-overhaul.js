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
    .sidebar{scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.22) transparent}.sidebar-nav{padding-bottom:12px}.vg-nav-label{width:100%;display:flex;align-items:center;justify-content:space-between;border:0;background:transparent;color:#8fa99c;padding:14px 9px 5px;font-size:10px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}.vg-nav-label:after{content:'⌄';font-size:13px;transition:transform .15s}.vg-nav-label[aria-expanded="false"]:after{transform:rotate(-90deg)}.vg-menu-item-collapsed{display:none!important}
    .nav:focus-visible,button:focus-visible,a:focus-visible{outline:3px solid #84d4a8;outline-offset:2px}
    .panel>.topline:first-child{flex-wrap:wrap}.item-title{overflow-wrap:anywhere}.item-actions{flex:0 0 auto}
    .card[data-vg-target]{cursor:pointer;transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease}.card[data-vg-target]:hover{transform:translateY(-2px);border-color:#a9cdbb;box-shadow:0 8px 22px rgba(20,50,35,.09)}
    .vg-round-not-started{display:flex;align-items:center;min-height:74px;padding:16px 18px;border:1px solid #d8c184;border-radius:14px;background:#fff8e8;color:#6f520b}
    .vg-round-not-started div{display:grid;gap:5px}.vg-round-not-started span{font-size:13px;color:#795f1e}
    #jobsFormPanel[hidden]{display:none!important}.vg-job-card{min-height:168px}.vg-job-card .vg-job-meta:empty{display:none}
    .vg-quick-start{background:linear-gradient(135deg,#f7fcf9,#eef8f3);border-color:#bedccc}.vg-quick-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.vg-quick-head h2{margin-bottom:4px}.vg-quick-head p{margin:0}.vg-quick-grid{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:10px;margin-top:14px}.vg-quick-step{display:grid;grid-template-columns:auto 1fr;gap:9px;align-items:start;border:1px solid #d4e5dc;border-radius:12px;background:#fff;padding:12px;text-align:left;color:#173f30}.vg-quick-step:hover{border-color:#66a987;background:#fbfffd}.vg-quick-step>span{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:#176b48;color:#fff;font-size:12px}.vg-quick-step small{display:block;margin-top:3px;color:#68766e;font-weight:500;line-height:1.35}.vg-quick-step.is-done>span{background:#dff3e7;color:#08723d}.vg-quick-step.is-done>span:before{content:'✓';font-size:14px}.vg-quick-step.is-done>span{font-size:0}.vg-welcome{border:1px solid #9fcbb4;background:#fff;padding:18px}.vg-welcome-grid{display:grid;grid-template-columns:1fr auto;gap:18px;align-items:center}.vg-welcome h2{margin-bottom:5px}.vg-welcome p{margin:0;line-height:1.5}.vg-welcome-actions{display:flex;gap:8px;flex-wrap:wrap}.vg-help-button{padding:7px 10px;font-size:11px}
    body.verde-bologna-page-open{overflow:hidden}
    @media(min-width:1500px){.main{padding-left:36px;padding-right:36px}.vg-job-grid{grid-template-columns:repeat(4,minmax(250px,1fr))}}
    @media(max-width:1050px){.vg-quick-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:850px){:root{--vg-sidebar:180px}.topline{align-items:flex-start;flex-wrap:wrap}.topline>.primary,.topline>.ghost{max-width:100%}.item{align-items:flex-start}.item-actions{max-width:42%}}
    @media(max-width:640px){
      .app-shell{display:block}.sidebar{position:relative;inset:auto;width:100%;height:auto;max-height:none;padding:14px 12px}.brand{padding:2px 6px 12px;font-size:20px}.sidebar-nav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px}.nav{margin:0;padding:10px;font-size:13px}.vg-nav-label{grid-column:1/-1;padding:14px 8px 4px}.sidebar-account{margin-top:10px}.main{width:100%;margin-left:0;padding:16px}.cards,.cards.five,.grid2,.formgrid,.vg-quick-grid,.vg-welcome-grid{grid-template-columns:1fr}.card{padding:14px}.card strong{font-size:24px}.topline,.vg-quick-head{display:grid}.topline>button{width:100%}.item{display:grid}.item-actions{max-width:none;justify-content:flex-start}.vg-job-grid{grid-template-columns:1fr}.vg-tabs{top:0;margin:0 -16px;padding:8px 16px;background:#f4f6f5}.email-activity-group-title{top:0}.verde-bologna-page{z-index:21000}
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
  navBox.querySelectorAll('.vg-menu-item-collapsed').forEach(x=>x.classList.remove('vg-menu-item-collapsed'));
  navBox.querySelectorAll('.vg-nav-label').forEach(x=>x.remove());
  const entries=[
    ['Lavoro',['dashboard','emailActivities','commesse','scadenze']],
    ['Gestione',['clienti','preventivi','prezzari','documenti','rapportini']],
    ['Economia',['consuntivi','fatture','spese']],
    ['Strumenti',['openVargaCantieriDesktop','eggsNextBoard','open-verde-bologna-btn','squadreGestione','cantieriSync','installVargaDesktop']],
    ['Impostazioni',['cloud','azienda','backup']]
  ];
  const find=key=>navBox.querySelector(`.nav[data-view="${key}"]`)||$(key);
  let saved={};try{saved=JSON.parse(localStorage.getItem('vg_menu_groups')||'{}')||{}}catch(_){saved={}}
  const firstUse=typeof db!=='undefined'&&!(db.clients||[]).length&&!(db.jobs||[]).length;
  entries.forEach(([label,keys],index)=>{
    const nodes=keys.map(find).filter(Boolean).filter(x=>!x.classList.contains('vg-hidden-nav'));
    if(!nodes.length)return;
    const collapsed=saved[label]===false||(saved[label]===undefined&&firstUse&&index>1);
    const heading=document.createElement('button');heading.type='button';heading.className='vg-nav-label';heading.textContent=label;heading.setAttribute('aria-expanded',String(!collapsed));navBox.appendChild(heading);
    nodes.forEach(node=>{navBox.appendChild(node);node.classList.toggle('vg-menu-item-collapsed',collapsed)});
    heading.onclick=()=>{const expanded=heading.getAttribute('aria-expanded')==='true';heading.setAttribute('aria-expanded',String(!expanded));nodes.forEach(node=>node.classList.toggle('vg-menu-item-collapsed',expanded));saved[label]=expanded;try{localStorage.setItem('vg_menu_groups',JSON.stringify(saved))}catch(_){}};
  });
}

function installDashboardHelp(){
  const dashboard=$('dashboard'),cards=dashboard?.querySelector('.cards');if(!dashboard||!cards)return;
  const clients=typeof db!=='undefined'?(db.clients||[]):[],jobs=typeof db!=='undefined'?(db.jobs||[]):[],quotes=typeof db!=='undefined'?(db.quotes||[]):[];
  const firstUse=!clients.length&&!jobs.length&&!quotes.length;
  let panel=$('vgQuickStart');if(!panel){panel=document.createElement('section');panel.id='vgQuickStart';panel.className='panel vg-quick-start';cards.insertAdjacentElement('afterend',panel)}
  const signature=[clients.length,jobs.length,quotes.length,firstUse].join(':');if(panel.dataset.signature===signature)return;panel.dataset.signature=signature;
  const steps=[
    ['clienti','1','Cliente','Inserisci anagrafica e contatti.',clients.length>0,'cName'],
    ['prezzari','2','Prezzario','Importa Excel o crea le voci.','priceLists' in (typeof db!=='undefined'?db:{})&&(db.priceLists||[]).length>1,'plName'],
    ['commesse','3','Commessa','Collega cliente, codice e valore.',jobs.length>0,'toggleJobsForm'],
    ['scadenze','4','Attività','Aggiungi la prima cosa da fare.',typeof db!=='undefined'&&(db.deadlines||[]).length>0,'openTaskComposer']
  ];
  panel.innerHTML=`<div class="vg-quick-head"><div><h2>${firstUse?'Inizia da qui':'Azioni rapide'}</h2><p class="muted">${firstUse?'Segui questi passaggi: il gestionale si organizzerà automaticamente.':'Crea o aggiorna i dati più usati senza cercare nel menu.'}</p></div><button id="vgShowGuide" class="ghost vg-help-button" type="button">? COME SI USA</button></div><div class="vg-quick-grid">${steps.map(([view,n,title,help,done,focus])=>`<button type="button" class="vg-quick-step ${done?'is-done':''}" data-vg-quick="${view}" data-vg-focus="${focus}"><span>${n}</span><strong>${title}<small>${help}</small></strong></button>`).join('')}</div>`;
  $('vgShowGuide').onclick=()=>{try{localStorage.removeItem('vg_onboarding_seen_v1')}catch(_){}installWelcome(true)};
  panel.querySelectorAll('[data-vg-quick]').forEach(button=>button.onclick=()=>{const view=button.dataset.vgQuick,navButton=document.querySelector(`.nav[data-view="${view}"]`);navButton?.click();window.setTimeout(()=>{const target=$(button.dataset.vgFocus);if(view==='commesse'&&target&&$('jobsFormPanel')?.hidden)target.click();else if(view==='scadenze'&&target&&$('taskComposer')?.hidden)target.click();else target?.focus?.()},80)});
}

function installWelcome(force=false){
  const dashboard=$('dashboard'),top=dashboard?.querySelector('.topline'),cards=dashboard?.querySelector('.cards');if(!dashboard||!top||!cards)return;
  let seen=false;try{seen=localStorage.getItem('vg_onboarding_seen_v1')==='1'}catch(_){}
  let panel=$('vgWelcome');if(seen&&!force){panel?.remove();return}
  if(!panel){panel=document.createElement('section');panel.id='vgWelcome';panel.className='panel vg-welcome';top.insertAdjacentElement('afterend',panel)}
  panel.innerHTML='<div class="vg-welcome-grid"><div><h2>Benvenuto in Varga Gestionale</h2><p><strong>1.</strong> Controlla scadenze e attività dalla Home. <strong>2.</strong> Apri una commessa per trovare tutto il lavoro collegato. <strong>3.</strong> Usa le altre sezioni solo quando ti servono.</p></div><div class="vg-welcome-actions"><button class="primary" type="button" data-vg-welcome-jobs>APRI COMMESSE</button><button class="ghost" type="button" data-vg-welcome-close>HO CAPITO</button></div></div>';
  panel.querySelector('[data-vg-welcome-jobs]').onclick=()=>document.querySelector('.nav[data-view="commesse"]')?.click();
  panel.querySelector('[data-vg-welcome-close]').onclick=()=>{try{localStorage.setItem('vg_onboarding_seen_v1','1')}catch(_){}panel.remove()};
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

function installDesktopDownload(){
  const navBox=document.querySelector('.sidebar-nav');if(!navBox)return;
  let button=$('installVargaDesktop');
  if(!button){button=document.createElement('button');button.id='installVargaDesktop';button.className='nav';button.type='button';button.textContent='💻 Installa sul PC';navBox.appendChild(button)}
  const desktop=new URLSearchParams(location.search).get('desktop')==='1'||Boolean(window.__TAURI_INTERNALS__);
  button.hidden=desktop;button.classList.toggle('vg-hidden-nav',desktop);
  button.onclick=()=>{
    const accepted=window.confirm('AVVISO PRIMA DELL’INSTALLAZIONE\n\nWindows potrebbe mostrare “Autore sconosciuto” perché l’installer non possiede ancora una firma digitale. Questo avviso non significa che il file sia un virus: è l’installer ufficiale di Varga Gestionale, generato e pubblicato dal nostro progetto.\n\nPER PROSEGUIRE SU WINDOWS:\n1. Apri il file scaricato.\n2. Se compare “PC protetto da Windows”, premi “Ulteriori informazioni”.\n3. Premi “Esegui comunque”.\n\nPremi OK per scaricare l’installer oppure Annulla per tornare indietro.');
    if(!accepted)return;
    const link=document.createElement('a');
    link.href='https://github.com/ionut290/VARGA-GESTIONALE/releases/download/desktop-v0.1.1/Varga.Gestionale_0.1.1_x64-setup.exe';
    link.download='Varga.Gestionale_0.1.1_x64-setup.exe';document.body.appendChild(link);link.click();link.remove();
  };
}

function improveTables(){
  document.querySelectorAll('table').forEach(table=>{
    if(table.closest('.table-wrap,.vg-account-wrap'))return;
    const parent=table.parentElement;if(!parent)return;
    const wrap=document.createElement('div');wrap.className='table-wrap';parent.insertBefore(wrap,table);wrap.appendChild(table);
  });
}

function run(){addStyles();improveLabels();installDesktopDownload();organizeMenu();improveDashboard();installDashboardHelp();installWelcome();accessibleFields();improveTables()}

run();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>window.setTimeout(run,0),{once:true});
window.setTimeout(run,700);
const observer=new MutationObserver(records=>{
  const added=records.some(r=>r.addedNodes.length);if(!added)return;
  window.clearTimeout(window.__vgUiTimer);window.__vgUiTimer=window.setTimeout(()=>{installDashboardHelp();accessibleFields();improveTables()},80);
});
observer.observe(document.body,{childList:true,subtree:true});
})();
