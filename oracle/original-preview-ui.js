/* Safe presentation layer for the Oracle preview.
 * Recreates the original GitHub Pages navigation and dashboard additions
 * without loading backend or browser-storage code.
 */
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const jobs=()=>Array.isArray(window.VGOraclePreviewData?.jobs)?window.VGOraclePreviewData.jobs:[];
  const activeJobs=()=>jobs().filter(j=>String(j.status||j.stato||'').toLowerCase()!=='terminata');
  const norm=value=>String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();

  function styles(){
    if($('vgOraclePreviewUiStyle'))return;
    const style=document.createElement('style');style.id='vgOraclePreviewUiStyle';style.textContent=`
      :root{--vg-sidebar:245px}.main{max-width:none;min-width:0}.sidebar{scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.22) transparent}.sidebar-nav{padding-bottom:12px}
      .vg-nav-label{width:100%;display:flex;align-items:center;justify-content:space-between;border:0;background:transparent;color:#8fa99c;padding:14px 9px 5px;font-size:10px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}.vg-menu-item-collapsed{display:none!important}.vg-welcome{margin:0 0 16px}.vg-welcome-grid{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}.vg-welcome-grid p{margin:6px 0 0}.vg-welcome-actions{display:flex;gap:8px;flex-wrap:wrap}
      .vg-oracle-quick{background:linear-gradient(135deg,#f7fcf9,#eef8f3);border-color:#bedccc}.vg-oracle-quick-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.vg-oracle-quick-head h2{margin-bottom:4px}.vg-oracle-quick-head p{margin:0}.vg-oracle-quick-grid{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:10px;margin-top:14px}
      .vg-oracle-quick-step{display:grid;grid-template-columns:auto 1fr;gap:9px;align-items:start;border:1px solid #d4e5dc;border-radius:12px;background:#fff;padding:12px;text-align:left;color:#173f30;cursor:pointer}.vg-oracle-quick-step:hover{border-color:#66a987;background:#fbfffd}.vg-oracle-quick-step>span{display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:#dff3e7;color:#08723d;font-size:14px}.vg-oracle-quick-step strong{font-size:14px}.vg-oracle-quick-step small{display:block;margin-top:3px;color:#68766e;font-weight:500;line-height:1.35}
      .vg-oracle-dashboard-jobs{margin-top:18px}.vg-oracle-dashboard-jobs .vg-oracle-job-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:12px}.vg-oracle-job-card{min-height:168px;border:1px solid #dce5df;border-radius:15px;background:#fff;padding:17px;display:flex;flex-direction:column;gap:7px}.vg-oracle-job-card.package{border:2px solid #287756;background:linear-gradient(180deg,#f3fbf7,#fff)}.vg-oracle-job-code{font-size:11px;font-weight:900;color:#176b48;letter-spacing:.06em}.vg-oracle-job-card h3{margin:0;color:#153d2e;font-size:18px}.vg-oracle-job-meta{color:#667085;font-size:12px;line-height:1.5}.vg-oracle-job-bottom{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:auto}.vg-oracle-job-bottom span{font-size:11px;font-weight:800;color:#176b48}.vg-oracle-job-card button{border:0;background:transparent;color:#16814f;font-weight:900;cursor:pointer;padding:5px 0}
      .vg-commesse-head{align-items:center}.vg-commesse-actions{display:flex;gap:8px;flex-wrap:wrap}.vg-job-list-toolbar{display:flex;gap:8px;align-items:center;margin:0 0 12px}.vg-job-list-toolbar input{flex:1}.vg-job-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}.vg-job-card{min-height:168px;border:1px solid #dfe4ea;border-radius:14px;background:#fff;padding:18px;box-shadow:0 3px 12px rgba(0,0,0,.04);cursor:pointer;transition:.15s}.vg-job-card:hover{transform:translateY(-1px);box-shadow:0 7px 20px rgba(0,0,0,.08)}.vg-job-card h3{margin:5px 0 8px;color:#17211c}.vg-job-code{font-size:12px;font-weight:800;letter-spacing:.06em;opacity:.62}.vg-job-meta{font-size:13px;color:#667085;line-height:1.5}.vg-job-bottom{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-top:14px}.vg-job-open{font-weight:800;color:#16794d}.vg-package-card{border:2px solid #287756;background:linear-gradient(180deg,#f3fbf7,#fff)}.vg-package-card .vg-job-code{color:#176b48;opacity:1}.vg-package-card h3{color:#153d2e}.vg-package-modal,.vg-plant-summary-modal{position:fixed;inset:0;background:rgba(15,23,42,.46);z-index:10050;display:flex;align-items:center;justify-content:center;padding:18px}.vg-package-modal[hidden],.vg-plant-summary-modal[hidden]{display:none}.vg-package-modal-card,.vg-plant-summary-card{background:#fff;width:min(920px,96vw);max-height:88vh;overflow:auto;border-radius:18px;box-shadow:0 24px 70px rgba(0,0,0,.28);padding:20px}.vg-package-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:15px}.vg-package-modal-head h2{margin:0 0 4px}.vg-package-modal-head p{margin:0;color:#667085}.vg-package-close{border:1px solid #d0d5dd;background:#fff;border-radius:9px;padding:8px 11px;font-weight:800;cursor:pointer}.vg-package-list{display:grid;gap:10px}.vg-package-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;border:1px solid #dfe6e2;border-radius:12px;padding:13px 14px;background:#fff}.vg-package-row-code{font-size:12px;font-weight:900;color:#176b48;letter-spacing:.04em}.vg-package-row-title{font-weight:900;margin-top:2px}.vg-package-row-meta{font-size:12px;color:#667085;margin-top:4px}.vg-package-open{border:0;background:#176b48;color:#fff;border-radius:9px;padding:9px 13px;font-weight:900;cursor:pointer}.vg-job-json{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 ui-monospace,monospace;background:#f8faf9;border-radius:10px;padding:14px;max-height:65vh;overflow:auto}.vg-plant-summary-card{width:min(1050px,97vw);max-height:90vh}.vg-plant-summary-card .vg-package-list>p{margin:14px 0}.vg-plant-summary-card .vg-package-row{grid-template-columns:1fr auto}
      .vg-work-head{border-radius:18px;padding:22px;background:linear-gradient(135deg,#133c2e,#176b4b);color:#fff;margin-bottom:16px}.vg-work-head .subtitle{color:rgba(255,255,255,.78)}.vg-work-actions{display:flex;gap:8px;flex-wrap:wrap}.vg-work-actions button{background:#fff;color:#173f31;border:0;border-radius:9px;padding:9px 12px;font-weight:800;cursor:pointer}.vg-round-summary{margin:0 0 18px}.vg-round-summary-head{display:flex;justify-content:space-between;gap:12px;align-items:end;margin-bottom:10px}.vg-round-summary-head h2{margin:0}.vg-round-summary-head span{font-size:12px;color:#667085}.vg-round-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:10px}.vg-round-card{background:#fff;border:1px solid #dfe7e2;border-radius:12px;padding:13px}.vg-round-card span{display:block;color:#667085;font-size:11px;margin-bottom:5px}.vg-round-card strong{font-size:19px;color:#163f30}.vg-round-card small{display:block;color:#667085;margin-top:4px;line-height:1.35}.vg-balance-positive{background:#e8f7ee;border:2px solid #55a878}.vg-balance-positive strong{color:#08723d}.vg-balance-negative{background:#fff0f0;border:2px solid #dc7777}.vg-balance-negative strong{color:#b42318}.vg-balance-neutral{background:#fff8e7;border:2px solid #d8ad45}.vg-balance-neutral strong{color:#8a5a00}.vg-round-note{margin:9px 2px 0;color:#667085;font-size:11px}.vg-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:10px;margin:14px 0 18px}.vg-stat{background:#fff;border:1px solid #dfe4ea;border-radius:12px;padding:13px}.vg-stat span{display:block;font-size:12px;color:#667085}.vg-stat strong{font-size:22px;display:block;margin-top:5px}.vg-tabs{display:flex;gap:7px;overflow:auto;padding:4px 0 12px;position:sticky;top:0;background:#f4f6f5;z-index:5}.vg-tab{white-space:nowrap;border:1px solid #d7dde5;background:#fff;padding:9px 12px;border-radius:999px;font-weight:750;cursor:pointer}.vg-tab.active{background:#183f31;color:#fff;border-color:#183f31}.vg-kv{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}.vg-kv>div{background:#f8fafb;border-radius:10px;padding:12px}.vg-kv small{display:block;color:#667085;margin-bottom:3px}.vg-job-detail-list{display:grid;gap:9px}.vg-job-detail-list article{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;border:1px solid #dfe7e2;border-radius:11px;padding:11px}.vg-job-detail-list article>div:first-child{display:grid;gap:3px}.vg-job-detail-list small{color:#637269}.vg-progress-track{height:8px;border-radius:99px;background:#e5ece8;overflow:hidden;margin-top:7px}.vg-progress-fill{height:100%;background:#188154;border-radius:99px}
      @media(min-width:1500px){.main{padding-left:36px;padding-right:36px}.vg-job-grid{grid-template-columns:repeat(4,minmax(250px,1fr))}}
      @media(max-width:1050px){.vg-oracle-quick-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.vg-oracle-dashboard-jobs .vg-oracle-job-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:760px){.vg-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.vg-job-detail-list article{grid-template-columns:1fr}.vg-round-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:640px){.vg-oracle-quick-grid,.vg-oracle-dashboard-jobs .vg-oracle-job-grid,.vg-job-grid,.vg-round-grid{grid-template-columns:1fr}.vg-oracle-quick-head{display:grid}.vg-oracle-job-card,.vg-job-card{min-height:130px}.vg-commesse-head{align-items:flex-start;flex-wrap:wrap}.vg-commesse-actions{width:100%}.vg-commesse-actions button{flex:1}.vg-package-row,.vg-plant-summary-card .vg-package-row{grid-template-columns:1fr}.vg-package-open{width:100%}.vg-work-actions button{flex:1 1 45%}}
    `;document.head.appendChild(style);
  }

  // Mirror the original ui-overhaul.js group structure; never persist UI state.
  function organizeMenu(){
    const nav=document.querySelector('.sidebar-nav');if(!nav||nav.dataset.oracleGrouped==='2')return;
    const labels={dashboard:'Home',richieste:'Attività da email',preventivo:'Nuovo preventivo',
      preventivi:'Preventivi',clienti:'Clienti',commesse:'Commesse',cantieriSync:'Sincronizza Varga Cantieri',
      consuntivi:'Consuntivi e contabilità',prezzari:'Prezzari',fatture:'Fatture e incassi',
      spese:'Spese',scadenze:'Scadenze e attività',documenti:'Documenti',
      firmaTimbro:'Firma e timbro',cloud:'Cloud e utenti',azienda:'Dati azienda',backup:'Backup'};
    for(const [key,label] of Object.entries(labels)){
      const b=nav.querySelector(`.nav[data-view="${key}"]`);if(b)b.textContent=label;
    }
    nav.querySelectorAll('.vg-nav-label').forEach(node=>node.remove());
    const entries=[
      ['Lavoro',['dashboard','richieste','commesse','scadenze']],
      ['Gestione',['clienti','preventivi','prezzari','documenti']],
      ['Economia',['consuntivi','fatture','spese']],
      ['Strumenti',['openVargaCantieriDesktop','cantieriSync']],
      ['Impostazioni',['firmaTimbro','cloud','azienda','backup','preventivo']]
    ];
    for(const [label,keys] of entries){
      const nodes=keys.map(key=>nav.querySelector(`.nav[data-view="${key}"]`)||$(key))
        .filter(Boolean).filter(node=>!node.hidden);
      if(!nodes.length)continue;
      const heading=document.createElement('button');heading.type='button';
      heading.className='vg-nav-label';heading.textContent=label;
      heading.setAttribute('aria-expanded','true');
      heading.addEventListener('click',()=>{
        const collapsed=heading.getAttribute('aria-expanded')==='true';
        heading.setAttribute('aria-expanded',String(!collapsed));
        nodes.forEach(node=>node.classList.toggle('vg-menu-item-collapsed',collapsed));
      });
      nav.append(heading,...nodes);
    }
    nav.dataset.oracleGrouped='2';
  }
  let welcomeDismissed=false;
  function welcomePanel(){
    const dashboard=$('dashboard'),top=dashboard?.querySelector('.topline');
    if(!top||welcomeDismissed||$('vgWelcome'))return;
    const panel=document.createElement('section');panel.id='vgWelcome';panel.className='panel vg-welcome';
    panel.innerHTML='<div class="vg-welcome-grid"><div><h2>Benvenuto in Varga Gestionale</h2><p><strong>1.</strong> Controlla scadenze e attività dalla Home. <strong>2.</strong> Apri una commessa per trovare tutto il lavoro collegato. <strong>3.</strong> Usa le altre sezioni solo quando ti servono.</p></div><div class="vg-welcome-actions"><button type="button" data-oracle-view="commesse" class="primary">APRI COMMESSE</button><button type="button" class="ghost" data-oracle-dismiss-welcome>HO CAPITO</button></div></div>';
    top.insertAdjacentElement('afterend',panel);
    panel.querySelector('[data-oracle-dismiss-welcome]').addEventListener('click',()=>{welcomeDismissed=true;panel.remove()});
  }

  function quickPanel(){
    const dashboard=$('dashboard'),cards=dashboard?.querySelector('.cards');if(!dashboard||!cards)return;
    let panel=$('vgOracleQuickStart');if(!panel){panel=document.createElement('section');panel.id='vgOracleQuickStart';panel.className='panel vg-oracle-quick';cards.insertAdjacentElement('afterend',panel)}
    const data=window.VGOraclePreviewData||{},clients=Array.isArray(data.clients)?data.clients:[],prices=Array.isArray(data.priceLists)?data.priceLists:[],openJobs=activeJobs(),deadlines=Array.isArray(data.deadlines)?data.deadlines:[];
    const done=[clients.length>0,prices.length>1,openJobs.length>0,deadlines.length>0];
    const signature=done.join(':');if(panel.dataset.signature===signature)return;panel.dataset.signature=signature;
    panel.innerHTML=`<div class="vg-oracle-quick-head"><div><h2>Azioni rapide</h2><p class="muted">Crea o aggiorna i dati più usati senza cercare nel menu.</p></div><span class="mini ghost" aria-hidden="true">? COME SI USA</span></div><div class="vg-oracle-quick-grid"><button class="vg-oracle-quick-step" data-oracle-view="clienti"><span>${done[0]?'✓':'1'}</span><strong>Cliente<small>Inserisci anagrafica e contatti.</small></strong></button><button class="vg-oracle-quick-step" data-oracle-view="prezzari"><span>${done[1]?'✓':'2'}</span><strong>Prezzario<small>Importa Excel o crea le voci.</small></strong></button><button class="vg-oracle-quick-step" data-oracle-view="commesse"><span>${done[2]?'✓':'3'}</span><strong>Commessa<small>Collega cliente, codice e valore.</small></strong></button><button class="vg-oracle-quick-step" data-oracle-view="scadenze"><span>${done[3]?'✓':'4'}</span><strong>Attività<small>Aggiungi la prima cosa da fare.</small></strong></button></div>`;
    panel.querySelectorAll('[data-oracle-view]').forEach(button=>button.onclick=()=>document.querySelector(`.nav[data-view="${button.dataset.oracleView}"]`)?.click());
  }

  const packages=[
    {title:'DISCARICHE',match:t=>t.includes('discaric')&&!t.includes('cadriano')&&!t.includes('ozzano')&&!t.includes('strg')&&!t.includes('stradelli guelf'),description:'Ore, squadre, consuntivi e contabilita restano separati per ogni discarica.'},
    {title:'INRETE',match:t=>/\binrete\b/.test(t)&&/\b(bologna|modena|ferrara)\b/.test(t),description:'INRETE Bologna, Modena e Ferrara, con codici e dati sempre separati.'},
    {title:'VARIE',match:t=>t.includes('ozzano')||t.includes('vega carburanti')||t.includes('cadriano')||t.includes('stradelli guelf')||t.includes('strg')||(/\bwte\b/.test(t)&&/\b(mo|modena)\b/.test(t)),description:'Hera Ozzano, WTE, Vega Carburanti, STR G e Hera Cadriano.'},
    {title:'COMUNE BOLOGNA',match:t=>t.includes('potature abbattimenti')||t.includes('pot abb')||t.includes('sfalcio cobo')||t.includes('cobo sfalcio'),description:'Potature Abbattimenti e Sfalcio COBO, mantenute come commesse distinte.'}
  ];
  function jobText(job){return norm([job.title,job.code,job.site,job.commessa,job.nome].filter(Boolean).join(' '))}
  function jobPanel(){
    const dashboard=$('dashboard');if(!dashboard)return;
    let panel=$('vgOracleDashboardJobs');if(!panel){panel=document.createElement('section');panel.id='vgOracleDashboardJobs';panel.className='panel vg-oracle-dashboard-jobs';const deadlines=dashboard.querySelector('.dashboard-only-deadlines');dashboard.insertBefore(panel,deadlines||null)}
    const all=activeJobs(),recent=all.slice().reverse().slice(0,4),assigned=new Set();
    const signature=JSON.stringify(all.map(job=>[job.id,job.code,job.title,job.name,job.site,job.status,job.stato]));if(panel.dataset.signature===signature)return;panel.dataset.signature=signature;
    const cards=[];
    for(const spec of packages){const matching=all.filter(job=>!assigned.has(job.id)&&spec.match(jobText(job)));if(!matching.some(job=>recent.includes(job)))continue;matching.forEach(job=>assigned.add(job.id));cards.push(`<article class="vg-oracle-job-card package"><div class="vg-oracle-job-code">PACCHETTO COMMESSE</div><h3>${esc(spec.title)}</h3><div class="vg-oracle-job-meta">${matching.length} commesse raggruppate • codici e dati separati</div><div class="vg-oracle-job-bottom"><span>ATTIVE</span><button type="button" data-oracle-view="commesse">APRI PACCHETTO →</button></div><div class="vg-oracle-job-meta">${esc(spec.description)}</div></article>`)}
    recent.filter(job=>!assigned.has(job.id)).forEach(job=>cards.push(`<article class="vg-oracle-job-card"><div class="vg-oracle-job-code">${esc(job.code||'Codice non assegnato')}</div><h3>${esc(job.title||job.name||'Commessa')}</h3><div class="vg-oracle-job-bottom"><span>Attiva</span><button type="button" data-oracle-view="commesse">APRI →</button></div></article>`));
    panel.innerHTML=`<div class="vg-section-head"><div><h2>Commesse</h2><div class="muted">Le 4 commesse più recenti.</div></div><button class="ghost" type="button" data-oracle-view="commesse">TUTTE LE COMMESSE</button></div><div class="vg-oracle-job-grid">${cards.length?cards.join(''):'<div class="empty">Nessuna commessa attiva.</div>'}</div>`;
    panel.querySelectorAll('[data-oracle-view]').forEach(button=>button.onclick=()=>document.querySelector(`.nav[data-view="${button.dataset.oracleView}"]`)?.click());
  }

  function accountingPanel(){
    const dashboard=$('dashboard'),cards=dashboard?.querySelector('.cards');
    if(!dashboard||!cards)return;
    const source=window.VGOraclePreviewData?.vcRecords;
    if(!Array.isArray(source))return;
    const normalize=v=>String(v??'').trim().toLowerCase();
    const rounds=source.filter(r=>{
      const parts=String(r.sourcePath||'').split('/');
      return parts.length===4&&parts[0]==='commesse'&&parts[2]==='giriContabili';
    }).map(r=>({...((r.data&&typeof r.data==='object'&&!Array.isArray(r.data))?r.data:{}),_path:r.sourcePath}))
      .filter(r=>!r.roundDeletedAt&&!r.dashboardHidden&&normalize(r.stato)!=='chiuso_definitivamente'&&normalize(r.mapStatus)!=='ricevuto')
      .sort((a,b)=>String(a.accountingDueAt||a.mapDueAt||a.closedAtIso||'').localeCompare(String(b.accountingDueAt||b.mapDueAt||b.closedAtIso||'')));
    let panel=$('dashboardAccountingRounds');
    if(!rounds.length){panel?.remove();return;}
    if(!panel){panel=document.createElement('section');panel.id='dashboardAccountingRounds';panel.className='panel';cards.insertAdjacentElement('afterend',panel);}
    const signature=JSON.stringify(rounds.map(r=>[r._path,r.stato,r.accountingSentAt,r.totalAmount,r.accountingDueAt,r.localArchiveSavedAt]));
    if(panel.dataset.signature===signature)return;panel.dataset.signature=signature;
    panel.replaceChildren();
    const heading=document.createElement('h2');heading.textContent='Contabilità da gestire';
    const description=document.createElement('p');description.className='muted';
    description.textContent=rounds.length+' giri con azioni ancora aperte · consultazione Oracle di sola lettura';
    panel.append(heading,description);
    for(const r of rounds.slice(0,10)){
      const item=document.createElement('div');item.className='item';
      const title=document.createElement('strong');title.textContent=String(r.commessaNome||'Commessa')+' — Giro '+String(r.numeroGiro||'');
      const detail=document.createElement('div');detail.className='muted';
      const sent=!!r.accountingSentAt||normalize(r.stato)==='map_in_attesa';
      detail.textContent=(sent?'MAP IN ATTESA':'CONTABILITÀ DA INVIARE')+' · '+Number(r.totalAmount||0).toLocaleString('it-IT',{style:'currency',currency:'EUR'});
      item.append(title,detail);panel.append(item);
    }
  }

  function render(){styles();organizeMenu();welcomePanel();quickPanel();accountingPanel();jobPanel()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(render,0),{once:true});else render();
  const observer=new MutationObserver(()=>{clearTimeout(observer._timer);observer._timer=setTimeout(render,50)});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('vg-oracle-preview-data',render);
})();
