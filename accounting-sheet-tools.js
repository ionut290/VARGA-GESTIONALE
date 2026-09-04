/* Strumenti avanzati vista Contabilità per commessa: fullscreen, ricerca esplicita e filtri per colonna. */
(function(){
'use strict';
if(window.VargaAccountingSheetTools?.installed)return;

const state={filters:{},fullscreen:false};
const txt=v=>String(v??'').trim();
const norm=v=>txt(v).toLocaleLowerCase('it-IT').normalize('NFD').replace(/[\u0300-\u036f]/g,'');

function injectStyle(){
  if(document.getElementById('accounting-sheet-tools-style'))return;
  const s=document.createElement('style');
  s.id='accounting-sheet-tools-style';
  s.textContent=`
    .accounting-tools-search-btn,.accounting-fullscreen-btn{white-space:nowrap}
    .accounting-table thead .accounting-filter-row th{top:33px;z-index:4;padding:5px 6px;background:#f7faf8}
    .accounting-table thead .accounting-filter-row th:first-child{z-index:5;background:#f1f7f3}
    .accounting-column-filter{width:100%;min-width:72px;height:27px;padding:3px 6px;border:1px solid #cbd9d1;border-radius:5px;background:#fff;font:inherit;font-size:11px;color:#173c2e;outline:none}
    .accounting-column-filter:focus{border-color:#1c7a58;box-shadow:0 0 0 2px rgba(28,122,88,.12)}
    .accounting-filter-clear{height:34px;padding:0 12px}
    #consuntivi.accounting-fullscreen-mode{position:fixed!important;inset:0!important;z-index:99999!important;background:#f4f7f5!important;padding:16px!important;margin:0!important;overflow:auto!important;max-width:none!important;width:100vw!important;height:100vh!important}
    #consuntivi.accounting-fullscreen-mode .accounting-sheet-panel{height:calc(100vh - 235px)!important;display:flex;flex-direction:column}
    #consuntivi.accounting-fullscreen-mode .accounting-table-wrap{max-height:none!important;height:100%!important;overflow:auto!important}
    body.accounting-fullscreen-body{overflow:hidden!important}
    @media(max-width:1100px){
      .accounting-table thead .accounting-filter-row th{top:33px}
      #consuntivi.accounting-fullscreen-mode .accounting-sheet-panel{height:calc(100vh - 315px)!important}
    }
  `;
  document.head.appendChild(s);
}

function ensureTopButtons(){
  const picker=document.querySelector('#consuntivi .accounting-picker');
  if(!picker)return;
  const search=document.getElementById('accountingSearch');
  if(search&&!document.getElementById('accountingSearchBtn')){
    const b=document.createElement('button');
    b.id='accountingSearchBtn';
    b.className='ghost accounting-tools-search-btn';
    b.textContent='CERCA';
    b.title='Esegui la ricerca nel foglio';
    b.addEventListener('click',()=>search.dispatchEvent(new Event('input',{bubbles:true})));
    search.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();b.click();}});
    search.insertAdjacentElement('afterend',b);
  }
  if(!document.getElementById('accountingFullscreenBtn')){
    const b=document.createElement('button');
    b.id='accountingFullscreenBtn';
    b.className='ghost accounting-fullscreen-btn';
    b.addEventListener('click',toggleFullscreen);
    picker.appendChild(b);
    updateFullscreenButton();
  }
  if(!document.getElementById('accountingClearFilters')){
    const b=document.createElement('button');
    b.id='accountingClearFilters';
    b.className='ghost accounting-filter-clear';
    b.textContent='AZZERA FILTRI';
    b.title='Cancella tutti i filtri delle colonne';
    b.addEventListener('click',()=>{
      state.filters={};
      document.querySelectorAll('#consuntivi .accounting-column-filter').forEach(i=>i.value='');
      applyColumnFilters();
    });
    picker.appendChild(b);
  }
}

