/* Snapshot giornaliero + filtri periodo dell'andamento economico.
   Il calcolo pesante originale viene eseguito una sola volta per commessa/giorno
   economico; i filtri annuali e personalizzati lavorano sui dati gia locali. */
(function(root){
'use strict';
const api=root.VargaJobEconomics;
if(!api||api.__dailySnapshotInstalled)return;
const originalRender=api.render;
const originalBind=api.bind;
const SNAPSHOT_KEY='vg_economicDailySnapshots_v2';
const PERIOD_KEY='vg_economicPeriodFilters_v1';
const REFRESH_HOUR=7;
const A=v=>Array.isArray(v)?v:[];
const n=v=>{if(v==null||v==='')return 0;if(typeof v==='number')return Number.isFinite(v)?v:0;let s=String(v).replace(/\s|€/g,'');const comma=s.lastIndexOf(','),dot=s.lastIndexOf('.');if(comma>=0&&dot>=0)s=comma>dot?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');else if(comma>=0)s=s.replace(/\./g,'').replace(',','.');const x=Number(s);return Number.isFinite(x)?x:0};
const norm=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
const money=v=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(n(v));
let cache=loadJson(SNAPSHOT_KEY,{});
let filters=loadJson(PERIOD_KEY,{});
function loadJson(key,fallback){try{const x=JSON.parse(localStorage.getItem(key)||'null');return x&&typeof x==='object'?x:fallback}catch(_){return fallback}}
function saveJson(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch(err){console.warn('Dati economici locali non salvati',err)}}
function pad(v){return String(v).padStart(2,'0')}
function localDateKey(d){return`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function businessDayKey(now=new Date()){const d=new Date(now);if(d.getHours()<REFRESH_HOUR)d.setDate(d.getDate()-1);return localDateKey(d)}
function day(v){if(!v)return'';const s=String(v);let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return`${m[1]}-${m[2]}-${m[3]}`;m=s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);if(m)return`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;const d=new Date(s);return Number.isNaN(d.getTime())?'':d.toISOString().slice(0,10)}
function displayDay(v){const d=day(v);return d?new Intl.DateTimeFormat('it-IT').format(new Date(`${d}T12:00:00`)):'-'}
function formatUpdated(value){const d=new Date(value);return Number.isNaN(d.getTime())?'mai':new Intl.DateTimeFormat('it-IT',{dateStyle:'short',timeStyle:'short'}).format(d)}
function jobKey(job){return String(job?.id||job?.code||job?.title||'commessa')}
function snapshotKey(job){return`${jobKey(job)}::${businessDayKey()}`}
function getSnapshot(job){return cache[snapshotKey(job)]||null}
function stripOldSnapshots(){const keep=businessDayKey();Object.keys(cache).forEach(k=>{if(!k.endsWith(`::${keep}`))delete cache[k]});saveJson(SNAPSHOT_KEY,cache)}
function buildSnapshot(job,reason='automatico'){const html=originalRender(job);const snap={jobId:jobKey(job),businessDay:businessDayKey(),updatedAt:new Date().toISOString(),reason,html};cache[snapshotKey(job)]=snap;saveJson(SNAPSHOT_KEY,cache);return snap}
function invalidate(job){if(job)delete cache[snapshotKey(job)];else cache={};saveJson(SNAPSHOT_KEY,cache)}
function recalculate(job){invalidate(job);return buildSnapshot(job,'ricalcolo manuale')}
function isAdminUser(){try{if(root.currentUserRole==='admin'||root.cloudUserRole==='admin'||root.userRole==='admin')return true;return /admin/i.test(document.getElementById('sidebarUserRole')?.textContent||'')}catch(_){return false}}
function matchesJob(row,job){if(!row||!job)return false;if(row.jobId===job.id||row.commessaId===job.id)return true;const code=norm(job.code),title=norm(job.title),text=norm([row.commessa,row.jobName,row.jobCode,row.codiceCommessa].join(' '));return !!((code&&text.includes(code))||(title.length>=4&&text.includes(title)))}
function workforce(){try{return typeof root.VargaWorkforceHours==='function'?A(root.VargaWorkforceHours()):A(root.db?.vcOre)}catch(_){return A(root.db?.vcOre)}}
function getDefaultPeriod(){const y=new Date().getFullYear();return{mode:'year',year:y,start:`${y}-01-01`,end:`${y}-12-31`,label:`Anno ${y}`}}
function getPeriod(job){const raw=filters[jobKey(job)]||getDefaultPeriod();if(raw.mode==='custom'&&raw.start&&raw.end)return raw;const y=Number(raw.year)||new Date().getFullYear();return{mode:'year',year:y,start:`${y}-01-01`,end:`${y}-12-31`,label:`Anno ${y}`}}
function setPeriod(job,value){filters[jobKey(job)]=value;saveJson(PERIOD_KEY,filters)}
function inRange(value,p){const d=day(value);return!!d&&d>=p.start&&d<=p.end}
function rowDate(row){return row?.data||row?.date||row?.giorno||row?.documentDate||row?.mapReceivedAt||row?.createdAt||''}
function rate(job){const x=n(job?.hourlyRevenueRate);return x>0?x:(api.DEFAULT_RATE||35)}
function periodStats(job,p){
 const db=root.db||{};
 const hours=workforce().filter(r=>matchesJob(r,job)&&inRange(rowDate(r),p)).reduce((s,r)=>s+n(r.ore||r.hours||r.numeroOre),0);
 const entries=A(db.economicEntries).filter(r=>r.jobId===job.id&&inRange(r.mapReceivedAt||r.documentDate||r.createdAt,p));
 const expenses=A(db.expenses).filter(r=>r.jobId===job.id&&inRange(r.date||r.createdAt,p));
 const hourlyRate=rate(job),accrued=hours*hourlyRate;
 const pending=entries.filter(x=>x.status===api.PENDING).reduce((s,x)=>s+n(x.amount),0);
 const confirmed=entries.filter(x=>x.status===api.CONFIRMED).reduce((s,x)=>s+n(x.amount),0);
 const expenseTotal=expenses.reduce((s,x)=>s+n(x.amount),0);
 return{workedHours:hours,hourlyRate,accrued,pending,confirmed,expenses:expenseTotal,estimated:accrued-expenseTotal,actual:confirmed-expenseTotal};
}
function signedMoney(v){return`${n(v)>=0?'+':'−'} ${money(Math.abs(n(v)))}`}
function kpisHtml(s){return`<div class="eco-kpis"><article><span>Ore lavorate</span><strong>${s.workedHours.toLocaleString('it-IT',{maximumFractionDigits:2})} h</strong><small>${money(s.hourlyRate)} per ora</small></article><article><span>Valore maturato</span><strong>${money(s.accrued)}</strong><small>Ore × tariffa</small></article><article class="pending"><span>Entrate da confermare</span><strong>${money(s.pending)}</strong><small>Nel periodo selezionato</small></article><article class="confirmed"><span>Entrate confermate</span><strong>${money(s.confirmed)}</strong><small>MAP ricevuti nel periodo</small></article><article class="expense"><span>Uscite</span><strong>${money(s.expenses)}</strong><small>Spese nel periodo</small></article><article class="${s.actual>=0?'positive':'negative'}"><span>Risultato reale</span><strong>${signedMoney(s.actual)}</strong><small>Confermate − uscite</small></article><article class="${s.estimated>=0?'positive':'negative'}"><span>Risultato stimato</span><strong>${signedMoney(s.estimated)}</strong><small>Valore ore − uscite</small></article></div>`}
function chartHtml(job,p){
 const db=root.db||{},events=[],r=rate(job);
 workforce().filter(x=>matchesJob(x,job)&&inRange(rowDate(x),p)).forEach(x=>events.push({date:day(rowDate(x)),work:n(x.ore||x.hours||x.numeroOre)*r,confirmed:0,expense:0}));
 A(db.economicEntries).filter(x=>x.jobId===job.id&&x.status===api.CONFIRMED&&inRange(x.mapReceivedAt||x.documentDate||x.createdAt,p)).forEach(x=>events.push({date:day(x.mapReceivedAt||x.documentDate||x.createdAt),work:0,confirmed:n(x.amount),expense:0}));
 A(db.expenses).filter(x=>x.jobId===job.id&&inRange(x.date||x.createdAt,p)).forEach(x=>events.push({date:day(x.date||x.createdAt),work:0,confirmed:0,expense:n(x.amount)}));
 if(!events.length)return'<div class="eco-empty">Nessun movimento economico nel periodo selezionato.</div>';
 const dates=[...new Set(events.map(x=>x.date))].sort(),points=[];let work=0,confirmed=0,expense=0;
 dates.forEach(d=>{events.filter(x=>x.date===d).forEach(x=>{work+=x.work;confirmed+=x.confirmed;expense+=x.expense});points.push({date:d,work,confirmed,expense})});
 const max=Math.max(1,...points.flatMap(x=>[x.work,x.confirmed,x.expense])),W=760,H=230,pad=32,x=i=>points.length===1?W/2:pad+i*(W-pad*2)/(points.length-1),y=v=>H-pad-(v/max)*(H-pad*2),poly=k=>points.map((p,i)=>`${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(' '),labels=points.length>5?[points[0],points[Math.floor(points.length/2)],points.at(-1)]:points;
 return`<div class="eco-chart-legend"><span class="work">Valore ore maturato</span><span class="income">Entrate confermate</span><span class="expense">Uscite</span></div><svg class="eco-chart" viewBox="0 0 ${W} ${H}"><line x1="${pad}" y1="${H-pad}" x2="${W-pad}" y2="${H-pad}"/><line x1="${pad}" y1="${pad}" x2="${pad}" y2="${H-pad}"/><polyline class="work" points="${poly('work')}"/><polyline class="income" points="${poly('confirmed')}"/><polyline class="expense" points="${poly('expense')}"/>${labels.map(pt=>{const i=points.indexOf(pt);return`<text x="${x(i)}" y="${H-8}" text-anchor="middle">${displayDay(pt.date)}</text>`}).join('')}<text x="${pad+3}" y="${pad-8}">${money(max)}</text></svg>`
}
function availableYears(job){const years=new Set([new Date().getFullYear()]);const db=root.db||{};workforce().filter(x=>matchesJob(x,job)).forEach(x=>{const d=day(rowDate(x));if(d)years.add(Number(d.slice(0,4)))});A(db.economicEntries).filter(x=>x.jobId===job.id).forEach(x=>{const d=day(x.mapReceivedAt||x.documentDate||x.createdAt);if(d)years.add(Number(d.slice(0,4)))});A(db.expenses).filter(x=>x.jobId===job.id).forEach(x=>{const d=day(x.date||x.createdAt);if(d)years.add(Number(d.slice(0,4)))});return[...years].filter(Boolean).sort((a,b)=>b-a)}
function controls(job,p,snap){const years=availableYears(job);return`<div class="eco-period-panel panel"><div class="eco-period-head"><div><strong>Periodo andamento economico</strong><small>${p.mode==='year'?`Anno ${p.year}`:`${displayDay(p.start)} → ${displayDay(p.end)}`}</small></div><div class="eco-period-actions"><button class="mini ${p.mode==='year'?'primary':'ghost'}" type="button" data-eco-period-year>ANNUALE</button><button class="mini ${p.mode==='custom'?'primary':'ghost'}" type="button" data-eco-period-custom>PERIODO PERSONALIZZATO</button></div></div><div class="eco-period-fields"><label>Anno<select data-eco-year>${years.map(y=>`<option value="${y}" ${Number(p.year)===y?'selected':''}>${y}</option>`).join('')}</select></label><label>Dal<input type="date" data-eco-start value="${p.start}"></label><label>Al<input type="date" data-eco-end value="${p.end}"></label><div class="eco-period-quick"><button class="mini ghost" type="button" data-eco-quick="month">QUESTO MESE</button><button class="mini ghost" type="button" data-eco-quick="3m">ULTIMI 3 MESI</button><button class="mini ghost" type="button" data-eco-quick="6m">ULTIMI 6 MESI</button><button class="mini ghost" type="button" data-eco-quick="year">ANNO CORRENTE</button></div></div><div class="eco-snapshot-bar"><span>📊 Dati base aggiornati: <strong>${formatUpdated(snap.updatedAt)}</strong></span><span>Aggiornamento automatico: <strong>07:00</strong></span>${isAdminUser()?'<button class="mini ghost" type="button" data-eco-recalculate-now>RICALCOLA ADESSO</button>':''}</div></div>`}
function applyPeriodHtml(base,job,p,snap){let html=String(base);html=html.replace('<section class="eco-page">',`<section class="eco-page">${controls(job,p,snap)}`);html=html.replace(/<div class="eco-kpis">[\s\S]*?<\/div><div class="panel"><h2>Andamento della commessa<\/h2>[\s\S]*?<\/div><div class="eco-two">/,`${kpisHtml(periodStats(job,p))}<div class="panel"><h2>Andamento della commessa · ${p.mode==='year'?`Anno ${p.year}`:`${displayDay(p.start)} → ${displayDay(p.end)}`}</h2>${chartHtml(job,p)}</div><div class="eco-two">`);return html}
function render(job){const snap=getSnapshot(job)||buildSnapshot(job,'primo accesso dopo le 07:00');return applyPeriodHtml(snap.html,job,getPeriod(job),snap)}
function rerender(rerenderFn){if(typeof rerenderFn==='function')rerenderFn();else root.refresh?.()}
function bind(job,rerenderFn){
 originalBind(job,rerenderFn);
 const draw=()=>rerender(rerenderFn),p=getPeriod(job);
 document.querySelector('[data-eco-period-year]')?.addEventListener('click',()=>{const y=Number(document.querySelector('[data-eco-year]')?.value)||new Date().getFullYear();setPeriod(job,{mode:'year',year:y,start:`${y}-01-01`,end:`${y}-12-31`});draw()});
 document.querySelector('[data-eco-period-custom]')?.addEventListener('click',()=>{const start=document.querySelector('[data-eco-start]')?.value,end=document.querySelector('[data-eco-end]')?.value;if(!start||!end||start>end)return alert('Controlla le date del periodo.');setPeriod(job,{mode:'custom',start,end});draw()});
 document.querySelector('[data-eco-year]')?.addEventListener('change',e=>{const y=Number(e.target.value);setPeriod(job,{mode:'year',year:y,start:`${y}-01-01`,end:`${y}-12-31`});draw()});
 document.querySelectorAll('[data-eco-quick]').forEach(btn=>btn.addEventListener('click',()=>{const now=new Date(),end=localDateKey(now);let start=end,mode='custom';if(btn.dataset.ecoQuick==='month')start=`${now.getFullYear()}-${pad(now.getMonth()+1)}-01`;if(btn.dataset.ecoQuick==='3m'){const d=new Date(now);d.setMonth(d.getMonth()-3);start=localDateKey(d)}if(btn.dataset.ecoQuick==='6m'){const d=new Date(now);d.setMonth(d.getMonth()-6);start=localDateKey(d)}if(btn.dataset.ecoQuick==='year'){const y=now.getFullYear();mode='year';start=`${y}-01-01`;setPeriod(job,{mode,year:y,start,end:`${y}-12-31`});return draw()}setPeriod(job,{mode,start,end});draw()}));
 document.querySelector('[data-eco-recalculate-now]')?.addEventListener('click',()=>{const btn=document.querySelector('[data-eco-recalculate-now]');if(btn){btn.disabled=true;btn.textContent='RICALCOLO…'}try{recalculate(job);draw()}finally{if(btn){btn.disabled=false;btn.textContent='RICALCOLA ADESSO'}}});
}
function addPeriodStyles(){if(document.getElementById('vgEconomicsPeriodStyles'))return;const st=document.createElement('style');st.id='vgEconomicsPeriodStyles';st.textContent=`.eco-period-panel{display:grid;gap:12px}.eco-period-head{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}.eco-period-head>div:first-child{display:grid;gap:3px}.eco-period-head small{color:#66776d}.eco-period-actions,.eco-period-quick{display:flex;gap:7px;flex-wrap:wrap}.eco-period-fields{display:grid;grid-template-columns:160px 170px 170px minmax(240px,1fr);gap:10px;align-items:end}.eco-period-fields label{display:grid;gap:5px}.eco-snapshot-bar{display:flex;gap:14px;align-items:center;flex-wrap:wrap;padding-top:10px;border-top:1px solid #e0e7e3;color:#5f6e66;font-size:.86rem}@media(max-width:900px){.eco-period-fields{grid-template-columns:1fr 1fr}.eco-period-quick{grid-column:1/-1}}@media(max-width:600px){.eco-period-fields{grid-template-columns:1fr}}`;document.head.appendChild(st)}
function msUntilNext0700(){const now=new Date(),next=new Date(now);next.setHours(REFRESH_HOUR,0,0,0);if(next<=now)next.setDate(next.getDate()+1);return next-now}
function schedule0700(){setTimeout(()=>{stripOldSnapshots();root.dispatchEvent?.(new CustomEvent('varga:economics-snapshot-day-changed',{detail:{hour:REFRESH_HOUR}}));schedule0700()},msUntilNext0700())}
api.render=render;api.bind=bind;api.getDailySnapshot=getSnapshot;api.recalculateDailySnapshot=recalculate;api.invalidateDailySnapshot=invalidate;api.businessDayKey=businessDayKey;api.getEconomicPeriod=getPeriod;api.setEconomicPeriod=setPeriod;api.__dailySnapshotInstalled=true;stripOldSnapshots();addPeriodStyles();schedule0700();
})(typeof window!=='undefined'?window:globalThis);
