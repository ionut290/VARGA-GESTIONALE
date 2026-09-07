/* Snapshot giornaliero dell'andamento economico.
   Evita di ricalcolare ore/documenti/grafico a ogni render.
   Il giorno economico cambia alle 07:00 locali. */
(function(root){
'use strict';
const api=root.VargaJobEconomics;
if(!api||api.__dailySnapshotInstalled)return;
const originalRender=api.render;
const originalBind=api.bind;
const STORAGE_KEY='vg_economicDailySnapshots_v1';
const REFRESH_HOUR=7;
let cache=loadCache();

function loadCache(){try{const x=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');return x&&typeof x==='object'?x:{}}catch(_){return{}}}
function saveCache(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(cache))}catch(err){console.warn('Snapshot economico non salvato',err)}}
function pad(v){return String(v).padStart(2,'0')}
function localDateKey(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function businessDayKey(now=new Date()){
  const d=new Date(now);
  if(d.getHours()<REFRESH_HOUR)d.setDate(d.getDate()-1);
  return localDateKey(d);
}
function formatUpdated(value){
  const d=new Date(value);if(Number.isNaN(d.getTime()))return 'mai';
  return new Intl.DateTimeFormat('it-IT',{dateStyle:'short',timeStyle:'short'}).format(d);
}
function jobKey(job){return String(job?.id||job?.code||job?.title||'commessa')}
function snapshotKey(job,dayKey=businessDayKey()){return `${jobKey(job)}::${dayKey}`}
function getSnapshot(job){return cache[snapshotKey(job)]||null}
function stripOldSnapshots(){
  const keep=businessDayKey();
  Object.keys(cache).forEach(k=>{if(!k.endsWith(`::${keep}`))delete cache[k]});
  saveCache();
}
function buildSnapshot(job,reason='automatico'){
  const started=performance?.now?.()||Date.now();
  const html=originalRender(job);
  const snap={jobId:jobKey(job),businessDay:businessDayKey(),updatedAt:new Date().toISOString(),reason,html};
  cache[snapshotKey(job,snap.businessDay)]=snap;
  saveCache();
  const elapsed=(performance?.now?.()||Date.now())-started;
  if(elapsed>250)console.info(`Snapshot economico ${jobKey(job)}: ${Math.round(elapsed)} ms`);
  return snap;
}
function isAdminUser(){
  try{
    if(root.currentUserRole==='admin'||root.cloudUserRole==='admin'||root.userRole==='admin')return true;
    const txt=document.getElementById('sidebarUserRole')?.textContent||'';
    return /admin/i.test(txt);
  }catch(_){return false}
}
function decorate(html,snap){
  const controls=`<div class="eco-snapshot-bar" data-eco-snapshot-bar><span>📊 Dati economici aggiornati: <strong>${formatUpdated(snap.updatedAt)}</strong></span><span>Aggiornamento giornaliero: <strong>07:00</strong></span>${isAdminUser()?'<button class="mini ghost" type="button" data-eco-recalculate-now>RICALCOLA ADESSO</button>':''}</div>`;
  return String(html).replace('<section class="eco-page">',`<section class="eco-page">${controls}`);
}
function render(job){
  const snap=getSnapshot(job)||buildSnapshot(job,'primo accesso dopo le 07:00');
  return decorate(snap.html,snap);
}
function invalidate(job){
  if(job)delete cache[snapshotKey(job)];
  else cache={};
  saveCache();
}
function recalculate(job){invalidate(job);return buildSnapshot(job,'ricalcolo manuale')}
function bind(job,rerender){
  originalBind(job,rerender);
  document.querySelector('[data-eco-recalculate-now]')?.addEventListener('click',()=>{
    const btn=document.querySelector('[data-eco-recalculate-now]');
    if(btn){btn.disabled=true;btn.textContent='RICALCOLO…'}
    try{recalculate(job);if(typeof rerender==='function')rerender();else root.refresh?.()}
    finally{if(btn){btn.disabled=false;btn.textContent='RICALCOLA ADESSO'}}
  });
}
function msUntilNext0700(){
  const now=new Date(),next=new Date(now);next.setHours(REFRESH_HOUR,0,0,0);
  if(next<=now)next.setDate(next.getDate()+1);
  return next-now;
}
function schedule0700(){
  setTimeout(()=>{
    // Alle 07:00 cambia il giorno economico. I nuovi snapshot vengono creati
    // una sola volta, quando la relativa commessa viene aperta.
    stripOldSnapshots();
    root.dispatchEvent?.(new CustomEvent('varga:economics-snapshot-day-changed',{detail:{hour:REFRESH_HOUR}}));
    schedule0700();
  },msUntilNext0700());
}

api.render=render;
api.bind=bind;
api.getDailySnapshot=getSnapshot;
api.recalculateDailySnapshot=recalculate;
api.invalidateDailySnapshot=invalidate;
api.businessDayKey=businessDayKey;
api.__dailySnapshotInstalled=true;
stripOldSnapshots();
schedule0700();
})(typeof window!=='undefined'?window:globalThis);
