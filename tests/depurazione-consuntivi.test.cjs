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

test('PDF contiene solo righe con quantità positiva e timbro/firma originali',()=>{
  const code=fs.readFileSync(path.join(root,'depurazione-consuntivi.js'),'utf8');
  assert.match(code,/lines\.filter\(l=>N\(l\.quantity\)>0\)/);
  assert.match(code,/DEPURAZIONE_FIRMA_ORIGINALE_JPG/);
  assert.match(code,/COMPLETA, CREA PDF E ARCHIVIA SU DRIVE/);
});

test('le date del consuntivo si possono digitare in formato italiano',()=>{
  const code=fs.readFileSync(path.join(root,'depurazione-consuntivi.js'),'utf8');
  assert.match(code,/placeholder='GG\/MM\/AAAA'/);
  assert.match(code,/date:isoDate\(v\('depDate'\)\)/);
  assert.match(code,/requestDate:isoDate\(v\('depRequestDate'\)\)/);
});

test('i consuntivi salvati possono essere modificati ed eliminati anche da Drive',()=>{
  const code=fs.readFileSync(path.join(root,'depurazione-consuntivi.js'),'utf8');
  const bridge=fs.readFileSync(path.join(root,'google-apps-script-map-bridge.gs'),'utf8');
  assert.match(code,/data-dep-edit/);
  assert.match(code,/data-dep-delete/);
  assert.match(code,/deleteDepurazioneConsuntivo/);
  assert.match(bridge,/function deleteDepurazioneConsuntivo_/);
  assert.match(bridge,/folder\.setTrashed\(true\)/);
});

test('consuntivi DEPURAZIONE e PDF Drive sono condivisi nel gestionale autenticato',()=>{
  const cloud=fs.readFileSync(path.join(root,'app-cloud.js'),'utf8');
  const incremental=fs.readFileSync(path.join(root,'cloud-incremental-sync.js'),'utf8');
  const code=fs.readFileSync(path.join(root,'depurazione-consuntivi.js'),'utf8');
  const bridge=fs.readFileSync(path.join(root,'google-apps-script-map-bridge.gs'),'utf8');
  assert.match(cloud,/depurazioneConsuntivi:db\.depurazioneConsuntivi/);
  assert.match(incremental,/knownVersions\[k\]==null/);
  assert.match(incremental,/keys\.forEach\(k=>hashes\[k\]=hashValue\(db\[k\]\)\)/);
  assert.match(code,/data-dep-pdf/);
  assert.match(code,/VargaMailBridgeCall\('getDepurazioneConsuntivo'/);
  assert.match(bridge,/function getDepurazioneConsuntivo_/);
  assert.match(bridge,/driveFolderInside_\(parents\.next\(\),root\)/);
  assert.doesNotMatch(bridge,/ANYONE_WITH_LINK/);
});

test('database impianti DEPURAZIONE compila solo nome e comune lasciandoli modificabili',()=>{
  const context={window:{}};vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root,'assets/depurazione-bologna-plants.js'),'utf8'),context);
  const plants=context.window.DEPURAZIONE_BOLOGNA_PLANTS;
  assert.ok(plants.length>=480);
  assert.deepEqual(Object.keys(plants[0]).sort(),['code','municipality','name']);
  const code=fs.readFileSync(path.join(root,'depurazione-consuntivi.js'),'utf8');
  assert.match(code,/input\.value=plant\.name;comune\.value=plant\.municipality/);
  assert.doesNotMatch(code,/depOdl[^\n]+plant\.code/);
  assert.doesNotMatch(code,/id="depPlant"[^>]+readonly/);
  assert.doesNotMatch(code,/id="depComune"[^>]+readonly/);
});

test('database impianti viene caricato prima del modulo consuntivi',()=>{
  const code=fs.readFileSync(path.join(root,'app.js'),'utf8');
  assert.ok(code.indexOf('assets/depurazione-bologna-plants.js')<code.indexOf("'depurazione-consuntivi.js'"));
});
