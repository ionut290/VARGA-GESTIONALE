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

test('modulo Cadriano offre preventivo e consuntivo compilando solo data e quantità',()=>{
  const code=fs.readFileSync(path.join(root,'cadriano-documenti.js'),'utf8');
  for(const text of ['HGSbSp7CQ5W08rS1RQ0R','28013','id="cadDate"','cad-quantity'])assert.ok(code.includes(text));
  assert.match(code,/\['preventivo','consuntivo'\]/);
  assert.match(code,/\+ CREA \$\{typeLabel\(type\)\.toUpperCase\(\)\}/);
  assert.match(code,/N\(row\.quantity\)\*N\(row\.price\)/);
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
