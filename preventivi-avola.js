// Preventivi Avola - layout fisso e ricerca multi-prezzario
(function(){
  if(typeof db==='undefined'||typeof $!=='function') return;

  const SIDEBAR_IMG='assets/avola-preventivo-sidebar.png';
  const DEFAULT_PLACE='Castel Maggiore';
  const DEFAULT_INTRO='A seguito della Vostra richiesta, si formula la seguente offerta per l’esecuzione delle lavorazioni richieste.';
  let selectedPriceLists=new Set();

  const E=s=>typeof esc==='function'?esc(s):String(s??'');
  const todayIso=()=>new Date().toISOString().slice(0,10);
  const dateIt=iso=>{if(!iso)return new Date().toLocaleDateString('it-IT');const m=String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}/${m[2]}/${m[1]}`:String(iso)};
  const norm=s=>String(s??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
  const money=n=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:3}).format(Number(n||0));
  const qtyFmt=n=>new Intl.NumberFormat('it-IT',{maximumFractionDigits:3}).format(Number(n||0));

  function nextAvolaNumber(){
    const nums=(db.quotes||[]).map(q=>String(q.number||'').match(/(?:OFFERTA\s*)?(\d+)\s*-\s*AM/i)).filter(Boolean).map(m=>Number(m[1])).filter(Number.isFinite);
    return `${(nums.length?Math.max(...nums):0)+1}-AM`;
  }

  function enhanceForm(){
    const form=$('preventivo')?.querySelector('.panel.grid2');
    if(!form||$('qDate')) return;
    const number=$('qNumber');
    if(number){number.removeAttribute('readonly');number.placeholder='Es. 4-AM';number.closest('label')?.firstChild&&(number.closest('label').firstChild.textContent='Numero offerta (modificabile)');}

    const place=document.createElement('label');place.innerHTML='Luogo intestazione<input id="qPlace" value="'+DEFAULT_PLACE+'">';
    const date=document.createElement('label');date.innerHTML='<span>Data offerta</span><input id="qDate" type="date">';
    const clientPreview=document.createElement('div');clientPreview.id='qClientPreview';clientPreview.className='av-client-preview';clientPreview.style.gridColumn='1 / -1';
    const intro=document.createElement('label');intro.className='av-full';intro.innerHTML='<span>Testo sotto l’oggetto</span><textarea id="qIntro" rows="2">'+DEFAULT_INTRO+'</textarea>';
    form.append(place,date,clientPreview,intro);

    const ai=$('preventivo')?.querySelector('.panel.ai');
    if(ai){
      const block=document.createElement('div');block.className='av-price-lists-block';block.innerHTML='<div class="av-field-title">Prezzari da utilizzare</div><div id="qPriceLists" class="av-price-list-picker"></div><div class="muted av-price-hint">Se hai più prezzari puoi selezionarne uno o più di uno prima della ricerca.</div>';
      const firstLabel=ai.querySelector('label');ai.insertBefore(block,firstLabel||ai.firstChild);
    }

    if($('qVat')){$('qVat').value=0;const l=$('qVat').closest('label');if(l)l.style.display='none';}
    if($('qVatAmount')){const line=$('qVatAmount').closest('.sumline');if(line)line.style.display='none';}
    const grand=$('qTotal')?.closest('.grand')?.querySelector('span');if(grand)grand.textContent='TOTALE IVA ESCLUSA';

    $('qDate').value=todayIso();
    if(!$('qNumber').value||/^PREV-/i.test($('qNumber').value))$('qNumber').value=nextAvolaNumber();
    updateClientPreview();
    renderPriceListPicker(true);
  }

  function updateClientPreview(){
    const box=$('qClientPreview');if(!box)return;
    const c=(db.clients||[]).find(x=>x.id===$('qClient')?.value);
    box.innerHTML=c?`<div class="av-preview-label">Dati che compariranno sotto “Spett.le”</div><strong>${E(c.name||'')}</strong><div>${E([c.address,[c.cap,c.city,c.province].filter(Boolean).join(' ')].filter(Boolean).join(' · '))}</div>${c.vat?`<div>P.IVA / C.F.: ${E(c.vat)}</div>`:''}${c.email?`<div>${E(c.email)}</div>`:''}`:'<div class="muted">Seleziona un cliente: nel PDF verranno usati automaticamente i dati salvati in anagrafica.</div>';
  }

  function renderPriceListPicker(resetForClient=false){
    const box=$('qPriceLists');if(!box)return;
    const lists=db.priceLists||[];
    if(!lists.length){box.innerHTML='<span class="muted">Nessun prezzario disponibile.</span>';selectedPriceLists.clear();return;}
    if(resetForClient||![...selectedPriceLists].some(id=>lists.some(p=>p.id===id))){
      selectedPriceLists.clear();
      const c=(db.clients||[]).find(x=>x.id===$('qClient')?.value);
      if(c?.priceListId&&lists.some(p=>p.id===c.priceListId)) selectedPriceLists.add(c.priceListId);
      else lists.forEach(p=>selectedPriceLists.add(p.id));
    }
    if(lists.length===1) selectedPriceLists=new Set([lists[0].id]);
    box.innerHTML=lists.map(p=>`<label class="av-pl-chip"><input type="checkbox" data-av-pl="${E(p.id)}" ${selectedPriceLists.has(p.id)?'checked':''}><span>${E(p.name)}</span></label>`).join('');
    box.querySelectorAll('[data-av-pl]').forEach(cb=>cb.onchange=()=>{
      cb.checked?selectedPriceLists.add(cb.dataset.avPl):selectedPriceLists.delete(cb.dataset.avPl);
      if(!selectedPriceLists.size){cb.checked=true;selectedPriceLists.add(cb.dataset.avPl);alert('Seleziona almeno un prezzario.');}
    });
  }

  const synonyms={
    albero:['alberi','arbusto','arbusti','arboreo','pianta','piante'],
    taglio:['potatura','abbattimento','tagliare','motosega'],
    pulizia:['raccolta','rimozione','carico','sgombero'],
    smaltimento:['trasporto','conferimento','risulta'],
    legno:['staccionata','recinzione','tavola','tavole'],
    mezzo:['escavatore','autocarro','trattore','macchina'],
    operatore:['operaio','manodopera','agricolo','florovivaista']
  };
  function searchScore(query,entry){
    const q=norm(query),desc=norm([entry.code,entry.description,entry.unit].join(' '));
    if(!q)return 0;
    let s=0;if(desc.includes(q))s+=120;if(norm(entry.code)===q)s+=180;
    const words=q.split(' ').filter(w=>w.length>1);
    words.forEach(w=>{
      if(desc.includes(w))s+=35;
      else Object.entries(synonyms).forEach(([k,arr])=>{
        if(w===k||arr.includes(w)){if([k,...arr].some(x=>desc.includes(norm(x))))s+=20;}
      });
    });
    return s;
  }

  function runPriceSearch(){
    const text=$('jobText')?.value.trim();if(!text)return alert('Scrivi una parola o una frase da cercare nel prezziario.');
    const allowed=selectedPriceLists.size?selectedPriceLists:new Set((db.priceLists||[]).map(p=>p.id));
    const listNames=new Map((db.priceLists||[]).map(p=>[p.id,p.name]));
    const results=(db.entries||[]).filter(e=>allowed.has(e.priceListId)).map(e=>({...e,_score:searchScore(text,e)})).filter(e=>e._score>0).sort((a,b)=>b._score-a._score||String(a.code).localeCompare(String(b.code))).slice(0,24);
    const out=$('suggestions');
    if(!results.length){out.innerHTML='<div class="empty">Nessuna voce trovata nei prezzari selezionati. Prova con una parola più semplice.</div>';return;}
    out.innerHTML=results.map(e=>`<div class="av-price-result"><div><div class="av-code">${E(e.code||'')}</div><div class="av-pl-name">${E(listNames.get(e.priceListId)||'')}</div></div><div class="av-desc">${E(e.description||'')}</div><div class="av-unit">${E(e.unit||'')}</div><strong>${money(e.price)}</strong><button class="primary" data-av-addq="${E(e.id)}">AGGIUNGI</button></div>`).join('');
    out.querySelectorAll('[data-av-addq]').forEach(b=>b.onclick=()=>{
      const e=(db.entries||[]).find(x=>x.id===b.dataset.avAddq);if(!e)return;
      qrows.push({id:uid(),code:e.code||'',description:e.description||'',unit:e.unit||'cad',qty:1,price:Number(e.price||0),priceListId:e.priceListId||'',priceListName:listNames.get(e.priceListId)||''});
      renderQ();
    });
  }

  calcQ=function(){
    const base=qrows.reduce((s,r)=>s+Number(r.qty||0)*Number(r.price||0),0);
    const disc=base*Number($('qDiscount')?.value||0)/100;
    const sub=base-disc;
    if($('qSub'))$('qSub').textContent=money(sub);
    if($('qVatAmount'))$('qVatAmount').textContent=money(0);
    if($('qTotal'))$('qTotal').textContent=money(sub);
    return{sub,vat:0,total:sub};
  };

  collectQ=function(){
    const c=(db.clients||[]).find(x=>x.id===$('qClient')?.value),t=calcQ();
    const dateIso=$('qDate')?.value||todayIso();
    return{
      id:uid(),number:($('qNumber')?.value||nextAvolaNumber()).trim(),date:dateIt(dateIso),dateIso,
      place:($('qPlace')?.value||DEFAULT_PLACE).trim(),clientId:c?.id||'',clientName:c?.name||'',client:c?{...c}:{},
      subject:$('qSubject')?.value||'',site:$('qSite')?.value||'',intro:$('qIntro')?.value||DEFAULT_INTRO,
      validity:+($('qValidity')?.value||30),payment:$('qPayment')?.value||'',rows:qrows.map(x=>({...x})),
      priceListIds:[...selectedPriceLists],discount:+($('qDiscount')?.value||0),vatRate:0,subtotal:t.sub,vat:0,total:t.total,status:'Bozza',layout:'avola-v1'
    };
  };

  clearQuote=function(){
    if($('qNumber'))$('qNumber').value=nextAvolaNumber();
    if($('qDate'))$('qDate').value=todayIso();
    if($('qPlace'))$('qPlace').value=DEFAULT_PLACE;
    if($('qSubject'))$('qSubject').value='';
    if($('qSite'))$('qSite').value='';
    if($('qIntro'))$('qIntro').value=DEFAULT_INTRO;
    if($('jobText'))$('jobText').value='';
    if($('qDiscount'))$('qDiscount').value=0;
    if($('qVat'))$('qVat').value=0;
    if($('qValidity'))$('qValidity').value=30;
    if($('qPayment'))$('qPayment').value='';
    qrows=[];
    if($('suggestions'))$('suggestions').innerHTML='';
    renderPriceListPicker(true);updateClientPreview();renderQ();
  };

  function unitText(unit){return String(unit||'').trim()}
  function priceCell(row){const u=unitText(row.unit);return `${money(row.price)}${u?'/'+E(u):''}`}
  function qtyCell(row){const u=unitText(row.unit);return `${qtyFmt(row.qty)}${u?' '+E(u):''}`}
  function referenceText(q){
    const names=(q.priceListIds||[]).map(id=>(db.priceLists||[]).find(p=>p.id===id)?.name).filter(Boolean);
    if(names.length===1)return `Riferimento economico: voci e prezzi unitari del prezzario ${names[0]}.`;
    if(names.length>1)return `Riferimento economico: voci e prezzi unitari dei prezzari selezionati (${names.join(', ')}).`;
    return 'Riferimento economico: voci e prezzi unitari del prezzario riportati nella documentazione tecnica ricevuta.';
  }
  function clientBlock(c){
    const locality=[c?.cap,c?.city,c?.province].filter(Boolean).join(' '),lines=[c?.name,c?.address,locality,c?.vat?`P.IVA / C.F.: ${c.vat}`:'',c?.email,c?.pec?`PEC: ${c.pec}`:''].filter(Boolean);
    return `<strong>Spett.le</strong><br>${lines.map(E).join('<br>')}`;
  }
  function embeddedImage(base64,fallback){
    const value=String(base64||'').trim();
    return value?`data:image/webp;base64,${value}`:fallback;
  }
  function buildPrintMarkup(q){
    const d=q.date||dateIt(q.dateIso||todayIso());
    const total=Number(q.subtotal??q.total??0);
    return `<div class="avola-print-doc">
      <img class="avola-letterhead" src="${SIDEBAR_IMG}?v=20260904-letterhead-v6" alt="Foglio intestato Avola">
      <div class="avola-content">
        <div class="avola-header-grid"><div class="avola-place">${E(q.place||DEFAULT_PLACE)}, il ${E(d)}</div><div class="avola-client">${clientBlock(q.client||{})}</div></div>
        <div class="avola-offer-title">OFFERTA ${E(q.number||'')} del ${E(d)}</div>
        <div class="avola-object"><strong>OGGETTO:</strong> ${E(q.subject||'')}</div>
        <div class="avola-intro">${E(q.intro||DEFAULT_INTRO)}</div>
        <table class="avola-table"><thead><tr><th>Codice</th><th>Descrizione</th><th>Prezzo<br>unitario</th><th>Quantità</th><th>Importo</th></tr></thead><tbody>
          ${(q.rows||[]).map(r=>`<tr><td>${E(r.code||'')}</td><td>${E(r.description||'')}</td><td>${priceCell(r)}</td><td>${qtyCell(r)}</td><td><strong>${money(Number(r.qty||0)*Number(r.price||0))}</strong></td></tr>`).join('')}
        </tbody></table>
        <div class="avola-reference">${E(referenceText(q))}</div>
        <div class="avola-bottom"><div class="avola-total"><strong>TOTALE OFFERTA (IVA ESCLUSA)</strong><div>${money(total)}</div><em>(oneri della sicurezza inclusi)</em></div></div>
      </div>
    </div>`;
  }

  function printDocumentHtml(q){
    const base=E(new URL('.',location.href).href);
    return `<!doctype html><html><head><meta charset="utf-8"><base href="${base}"><title>Offerta ${E(q.number||'')}</title><style>
      @page{size:A4 portrait;margin:0}
      *{box-sizing:border-box}
      html,body{width:210mm;margin:0;padding:0;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .avola-print-doc{position:relative;width:210mm;min-height:297mm;background:#fff;font-size:10.2pt;line-height:1.18}
      .avola-letterhead{position:absolute;left:0;top:0;width:48.5mm;height:297mm;object-fit:fill;display:block;z-index:0}
      .avola-content{position:relative;z-index:1;margin-left:51mm;width:154mm;padding:25mm 4mm 16mm 0;min-height:297mm}
      .avola-header-grid{display:grid;grid-template-columns:minmax(0,1fr) 57mm;gap:8mm;align-items:start;min-height:28mm}
      .avola-place{padding-top:2mm;white-space:nowrap}.avola-client{font-size:9.6pt;line-height:1.2;overflow-wrap:anywhere}
      .avola-offer-title{font-weight:800;font-size:11pt;margin:0 0 12mm;clear:both}
      .avola-object{font-size:10.6pt;line-height:1.35;margin-bottom:3mm;overflow-wrap:anywhere}.avola-object strong{font-size:11pt}
      .avola-intro{font-size:9.7pt;line-height:1.25;margin-bottom:12mm;white-space:pre-wrap;overflow-wrap:anywhere}
      .avola-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8.2pt;margin:0}
      .avola-table thead{display:table-header-group}.avola-table tr{break-inside:avoid;page-break-inside:avoid}
      .avola-table th{background:#006b3c;color:#fff;border:.25mm solid #9ba39f;text-align:center;padding:2.1mm 1.4mm;font-weight:700;line-height:1.15}
      .avola-table td{border:.25mm solid #a6ada9;padding:2.2mm 1.5mm;vertical-align:middle;line-height:1.15;overflow-wrap:anywhere}
      .avola-table th:nth-child(1),.avola-table td:nth-child(1){width:13%}.avola-table th:nth-child(2),.avola-table td:nth-child(2){width:48%}.avola-table th:nth-child(3),.avola-table td:nth-child(3){width:15%;text-align:center}.avola-table th:nth-child(4),.avola-table td:nth-child(4){width:11%;text-align:center}.avola-table th:nth-child(5),.avola-table td:nth-child(5){width:13%;text-align:center}
      .avola-reference{font-size:7.8pt;font-style:italic;margin-top:2mm;line-height:1.2;break-inside:avoid;page-break-inside:avoid}
      .avola-bottom{display:block;margin-top:17mm;break-inside:avoid;page-break-inside:avoid;position:relative}
      .avola-total{font-size:12pt;line-height:1.2;min-width:0}.avola-total>div{font-weight:800;font-size:12.5pt;margin-top:1mm}.avola-total em{font-size:8.7pt;font-weight:400}
      @media screen{body{margin:0 auto}}
    </style></head><body>${buildPrintMarkup(q)}<script>window.addEventListener('load',()=>setTimeout(()=>{window.focus();window.print()},150))<\/script></body></html>`;
  }
  function printQuoteObject(q){
    const w=window.open('','_blank');
    if(!w)return alert('Consenti i popup per aprire la stampa.');
    w.document.open();w.document.write(printDocumentHtml(q));w.document.close();
  }
  printCurrent=function(){if(!qrows.length)return alert('Inserisci almeno una voce.');return downloadEditablePdf(collectQ())};

  function loadExcelJs(){
    if(window.ExcelJS)return Promise.resolve();
    if(window.__vgExcelJsPromise)return window.__vgExcelJsPromise;
    window.__vgExcelJsPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='vendor/exceljs.min.js?v='+encodeURIComponent(window.VG_BUILD||'local');s.onload=resolve;s.onerror=()=>reject(new Error('ExcelJS non disponibile'));document.head.appendChild(s)});
    return window.__vgExcelJsPromise;
  }
  async function imageData(path,fallbackBase64){
    try{const response=await fetch(path,{cache:'force-cache'});if(response.ok){const bytes=new Uint8Array(await response.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(binary)}}catch(_){}
    const fallback=String(fallbackBase64||'').trim();if(!fallback)throw new Error(`Immagine non disponibile: ${path}`);
    if(!fallback.startsWith('UklG'))return fallback;
    return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;canvas.getContext('2d').drawImage(img,0,0);resolve(canvas.toDataURL('image/png').split(',')[1])};img.onerror=reject;img.src='data:image/webp;base64,'+fallback});
  }
  function safeFileName(value){return String(value||'preventivo').replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,' ').trim()||'preventivo'}
  function loadPdfLib(){
    if(window.PDFLib)return Promise.resolve();
    if(window.__vgPdfLibPromise)return window.__vgPdfLibPromise;
    window.__vgPdfLibPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';s.onload=resolve;s.onerror=()=>reject(new Error('Modulo PDF compilabile non disponibile'));document.head.appendChild(s)});
    return window.__vgPdfLibPromise;
  }
  function pdfLines(text,font,size,maxWidth){
    const words=String(text||'').replace(/\s+/g,' ').trim().split(' ').filter(Boolean),lines=[];let line='';
    words.forEach(word=>{const test=line?line+' '+word:word;if(font.widthOfTextAtSize(test,size)<=maxWidth)line=test;else{if(line)lines.push(line);line=word}});if(line)lines.push(line);return lines.length?lines:[''];
  }
  async function downloadEditablePdf(q){
    try{
      await loadPdfLib();
      const {PDFDocument,StandardFonts,rgb}=window.PDFLib,pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold),form=pdf.getForm();
      const sidebarBytes=await fetch(`${SIDEBAR_IMG}?v=20260904-letterhead-v6`,{cache:'force-cache'}).then(r=>{if(!r.ok)throw new Error('Carta intestata non disponibile');return r.arrayBuffer()}),sidebar=await pdf.embedPng(sidebarBytes);
      const W=595.28,H=841.89,left=151,right=570,green=rgb(0,.42,.24),gray=rgb(.42,.45,.44),black=rgb(0,0,0);
      const addPage=()=>{const page=pdf.addPage([W,H]);page.drawImage(sidebar,{x:0,y:0,width:137,height:H});return page};
      let page=addPage(),pageNo=1,y=767;
      const text=(value,x,yy,size=9,usedFont=font,color=black)=>page.drawText(String(value??''),{x,y:yy,size,font:usedFont,color});
      const field=(name,value,x,yy,width,height=16,size=9)=>{const f=form.createTextField(`${name}_${pageNo}`);f.setText(String(value??''));if(height>20)f.enableMultiline();f.addToPage(page,{x,y:yy,width,height,borderWidth:0,textColor:black,backgroundColor:rgb(1,1,1),font});f.setFontSize(size);return f};
      const header=()=>{
        field('luogo',q.place||DEFAULT_PLACE,left,y,110);text(', il',263,y+3,9);field('data_offerta',q.date||dateIt(q.dateIso),282,y,78);text('Spett.le',410,y+4,8,bold);
        field('cliente',q.client?.name||q.clientName||'',410,y-15,160);field('indirizzo_cliente',q.client?.address||'',410,y-31,160);field('localita_cliente',[q.client?.cap,q.client?.city,q.client?.province].filter(Boolean).join(' '),410,y-47,160);
        y-=73;text('OFFERTA',left,y+4,10,bold);field('numero_offerta',q.number||'',202,y,100,18,10);text('del',308,y+4,10,bold);field('data_offerta_titolo',q.date||dateIt(q.dateIso),330,y,82,18,10);y-=35;
        text('OGGETTO:',left,y+4,10,bold);field('oggetto',q.subject||'',213,y-2,357,22,10);y-=35;
        field('introduzione',q.intro||DEFAULT_INTRO,left,y-18,419,36,9);y-=61;
      };
      const tableHeader=()=>{const widths=[55,202,62,48,63],heads=['Codice','Descrizione','Prezzo unit.','Quantità','Importo'];let x=left;heads.forEach((h,i)=>{page.drawRectangle({x,y:y-21,width:widths[i],height:24,color:green});text(h,x+4,y-13,7,bold,rgb(1,1,1));x+=widths[i]});y-=24};
      const newPage=()=>{page=addPage();pageNo++;y=790;text(`OFFERTA ${q.number||''} del ${q.date||dateIt(q.dateIso)}`,left,y,8,bold,gray);y-=23;tableHeader()};
      header();tableHeader();
      (q.rows||[]).forEach((row,index)=>{const desc=pdfLines(row.description,font,8,194),height=Math.max(25,desc.length*10+9);if(y-height<105)newPage();let x=left;const widths=[55,202,62,48,63];widths.forEach(w=>{page.drawRectangle({x,y:y-height,width:w,height,borderColor:rgb(.68,.7,.69),borderWidth:.5});x+=w});field(`codice_riga_${index+1}`,row.code||'',left+3,y-height+5,49,height-8,7);field(`descrizione_riga_${index+1}`,row.description||'',left+58,y-height+4,196,height-7,7);field(`prezzo_riga_${index+1}`,Number(row.price||0).toFixed(3),left+260,y-height+5,56,height-8,7);field(`quantita_riga_${index+1}`,row.qty||'',left+323,y-height+5,42,height-8,7);field(`importo_riga_${index+1}`,(Number(row.qty||0)*Number(row.price||0)).toFixed(2),left+371,y-height+5,57,height-8,7);y-=height});
      if(y<155)newPage();y-=18;text(referenceText(q),left,y,7,font,gray);y-=37;text('Sconto %',390,y+3,8);field('sconto_percentuale',q.discount||0,510,y,60);y-=24;text('TOTALE OFFERTA (IVA ESCLUSA)',350,y+3,9,bold);field('totale_offerta',Number(q.subtotal??q.total??0).toFixed(2),500,y,70,18,9);y-=32;text('Pagamento',left,y+3,8,bold);field('pagamento',q.payment||'',215,y,355,18,8);y-=25;text('Cantiere',left,y+3,8,bold);field('cantiere',q.site||'',215,y,355,18,8);
      form.updateFieldAppearances(font);const bytes=await pdf.save(),blob=new Blob([bytes],{type:'application/pdf'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`Offerta-${safeFileName(q.number)}-${safeFileName(q.clientName||q.client?.name)}-compilabile.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    }catch(err){console.error(err);alert('Non riesco a creare il PDF compilabile. Ricarica la pagina e riprova.')}
  }
  function excelRowHeight(text,charsPerLine=42,min=18,lineHeight=14){
    const lines=String(text||'').split(/\r?\n/).reduce((sum,line)=>sum+Math.max(1,Math.ceil(line.length/charsPerLine)),0);
    return Math.max(min,Math.min(120,lines*lineHeight+8));
  }
  async function exportQuoteXlsx(q){
    await loadExcelJs();
    const wb=new ExcelJS.Workbook();wb.creator='Varga Gestionale';wb.created=new Date();wb.calcProperties.fullCalcOnLoad=true;
    const ws=wb.addWorksheet('Preventivo');
    ws.pageSetup={paperSize:9,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0,horizontalCentered:false,verticalCentered:false,margins:{left:0.1,right:0.1,top:0.1,bottom:0.1,header:0,footer:0}};
    ws.views=[{showGridLines:false}];ws.properties.defaultRowHeight=18;ws.columns=[{width:12},{width:34},{width:9},{width:10},{width:13},{width:14}];
    const d=q.date||dateIt(q.dateIso||todayIso()),client=q.client||{};
    ws.mergeCells('A2:C2');ws.getCell('A2').value=`${q.place||DEFAULT_PLACE}, il ${d}`;ws.getCell('A2').font={size:11};
    ws.mergeCells('D2:E2');ws.getCell('D2').value='Spett.le';ws.getCell('D2').font={bold:true,size:10};
    [['D3',client.name||q.clientName||''],['D4',client.address||''],['D5',[client.cap,client.city,client.province].filter(Boolean).join(' ')],['D6',client.vat?`P.IVA / C.F.: ${client.vat}`:'']].forEach(([cell,value])=>{ws.mergeCells(`${cell}:E${cell.slice(1)}`);ws.getCell(cell).value=value});
    ws.mergeCells('A7:F7');ws.getCell('A7').value=`OFFERTA ${q.number||''} del ${d}`;ws.getCell('A7').font={bold:true,size:13};
    ws.mergeCells('A9:F9');ws.getCell('A9').value=`OGGETTO: ${q.subject||''}`;ws.getCell('A9').font={bold:true,size:12};ws.getCell('A9').alignment={wrapText:true,vertical:'top'};ws.getRow(9).height=excelRowHeight(`OGGETTO: ${q.subject||''}`,75,22,15);
    ws.mergeCells('A11:F12');ws.getCell('A11').value=q.intro||DEFAULT_INTRO;ws.getCell('A11').font={size:11};ws.getCell('A11').alignment={wrapText:true,vertical:'top'};ws.getRow(11).height=excelRowHeight(q.intro||DEFAULT_INTRO,78,24,14);ws.getRow(12).height=8;
    const headerRow=14,headers=['Codice','Descrizione','U.M.','Quantità','Prezzo unitario','Importo'];
    headers.forEach((h,i)=>{const c=ws.getCell(headerRow,i+1);c.value=h;c.font={bold:true,size:11,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF006B3C'}};c.alignment={horizontal:'center',vertical:'middle',wrapText:true};c.border={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}}});ws.getRow(headerRow).height=34;
    const firstData=headerRow+1;
    (q.rows||[]).forEach((r,index)=>{const row=firstData+index;ws.getCell(row,1).value=r.code||'';ws.getCell(row,2).value=r.description||'';ws.getCell(row,3).value=r.unit||'';ws.getCell(row,4).value=Number(r.qty||0);ws.getCell(row,5).value=Number(r.price||0);ws.getCell(row,6).value={formula:`D${row}*E${row}`,result:Number(r.qty||0)*Number(r.price||0)};for(let col=1;col<=6;col++){const c=ws.getCell(row,col);c.font={size:11};c.alignment={vertical:'top',wrapText:true};c.border={top:{style:'thin',color:{argb:'FFAAAAAA'}},left:{style:'thin',color:{argb:'FFAAAAAA'}},bottom:{style:'thin',color:{argb:'FFAAAAAA'}},right:{style:'thin',color:{argb:'FFAAAAAA'}}}}ws.getRow(row).height=excelRowHeight(r.description||'',38,32,14)});
    const lastData=Math.max(firstData,firstData+(q.rows||[]).length-1),referenceRow=lastData+2;
    ws.mergeCells(`A${referenceRow}:F${referenceRow}`);ws.getCell(referenceRow,1).value=referenceText(q);ws.getCell(referenceRow,1).font={italic:true,size:9};ws.getCell(referenceRow,1).alignment={wrapText:true};
    const discountRow=referenceRow+2,totalRow=referenceRow+3;ws.mergeCells(`D${discountRow}:E${discountRow}`);ws.getCell(`D${discountRow}`).value='Sconto %';ws.getCell(`F${discountRow}`).value=Number(q.discount||0);ws.getCell(`F${discountRow}`).numFmt='0.00';
    ws.mergeCells(`D${totalRow}:E${totalRow}`);ws.getCell(`D${totalRow}`).value='TOTALE OFFERTA (IVA ESCLUSA)';ws.getCell(`D${totalRow}`).font={bold:true,size:11};ws.getCell(`F${totalRow}`).value={formula:`SUM(F${firstData}:F${lastData})*(1-F${discountRow}/100)`,result:Number(q.subtotal??q.total??0)};ws.getCell(`F${totalRow}`).font={bold:true,size:12};
    ws.getColumn(4).numFmt='#,##0.###';ws.getColumn(5).numFmt='€ #,##0.000';ws.getColumn(6).numFmt='€ #,##0.00';
    ws.pageSetup.printArea=`A1:F${Math.max(44,totalRow+2)}`;
    const buffer=await wb.xlsx.writeBuffer(),blob=new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`Offerta-${safeFileName(q.number)}-${safeFileName(q.clientName||client.name)}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }
  async function downloadXlsx(q){try{await exportQuoteXlsx(q)}catch(err){console.error(err);alert('Non riesco a creare il file Excel. Controlla la connessione e riprova.')}}
  function addCurrentExcelButton(){
    const pdf=$('printQuote');if(!pdf||$('excelQuote'))return;const b=document.createElement('button');b.id='excelQuote';b.className='ghost';b.textContent='SCARICA EXCEL';b.onclick=()=>{if(!qrows.length)return alert('Inserisci almeno una voce.');downloadXlsx(collectQ())};pdf.parentElement.insertBefore(b,pdf);
  }

  function addSavedQuotePdfButtons(){
    const list=$('quotesList');if(!list)return;
    list.querySelectorAll('[data-del-quote]').forEach(del=>{
      const box=del.parentElement,id=del.dataset.delQuote;if(!box||box.querySelector(`[data-av-pdf="${CSS.escape(id)}"]`))return;
      const b=document.createElement('button');b.className='mini';b.dataset.avPdf=id;b.textContent='PDF COMPILABILE';b.onclick=()=>{const q=(db.quotes||[]).find(x=>x.id===id);if(q)downloadEditablePdf(q)};box.insertBefore(b,box.firstChild);
      const x=document.createElement('button');x.className='mini';x.dataset.avXlsx=id;x.textContent='EXCEL';x.onclick=()=>{const q=(db.quotes||[]).find(v=>v.id===id);if(q)downloadXlsx(q)};box.insertBefore(x,b);
    });
  }

  function installStyles(){
    if(document.getElementById('avolaQuoteStyles'))return;
    const st=document.createElement('style');st.id='avolaQuoteStyles';st.textContent=`
      .av-full{grid-column:1 / -1}.av-client-preview{background:#f6faf8;border:1px solid #dce8e2;border-radius:10px;padding:11px;font-size:12px;line-height:1.45}.av-preview-label,.av-field-title{font-size:12px;font-weight:900;color:#46554d;margin-bottom:7px}.av-price-lists-block{margin-bottom:14px}.av-price-list-picker{display:flex;gap:8px;flex-wrap:wrap}.av-pl-chip{display:inline-flex;flex-direction:row;align-items:center;gap:7px;border:1px solid #bcd5c8;border-radius:999px;padding:7px 11px;background:#fff;color:#225d43;cursor:pointer}.av-pl-chip input{width:auto;margin:0}.av-price-hint{font-size:11px;margin-top:6px}.av-price-result{display:grid;grid-template-columns:140px minmax(260px,1fr) 70px 110px auto;gap:10px;align-items:center;border:1px solid #dbe6df;border-radius:11px;padding:10px;background:#fff}.av-code{font-weight:900}.av-pl-name{font-size:10px;color:#6d7c74;margin-top:3px}.av-desc{line-height:1.3}.av-unit{font-size:12px;color:#66746b}
      @media(max-width:1050px){.av-price-result{grid-template-columns:1fr}.av-price-result button{width:max-content}}
      @media print{
        @page{size:A4 portrait;margin:0}
        html,body{width:210mm!important;margin:0!important;padding:0!important;background:#fff!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
        #preventivo{display:block!important}
        .quote-print{display:block!important;width:210mm!important;margin:0!important;padding:0!important}
        .avola-print-doc{position:relative;width:210mm;min-height:297mm;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;font-size:10.2pt;line-height:1.18;overflow:hidden}
        .avola-letterhead{position:absolute;left:0;top:0;width:48.5mm;height:297mm;object-fit:fill;display:block;z-index:0}
        .avola-content{position:relative;z-index:1;margin-left:51mm;width:154mm;padding-top:25mm;padding-right:4mm;min-height:297mm}
        .avola-header-grid{display:grid;grid-template-columns:1fr 57mm;gap:8mm;align-items:start;min-height:28mm}
        .avola-place{padding-top:2mm;white-space:nowrap}.avola-client{font-size:9.6pt;line-height:1.2}
        .avola-offer-title{font-weight:800;font-size:11pt;margin:0 0 12mm}
        .avola-object{font-size:10.6pt;line-height:1.35;margin-bottom:3mm}.avola-object strong{font-size:11pt}
        .avola-intro{font-size:9.7pt;line-height:1.25;margin-bottom:12mm;white-space:pre-wrap}
        .avola-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8.2pt;margin-top:0}
        .avola-table th{background:#006b3c!important;color:#fff!important;border:0.25mm solid #9ba39f;text-align:center;padding:2.1mm 1.4mm;font-weight:700}
        .avola-table td{border:0.25mm solid #a6ada9;padding:2.2mm 1.5mm;vertical-align:middle;line-height:1.15}
        .avola-table th:nth-child(1),.avola-table td:nth-child(1){width:13%}.avola-table th:nth-child(2),.avola-table td:nth-child(2){width:48%}.avola-table th:nth-child(3),.avola-table td:nth-child(3){width:15%;text-align:center}.avola-table th:nth-child(4),.avola-table td:nth-child(4){width:11%;text-align:center}.avola-table th:nth-child(5),.avola-table td:nth-child(5){width:13%;text-align:center}
        .avola-reference{font-size:7.8pt;font-style:italic;margin-top:2mm;line-height:1.2}
        .avola-bottom{display:block;margin-top:17mm;break-inside:avoid}
        .avola-total{font-size:12pt;line-height:1.2}.avola-total>div{font-weight:800;font-size:12.5pt;margin-top:1mm}.avola-total em{font-size:8.7pt;font-weight:400}
      }`;
    document.head.appendChild(st);
  }

  function install(){
    installStyles();enhanceForm();addCurrentExcelButton();
    if($('smartSearch'))$('smartSearch').onclick=runPriceSearch;
    if($('newQuote'))$('newQuote').onclick=clearQuote;
    if($('printQuote')){$('printQuote').textContent='SCARICA PDF COMPILABILE';$('printQuote').onclick=printCurrent;}
    if($('qClient'))$('qClient').onchange=()=>{updateClientPreview();renderPriceListPicker(true)};
    if($('qDiscount'))$('qDiscount').oninput=calcQ;
    const oldRefresh=typeof refresh==='function'?refresh:null;
    if(oldRefresh&&!oldRefresh.__avolaPreventivi){
      refresh=function(){const r=oldRefresh();enhanceForm();addCurrentExcelButton();renderPriceListPicker(false);updateClientPreview();addSavedQuotePdfButtons();return r};
      refresh.__avolaPreventivi=true;
    }
    addSavedQuotePdfButtons();calcQ();
  }

  install();
})();
