const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

test('carica per ultima la revisione generale dell’interfaccia',()=>{
  const app=read('app.js');
  assert.match(app,/ui-overhaul\.js/);
  assert.ok(app.indexOf('ui-overhaul.js')>app.indexOf('job-workspace.js'));
});

test('la navigazione porta sempre la nuova vista in alto',()=>{
  assert.match(read('app-core.js'),/window\.scrollTo\(\{top:0,left:0,behavior:'auto'\}\)/);
});

test('le email usano un’anteprima compatta',()=>{
  const source=read('request-mail-center.js');
  assert.match(source,/function compactActivityPreview/);
  assert.match(source,/text\.length>260/);
});

test('Verde Bologna isola la vista sottostante',()=>{
  const source=read('verde-bologna-gestionale.js');
  assert.match(source,/app\.inert=true/);
  assert.match(source,/app\.removeAttribute\('inert'\)/);
});

test('il modulo nuova commessa parte chiuso',()=>{
  const source=read('job-management-sync.js');
  assert.match(source,/form\.hidden=true/);
  assert.match(source,/NUOVA COMMESSA/);
});

test('il menu mantiene disponibili tutte le aree economiche',()=>{
  const source=read('job-workspace.js');
  for(const view of ['consuntivi','fatture','spese'])assert.match(source,new RegExp(`'${view}'`));
});

test('il contenuto usa tutta la larghezza disponibile',()=>{
  assert.match(read('ui-overhaul.js'),/\.main\{max-width:none/);
});
