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
});
