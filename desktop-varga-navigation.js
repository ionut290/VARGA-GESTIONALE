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
    window.location.assign(VARGA_CANTIERI_URL);
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
