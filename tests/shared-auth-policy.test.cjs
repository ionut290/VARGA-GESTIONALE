const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../shared-auth-policy.js');

const user = (email = 'operatore@example.com', extra = {}) => ({
  uid: 'uid-1',
  email,
  emailVerified: true,
  ...extra
});

test('nega sempre l’accesso senza autenticazione', () => {
  assert.equal(policy.resolveAccess({}).allowed, false);
});

test('nega un indirizzo email non verificato', () => {
  const result = policy.resolveAccess({
    user: user('operatore@example.com', { emailVerified: false }),
    profile: { statoAccount: 'attivo' }
  });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /Verifica/i);
});

test('gli amministratori di Varga Cantieri restano amministratori', () => {
  const result = policy.resolveAccess({
    user: user('ADMIN@example.com'),
    profile: null,
    adminEmails: ['admin@example.com']
  });
  assert.deepEqual({ allowed: result.allowed, role: result.role }, { allowed: true, role: 'admin' });
});

test('un profilo attivo normale entra come operatore', () => {
  const result = policy.resolveAccess({
    user: user(),
    profile: { statoAccount: 'attivo', role: 'user' }
  });
  assert.deepEqual({ allowed: result.allowed, role: result.role }, { allowed: true, role: 'operatore' });
});

test('mantiene il ruolo ufficio quando presente', () => {
  const result = policy.resolveAccess({
    user: user(),
    profile: { accountStatus: 'active', ruolo: 'ufficio' }
  });
  assert.deepEqual({ allowed: result.allowed, role: result.role }, { allowed: true, role: 'ufficio' });
});

test('nega account in attesa, rifiutati o bloccati', () => {
  for (const profile of [
    { statoAccount: 'in_attesa' },
    { statoAccount: 'rifiutato' },
    { statoAccount: 'attivo', banned: true }
  ]) {
    assert.equal(policy.resolveAccess({ user: user(), profile }).allowed, false);
  }
});

test('mantiene compatibilità con i profili storici già autorizzati', () => {
  const result = policy.resolveAccess({ user: user(), profile: { role: 'user' } });
  assert.equal(result.allowed, true);
  assert.equal(result.role, 'operatore');
});
