/* Animazione decorativa della Dashboard: trattorino che taglia l'erba. */
(function(){
'use strict';

function ensureStyles(){
  if(document.getElementById('vgDashboardMowerStyles'))return;
  const style=document.createElement('style');
  style.id='vgDashboardMowerStyles';
  style.textContent=`
.vg-mower-scene{position:relative;flex:1;min-width:180px;max-width:620px;height:78px;margin:0 22px;overflow:hidden;border-radius:16px;background:linear-gradient(180deg,#dff4ff 0 58%,#6fbf65 59% 100%);border:1px solid #cfe4d8;box-shadow:inset 0 -9px 0 rgba(20,105,64,.13)}
.vg-mower-scene:before{content:'';position:absolute;inset:46px 0 0;background:repeating-linear-gradient(78deg,transparent 0 7px,#2f8d48 8px 10px,transparent 11px 15px);opacity:.9}
.vg-mower-cut{position:absolute;left:0;bottom:0;height:27px;width:0;background:linear-gradient(180deg,#71bc62,#438f49);animation:vgMowerCut 8s linear infinite}
.vg-mower-cut:after{content:'';position:absolute;inset:9px 0 0;background:repeating-linear-gradient(90deg,rgba(255,255,255,.12) 0 2px,transparent 2px 9px)}
.vg-mower{position:absolute;left:-78px;bottom:9px;width:76px;height:55px;animation:vgMowerDrive 8s linear infinite;filter:drop-shadow(0 4px 3px rgba(15,55,35,.25));z-index:2}
.vg-mower svg{display:block;width:100%;height:100%}.vg-mower-wheel{transform-box:fill-box;transform-origin:center;animation:vgMowerWheel .65s linear infinite}
.vg-mower-clippings{position:absolute;left:-8px;bottom:16px;width:34px;height:18px;opacity:0;animation:vgMowerClippings 8s linear infinite;background:radial-gradient(circle at 10% 65%,#27763d 0 2px,transparent 3px),radial-gradient(circle at 35% 25%,#3d944a 0 2px,transparent 3px),radial-gradient(circle at 65% 70%,#24743a 0 2px,transparent 3px),radial-gradient(circle at 90% 20%,#4ba456 0 2px,transparent 3px)}
.vg-mower-label{position:absolute;right:10px;top:7px;color:#256343;font-size:10px;font-weight:900;letter-spacing:.08em;opacity:.72}
@keyframes vgMowerDrive{0%{transform:translateX(0)}8%{transform:translateX(12px)}88%{transform:translateX(calc(100% + 610px))}100%{transform:translateX(calc(100% + 620px))}}
@keyframes vgMowerCut{0%,8%{width:0}88%,100%{width:100%}}
@keyframes vgMowerWheel{to{transform:rotate(360deg)}}
@keyframes vgMowerClippings{0%,7%,90%,100%{opacity:0}12%,86%{opacity:1}}
@media(max-width:900px){.vg-mower-scene{max-width:330px;margin:0 12px}.vg-mower-label{display:none}}
@media(max-width:650px){#dashboard .topline{flex-wrap:wrap}.vg-mower-scene{order:3;flex-basis:100%;max-width:none;width:100%;margin:8px 0 0;height:64px}}
@media(prefers-reduced-motion:reduce){.vg-mower,.vg-mower-cut,.vg-mower-wheel,.vg-mower-clippings{animation-play-state:paused}.vg-mower{left:42%}.vg-mower-cut{width:48%}}
`;
  document.head.appendChild(style);
}

function addMower(){
  const top=document.querySelector('#dashboard .topline');
  if(!top||top.querySelector('.vg-mower-scene'))return;
  ensureStyles();
  const scene=document.createElement('div');
  scene.className='vg-mower-scene';
  scene.setAttribute('role','img');
  scene.setAttribute('aria-label',"Trattorino animato che taglia l'erba");
  scene.innerHTML=`<div class="vg-mower-label">MANUTENZIONE DEL VERDE</div><div class="vg-mower-cut"></div><div class="vg-mower"><div class="vg-mower-clippings"></div><svg viewBox="0 0 118 78" aria-hidden="true"><path fill="#efc126" d="M40 20h35l13 25H29z"/><path fill="#f8d84a" d="M50 8h22l4 21H46z"/><path fill="#c9eff6" d="M54 12h14l3 15H51z"/><path fill="#176b48" d="M72 33h25l8 17H76z"/><rect fill="#193d31" x="81" y="18" width="6" height="18" rx="2"/><rect fill="#efc126" x="22" y="40" width="77" height="13" rx="4"/><path fill="#d7a719" d="M12 50h94l-5 8H17z"/><circle class="vg-mower-wheel" fill="#22332c" cx="79" cy="57" r="16"/><circle fill="#a9b8ae" cx="79" cy="57" r="7"/><circle class="vg-mower-wheel" fill="#22332c" cx="32" cy="59" r="11"/><circle fill="#a9b8ae" cx="32" cy="59" r="5"/><circle fill="#fff3b0" cx="101" cy="43" r="4"/></svg></div>`;
  const action=top.querySelector('button');
  top.insertBefore(scene,action||null);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addMower,{once:true});else addMower();
const observer=new MutationObserver(addMower);
observer.observe(document.documentElement,{childList:true,subtree:true});
})();
