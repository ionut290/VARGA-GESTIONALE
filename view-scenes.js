/* Scene animate contestuali per le viste principali del gestionale. */
(function(){
'use strict';

const scenes={
  dashboard:{label:'PANORAMICA AZIENDALE',icon:'🏢',items:['📋','🌿','€'],kind:'overview'},
  richieste:{label:'RICHIESTE E SEGNALAZIONI',icon:'📨',items:['✉️','!','✓'],kind:'mail'},
  emailActivities:{label:'ATTIVITÀ DA EMAIL',icon:'📥',items:['✉️','→','📋'],kind:'mail'},
  commesse:{label:'GESTIONE COMMESSE',icon:'🏗️',items:['📁','⚙️','✓'],kind:'work'},
  scadenze:{label:'SCADENZE E ATTIVITÀ',icon:'📅',items:['1','2','✓'],kind:'calendar'},
  clienti:{label:'ANAGRAFICA CLIENTI',icon:'🤝',items:['👤','☎','✓'],kind:'people'},
  preventivo:{label:'NUOVO PREVENTIVO',icon:'📝',items:['＋','€','✓'],kind:'document'},
  preventivi:{label:'GESTIONE PREVENTIVI',icon:'📑',items:['€','→','✓'],kind:'document'},
  prezzari:{label:'PREZZARI E LAVORAZIONI',icon:'🏷️',items:['€','≡','🔎'],kind:'prices'},
  documenti:{label:'ARCHIVIO DOCUMENTI',icon:'📂',items:['📄','↑','✓'],kind:'files'},
  rapportini:{label:'RAPPORTINI DI LAVORO',icon:'🧾',items:['✍','📍','✓'],kind:'document'},
  consuntivi:{label:'CONSUNTIVI E CONTABILITÀ',icon:'📊',items:['▥','€','✓'],kind:'chart'},
  fatture:{label:'FATTURE E INCASSI',icon:'🧾',items:['€','→','✓'],kind:'money'},
  spese:{label:'CONTROLLO SPESE',icon:'💳',items:['−','€','📊'],kind:'money'},
  cantieriSync:{label:'SINCRONIZZAZIONE CANTIERI',icon:'🔄',items:['📱','↔','💻'],kind:'sync'},
  squadreGestione:{label:'ORGANIZZAZIONE SQUADRE',icon:'👷',items:['👥','📅','✓'],kind:'people'},
  cloud:{label:'CLOUD E UTENTI',icon:'☁️',items:['👤','↑','✓'],kind:'cloud'},
  azienda:{label:'DATI AZIENDA',icon:'🏢',items:['✎','📋','✓'],kind:'work'},
  backup:{label:'BACKUP E SICUREZZA',icon:'🛡️',items:['↓','💾','✓'],kind:'backup'}
};

function ensureStyles(){
  if(document.getElementById('vgViewScenesStyles'))return;
  const style=document.createElement('style');
  style.id='vgViewScenesStyles';
  style.textContent=`
.vg-view-scene{--scene:#176b48;position:relative;flex:1;min-width:220px;max-width:640px;height:76px;margin:0 22px;overflow:hidden;background:transparent}
.vg-view-scene[data-kind="mail"]{--scene:#2875a8}.vg-view-scene[data-kind="calendar"]{--scene:#b36b19}.vg-view-scene[data-kind="money"]{--scene:#8b6b14}.vg-view-scene[data-kind="sync"]{--scene:#4768a9}.vg-view-scene[data-kind="cloud"]{--scene:#347dac}.vg-view-scene[data-kind="backup"]{--scene:#5b5ca8}.vg-view-scene[data-kind="prices"]{--scene:#9b6a18}.vg-view-scene[data-kind="chart"]{--scene:#247758}
.vg-scene-label{position:absolute;left:14px;top:9px;color:var(--scene);font-size:10px;font-weight:900;letter-spacing:.09em;opacity:.78}
.vg-scene-main{position:absolute;left:16px;bottom:7px;font-size:35px;line-height:1;animation:vgSceneMain 3.2s ease-in-out infinite;filter:drop-shadow(0 3px 2px rgba(20,50,35,.16))}
.vg-scene-line{position:absolute;left:68px;right:12px;bottom:16px;height:4px;border-radius:99px;background:color-mix(in srgb,var(--scene) 18%,#e7eee9);overflow:hidden}.vg-scene-line:after{content:'';display:block;width:32%;height:100%;border-radius:inherit;background:var(--scene);animation:vgSceneProgress 4s ease-in-out infinite}
.vg-scene-items{position:absolute;left:27%;right:7%;top:13px;bottom:20px;display:flex;align-items:center;justify-content:space-around}.vg-scene-item{display:grid;place-items:center;width:34px;height:34px;color:var(--scene);font-weight:900;font-size:18px;filter:drop-shadow(0 3px 2px rgba(20,50,35,.1));animation:vgSceneFloat 3s ease-in-out infinite}.vg-scene-item:nth-child(2){animation-delay:.35s}.vg-scene-item:nth-child(3){animation-delay:.7s}
.vg-view-scene[data-kind="sync"] .vg-scene-items,.vg-view-scene[data-kind="mail"] .vg-scene-items{animation:vgSceneTravel 4.2s ease-in-out infinite}.vg-view-scene[data-kind="chart"] .vg-scene-item{transform-origin:bottom;animation-name:vgSceneBars}.vg-view-scene[data-kind="backup"] .vg-scene-main,.vg-view-scene[data-kind="cloud"] .vg-scene-main{animation-name:vgScenePulse}
.vg-scene-spark{position:absolute;width:7px;height:7px;border-radius:50%;background:var(--scene);opacity:.18;animation:vgSceneSpark 4s linear infinite}.vg-scene-spark.s1{left:18%;top:17px}.vg-scene-spark.s2{left:56%;top:57px;animation-delay:1.3s}.vg-scene-spark.s3{right:5%;top:12px;animation-delay:2.1s}
@keyframes vgSceneMain{50%{transform:translateY(-5px) rotate(-2deg)}}@keyframes vgScenePulse{50%{transform:scale(1.12)}}@keyframes vgSceneProgress{0%{transform:translateX(-110%)}60%,100%{transform:translateX(315%)}}@keyframes vgSceneFloat{50%{transform:translateY(-7px)}}@keyframes vgSceneTravel{50%{transform:translateX(8%)}}@keyframes vgSceneBars{50%{transform:scaleY(.68) translateY(5px)}}@keyframes vgSceneSpark{0%{transform:scale(.4);opacity:0}40%{opacity:.25}100%{transform:scale(2.2);opacity:0}}
.view>.vg-view-scene{max-width:none;width:100%;margin:10px 0 18px}.topline>.vg-view-scene{width:auto;margin-top:-4px;margin-bottom:10px}
@media(max-width:900px){.vg-view-scene{max-width:360px;margin-left:12px;margin-right:12px}.vg-scene-label{display:none}}
@media(max-width:680px){.topline{flex-wrap:wrap}.topline>.vg-view-scene{order:3;flex-basis:100%;max-width:none;width:100%;margin:8px 0 4px;height:64px}.vg-view-scene{height:64px}.vg-scene-main{font-size:29px}.vg-scene-items{top:7px}}
@media(prefers-reduced-motion:reduce){.vg-view-scene *{animation-play-state:paused!important}}
`;
  document.head.appendChild(style);
}

function sceneElement(id,config){
  const el=document.createElement('div');
  el.className='vg-view-scene';
  el.dataset.viewScene=id;
  el.dataset.kind=config.kind;
  el.setAttribute('role','img');
  el.setAttribute('aria-label','Animazione '+config.label.toLowerCase());
  el.innerHTML=`<span class="vg-scene-label">${config.label}</span><span class="vg-scene-main">${config.icon}</span><span class="vg-scene-items">${config.items.map(item=>`<span class="vg-scene-item">${item}</span>`).join('')}</span><span class="vg-scene-line"></span><i class="vg-scene-spark s1"></i><i class="vg-scene-spark s2"></i><i class="vg-scene-spark s3"></i>`;
  return el;
}

function installScene(id,config){
  const view=document.getElementById(id);
  if(!view||view.querySelector(`.vg-view-scene[data-view-scene="${id}"]`))return;
  const scene=sceneElement(id,config),top=view.querySelector(':scope > .topline');
  if(top){const action=top.querySelector(':scope > button');top.insertBefore(scene,action||null);return}
  const subtitle=view.querySelector(':scope > .subtitle');
  if(subtitle)subtitle.insertAdjacentElement('afterend',scene);
  else view.insertBefore(scene,view.firstElementChild?.nextSibling||null);
}

function installAll(){ensureStyles();Object.entries(scenes).forEach(([id,config])=>installScene(id,config))}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installAll,{once:true});else installAll();
const observer=new MutationObserver(()=>{clearTimeout(observer._timer);observer._timer=setTimeout(installAll,40)});
observer.observe(document.documentElement,{childList:true,subtree:true});
})();
