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
      @media(max-width:1050px){.vg-oracle-quick-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.vg-oracle-dashboard-jobs .vg-oracle-job-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:640px){.vg-oracle-quick-grid,.vg-oracle-dashboard-jobs .vg-oracle-job-grid{grid-template-columns:1fr}.vg-oracle-quick-head{display:grid}.vg-oracle-job-card{min-height:130px}}
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
  function welcomePanel(){
    const dashboard=$('dashboard'),top=dashboard?.querySelector('.topline');
    if(!top||$('vgWelcome'))return;
    const panel=document.createElement('section');panel.id='vgWelcome';panel.className='panel vg-welcome';
    panel.innerHTML='<div class="vg-welcome-grid"><div><h2>Benvenuto in Varga Gestionale</h2><p><strong>1.</strong> Controlla scadenze e attività dalla Home. <strong>2.</strong> Apri una commessa per trovare tutto il lavoro collegato. <strong>3.</strong> Usa le altre sezioni solo quando ti servono.</p></div><div class="vg-welcome-actions"><button type="button" data-oracle-view="commesse" class="primary">APRI COMMESSE</button><button type="button" class="ghost" data-oracle-dismiss-welcome>HO CAPITO</button></div></div>';
    top.insertAdjacentElement('afterend',panel);
    panel.querySelector('[data-oracle-dismiss-welcome]').addEventListener('click',()=>panel.remove());
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
  function render(){styles();organizeMenu();welcomePanel();quickPanel();jobPanel()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(render,0),{once:true});else render();
  const observer=new MutationObserver(()=>{clearTimeout(observer._timer);observer._timer=setTimeout(render,50)});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('vg-oracle-preview-data',render);
})();
