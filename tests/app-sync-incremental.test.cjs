const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const element = { value: '', textContent: '', onclick: null, onchange: null, oninput: null };
const context = {
  console,
  db: {
    vcRecords: [], vcImpianti: [], vcUtenti: [], vcOre: [], vcSquadre: [],
    documents: [], vcSegnalazioni: [], vcCommesse: [], jobs: [], consuntivi: [],
    clients: [], meta: {}
  },
  norm: (value) => String(value || '').trim().toLowerCase(),
  uid: () => 'generated-id',
  upsertBySource: () => 0,
  save: () => {},
  refreshVcCounts: () => {},
  refresh: () => {},
  ingestVcRows: () => ({ changed: 0, created: 0 }),
  importFullVarga: () => ({ total: 0 }),
  $: () => element,
  cloudFunctions: null,
  cloudUser: null,
  document: { addEventListener: () => {}, hidden: false, createElement: () => ({ click: () => {} }) },
  setTimeout: () => 0,
  setInterval: () => 0,
  fetch: async () => ({ ok: true, json: async () => [] }),
  Blob,
  URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} }
};

vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '..', 'app-sync.js'), 'utf8'),
  context,
  { filename: 'app-sync.js' }
);

let result = context.mergeRawVcRecords([{
  sourcePath: 'impianti/1', rootCollection: 'impianti', id: '1', operation: 'upsert', data: { nome: 'A' }
}]);
assert.equal(result.created, 1);
assert.equal(context.db.vcRecords.length, 1);

result = context.mergeRawVcRecords([{
  sourcePath: 'impianti/1', rootCollection: 'impianti', id: '1', operation: 'upsert', data: { nome: 'B' }
}]);
assert.equal(result.updated, 1);
assert.equal(context.db.vcRecords[0].data.nome, 'B');

context.db.jobs.push({ id: 'job-1', vcSourceId: 'commesse/1', title: 'Commessa protetta' });
const beforeLength = context.db.jobs.length;
result = context.mapSnapshotRecords([{
  sourcePath: 'commesse/1', rootCollection: 'commesse', id: '1', operation: 'delete',
  deleted: true, deletedAt: '000000000100.000000002:test', data: null
}], { mode: 'incremental', nextCursor: '000000000100.000000002:test' });

assert.equal(result.archived, 1);
assert.equal(context.db.jobs.length, beforeLength, 'Le eliminazioni non devono rimuovere record locali');
assert.equal(context.db.jobs[0].vcArchived, true);
assert.equal(context.db.meta.vcDeltaCursor, '000000000100.000000002:test');

(async () => {
  const calls = [];
  context.db.meta.vcDeltaCursor = 'cursor-0';
  context.cloudUser = { uid: 'user-1' };
  context.cloudFunctions = {
    httpsCallable(name) {
      return async (payload) => {
        calls.push({ name, payload });
        if (name !== 'getVargaGestionaleChanges') throw new Error(`Callable inatteso: ${name}`);
        return {
          data: {
            mode: 'incremental',
            records: [{
              sourcePath: 'impianti/2', rootCollection: 'impianti', id: '2',
              operation: 'upsert', data: { nome: 'Nuovo impianto' }
            }],
            nextCursor: 'cursor-1',
            hasMore: false
          }
        };
      };
    }
  };

  await context.syncVargaFromCloud();
  assert.deepEqual(calls.map((call) => call.name), ['getVargaGestionaleChanges']);
  assert.equal(calls[0].payload.cursor, 'cursor-0');
  assert.equal(context.db.meta.vcDeltaCursor, 'cursor-1');
  assert.equal(context.db.vcRecords.some((record) => record.sourcePath === 'impianti/2'), true);

  const bootstrapCalls = [];
  context.db.meta.vcDeltaCursor = '';
  context.cloudFunctions = {
    httpsCallable(name) {
      return async (payload) => {
        bootstrapCalls.push({ name, payload });
        if (name === 'getVargaGestionaleChanges') {
          return { data: { bootstrapRequired: true, manifest: {
            mode: 'full-snapshot', snapshotId: 'snapshot-1', chunkCount: 1,
            changeCursor: 'baseline-1', generatedAt: '2026-09-05T00:00:00.000Z'
          } } };
        }
        if (name === 'getVargaGestionaleSnapshotChunk') {
          return { data: { records: [{
            sourcePath: 'impianti/3', rootCollection: 'impianti', id: '3', data: { nome: 'Base' }
          }] } };
        }
        throw new Error(`Callable inatteso durante bootstrap: ${name}`);
      };
    }
  };

  await context.syncVargaFromCloud();
  assert.deepEqual(
    bootstrapCalls.map((call) => call.name),
    ['getVargaGestionaleChanges', 'getVargaGestionaleSnapshotChunk']
  );
  assert.equal(context.db.meta.vcDeltaCursor, 'baseline-1');
  assert.equal(context.db.vcRecords.some((record) => record.sourcePath === 'impianti/3'), true);
  console.log('Client Varga Gestionale incrementale: controlli superati.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
