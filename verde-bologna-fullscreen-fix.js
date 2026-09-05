(() => {
  "use strict";

  const STYLE_ID = "verde-bologna-fullscreen-layout-fix";
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .verde-bologna-map-card.is-fullscreen {
      grid-template-rows: auto auto auto minmax(0, 1fr) !important;
      overflow: hidden !important;
    }

    .verde-bologna-map-card.is-fullscreen .verde-bologna-overview-legend {
      align-items: center !important;
      align-content: flex-start !important;
      min-height: 0 !important;
      height: auto !important;
      flex: 0 0 auto !important;
    }

    .verde-bologna-map-card.is-fullscreen .verde-bologna-legend-item {
      align-self: flex-start !important;
      min-height: 0 !important;
      height: auto !important;
    }

    .verde-bologna-map-card.is-fullscreen .verde-bologna-map {
      min-width: 0 !important;
      min-height: 0 !important;
      height: 100% !important;
    }
  `;
  document.head.appendChild(style);
})();
