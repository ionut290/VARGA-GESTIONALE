/* Esportazione contabilità INRETE dal modello Excel ufficiale.
   Il file OOXML viene aggiornato direttamente per conservare fogli, Pivot, formule e formattazione. */
(function(){
'use strict';
const TEMPLATE='assets/contabilita-inrete-template.xlsx';
const txt=v=>String(v??'').trim();
const norm=v=>txt(v).toLocaleLowerCase('it-IT').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const num=v=>{if(v==null||v==='')return 0;if(typeof v==='number')return Number.isFinite(v)?v:0;let s=txt(v).replace(/\s/g,'').replace(/€/g,'');const c=s.lastIndexOf(','),d=s.lastIndexOf('.');if(c>=0&&d>=0)s=c>d?s.replace(/\./g,'').replace(',','.'):s.replace(/,/g,'');else if(c>=0)s=s.replace(/\./g,'').replace(',','.');const n=Number(s);return Number.isFinite(n)?n:0};
const isInrete=job=>/\bin\s*rete\b|\binrete\b/.test(norm([job?.title,job?.code].join(' ')));
const escXml=v=>txt(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const parse=s=>new DOMParser().parseFromString(s,'application/xml');
const serialize=d=>new XMLSerializer().serializeToString(d);
const direct=(node,tag)=>[...node.children].find(x=>x.localName===tag)||null;
const cell=(row,col)=>[...row.children].find(x=>x.localName==='c'&&x.getAttribute('r')===col+row.getAttribute('r'))||null;
const setRef=(node,col,row)=>node.setAttribute('r',col+row);
const excelDate=v=>{const s=txt(v);if(!s)return null;const m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);const d=m?new Date(Date.UTC(+m[1],+m[2]-1,+m[3])):new Date(s);return isNaN(d)?null:d.getTime()/86400000+25569};
const excelTime=v=>{const m=txt(v).match(/(\d{1,2}):(\d{2})/);return m?(+m[1]*60 + +m[2])/1440:null};

function clearValue(c){[...c.children].forEach(x=>{if(['v','f','is'].includes(x.localName))x.remove()});c.removeAttribute('t')}
function put(c,value,type='text',formula=''){
  clearValue(c);
  if(formula){const f=c.ownerDocument.createElementNS(c.namespaceURI,'f');f.textContent=formula;c.appendChild(f)}
  if(value==null||value==='')return;
  if(type==='number'){
    const v=c.ownerDocument.createElementNS(c.namespaceURI,'v');v.textContent=String(num(value));c.appendChild(v);return;
  }
  c.setAttribute('t','inlineStr');const is=c.ownerDocument.createElementNS(c.namespaceURI,'is'),t=c.ownerDocument.createElementNS(c.namespaceURI,'t');t.setAttribute('xml:space','preserve');t.textContent=txt(value);is.appendChild(t);c.appendChild(is);
}
function cloneRow(template,rowNumber){
  const r=template.cloneNode(true);r.setAttribute('r',rowNumber);r.setAttribute('spans','1:21');[...r.children].filter(x=>x.localName==='c').forEach(c=>{const col=(c.getAttribute('r')||'A').replace(/\d+/g,'');setRef(c,col,rowNumber);clearValue(c)});return r;
}
function ensureCell(row,col,styleSource){
  let c=cell(row,col);if(c)return c;c=styleSource?.cloneNode(true)||row.ownerDocument.createElementNS(row.namespaceURI,'c');setRef(c,col,row.getAttribute('r'));clearValue(c);row.appendChild(c);return c;
}
function mainSheet(xml,rows,job,form){
  const d=parse(xml),sheetData=d.getElementsByTagNameNS('*','sheetData')[0],all=[...sheetData.children].filter(x=>x.localName==='row'),template=all.find(x=>x.getAttribute('r')==='4'),totalTemplate=all.find(x=>x.getAttribute('r')==='48')||template;
  all.filter(x=>+x.getAttribute('r')>=4).forEach(x=>x.remove());
  const cdcDefault=rows.find(r=>txt(r.cdc))?.cdc||'';
  rows.forEach((data,i)=>{
    const n=i+4,r=cloneRow(template,n),values={A:data.note,B:i+1,C:data.distretto,D:data.idSap,E:data.impianto,F:data.comune,G:data.indirizzo,H:data.voce,I:data.quantita,J:data.frequenza,K:data.lavorazione,L:data.gpsY,M:data.gpsX,N:data.um,O:data.prezzoBase,P:data.prezzoRibassato,Q:data.totale,R:data.cdc||cdcDefault,S:i+1,T:excelDate(data.data),U:excelTime(data.ora)};
    for(const [col,value] of Object.entries(values))put(ensureCell(r,col,cell(template,col)),value,['B','I','J','L','M','O','P','Q','R','S','T','U'].includes(col)?'number':'text');
    put(cell(r,'N'),data.um,'text',`VLOOKUP($H${n},'Elenco prezzi'!$C:$F,2,FALSE)`);
    put(cell(r,'O'),data.prezzoBase,'number',`VLOOKUP($H${n},'Elenco prezzi'!$C:$F,3,FALSE)`);
    put(cell(r,'P'),data.prezzoRibassato,'number',`VLOOKUP($H${n},'Elenco prezzi'!$C:$F,4,FALSE)`);
    put(cell(r,'Q'),data.totale,'number',`IF(N${n}='Elenco prezzi'!$D$3,P${n},I${n}*P${n})`);
    sheetData.appendChild(r);
  });
  const totalRow=cloneRow(totalTemplate,rows.length+4);put(cell(totalRow,'P'),'Totale');put(cell(totalRow,'Q'),rows.reduce((s,x)=>s+num(x.totale),0),'number',`SUM(Q4:Q${Math.max(4,rows.length+3)})`);sheetData.appendChild(totalRow);
  const end=rows.length+4,dim=d.getElementsByTagNameNS('*','dimension')[0];if(dim)dim.setAttribute('ref',`A1:U${end}`);
  const firstRows=[...sheetData.children].filter(x=>x.localName==='row');
  const setHead=(row,col,value)=>{const r=firstRows.find(x=>x.getAttribute('r')===String(row));if(r&&value)put(ensureCell(r,col,cell(r,col)),value)};
  setHead(1,'A',`Contratto n. ${form.contractCode||job.code||''}`);setHead(2,'C',form.subject||job.title||'');
  return serialize(d);
}
function pivotSummary(rows){
  const map=new Map();rows.forEach(r=>{const k=txt(r.voce)||'SENZA CODICE',p=num(r.prezzoRibassato)||num(r.prezzoBase);const x=map.get(k)||{code:k,count:0,units:0,priceSum:0,total:0};x.count++;x.units+=num(r.quantita);x.priceSum+=p;x.total+=num(r.totale);map.set(k,x)});return [...map.values()].sort((a,b)=>b.total-a.total).map(x=>({...x,price:x.count?x.priceSum/x.count:0}))
}
function pivotSheet(xml,rows){
  const d=parse(xml),sd=d.getElementsByTagNameNS('*','sheetData')[0],old=[...sd.children].filter(x=>x.localName==='row'),detail=old.find(x=>x.getAttribute('r')==='4'),grand=old.find(x=>x.getAttribute('r')==='9')||detail,groups=pivotSummary(rows);old.filter(x=>+x.getAttribute('r')>=4).forEach(x=>x.remove());
  groups.forEach((g,i)=>{const n=i+4,r=cloneRow(detail,n);put(cell(r,'A'),g.code);put(cell(r,'B'),g.count,'number');put(cell(r,'C'),g.units,'number');put(cell(r,'D'),g.price,'number');put(cell(r,'E'),g.total,'number');sd.appendChild(r)});
  const n=groups.length+4,r=cloneRow(grand,n),totalCount=rows.length,totalUnits=rows.reduce((s,x)=>s+num(x.quantita),0),avg=totalCount?rows.reduce((s,x)=>s+(num(x.prezzoRibassato)||num(x.prezzoBase)),0)/totalCount:0,total=rows.reduce((s,x)=>s+num(x.totale),0);put(cell(r,'A'),'Grand Total');put(cell(r,'B'),totalCount,'number');put(cell(r,'C'),totalUnits,'number');put(cell(r,'D'),avg,'number');put(cell(r,'E'),total,'number');sd.appendChild(r);
  const dim=d.getElementsByTagNameNS('*','dimension')[0];if(dim)dim.setAttribute('ref',`A3:E${n+2}`);return{xml:serialize(d),end:n}
}
function refreshPivot(xml,lastRow,pivotEnd){const d=parse(xml),root=d.documentElement;root.setAttribute('refreshOnLoad','1');root.setAttribute('enableRefresh','1');root.setAttribute('recordCount','0');const source=d.getElementsByTagNameNS('*','worksheetSource')[0];if(source)source.setAttribute('ref',`A3:R${lastRow}`);return serialize(d)}
function pivotTable(xml,end){const d=parse(xml),loc=d.getElementsByTagNameNS('*','location')[0];if(loc)loc.setAttribute('ref',`A3:E${end}`);return serialize(d)}
async function ensureZip(){if(window.JSZip)return;if(window.__vgJsZipPromise)return window.__vgJsZipPromise;window.__vgJsZipPromise=new Promise((ok,no)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';s.onload=ok;s.onerror=()=>no(new Error('Componente Excel non disponibile'));document.head.appendChild(s)});return window.__vgJsZipPromise}
async function generate(job,rows,form){
  if(!isInrete(job))return false;await ensureZip();const response=await fetch(`${TEMPLATE}?v=${encodeURIComponent(window.VG_BUILD||'1')}`);if(!response.ok)throw new Error('Modello contabilità INRETE non disponibile');const zip=await JSZip.loadAsync(await response.arrayBuffer());
  const read=p=>zip.file(p).async('string');const [main,pivot,cache,pivotDef]=await Promise.all([read('xl/worksheets/sheet1.xml'),read('xl/worksheets/sheet3.xml'),read('xl/pivotCache/pivotCacheDefinition1.xml'),read('xl/pivotTables/pivotTable1.xml')]);
  zip.file('xl/worksheets/sheet1.xml',mainSheet(main,rows,job,form));const p=pivotSheet(pivot,rows);zip.file('xl/worksheets/sheet3.xml',p.xml);zip.file('xl/pivotCache/pivotCacheDefinition1.xml',refreshPivot(cache,rows.length+3,p.end));zip.file('xl/pivotTables/pivotTable1.xml',pivotTable(pivotDef,p.end));
  const blob=await zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`Contabilita-INRETE-${txt(job.title).replace(/[^a-z0-9_-]+/gi,'-')||'commessa'}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500);return true
}
window.VargaInreteAccountingExport={installed:true,isInrete,generate};
})();
