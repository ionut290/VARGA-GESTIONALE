const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('carica il recupero prima del gestore login', () => {
  const loader = read('app.js');
  const recoveryIndex = loader.indexOf("'password-recovery-code.js'");
  const loginIndex = loader.indexOf("'app-cloud.js'");
  assert.ok(recoveryIndex >= 0);
  assert.ok(loginIndex > recoveryIndex);
});

test('intercetta solo i codici REC- prima del login Firebase', () => {
  const cloud = read('app-cloud.js');
  const hook = cloud.indexOf('VargaPasswordRecovery?.isRecoveryCodeCandidate');
  const login = cloud.indexOf('await loginWithEmail(email,password)', hook);
  assert.ok(hook >= 0);
  assert.ok(login > hook);
  assert.match(cloud, /handleLoginCode\(\{email,code:password\}\)/);
});

test('usa soltanto callable server-side per verificare e completare il recupero', () => {
  const recovery = read('password-recovery-code.js');
  assert.match(recovery, /startPasswordRecoveryWithCode/);
  assert.match(recovery, /completePasswordRecoveryWithCode/);
  assert.match(recovery, /setPasswordRecoveryCode/);
  assert.match(recovery, /id="password-recovery-code-accept" type="checkbox" required/);
  assert.match(recovery, /CONFERMA E SOSTITUISCI/);
  assert.doesNotMatch(recovery, /collection\s*\(/);
  assert.doesNotMatch(recovery, /localStorage|sessionStorage/);
});

test('rende riconoscibile il codice unico nella schermata iniziale', () => {
  const html = read('index.html');
  assert.match(html, /Password o codice REC-/);
  assert.match(html, /codice unico REC-/);
});
