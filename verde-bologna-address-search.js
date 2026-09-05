(() => {
  "use strict";

  const FORM_ID = "verde-bologna-address-search-form";
  const INPUT_ID = "verde-bologna-address-search-input";
  const STATUS_ID = "verde-bologna-address-search-status";
  const STYLE_ID = "verde-bologna-address-search-style";
  const MAP_CREATED_EVENT = "hera:verde-bologna-map-created";
  const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
  const BOLOGNA_VIEWBOX = "11.20,44.60,11.50,44.40";

  let activeMap = null;
  let addressMarker = null;
  let requestController = null;

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .verde-bologna-address-search{display:flex;align-items:center;gap:6px;flex:1 1 330px;min-width:260px;max-width:520px;margin:0}
      .verde-bologna-address-search input{flex:1 1 240px;min-width:180px;min-height:40px;padding:7px 10px;border:1px solid #aebfb2;border-radius:9px;background:#fff;color:#173426;font:inherit}
      .verde-bologna-address-search .btn{min-height:40px;padding:7px 11px;white-space:nowrap}
      .verde-bologna-address-search-status{flex:1 0 100%;margin:0;color:#5d7464;font-size:.72rem;line-height:1.25}
      .verde-bologna-address-search-status:empty{display:none}
      .verde-bologna-address-search-status.is-error{color:#9b281f}
      .verde-bologna-map-card.is-fullscreen .verde-bologna-address-search{max-width:620px}
      @media(max-width:760px){
        .verde-bologna-address-search{order:20;flex:1 0 100%;width:100%;max-width:none;min-width:0}
        .verde-bologna-address-search input{min-width:0}
      }
      @media(max-width:430px){
        .verde-bologna-address-search{display:grid;grid-template-columns:minmax(0,1fr) auto}
        .verde-bologna-address-search-status{grid-column:1/-1}
      }
    `;
    document.head.appendChild(style);
  }

  function setSearchStatus(message, error = false) {
    const status = document.getElementById(STATUS_ID);
    if (!status) return;
    status.textContent = message || "";
    status.classList.toggle("is-error", Boolean(error));
  }

  function removeAddressMarker() {
    if (!addressMarker) return;
    try { addressMarker.remove(); } catch (_) {}
    addressMarker = null;
  }

  function focusResult(result) {
    if (!activeMap || !window.L) throw new Error("Mappa non ancora pronta.");

    const lat = Number(result?.lat);
    const lon = Number(result?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error("Coordinate non valide.");

    const bbox = Array.isArray(result?.boundingbox) ? result.boundingbox.map(Number) : [];
    const validBounds = bbox.length === 4 && bbox.every(Number.isFinite);

    if (validBounds) {
      const [south, north, west, east] = bbox;
      const span = Math.max(Math.abs(north - south), Math.abs(east - west));
      if (span > 0.001) {
        activeMap.fitBounds([[south, west], [north, east]], { padding: [32, 32], maxZoom: 17 });
      } else {
        activeMap.setView([lat, lon], 18);
      }
    } else {
      activeMap.setView([lat, lon], 18);
    }

    removeAddressMarker();
    const label = String(result?.display_name || "Zona cercata");
    addressMarker = window.L.marker([lat, lon], {
      title: label,
      keyboard: true,
      riseOnHover: true
    }).addTo(activeMap);
    addressMarker.bindPopup(`<strong>📍 Zona cercata</strong><br>${esc(label)}`).openPopup();

    window.setTimeout(() => {
      try { activeMap.invalidateSize(false); } catch (_) {}
    }, 80);
  }

  async function searchAddress(event) {
    event?.preventDefault?.();
    const input = document.getElementById(INPUT_ID);
    const form = document.getElementById(FORM_ID);
    const button = form?.querySelector("button[type='submit']");
    const raw = String(input?.value || "").trim();

    if (!raw) {
      setSearchStatus("Scrivi una via, un numero civico o una zona di Bologna.", true);
      input?.focus?.();
      return;
    }
    if (!activeMap) {
      setSearchStatus("La mappa non è ancora pronta. Attendi un attimo e riprova.", true);
      return;
    }

    if (requestController) requestController.abort();
    requestController = new AbortController();
    const timeout = window.setTimeout(() => requestController?.abort(), 9000);

    if (button) {
      button.disabled = true;
      button.textContent = "CERCO…";
    }
    setSearchStatus(`Cerco “${raw}” a Bologna…`);

    try {
      const params = new URLSearchParams({
        format: "jsonv2",
        q: /bologna/i.test(raw) ? raw : `${raw}, Bologna, Italia`,
        limit: "5",
        countrycodes: "it",
        "accept-language": "it",
        addressdetails: "1",
        viewbox: BOLOGNA_VIEWBOX,
        bounded: "1"
      });
      const response = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
        method: "GET",
        mode: "cors",
        credentials: "omit",
        signal: requestController.signal,
        headers: { Accept: "application/json" }
      });
      if (!response.ok) throw new Error(`Servizio indirizzi non disponibile (${response.status}).`);
      const results = await response.json();
      const result = Array.isArray(results) ? results.find((item) => Number.isFinite(Number(item?.lat)) && Number.isFinite(Number(item?.lon))) : null;
      if (!result) {
        setSearchStatus("Indirizzo o zona non trovati nel Comune di Bologna. Prova con via + numero civico.", true);
        return;
      }

      focusResult(result);
      const shortLabel = String(result.display_name || raw).split(",").slice(0, 3).join(",");
      setSearchStatus(`Trovato: ${shortLabel}. La mappa è stata centrata sulla zona.`);
    } catch (error) {
      if (error?.name === "AbortError") {
        setSearchStatus("Ricerca indirizzo interrotta o troppo lenta. Riprova.", true);
      } else {
        console.warn("Ricerca indirizzo Verde Bologna non riuscita:", error);
        setSearchStatus(error?.message || "Non riesco a cercare l’indirizzo in questo momento.", true);
      }
    } finally {
      window.clearTimeout(timeout);
      requestController = null;
      if (button?.isConnected) {
        button.disabled = false;
        button.textContent = "VAI";
      }
    }
  }

  function ensureControls() {
    injectStyle();
    if (document.getElementById(FORM_ID)) return;
    const toolbar = document.querySelector("#verde-bologna-map-card .verde-bologna-map-toolbar");
    if (!toolbar) return;

    const form = document.createElement("form");
    form.id = FORM_ID;
    form.className = "verde-bologna-address-search";
    form.setAttribute("role", "search");
    form.innerHTML = `
      <input id="${INPUT_ID}" type="search" autocomplete="street-address" inputmode="search" placeholder="Cerca via, civico o zona…" aria-label="Cerca un indirizzo o una zona a Bologna">
      <button class="btn" type="submit" title="Cerca sulla mappa">🔎 VAI</button>
      <p id="${STATUS_ID}" class="verde-bologna-address-search-status" role="status" aria-live="polite"></p>
    `;
    form.addEventListener("submit", searchAddress);
    toolbar.appendChild(form);
  }

  window.addEventListener(MAP_CREATED_EVENT, (event) => {
    activeMap = event?.detail?.map || null;
    removeAddressMarker();
    ensureControls();
  });

  const observer = new MutationObserver(() => ensureControls());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  ensureControls();
})();
