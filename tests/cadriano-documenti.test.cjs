const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');

test('catalogo Hera Cadriano riproduce le sei voci della matrice AVOLA C14',()=>{
  const context={window:{}};vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root,'assets/cadriano-catalog.js'),'utf8'),context);
  const rows=context.window.CADRIANO_DOCUMENT_CATALOG;
  assert.deepEqual(Array.from(rows,row=>row.code),['A1','A2','A3','A4','A5','B1']);
  assert.deepEqual(Array.from(rows,row=>row.price),[700,450,450,750,350,3900]);
  assert.ok(rows.every(row=>row.unit==='CAD'));
});

test('modulo Cadriano offre preventivo e consuntivo con richiedente e righe manuali',()=>{
  const code=fs.readFileSync(path.join(root,'cadriano-documenti.js'),'utf8');
  for(const text of ['HGSbSp7CQ5W08rS1RQ0R','28013','id="cadDate"','id="cadRequester"','cad-quantity','data-cad-add-row','data-cad-remove-row','manual:true'])assert.ok(code.includes(text));
  assert.match(code,/\['preventivo','consuntivo'\]/);
  assert.match(code,/\+ CREA \$\{typeLabel\(type\)\.toUpperCase\(\)\}/);
  assert.match(code,/N\(row\.quantity\)\*N\(row\.price\)/);
  assert.match(code,/requester,rows,total/);
  assert.match(code,/record\.requester\|\|'ZEROUAL WASSIM'/);
  assert.match(code,/manualRows\.slice\(offset,offset\+8\)/);
  assert.match(code,/VARGA_DEPURAZIONE_STAMP_JPG/);
  assert.match(code,/Preventivi':'Contabilita/);
  assert.match(code,/\.\.\.\(editing\|\|\{\}\)/);
});

test('documenti Cadriano sono persistiti e sincronizzati come sezione autonoma',()=>{
  assert.match(fs.readFileSync(path.join(root,'app-core.js'),'utf8'),/cadrianoDocuments:S\.get\('vg_cadrianoDocuments'/);
  assert.match(fs.readFileSync(path.join(root,'app-cloud.js'),'utf8'),/cadrianoDocuments:db\.cadrianoDocuments/);
  assert.match(fs.readFileSync(path.join(root,'cloud-incremental-sync.js'),'utf8'),/'cadrianoDocuments'/);
  const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
  assert.ok(app.indexOf('assets/cadriano-catalog.js')<app.indexOf('cadriano-documenti.js'));
  assert.ok(app.indexOf('depurazione-consuntivi.js')<app.indexOf('cadriano-documenti.js'));
});

test('note standard e manuali sopravvivono alla riapertura e vengono scritte nel PDF',async()=>{
  const drawn=[];let pages=0;
  const font={widthOfTextAtSize:(s,size)=>s.length*size/2};
  const pdf={embedFont:async()=>font,addPage(){pages++;return{drawText:s=>drawn.push(s),drawRectangle(){}}},setTitle(){},save:async()=>new Uint8Array()};
  const context={window:{PDFLib:{PDFDocument:{create:async()=>pdf},StandardFonts:{},rgb(){}}},Blob,crypto:require('node:crypto').webcrypto};vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root,'assets/cadriano-catalog.js'),'utf8'),context);
  let code=fs.readFileSync(path.join(root,'cadriano-documenti.js'),'utf8');
  code=code.slice(0,code.indexOf('addStyle();new MutationObserver'))+'window.api={editableLines,makePdf,rowMarkup};})();';
  vm.runInContext(code,context);
  const record={type:'consuntivo',date:'2026-09-08',description:'Taglio siepe lato ingresso',rows:[{code:'A1',quantity:1,amount:700,notes:'Raccolta completata'},{id:'extra',manual:true,code:'X1',quantity:1,price:20,amount:20,notes:'Trasporto incluso'}],total:720};
  const restored=context.window.api.editableLines(record);
  assert.equal(restored[0].notes,'Raccolta completata');assert.equal(restored.at(-1).notes,'Trasporto incluso');
  assert.match(context.window.api.rowMarkup(restored[0],0),/cad-notes/);
  await context.window.api.makePdf(record);
  assert.ok(drawn.includes(record.description));assert.ok(drawn.includes('Raccolta completata'));assert.ok(drawn.includes('Trasporto incluso'));
  record.rows[0].notes='Intervento dettagliato '.repeat(100)+'ULTIMA NOTA';drawn.length=0;pages=0;
  await context.window.api.makePdf(record);assert.ok(pages>=3);assert.ok(drawn.some(s=>s.includes('ULTIMA NOTA')));
});
