const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');

test('catalogo discariche riproduce le 18 voci del documento',()=>{
  const context={window:{}};vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root,'assets/discariche-catalog.js'),'utf8'),context);
  const rows=context.window.DISCARICHE_CONSUNTIVO_CATALOG;
  assert.equal(rows.length,18);
  assert.deepEqual(Array.from(rows.slice(0,6),x=>x.quantity),[146000,158000,90000,16000,8000,130000]);
  assert.ok(rows.slice(0,6).every(x=>x.automatic));
  assert.ok(rows.slice(6).every(x=>!x.automatic));
});

test('modulo attivo per discariche ma escluso per STR G e Discarica Hera Ozzano',()=>{
  const code=fs.readFileSync(path.join(root,'discariche-consuntivi.js'),'utf8');
  assert.match(code,/includes\('discaric'\)/);
  assert.match(code,/str g/);
  assert.match(code,/discarica hera ozzano/);
  assert.match(code,/l\.startDate&&l\.endDate/);
  assert.match(code,/!l\.automatic&&N\(l\.quantity\)<=0/);
});

test('il documento contiene quantità e date per ogni voce',()=>{
  const code=fs.readFileSync(path.join(root,'discariche-consuntivi.js'),'utf8');
  assert.match(code,/DATA INIZIO/);
  assert.match(code,/DATA FINE/);
  assert.match(code,/Quantità/);
  assert.match(code,/Contratto n\.2670001725/);
  assert.match(code,/N\(l\.quantity\)\*N\(l\.price\)/);
});

test('il PDF viene scaricato prima del tentativo di archiviazione Drive',()=>{
  const code=fs.readFileSync(path.join(root,'discariche-consuntivi.js'),'utf8');
  const download=code.indexOf('a.click()');
  const upload=code.indexOf("bridgeRetry('driveUpload'");
  assert.ok(download>0&&upload>download);
  assert.match(code,/Completato - Drive in attesa/);
  assert.match(code,/for\(let attempt=0;attempt<2;attempt\+\+\)/);
});

test('catalogo e modulo sono caricati nell’ordine corretto',()=>{
  const code=fs.readFileSync(path.join(root,'app.js'),'utf8');
  assert.ok(code.indexOf('assets/discariche-catalog.js')<code.indexOf('discariche-consuntivi.js'));
});
