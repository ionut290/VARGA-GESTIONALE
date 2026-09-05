(function () {
  'use strict';

  const VARGA_CANTIERI_URL = 'https://creative-syrniki-dddbae.netlify.app/?fromGestionale=1';

  function isDesktopBrowser() {
    const isNativeApp = Boolean(window.Capacitor?.isNativePlatform?.());
    return !isNativeApp && window.matchMedia('(min-width: 900px) and (pointer: fine)').matches;
  }

  function updateVisibility() {
    const button = document.getElementById('openVargaCantieriDesktop');
    if (!button) return;
    button.hidden = !isDesktopBrowser();
  }

  function openVargaCantieri() {
    if (!isDesktopBrowser()) return;
    const button = document.getElementById('openVargaCantieriDesktop');
    if (button) {
      button.disabled = true;
      button.textContent = 'APERTURA VARGA CANTIERI…';
    }

    try {
      if (typeof window.stopCloudRealtime === 'function') window.stopCloudRealtime();
    } catch (_) {}

    const loading = document.createElement('main');
    loading.setAttribute('role', 'status');
    loading.setAttribute('aria-live', 'polite');
    loading.style.cssText = 'min-height:100vh;display:grid;place-items:center;background:#f4f6f5;color:#123b2c;font:800 18px Inter,Segoe UI,Arial,sans-serif;text-align:center;padding:24px';
    loading.textContent = 'Apertura Varga Cantieri…';
    document.body.replaceChildren(loading);

    // replace evita di conservare il Gestionale nella cronologia e riduce il
    // picco di memoria mentre Opera prepara la pagina operativa.
    window.setTimeout(() => window.location.replace(VARGA_CANTIERI_URL), 60);
  }

  function initialize() {
    const button = document.getElementById('openVargaCantieriDesktop');
    if (!button) return;
    button.onclick = openVargaCantieri;
    updateVisibility();
    window.matchMedia('(min-width: 900px) and (pointer: fine)').addEventListener?.('change', updateVisibility);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
