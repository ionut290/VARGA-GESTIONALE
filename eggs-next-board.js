(function(){
'use strict';
const EGGS_URL='https://coopavola.eggsnext.cloud/main/functions/home';
function install(){
  const navBox=document.querySelector('.sidebar-nav'),main=document.querySelector('.main');
  if(!navBox||!main||document.getElementById('eggsNextBoard'))return;
  const button=document.createElement('button');
  button.className='nav';button.type='button';button.dataset.view='eggsNextBoard';button.textContent='▣ Lavagna EGGS-NEXT';
  const sync=document.querySelector('[data-view="cantieriSync"]');
  navBox.insertBefore(button,sync||null);
  const section=document.createElement('section');
  section.id='eggsNextBoard';section.className='view eggs-next-view';
  section.innerHTML=`<div class="topline eggs-next-head"><div><h1>Lavagna EGGS-NEXT</h1><p class="subtitle">Pianificazione Avola aggiornata direttamente dal portale originale.</p></div><div class="eggs-next-actions"><button id="reloadEggsNext" class="ghost" type="button">↻ AGGIORNA</button><a class="primary eggs-next-open" href="${EGGS_URL}" target="_blank" rel="noopener">APRI FUORI</a></div></div><div class="eggs-next-notice">La lavagna è visualizzata direttamente da EGGS-NEXT. Se richiesto, effettua l’accesso con il tuo account Avola.</div><div class="eggs-next-frame-wrap"><iframe id="eggsNextFrame" title="Lavagna pianificazione EGGS-NEXT" src="${EGGS_URL}" loading="lazy" allow="clipboard-read; clipboard-write" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
  main.appendChild(section);
  button.onclick=()=>nav('eggsNextBoard');
  document.getElementById('reloadEggsNext').onclick=()=>{const frame=document.getElementById('eggsNextFrame');frame.src='about:blank';setTimeout(()=>frame.src=EGGS_URL,60)};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
