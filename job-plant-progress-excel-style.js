/* Esportazione Excel leggibile e colorata per "Situazione impianti". */
(function(root){
'use strict';
const A=value=>Array.isArray(value)?value:[];
const api=()=>root.VargaPlantProgressSummary||{};

function ensureStyledXlsx(){
  if(root.__vgPlantStyledXlsxPromise)return root.__vgPlantStyledXlsxPromise;
  root.__vgPlantStyledXlsxPromise=new Promise((resolve,reject)=>{
    if(typeof document==='undefined')return reject(new Error('Esportazione Excel disponibile solo nel browser'));
    const script=document.createElement('script');
    script.src='https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js';
    script.onload=()=>{root.__vgPlantStyledXlsxLoaded=true;resolve(root.XLSX)};
    script.onerror=()=>reject(new Error('Componente Excel con stile non disponibile'));
    document.head.appendChild(script);
  });
  return root.__vgPlantStyledXlsxPromise;
}

const border={
  top:{style:'thin',color:{rgb:'D1D5DB'}},
  bottom:{style:'thin',color:{rgb:'D1D5DB'}},
  left:{style:'thin',color:{rgb:'D1D5DB'}},
  right:{style:'thin',color:{rgb:'D1D5DB'}}
};
const alignCenter={horizontal:'center',vertical:'center'};
const alignLeft={horizontal:'left',vertical:'center'};
const font=(color='1F2937',bold=false,sz=11)=>({name:'Aptos',color:{rgb:color},bold,sz});
const fill=rgb=>({fgColor:{rgb},patternType:'solid'});
function styleCell(sheet,address,style){if(sheet[address])sheet[address].s=style}
function styleRange(sheet,r1,r2,c1,c2,styleFactory){
  for(let r=r1;r<=r2;r++)for(let c=c1;c<=c2;c++){
    const address=root.XLSX.utils.encode_cell({r:r-1,c:c-1});
    if(sheet[address])sheet[address].s=typeof styleFactory==='function'?styleFactory(r,c):styleFactory;
  }
}
function progressStyle(progress){
  if(progress>=0.75)return{fill:fill('DCFCE7'),font:font('166534',true,11),alignment:alignCenter,border};
  if(progress>=0.40)return{fill:fill('FEF3C7'),font:font('92400E',true,11),alignment:alignCenter,border};
  return{fill:fill('FEE2E2'),font:font('991B1B',true,11),alignment:alignCenter,border};
}
function todoStyle(todo,total){
  const ratio=total?todo/total:0;
  if(ratio<=0.25)return{fill:fill('DCFCE7'),font:font('166534',false,11),alignment:alignCenter,border};
  if(ratio<=0.70)return{fill:fill('FEF3C7'),font:font('92400E',false,11),alignment:alignCenter,border};
  return{fill:fill('FECACA'),font:font('991B1B',false,11),alignment:alignCenter,border};
}

async function exportStyled(rows){
  const XLSX=await ensureStyledXlsx();
  if(!XLSX)throw new Error('Libreria Excel non caricata');
  rows=A(rows).length?rows:A(api().summaries?.());
  const totals=rows.reduce((sum,row)=>({total:sum.total+(+row.total||0),done:sum.done+(+row.done||0),todo:sum.todo+(+row.todo||0)}),{total:0,done:0,todo:0});
  const progress=totals.total?totals.done/totals.total:0;
  const data=[
    ['SITUAZIONE IMPIANTI','','','','','',''],
    ['Riepilogo contabilità impianti DEPURAZIONE e INRETE','','','','','',''],
    ['','','','','','',''],
    ['IMPIANTI TOTALI','','FATTI','','DA FARE','','AVANZAMENTO'],
    [totals.total,'',totals.done,'',totals.todo,'',progress],
    ['','','','','','',''],
    ['Area','Commessa','Codice','Impianti fatti','Impianti da fare','Totale impianti','Avanzamento %'],
    ...rows.map(row=>[row.family,row.title,row.code||'',row.done,row.todo,row.total,(+row.progress||0)/100])
  ];
  const sheet=XLSX.utils.aoa_to_sheet(data);
  sheet['!merges']=[
    {s:{r:0,c:0},e:{r:0,c:6}},
    {s:{r:1,c:0},e:{r:1,c:6}},
    {s:{r:3,c:0},e:{r:3,c:1}},{s:{r:4,c:0},e:{r:4,c:1}},
    {s:{r:3,c:2},e:{r:3,c:3}},{s:{r:4,c:2},e:{r:4,c:3}},
    {s:{r:3,c:4},e:{r:3,c:5}},{s:{r:4,c:4},e:{r:4,c:5}}
  ];
  sheet['!cols']=[{wch:18},{wch:34},{wch:22},{wch:15},{wch:18},{wch:16},{wch:18}];
  sheet['!rows']=[{hpt:28},{hpt:20},{hpt:8},{hpt:20},{hpt:28},{hpt:8},{hpt:25},...rows.map(()=>({hpt:22}))];
  sheet['!freeze']={xSplit:0,ySplit:7,topLeftCell:'A8',activePane:'bottomLeft',state:'frozen'};

  styleRange(sheet,1,1,1,7,{fill:fill('14532D'),font:font('FFFFFF',true,18),alignment:alignLeft});
  styleRange(sheet,2,2,1,7,{fill:fill('E8F3EC'),font:font('4B5563',false,10),alignment:alignLeft});

  const kpis=[
    {label:'A4',value:'A5',range:[4,5,1,2],bg:'E8F3EC',fg:'14532D'},
    {label:'C4',value:'C5',range:[4,5,3,4],bg:'DCFCE7',fg:'166534'},
    {label:'E4',value:'E5',range:[4,5,5,6],bg:'FEF3C7',fg:'92400E'},
    {label:'G4',value:'G5',range:[4,5,7,7],bg:'DBEAFE',fg:'1D4ED8'}
  ];
  kpis.forEach(k=>{
    styleRange(sheet,k.range[0],k.range[1],k.range[2],k.range[3],{fill:fill(k.bg),font:font(k.fg,false,11),alignment:alignCenter,border});
    styleCell(sheet,k.label,{fill:fill(k.bg),font:font(k.fg,true,9),alignment:alignCenter,border});
    styleCell(sheet,k.value,{fill:fill(k.bg),font:font(k.fg,true,18),alignment:alignCenter,border});
  });
  if(sheet.G5)sheet.G5.z='0%';

  styleRange(sheet,7,7,1,7,{fill:fill('176B48'),font:font('FFFFFF',true,10),alignment:alignCenter,border});
  rows.forEach((row,index)=>{
    const r=8+index,baseFill=index%2===0?'F8FAF9':'FFFFFF';
    styleRange(sheet,r,r,1,7,(rr,cc)=>({fill:fill(baseFill),font:font(cc===1?'14532D':'1F2937',cc===1||cc===2,11),alignment:cc<=3?alignLeft:alignCenter,border}));
    styleCell(sheet,`E${r}`,todoStyle(+row.todo||0,+row.total||0));
    styleCell(sheet,`G${r}`,progressStyle((+row.progress||0)/100));
    if(sheet[`G${r}`])sheet[`G${r}`].z='0%';
  });

  const workbook=XLSX.utils.book_new();
  workbook.Props={Title:'Situazione impianti',Subject:'Riepilogo DEPURAZIONE e INRETE',Author:'Varga Gestionale'};
  XLSX.utils.book_append_sheet(workbook,sheet,'Situazione impianti');
  const date=new Date().toISOString().slice(0,10);
  XLSX.writeFile(workbook,`Situazione-impianti-${date}.xlsx`,{compression:true,cellStyles:true});
}

function patchExportButton(){
  const button=document.querySelector('#vgPlantProgressModal [data-plant-summary-export]');
  if(!button||button.dataset.vgStyledExport==='1')return;
  button.dataset.vgStyledExport='1';
  button.onclick=async()=>{
    const oldText=button.textContent;
    button.disabled=true;button.textContent='CREAZIONE EXCEL...';
    try{await exportStyled(api().summaries?.())}
    catch(error){console.error(error);root.alert?.('Impossibile creare il file Excel formattato. Controlla la connessione e riprova.')}
    finally{button.disabled=false;button.textContent=oldText}
  };
}

if(typeof document!=='undefined'){
  const observer=new MutationObserver(()=>{clearTimeout(observer._vgTimer);observer._vgTimer=setTimeout(patchExportButton,20)});
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',patchExportButton);else patchExportButton();
}
root.VargaPlantProgressStyledExport={exportStyled,patchExportButton};
})(globalThis);
