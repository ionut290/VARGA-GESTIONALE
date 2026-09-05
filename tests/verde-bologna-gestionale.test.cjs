const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'verde-bologna-gestionale.js'), 'utf8');

test('espone tutte le 11 categorie ufficiali di Verde Bologna', () => {
  const ids = [
    'un_gest', 'alberi-manutenzioni', 'popolazione-arborea', 'siepi',
    'attrezzature_ludiche_ginniche_sportive', 'arredo', 'sgambatura_cani',
    'carta-tecnica-comunale-toponimi-parchi-e-giardini',
    'aree-verdi_entrate_centroidi', 'aree-ortive', 'verde_privato_urbanizzato'
  ];
  ids.forEach((id) => assert.match(source, new RegExp(`id: ["']${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`)));
});

test('legge le API pubbliche senza usare Firestore', () => {
  assert.match(source, /opendata\.comune\.bologna\.it\/api\/explore\/v2\.1/);
  assert.doesNotMatch(source, /cloudStore|firebase\.firestore|onSnapshot|\.collection\(/);
});

test('il Catasto alberi resta interno al Gestionale', () => {
  const row = source.split('\n').find((line) => line.includes('id: "alberi-manutenzioni"')) || '';
  assert.doesNotMatch(row, /delegate/);
  assert.match(row, /searchHint/);
  assert.match(row, /codeFields: \["num_pt", "cod_alb"\]/);
  assert.doesNotMatch(row, /"numpt"|"id", "codice"/);
});

test('la testata Verde Bologna usa lo spazio del Gestionale senza comprimere il titolo', () => {
  const headerRule = source.split('\n').find((line) => line.includes('.verde-bologna-header{')) || '';
  assert.match(headerRule, /padding:max\(12px,env\(safe-area-inset-top\)\) 24px 12px/);
  assert.doesNotMatch(headerRule, /100vw - 1180px/);
});

test('Verde Bologna occupa armoniosamente tutto lo schermo desktop', () => {
  assert.match(source, /\.verde-bologna-shell\{width:100%;max-width:none/);
  assert.match(source, /height:clamp\(460px,60vh,760px\)/);
});

test('la mappa generale carica insieme tutte le categorie in base allo zoom', () => {
  assert.match(source, /async function loadOverviewRecords/);
  assert.match(source, /Promise\.allSettled\(DATASETS\.map/);
  assert.match(source, /state\.overviewMode \? loadOverviewRecords\(\) : loadViewportRecords\(\)/);
  assert.match(source, /Mappa completa del verde/);
  assert.match(source, /verde-bologna-overview-legend/);
  assert.match(source, /zoom >= 16/);
  assert.match(source, /verde-bologna-overview-marker/);
});

test('la scheda albero include Whazzup, manutenzione completa e crea cantiere', () => {
  assert.match(source, /INVIA TRAMITE WHAZZUP/);
  assert.match(source, /data-vb-tree-maintenance/);
  assert.match(source, /CREA CANTIERE POTATURA \/ ABBATTIMENTO/);
  assert.match(source, /treeMaintenance/);
  assert.match(source, /VargaCloud\.createTreeWorkOrder/);
});
