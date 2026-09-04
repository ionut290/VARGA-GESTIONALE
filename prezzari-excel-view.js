// Varga Gestionale - vista prezzari in formato Excel e importazione fedele.
(function(){
  const ACTIVE_KEY='vg_activePriceListId_v2';
  let excelState=null;
  let uiReady=false;

  const ntext=value=>String(value??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const numberFrom=value=>{
    if(typeof value==='number')return Number.isFinite(value)?value:0;
    let s=String(value??'').replace(/€/g,'').replace(/\s/g,'').trim();
    if(!s)return 0;
    if(s.includes(',')&&s.includes('.'))s=s.lastIndexOf(',')>s.lastIndexOf('.')?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');
    else s=s.replace(',','.');
    const n=Number(s.replace(/[^0-9.-]/g,''));
    return Number.isFinite(n)?n:0;
  };
  const fixed2=value=>Number(value||0).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2});

  function activePriceListId(){
    let id='';
    try{id=localStorage.getItem(ACTIVE_KEY)||''}catch(_){}
    if(id&&db.priceLists.some(p=>p.id===id))return id;
    id=db.priceLists[0]?.id||'';
    if(id)try{localStorage.setItem(ACTIVE_KEY,id)}catch(_){}
    return id;
  }
  function setActivePriceListId(id){
    if(!id||!db.priceLists.some(p=>p.id===id))return;
    try{localStorage.setItem(ACTIVE_KEY,id)}catch(_){}
    const hidden=document.getElementById('ePL');
    if(hidden)hidden.value=id;
    renderPriceLists();
  }

  function injectStyles(){
    if(document.getElementById('vg-pricebook-style'))return;
    const style=document.createElement('style');
    style.id='vg-pricebook-style';
    style.textContent=`
      .vg-pricebook-picker{border-color:#b9d8c8;background:linear-gradient(135deg,#ffffff,#f5fbf8)}
      .vg-pricebook-picker-grid{display:grid;grid-template-columns:minmax(260px,420px) 1fr;gap:18px;align-items:end}
      .vg-pricebook-manage{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
      .vg-new-pricebook-actions{margin-top:12px;padding:13px;border:2px solid #69b98f;border-radius:11px;background:#eef9f3}
      .vg-new-pricebook-actions strong{display:block;color:#174f36;margin-bottom:5px}
      .vg-new-pricebook-actions .actions{margin-top:10px;justify-content:flex-start}
      .vg-pricebook-picker select{font-size:15px;font-weight:800;border-color:#8bbda4}
      .vg-pricebook-chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
      .vg-pricebook-chip{border:1px solid #b7cfc2;background:#fff;color:#225d43;padding:8px 11px;border-radius:999px;font-weight:800;cursor:pointer}
      .vg-pricebook-chip.active{background:#176b48;color:#fff;border-color:#176b48}
      .vg-pricebook-chip small{opacity:.78;font-weight:700;margin-left:6px}
      .vg-pricebook-table-head{display:flex;align-items:end;justify-content:space-between;gap:14px;margin-bottom:10px}
      .vg-pricebook-table-head h2{margin:0}
      .vg-pricebook-count{font-size:12px;color:#65746c;font-weight:700;margin-top:4px}
      .vg-pricebook-search{max-width:430px}
      .vg-pricebook-sheet-wrap{border:1px solid #6fc4ea;overflow:auto;max-height:72vh;background:#fff;border-radius:3px}
      table.vg-pricebook-sheet{border-collapse:collapse;min-width:1180px;width:100%;font-size:12px;table-layout:fixed}
      .vg-pricebook-sheet th{position:sticky;top:0;z-index:2;background:#1f4e78;color:#fff;text-align:center;font-size:11px;font-weight:900;padding:9px 7px;border:1px solid #5aaed2;white-space:nowrap}
      .vg-pricebook-sheet td{padding:6px 7px;border:1px solid #87cdeb;vertical-align:top;color:#14231c;line-height:1.25;word-break:break-word}
      .vg-pricebook-sheet tbody tr:nth-child(odd){background:#c7eaf7}
      .vg-pricebook-sheet tbody tr:nth-child(even){background:#fff}
      .vg-pricebook-sheet .c-code{width:17%;text-align:center;white-space:nowrap}
      .vg-pricebook-sheet .c-desc{width:52%}
      .vg-pricebook-sheet .c-unit{width:9%;text-align:center}
      .vg-pricebook-sheet .c-price,.vg-pricebook-sheet .c-discount{width:9%;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
      .vg-pricebook-sheet .c-actions{width:12%;text-align:center;white-space:nowrap}
      .vg-pricebook-row-actions{display:flex;gap:5px;justify-content:center}
      .vg-pricebook-manual-note{grid-column:span 2;background:#edf5f0;border:1px solid #cfe0d7;border-radius:9px;padding:9px 11px;color:#315743;font-size:12px;font-weight:800}
      .vg-pricebook-preview{margin-top:12px;border:1px solid #a8d4e8;border-radius:4px;overflow:auto;max-height:280px}
      .vg-pricebook-preview table{min-width:920px;font-size:11px}
      .vg-pricebook-preview th{background:#1f4e78;color:#fff;position:sticky;top:0}
      .vg-pricebook-preview tr:nth-child(odd) td{background:#d7f0fa}
      @media(max-width:850px){.vg-pricebook-picker-grid{grid-template-columns:1fr}.vg-pricebook-table-head{align-items:stretch;flex-direction:column}.vg-pricebook-search{max-width:none}.vg-pricebook-manual-note{grid-column:auto}}
    `;
    document.head.appendChild(style);
  }

  function ensureUi(){
    if(uiReady&&document.getElementById('vgActivePriceList'))return;
    const section=document.getElementById('prezzari');
    const entries=document.getElementById('entriesList');
    if(!section||!entries)return;
    injectStyles();

    let picker=document.getElementById('vgPriceBookPicker');
    if(!picker){
      picker=document.createElement('div');
      picker.id='vgPriceBookPicker';
      picker.className='panel vg-pricebook-picker';
      picker.innerHTML=`<div class="vg-pricebook-picker-grid"><div><h2>Prezziari caricati</h2><label>PREZZIARIO DA VISUALIZZARE<select id="vgActivePriceList"></select></label><div class="vg-pricebook-manage"><button type="button" id="vgRenamePriceList" class="mini">RINOMINA</button><button type="button" id="vgDeletePriceList" class="mini danger">ELIMINA PREZZIARIO</button></div></div><div><div class="muted">Seleziona un prezziario: subito sotto vengono mostrate soltanto le sue voci, nello stesso ordine e con le colonne del file Excel.</div><div id="vgPriceBookChips" class="vg-pricebook-chips"></div></div></div>`;
      const subtitle=section.querySelector('.subtitle');
      if(subtitle)subtitle.insertAdjacentElement('afterend',picker); else section.prepend(picker);
    }

    const listPanel=entries.closest('.panel');
    if(listPanel){
      if(!document.getElementById('vgPriceBookTableHead')){
        const head=document.createElement('div');
        head.id='vgPriceBookTableHead';
        head.className='vg-pricebook-table-head';
        head.innerHTML=`<div><h2>Voci del prezziario</h2><div id="vgPriceBookCount" class="vg-pricebook-count"></div></div><input id="vgPriceBookSearch" class="vg-pricebook-search" placeholder="Cerca codice o descrizione...">`;
        listPanel.insertBefore(head,entries);
        head.querySelector('#vgPriceBookSearch').addEventListener('input',renderPriceLists);
      }
      if(picker.nextElementSibling!==listPanel)section.insertBefore(listPanel,picker.nextSibling);
    }

    const manualPL=document.getElementById('ePL');
    const manualPanel=manualPL?.closest('.panel');
    if(manualPanel){
      manualPL.style.display='none';
      document.getElementById('eChapter')?.remove();
      if(!document.getElementById('eDiscount')){
        const discount=document.createElement('input'); discount.id='eDiscount'; discount.type='number'; discount.step='0.01'; discount.placeholder='Ribasso %';
        const button=document.getElementById('addEntry');
        manualPanel.insertBefore(discount,button||null);
      }
      if(!document.getElementById('vgManualPriceListNote')){
        const note=document.createElement('div'); note.id='vgManualPriceListNote'; note.className='vg-pricebook-manual-note';
        manualPanel.insertBefore(note,manualPanel.firstChild);
      }
      const addBtn=document.getElementById('addEntry');
      if(addBtn)addBtn.textContent='AGGIUNGI / AGGIORNA VOCE';
    }

    const active=document.getElementById('vgActivePriceList');
    if(active&&!active.dataset.bound){
      active.dataset.bound='1';
      active.addEventListener('change',()=>setActivePriceListId(active.value));
    }
    const rename=document.getElementById('vgRenamePriceList');
    if(rename&&!rename.dataset.bound){rename.dataset.bound='1';rename.addEventListener('click',renameActivePriceList)}
    const remove=document.getElementById('vgDeletePriceList');
    if(remove&&!remove.dataset.bound){remove.dataset.bound='1';remove.addEventListener('click',deleteActivePriceList)}
    const addPriceList=document.getElementById('addPriceList');
    if(addPriceList)addPriceList.textContent='AGGIUNGI NUOVO PREZZIARIO';
    uiReady=true;
  }

  function showNewPriceListActions(pl){
    document.getElementById('vgNewPriceListActions')?.remove();
    const createPanel=document.getElementById('addPriceList')?.closest('.panel');
    if(!createPanel)return;
    const box=document.createElement('div');
    box.id='vgNewPriceListActions';box.className='vg-new-pricebook-actions';
    box.innerHTML=`<strong>Prezziario “${esc(pl.name)}” creato.</strong><div>Scegli ora come inserire le voci:</div><div class="actions"><button type="button" id="vgAttachNewPriceList" class="primary">ALLEGA PREZZIARIO EXCEL</button><button type="button" id="vgManualNewPriceList" class="ghost">AGGIUNGI VOCI MANUALMENTE</button></div>`;
    createPanel.appendChild(box);
    box.querySelector('#vgAttachNewPriceList').onclick=()=>{
      const input=document.getElementById('excelFile');
      if(input){input.value='';input.click()}
    };
    box.querySelector('#vgManualNewPriceList').onclick=()=>{
      const field=document.getElementById('eCode');
      field?.closest('.panel')?.scrollIntoView({behavior:'smooth',block:'start'});
      setTimeout(()=>field?.focus(),250);
    };
    box.scrollIntoView({behavior:'smooth',block:'center'});
  }

  function renameActivePriceList(){
    const id=activePriceListId(),pl=db.priceLists.find(p=>p.id===id);
    if(!pl)return alert('Seleziona un prezziario.');
    const name=prompt('Nuovo nome del prezziario:',pl.name||'');
    if(name===null)return;
    const clean=name.trim();
    if(!clean)return alert('Il nome non può essere vuoto.');
    if(db.priceLists.some(p=>p.id!==id&&ntext(p.name)===ntext(clean)))return alert('Esiste già un prezziario con questo nome.');
    pl.name=clean;
    save();
  }

  function deleteActivePriceList(){
    const id=activePriceListId(),pl=db.priceLists.find(p=>p.id===id);
    if(!pl)return alert('Seleziona un prezziario.');
    const count=db.entries.filter(e=>e.priceListId===id).length;
    if(!confirm(`Eliminare il prezziario “${pl.name}” e tutte le sue ${count} voci?\n\nQuesta operazione non può essere annullata.`))return;
    db.priceLists=db.priceLists.filter(p=>p.id!==id);
    db.entries=db.entries.filter(e=>e.priceListId!==id);
    db.clients.forEach(c=>{if(c.priceListId===id)c.priceListId=''});
    const next=db.priceLists[0]?.id||'';
    try{next?localStorage.setItem(ACTIVE_KEY,next):localStorage.removeItem(ACTIVE_KEY)}catch(_){}
    save();
  }

  function editPriceEntry(id){
    const entry=db.entries.find(e=>e.id===id);if(!entry)return;
    const code=prompt('Codice prezzo:',entry.code||'');if(code===null)return;
    const description=prompt('Descrizione:',entry.description||'');if(description===null)return;
    const unit=prompt('Unità di misura:',entry.unit||'');if(unit===null)return;
    const price=prompt('Prezzo unitario:',fixed2(entry.price));if(price===null)return;
    const discount=prompt('Ribasso %:',fixed2(entry.discount||0));if(discount===null)return;
    if(!description.trim())return alert('La descrizione non può essere vuota.');
    Object.assign(entry,{code:code.trim(),description:description.trim(),unit:unit.trim(),price:numberFrom(price),discount:numberFrom(discount)});
    save();
  }

  function deletePriceEntry(id){
    const entry=db.entries.find(e=>e.id===id);if(!entry)return;
    if(!confirm(`Eliminare la voce ${entry.code||''} - ${entry.description||''}?`))return;
    db.entries=db.entries.filter(e=>e.id!==id);
    save();
  }

  function renderPicker(){
    const select=document.getElementById('vgActivePriceList');
    const chips=document.getElementById('vgPriceBookChips');
    if(!select||!chips)return;
    const active=activePriceListId();
    select.innerHTML=db.priceLists.length?db.priceLists.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join(''):'<option value="">Nessun prezziario</option>';
    select.value=active;
    chips.innerHTML=db.priceLists.length?db.priceLists.map(p=>{
      const count=db.entries.reduce((n,e)=>n+(e.priceListId===p.id?1:0),0);
      return `<button type="button" class="vg-pricebook-chip ${p.id===active?'active':''}" data-vg-pl="${esc(p.id)}">${esc(p.name)}<small>${count} voci</small></button>`;
    }).join(''):'<span class="muted">Nessun prezziario caricato.</span>';
    chips.querySelectorAll('[data-vg-pl]').forEach(b=>b.onclick=()=>setActivePriceListId(b.dataset.vgPl));
    const hidden=document.getElementById('ePL');
    if(hidden&&active)hidden.value=active;
    const pl=db.priceLists.find(p=>p.id===active);
    const note=document.getElementById('vgManualPriceListNote');
    if(note)note.textContent=pl?`La voce manuale verrà salvata in: ${pl.name}`:'Crea o seleziona prima un prezziario.';
  }

  function renderTable(){
    const target=document.getElementById('entriesList');
    if(!target)return;
    const active=activePriceListId();
    const query=ntext(document.getElementById('vgPriceBookSearch')?.value||'');
    let rows=db.entries.filter(e=>e.priceListId===active);
    if(query)rows=rows.filter(e=>ntext([e.code,e.description,e.unit,e.price,e.discount].join(' ')).includes(query));
    const total=db.entries.reduce((n,e)=>n+(e.priceListId===active?1:0),0);
    const count=document.getElementById('vgPriceBookCount');
    if(count)count.textContent=query?`${rows.length} risultati su ${total} voci`:`${total} voci caricate`;
    if(!active){target.innerHTML='<div class="empty">Crea o seleziona un prezziario.</div>';return;}
    if(!rows.length){target.innerHTML='<div class="empty">Nessuna voce in questo prezziario.</div>';return;}
    target.innerHTML=`<div class="vg-pricebook-sheet-wrap"><table class="vg-pricebook-sheet"><thead><tr><th class="c-code">CODICE PREZZO</th><th class="c-desc">DESCRIZIONE</th><th class="c-unit">UNITÀ DI MISURA</th><th class="c-price">PREZZO UNITARIO</th><th class="c-discount">RIBASSO %</th><th class="c-actions">AZIONI</th></tr></thead><tbody>${rows.map(e=>`<tr><td class="c-code">${esc(e.code||'')}</td><td class="c-desc">${esc(e.description||'')}</td><td class="c-unit">${esc(e.unit||'')}</td><td class="c-price">${fixed2(e.price)}</td><td class="c-discount">${fixed2(e.discount||0)}</td><td class="c-actions"><div class="vg-pricebook-row-actions"><button type="button" class="mini" data-vg-edit-entry="${esc(e.id)}">MODIFICA</button><button type="button" class="mini danger" data-vg-delete-entry="${esc(e.id)}">ELIMINA</button></div></td></tr>`).join('')}</tbody></table></div>`;
    target.querySelectorAll('[data-vg-edit-entry]').forEach(b=>b.onclick=()=>editPriceEntry(b.dataset.vgEditEntry));
    target.querySelectorAll('[data-vg-delete-entry]').forEach(b=>b.onclick=()=>deletePriceEntry(b.dataset.vgDeleteEntry));
  }

  function renderPriceLists(){
    ensureUi();
    renderPicker();
    renderTable();
  }

  function bindCreateAndManual(){
    const addPL=document.getElementById('addPriceList');
    if(addPL)addPL.onclick=()=>{
      const input=document.getElementById('plName');
      const name=input?.value.trim();
      if(!name)return alert('Inserisci il nome del prezziario.');
      const row={id:uid(),name};
      db.priceLists.push(row);
      if(input)input.value='';
      try{localStorage.setItem(ACTIVE_KEY,row.id)}catch(_){}
      save();
      showNewPriceListActions(row);
    };

    const addEntry=document.getElementById('addEntry');
    if(addEntry)addEntry.onclick=()=>{
      const pl=activePriceListId();
      if(!pl)return alert('Crea o seleziona prima un prezziario.');
      const description=document.getElementById('eDesc')?.value.trim()||'';
      if(!description)return alert('Inserisci la descrizione della voce.');
      const code=(document.getElementById('eCode')?.value.trim()||'VOCE').trim();
      const data={priceListId:pl,code,description,unit:document.getElementById('eUnit')?.value.trim()||'cad',price:numberFrom(document.getElementById('ePrice')?.value),discount:numberFrom(document.getElementById('eDiscount')?.value)};
      const existing=db.entries.find(e=>e.priceListId===pl&&ntext(e.code)===ntext(code));
      if(existing)Object.assign(existing,data); else db.entries.push({id:uid(),...data});
      ['eCode','eDesc','eUnit','ePrice','eDiscount'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});
      save();
    };
  }

  const aliases={
    chapter:['capitolo','categoria','gruppo','sezione'],
    code:['codice prezzo','codice','cod.','cod','articolo'],
    description:['descrizione','lavorazione','denominazione','testo'],
    unit:['unita di misura','unità di misura','u.m.','um'],
    price:['prezzo unitario','prezzo','importo','costo'],
    discount:['ribasso %','ribasso','sconto %','sconto','ribasso percentuale']
  };
  function detectColumn(headers,key){
    const hs=headers.map(ntext), as=aliases[key].map(ntext);
    for(const a of as){const i=hs.findIndex(h=>h===a);if(i>=0)return i;}
    for(const a of as){const i=hs.findIndex(h=>h.includes(a));if(i>=0)return i;}
    return -1;
  }
  function detectUnitPriceColumn(headers){
    const hs=headers.map(ntext);
    const exact=['prezzo unitario','importo unitario','tariffa unitaria'];
    for(const name of exact){const i=hs.findIndex(h=>h===name);if(i>=0)return i;}
    return hs.findIndex(h=>(h.includes('prezzo')||h.includes('importo')||h.includes('tariffa'))&&!h.includes('codice'));
  }
  function columnMap(headers){return{chapter:detectColumn(headers,'chapter'),code:detectColumn(headers,'code'),description:detectColumn(headers,'description'),unit:detectColumn(headers,'unit'),price:detectUnitPriceColumn(headers),discount:detectColumn(headers,'discount')}}
  function findHeaderRow(matrix){
    const limit=Math.min(matrix.length,40);
    for(let i=0;i<limit;i++){
      const m=columnMap(matrix[i]||[]);
      if(m.description>=0&&m.price>=0)return i;
    }
    return matrix.findIndex(r=>(r||[]).some(v=>String(v??'').trim()));
  }
  function cell(row,index,fallback=''){return index>=0?(row[index]??fallback):fallback}
  function buildImportedRows(state){
    const active=activePriceListId();
    const existing=new Map(db.entries.filter(e=>e.priceListId===active&&e.code).map(e=>[ntext(e.code),e]));
    const result=[],used=new Map();
    state.rows.forEach((r,i)=>{
      const description=String(cell(r,state.map.description,'')).trim();
      if(!description)return;
      const code=String(cell(r,state.map.code,`VOCE-${i+1}`)).trim()||`VOCE-${i+1}`;
      const key=ntext(code)||`__row_${i}`;
      const old=existing.get(key);
      const entry={id:old?.id||uid(),priceListId:active,chapter:String(cell(r,state.map.chapter,'')).trim(),code,description,unit:String(cell(r,state.map.unit,'cad')).trim()||'cad',price:numberFrom(cell(r,state.map.price,0)),discount:numberFrom(cell(r,state.map.discount,0)),sourceRow:i+state.headerRow+2};
      if(used.has(key))result[used.get(key)]=entry; else{used.set(key,result.length);result.push(entry)}
    });
    return result;
  }
  function previewHtml(rows){
    const sample=rows.slice(0,8);
    if(!sample.length)return '';
    return `<div class="vg-pricebook-preview"><table><thead><tr><th>CODICE PREZZO</th><th>DESCRIZIONE</th><th>UNITÀ DI MISURA</th><th>PREZZO UNITARIO</th><th>RIBASSO %</th></tr></thead><tbody>${sample.map(e=>`<tr><td>${esc(e.code)}</td><td>${esc(e.description)}</td><td>${esc(e.unit)}</td><td>${fixed2(e.price)}</td><td>${fixed2(e.discount)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function bindExcelImport(){
    const input=document.getElementById('excelFile');
    if(!input)return;
    input.onchange=async event=>{
      const file=event.target.files?.[0];
      if(!file)return;
      const active=activePriceListId();
      if(!active){input.value='';return alert('Crea o seleziona prima il prezziario di destinazione.');}
      if(typeof XLSX==='undefined'){input.value='';return alert('Modulo Excel non disponibile: connetti il PC a Internet e riapri.');}
      try{
        const workbook=XLSX.read(await file.arrayBuffer(),{type:'array'});
        const sheetName=workbook.SheetNames.find(n=>ntext(n)==='prezziario')||workbook.SheetNames[0];
        const sheet=workbook.Sheets[sheetName];
        const matrix=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:true});
        const headerRow=findHeaderRow(matrix);
        if(headerRow<0)throw new Error('Non trovo la riga delle intestazioni.');
        const headers=matrix[headerRow]||[];
        const map=columnMap(headers);
        if(map.description<0||map.price<0)throw new Error('Non riconosco le colonne DESCRIZIONE e PREZZO UNITARIO.');
        const rows=matrix.slice(headerRow+1).filter(r=>(r||[]).some(v=>String(v??'').trim()));
        excelState={fileName:file.name,sheetName,headerRow,headers,rows,map};
        const parsed=buildImportedRows(excelState);
        const pl=db.priceLists.find(p=>p.id===active);
        if(pl&&ntext(file.name).includes('assoverde'))pl.name='Assoverde 2025';
        const area=document.getElementById('excelArea');
        area.innerHTML=`<div class="warn">File: <strong>${esc(file.name)}</strong> • Foglio: <strong>${esc(sheetName)}</strong> • <strong>${parsed.length} voci valide</strong>.<br>Riconosciute: Codice ${map.code>=0?'✓':'—'}, Descrizione ✓, U.M. ${map.unit>=0?'✓':'—'}, Prezzo unitario ✓, Ribasso ${map.discount>=0?'✓':'—'}.</div>${previewHtml(parsed)}<div class="actions left"><button id="doExcel" class="primary">AGGIORNA ${esc(pl?.name||'PREZZIARIO')}</button></div>`;
        document.getElementById('doExcel').onclick=()=>{
          const current=activePriceListId();
          if(current!==active)return alert('Hai cambiato prezziario. Ricarica il file per evitare di importarlo nel prezziario sbagliato.');
          const imported=buildImportedRows(excelState);
          if(!imported.length)return alert('Il file non contiene voci valide da importare.');
          const oldCount=db.entries.filter(e=>e.priceListId===active).length;
          if(!confirm(`Aggiornare il prezziario "${pl?.name||''}" con ${imported.length} voci?\n\nLe voci di questo prezziario verranno sostituite con quelle del file Excel, così codici e prezzi restano esattamente aggiornati.`))return;
          db.entries=db.entries.filter(e=>e.priceListId!==active).concat(imported);
          save();
          const done=document.getElementById('excelArea');
          if(done)done.innerHTML=`<div class="warn"><strong>Importazione completata.</strong> ${imported.length} voci caricate nel prezziario ${esc(pl?.name||'')}. Prima erano ${oldCount}. I prezzi visualizzati derivano dalla colonna PREZZO UNITARIO del file.</div>`;
          input.value='';
        };
      }catch(err){
        console.warn(err);
        const area=document.getElementById('excelArea');
        if(area)area.innerHTML=`<div class="warn">Errore importazione: ${esc(err.message||String(err))}</div>`;
        input.value='';
      }
    };
  }

  function init(){
    ensureUi();
    bindCreateAndManual();
    bindExcelImport();
    const originalRefresh=window.refresh;
    if(typeof originalRefresh==='function'&&!originalRefresh.__vgPriceBookWrapped){
      const wrapped=function(){originalRefresh.apply(this,arguments);renderPriceLists();};
      wrapped.__vgPriceBookWrapped=true;
      window.refresh=wrapped;
    }
    renderPriceLists();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
