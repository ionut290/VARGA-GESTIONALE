(function installVargaSharedAuthPolicy(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.VargaSharedAuthPolicy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createVargaSharedAuthPolicy() {
  'use strict';

  const OWNER_ADMIN_EMAILS = ['ionut29019@gmail.com'];
  const ACTIVE_STATUSES = new Set(['attivo', 'active', 'approvato', 'approved']);
  const PENDING_STATUSES = new Set(['in_attesa', 'richiesta_inviata', 'pending']);

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  function normalizeStatus(profile) {
    return String(profile?.statoAccount || profile?.accountStatus || '').trim().toLowerCase();
  }

  function normalizeAdminEmails(values) {
    return new Set([...(Array.isArray(values) ? values : []), ...OWNER_ADMIN_EMAILS].map(normalizeEmail).filter(Boolean));
  }

  function resolveAccess({ user, profile, adminEmails = [] } = {}) {
    if (!user?.uid || !normalizeEmail(user.email)) {
      return { allowed: false, role: '', reason: 'Accedi con un account Varga Cantieri valido.' };
    }
    if (user.emailVerified === false) {
      return { allowed: false, role: '', reason: 'Verifica il tuo indirizzo email prima di accedere.' };
    }

    const email = normalizeEmail(user.email);
    if (normalizeAdminEmails(adminEmails).has(email)) {
      return { allowed: true, role: 'admin', reason: '', email };
    }
    if (!profile) {
      return { allowed: false, role: '', reason: 'Account creato. Attendi l’approvazione di un amministratore di Varga Cantieri.', email, needsProfile: true };
    }
    if (profile.banned === true) {
      return { allowed: false, role: '', reason: 'Questo account è stato bloccato. Contatta un amministratore.', email };
    }

    const status = normalizeStatus(profile);
    const legacyActive = !status && profile.profileMigratedByEmail !== false;
    if (!legacyActive && !ACTIVE_STATUSES.has(status)) {
      const reason = PENDING_STATUSES.has(status)
        ? 'Il tuo account è in attesa di approvazione in Varga Cantieri.'
        : 'Il tuo account non è autorizzato. Contatta un amministratore di Varga Cantieri.';
      return { allowed: false, role: '', reason, email };
    }

    const sourceRole = String(profile.role || profile.ruolo || '').trim().toLowerCase();
    const role = sourceRole === 'ufficio' ? 'ufficio' : 'operatore';
    return { allowed: true, role, reason: '', email };
  }

  return {
    OWNER_ADMIN_EMAILS: [...OWNER_ADMIN_EMAILS],
    normalizeEmail,
    normalizeStatus,
    resolveAccess
  };
});
