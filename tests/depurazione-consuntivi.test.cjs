const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');

test('catalogo DEPURAZIONE contiene tutte le 53 voci del modello',()=>{
  const context={window:{}};vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root,'assets/depurazione-catalog.js'),'utf8'),context);
  const rows=context.window.DEPURAZIONE_CONSUNTIVO_CATALOG;
  assert.equal(rows.length,53);
  assert.equal(rows.find(x=>x.code==='A1').price,59.85);
  assert.equal(rows.find(x=>x.code==='B3/a').price,44.88);
  assert.equal(rows.find(x=>x.code==='20030031  (ASSOVERDE)').discounted,false);
});

test('ponte Drive usa percorso e nomi richiesti',()=>{
  const code=fs.readFileSync(path.join(root,'google-apps-script-map-bridge.gs'),'utf8');
  assert.match(code,/1ZTsKCV5zrH2KemJLbgac6pIPRMqye8ku/);
  assert.match(code,/folderName=dateKey\+' - '\+plant/);
  assert.match(code,/fileName=dateKey\+' - '\+plant\+'\.pdf'/);
  assert.match(code,/saveDepurazioneConsuntivo/);
});

test('PDF contiene solo righe con quantità positiva e timbro/firma',()=>{
  const code=fs.readFileSync(path.join(root,'depurazione-consuntivi.js'),'utf8');
  assert.match(code,/lines\.filter\(l=>N\(l\.quantity\)>0\)/);
  assert.match(code,/AVOLA_SIGNATURE_B64/);
  assert.match(code,/COMPLETA, CREA PDF E ARCHIVIA SU DRIVE/);
});
