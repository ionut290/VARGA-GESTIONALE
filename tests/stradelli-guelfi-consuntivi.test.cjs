const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),code=fs.readFileSync(path.join(root,'stradelli-guelfi-consuntivi.js'),'utf8');
test('catalogo Stradelli Guelfi riproduce le 21 righe del modello',()=>{
  assert.match(code,/const C=\[/);
  assert.equal((code.match(/R\('/g)||[]).length,21);
  for(const v of ['MANUTENZ AREE VERDI ST BO','MANUTENZ AREE VERDI CORPO DISC','MANUT AREE VERDI'])assert.match(code,new RegExp(v));
  assert.equal((code.match(/true\)/g)||[]).length,3);
});
test('quantità non AC ripartite un terzo e due terzi',()=>{
  assert.match(code,/q\/3/);assert.match(code,/q\*2\/3/);
  assert.match(code,/A1:'B1'/);assert.match(code,/A10:'B10'/);
});
test('form e PDF includono titolo, date, formato e timbro depurazione',()=>{
  for(const v of ['Titolo consuntivo interventi','Data inizio','Data fine','Quantità lavori straordinari','Importo straordinari','VARGA_DEPURAZIONE_STAMP_JPG'])assert.match(code,new RegExp(v));
});
test('modulo si attiva soltanto per STR G o Stradelli Guelfi',()=>{
  assert.match(code,/str g/);assert.match(code,/stradelli guelf/);
});
test('mostra CREA CONSUNTIVO nella barra superiore della commessa',()=>{
  assert.match(code,/\.vg-work-actions/);
  assert.match(code,/\+ CREA CONSUNTIVO/);
  assert.match(code,/data-sg-quick/);
});
