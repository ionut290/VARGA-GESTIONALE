const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),code=fs.readFileSync(path.join(root,'wte-modena-consuntivi.js'),'utf8');
test('catalogo WTE Modena riproduce contratto e voci della matrice',()=>{assert.match(code,/2670000821/);assert.match(code,/WTE MODENA/);assert.equal((code.match(/R\('/g)||[]).length,16);for(const v of ["'A2'","'A12'","'A20'","'B9'"])assert.match(code,new RegExp(v))});
test('modulo WTE calcola importi e genera PDF',()=>{assert.match(code,/N\(l\.quantity\)\*N\(l\.price\)/);assert.match(code,/TOTALE INTERVENTO/);assert.match(code,/COMPLETA E CREA PDF/);assert.match(code,/VargaDriveLifecycle/)});
test('modulo si attiva per WTE MO e WTE Modena',()=>{assert.match(code,/wte mo/);assert.match(code,/t\.includes\('wte modena'\)/);assert.match(code,/termovalorizzatore modena/)});
test('dati WTE sono salvati localmente e nel cloud',()=>{for(const f of ['app-core.js','app-cloud.js','cloud-incremental-sync.js'])assert.match(fs.readFileSync(path.join(root,f),'utf8'),/wteModenaConsuntivi/)});