function updateFullscreenButton(){
  const b=document.getElementById('accountingFullscreenBtn');
  if(!b)return;
  b.textContent=state.fullscreen?'ESCI DALLO SCHERMO INTERO':'VEDI A SCHERMO INTERO';
  b.classList.toggle('primary',state.fullscreen);
  b.classList.toggle('ghost',!state.fullscreen);
}

function toggleFullscreen(){
  const section=document.getElementById('consuntivi');
  if(!section)return;
  state.fullscreen=!state.fullscreen;
  section.classList.toggle('accounting-fullscreen-mode',state.fullscreen);
  document.body.classList.toggle('accounting-fullscreen-body',state.fullscreen);
  updateFullscreenButton();
  if(state.fullscreen)window.scrollTo(0,0);
}

function cellRawText(cell){return norm(cell?.textContent||'');}

function applyColumnFilters(){
  const table=document.querySelector('#consuntivi .accounting-table');
  if(!table)return;
  const rows=table.querySelectorAll('tbody tr');
  rows.forEach(row=>{
    const cells=row.children;
    let visible=true;
    Object.entries(state.filters).forEach(([idx,value])=>{
      if(!visible||!value)return;
      const cell=cells[Number(idx)];
      if(!cell||!cellRawText(cell).includes(norm(value)))visible=false;
    });
    row.style.display=visible?'':'none';
  });
  const visible=[...rows].filter(r=>r.style.display!=='none').length;
  let info=document.getElementById('accountingFilteredCount');
  if(!info){
    info=document.createElement('div');
    info.id='accountingFilteredCount';
    info.style.cssText='padding:7px 10px;font-size:12px;color:#50655b;border-top:1px solid #dde6e1;background:#fafcfb';
    table.closest('.accounting-table-wrap')?.insertAdjacentElement('afterend',info);
  }
  const total=rows.length;
  const active=Object.values(state.filters).some(Boolean);
  info.textContent=active?`Filtri colonna: ${visible} righe visibili su ${total}`:'';
  info.style.display=active?'block':'none';
}

function ensureColumnFilters(){
  const table=document.querySelector('#consuntivi .accounting-table');
  const head=table?.tHead;
  if(!table||!head||!head.rows.length)return;
  const header=head.rows[0];
  if(head.querySelector('.accounting-filter-row')){
    applyColumnFilters();
    return;
  }
  const filterRow=document.createElement('tr');
  filterRow.className='accounting-filter-row';
  [...header.cells].forEach((th,index)=>{
    const cell=document.createElement('th');
    const input=document.createElement('input');
    input.type='search';
    input.className='accounting-column-filter';
    input.placeholder='Filtra…';
    input.setAttribute('aria-label',`Filtra ${txt(th.textContent)||'colonna'}`);
    input.value=state.filters[index]||'';
    input.addEventListener('input',()=>{
      state.filters[index]=input.value;
      applyColumnFilters();
    });
    cell.appendChild(input);
    filterRow.appendChild(cell);
  });
  head.appendChild(filterRow);
  applyColumnFilters();
}

function enhance(){
  injectStyle();
  ensureTopButtons();
  ensureColumnFilters();
  const section=document.getElementById('consuntivi');
  if(section&&state.fullscreen&&!section.classList.contains('accounting-fullscreen-mode')){
    section.classList.add('accounting-fullscreen-mode');
    document.body.classList.add('accounting-fullscreen-body');
  }
  updateFullscreenButton();
}

let timer=0;
const schedule=()=>{clearTimeout(timer);timer=setTimeout(enhance,20)};
const observer=new MutationObserver(schedule);
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',()=>{enhance();observer.observe(document.body,{childList:true,subtree:true});},{once:true});
}else{
  enhance();observer.observe(document.body,{childList:true,subtree:true});
}

document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&state.fullscreen){e.preventDefault();toggleFullscreen();}
});

window.VargaAccountingSheetTools={installed:true,state,enhance,toggleFullscreen,applyColumnFilters};
})();
