/* ==========================================================================
   SIG DE POCHE VNF - UTI CMRE-EN (Nancy)
   Moteur WebGIS Leaflet - Offline First & Spécifications Métier Fluvial
   Version corrigée : fallback générique visible, PK réels depuis la
   segmentation VNF, filtrage du hors-périmètre, seuil PK abaissé.
   ========================================================================== */

(function () {
  "use strict";

  const VNF_THEME = {
    cemt5: "#e67e22",
    cemt1: "#f1c40f",
    rigole: "#3498db",
    horsPerimetre: "#b0bec5",
    outline: "#1a252f",
    ecluseFill: "#ffffff",
    ecluseStroke: "#c0392b",
    portCom: "#8e44ad",
    portPlaisance: "#2980b9",
    bassinVir: "#16a085",
    pkColor: "#2c3e50"
  };

  const REF_UTI = {
    moselle: { voie: "Moselle canalisée", cemt: "V", mouillage: "3.00 m", hLibre: "5.10 à 5.29 m", tEau: "2.50 à 3.00 m", tAir: "4.50 à 5.25 m" },
    cmr_est: { voie: "Canal de la Marne au Rhin (Est)", cemt: "I", mouillage: "2.20 m", hLibre: "3.60 m", tEau: "1.80 à 2.20 m", tAir: "3.40 m" },
    embranchement: { voie: "Embranchement de Nancy", cemt: "I", mouillage: "2.20 m", hLibre: "3.60 m", tEau: "1.80 à 2.20 m", tAir: "3.40 m" }
  };

  // Mots-clés qui définissent le périmètre réel de l'UTI CMRE-EN.
  // Toute ligne qui ne matche AUCUN de ces mots-clés est hors périmètre :
  // elle est affichée en gris neutre discret plutôt qu'en jaune/orange trompeur.
  const RESEAU_KEYWORDS = [
    "moselle", "marne au rhin", "embranchement", "nancy", "messein",
    "richardm", "frouard", "custines", "pompey", "malzeville", "laneuveville",
    "dombasle", "varangeville", "sommerviller", "crevic", "maixe", "einville",
    "lagarde", "xures", "bauzemont", "henamenil", "mouacourt", "parroy",
    "moussey", "rechicourt", "maizieres", "neuves-maisons", "ludres",
    "fleville", "jarville"
  ];

  function isDansPerimetre(name, voieAttr) {
    const n = ((name || "") + " " + (voieAttr || "")).toLowerCase();
    return RESEAU_KEYWORDS.some((kw) => n.includes(kw));
  }

  const map = L.map("map", {
    center: [48.6921, 6.22],
    zoom: 11,
    minZoom: 8,
    maxZoom: 19,
    zoomControl: false
  });

  L.control.zoom({ position: "topright" }).addTo(map);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap contributors | VNF UTI CMRE-EN"
  }).addTo(map);

  const layerVoiesGrandGabarit = L.layerGroup().addTo(map);
  const layerVoiesFreycinet = L.layerGroup().addTo(map);
  const layerRigoles = L.layerGroup().addTo(map);
  const layerHorsPerimetre = L.layerGroup(); // masqué par défaut, activable via calque
  const layerEcluses = L.layerGroup().addTo(map);
  const layerOuvrages = L.layerGroup().addTo(map);
  const layerDivers = L.layerGroup().addTo(map); // fallback générique désormais visible
  const layerPK = L.layerGroup().addTo(map); // PK visibles dès le chargement, seuil abaissé

  let searchIndex = [];
  const PK_MIN_ZOOM = 10; // abaissé (était 13) : les PK apparaissent bien plus tôt

  function createCustomIcon(svgContent, bgCol, size) {
    const s = size || 32;
    return L.divIcon({
      className: "vnf-custom-marker",
      html: `<div style="width:${s}px;height:${s}px;background:${bgCol};border:2px solid #ffffff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.4);">${svgContent}</div>`,
      iconSize: [s, s],
      iconAnchor: [s / 2, s / 2],
      popupAnchor: [0, -s / 2]
    });
  }

  const ICONS = {
    ecluse: (num) => createCustomIcon(
      `<span style="color:#c0392b;font-weight:900;font-size:11px;font-family:sans-serif;">${num || "É"}</span>`,
      "#ffffff", 28
    ),
    portCommerce: createCustomIcon(
      `<svg width="14" height="14" viewBox="0 0 24 24" fill="#ffffff"><path d="M4 3h16v3H4V3zm2 5h12v12H6V8zm2 2v8h8v-8H8z"/></svg>`,
      VNF_THEME.portCom, 26
    ),
    portPlaisance: createCustomIcon(
      `<svg width="14" height="14" viewBox="0 0 24 24" fill="#ffffff"><path d="M12 2L4 10h3v9h10v-9h3L12 2zm0 3.5l4.5 4.5H14v6h-4v-6H7.5L12 5.5z"/></svg>`,
      VNF_THEME.portPlaisance, 26
    ),
    bassinVirement: createCustomIcon(
      `<svg width="14" height="14" viewBox="0 0 24 24" fill="#ffffff"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>`,
      VNF_THEME.bassinVir, 24
    ),
    divers: createCustomIcon(
      `<svg width="12" height="12" viewBox="0 0 24 24" fill="#ffffff"><circle cx="12" cy="12" r="8"/></svg>`,
      "#34495e", 20
    ),
    pk: (val) => L.divIcon({
      className: "vnf-pk-marker",
      html: `<div style="background:#2c3e50;color:#fff;font-size:9px;font-weight:bold;padding:1px 4px;border-radius:3px;border:1px solid #fff;white-space:nowrap;">PK ${val}</div>`,
      iconSize: [40, 16],
      iconAnchor: [20, 8]
    })
  };

  function getAttr(props, candidates) {
    if (!props) return null;
    for (let c of candidates) {
      if (props[c] !== undefined && props[c] !== null && props[c] !== "") return props[c];
      let low = c.toLowerCase();
      for (let k in props) {
        if (k.toLowerCase() === low && props[k] !== undefined && props[k] !== "") return props[k];
      }
    }
    return null;
  }

  function toNumber(v) {
    if (v === null || v === undefined) return null;
    const n = parseFloat(String(v).replace(",", "."));
    return isNaN(n) ? null : n;
  }

  // FPKH/TPKH du référentiel VNF DPF sont exprimés en mètres -> conversion en km.
  function pkFromHecto(v) {
    const n = toNumber(v);
    if (n === null) return null;
    return +(n / 1000).toFixed(2);
  }

  function deduceWaterwaySpecs(name, cemtRaw) {
    const n = (name || "").toLowerCase();
    const c = (cemtRaw || "").toUpperCase();

    if (c.includes("V") || n.includes("moselle")) {
      return { ...REF_UTI.moselle, isClass5: true, color: VNF_THEME.cemt5, weight: 6 };
    }
    if (n.includes("embranchement") || n.includes("messein") || n.includes("richardm")) {
      return { ...REF_UTI.embranchement, isClass5: false, color: VNF_THEME.cemt1, weight: 4 };
    }
    return { ...REF_UTI.cmr_est, isClass5: false, color: VNF_THEME.cemt1, weight: 4 };
  }

  window.showBottomSheet = function (data) {
    const bs = document.getElementById("bottom-sheet");
    const content = document.getElementById("sheet-content");
    if (!bs || !content) return;

    let badgeCemt = data.cemt ? `<span class="vnf-badge cemt-${data.cemt.toLowerCase()}">Gabarit CEMT ${data.cemt}</span>` : "";

    content.innerHTML = `
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
        <div>
          <h3 style="margin:0 0 4px 0;font-size:17px;color:#1a252f;">${data.titre || "Ouvrage sans nom"}</h3>
          <div style="font-size:13px;color:#7f8c8d;font-weight:600;">${data.sousTitre || "UTI CMRE-EN (Nancy)"}</div>
        </div>
        ${badgeCemt}
      </div>

      <div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">
        <div class="vnf-card-prop"><strong>Voie :</strong> ${data.voie || "Canal de la Marne au Rhin"}</div>
        <div class="vnf-card-prop"><strong>Position :</strong> ${data.pk ? "PK " + data.pk : "Secteur Nancy"}</div>
        <div class="vnf-card-prop"><strong>Hauteur libre :</strong> ${data.hLibre || "3.60 m"}</div>
        <div class="vnf-card-prop"><strong>Mouillage cible :</strong> ${data.mouillage || "2.20 m"}</div>
        <div class="vnf-card-prop"><strong>Tirant d'air max :</strong> ${data.tAir || "3.40 m"}</div>
        <div class="vnf-card-prop"><strong>Tirant d'eau max :</strong> ${data.tEau || "1.80 à 2.20 m"}</div>
      </div>

      ${data.details ? `<div style="margin-top:10px;padding:8px;background:#f8f9fa;border-radius:6px;font-size:12px;color:#34495e;">${data.details}</div>` : ""}
    `;

    bs.classList.add("active");
  };

  window.closeBottomSheet = function () {
    const bs = document.getElementById("bottom-sheet");
    if (bs) bs.classList.remove("active");
  };

  // 1. Linéaires des voies navigables + PK réels tirés du référentiel VNF
  function processWaterways(geoData) {
    if (!geoData || !geoData.features) return;

    L.geoJSON(geoData, {
      style: function (feature) {
        const p = feature.properties || {};
        const name = getAttr(p, ["name", "nom", "Voie", "waterway", "Toponyme1"]);
        const voieAttr = getAttr(p, ["Voie", "Toponyme1"]);
        const cemt = getAttr(p, ["CEMT", "Gabarit", "cemt"]);
        const isRigole = (p.waterway === "drain" || p.waterway === "ditch" || (name && name.toLowerCase().includes("rigole")));
        const dansPerimetre = isDansPerimetre(name, voieAttr);

        if (!dansPerimetre) {
          return { color: VNF_THEME.horsPerimetre, weight: 1, opacity: 0.35 };
        }
        if (isRigole) {
          return { color: VNF_THEME.rigole, weight: 2.5, dashArray: "4, 4" };
        }

        const specs = deduceWaterwaySpecs(name, cemt);
        return {
          color: specs.color,
          weight: specs.weight,
          opacity: 0.95,
          lineJoin: "round",
          lineCap: "round"
        };
      },
      onEachFeature: function (feature, layer) {
        const p = feature.properties || {};
        const name = getAttr(p, ["name", "nom", "Voie", "Toponyme1"]) || "Voie navigable";
        const voieAttr = getAttr(p, ["Voie", "Toponyme1"]);
        const cemt = getAttr(p, ["CEMT", "Gabarit"]);
        const isRigole = (p.waterway === "drain" || p.waterway === "ditch" || (name && name.toLowerCase().includes("rigole")));
        const dansPerimetre = isDansPerimetre(name, voieAttr);
        const specs = deduceWaterwaySpecs(name, cemt);

        const fpkh = pkFromHecto(getAttr(p, ["FPKH"]));
        const tpkh = pkFromHecto(getAttr(p, ["TPKH"]));

        const cardData = {
          titre: name,
          sousTitre: specs.voie,
          voie: specs.voie,
          cemt: specs.cemt,
          hLibre: specs.hLibre,
          mouillage: specs.mouillage,
          tAir: specs.tAir,
          tEau: specs.tEau,
          pk: fpkh !== null ? fpkh : getAttr(p, ["pk", "PK"]),
          details: getAttr(p, ["description", "Remarque", "Navigabilite", "Nature"])
        };

        layer.on("click", () => showBottomSheet(cardData));

        if (name && dansPerimetre) {
          searchIndex.push({ label: `${name} (${specs.cemt})`, layer: layer, latlng: layer.getBounds ? layer.getBounds().getCenter() : null });
        }

        // --- Création des repères PK à partir du référentiel VNF (FPKH/TPKH) ---
        if (dansPerimetre && fpkh !== null && layer.getLatLngs) {
          const latlngs = layer.getLatLngs();
          const flat = Array.isArray(latlngs[0]) ? latlngs[0] : latlngs;
          const first = Array.isArray(flat[0]) ? flat[0][0] : flat[0];
          if (first) {
            const pkMarker = L.marker(first, { icon: ICONS.pk(fpkh.toFixed(2)) });
            pkMarker.on("click", () => showBottomSheet({ ...cardData, titre: (voieAttr || name) + " — PK " + fpkh.toFixed(2) }));
            layerPK.addLayer(pkMarker);
            searchIndex.push({ label: `${voieAttr || name} — PK ${fpkh.toFixed(2)}`, layer: pkMarker, latlng: first });
          }
        }

        if (!dansPerimetre) {
          layerHorsPerimetre.addLayer(layer);
        } else if (isRigole) {
          layerRigoles.addLayer(layer);
        } else if (specs.isClass5) {
          layerVoiesGrandGabarit.addLayer(layer);
        } else {
          layerVoiesFreycinet.addLayer(layer);
        }
      }
    });
  }

  // 2. Ouvrages ponctuels (Écluses, Ponts, Bassins) — fallback désormais visible
  function processPoints(geoData) {
    if (!geoData || !geoData.features) return;

    L.geoJSON(geoData, {
      pointToLayer: function (feature, latlng) {
        const p = feature.properties || {};
        const lock = getAttr(p, ["lock", "lock_name", "ecluse", "nom_ecluse", "name"]);
        const seamark = getAttr(p, ["seamark:type", "seamark_type", "type_ouvrage", "type"]);
        const harbourCat = getAttr(p, ["seamark:harbour:category", "seamark_harbour_category", "harbour"]);
        const pk = getAttr(p, ["pk", "PK", "pk_debut"]);

        if (lock || (seamark && seamark.includes("lock")) || p.waterway === "lock_gate" || getAttr(p, ["lock"]) === "yes") {
          const matchNum = (lock || "").toString().match(/\d+/);
          const num = matchNum ? matchNum[0] : "";
          const marker = L.marker(latlng, { icon: ICONS.ecluse(num) });
          layerEcluses.addLayer(marker);
          return marker;
        }

        if (seamark === "turning_basin" || p.waterway === "turning_point" || (p.name && p.name.toLowerCase().includes("virement"))) {
          const marker = L.marker(latlng, { icon: ICONS.bassinVirement });
          layerOuvrages.addLayer(marker);
          return marker;
        }

        if (seamark === "harbour" || harbourCat || (p.name && p.name.toLowerCase().includes("port"))) {
          const nomLower = (p.name || "").toLowerCase();
          const isComm = harbourCat !== "marina" && (nomLower.includes("frouard") || nomLower.includes("commerce") || nomLower.includes("quai"));
          const marker = L.marker(latlng, { icon: isComm ? ICONS.portCommerce : ICONS.portPlaisance });
          layerOuvrages.addLayer(marker);
          return marker;
        }

        if (pk) {
          const marker = L.marker(latlng, { icon: ICONS.pk(pk) });
          layerPK.addLayer(marker);
          return marker;
        }

        // Point générique : désormais visible dans un calque dédié.
        const marker = L.marker(latlng, { icon: ICONS.divers });
        layerDivers.addLayer(marker);
        return marker;
      },
      onEachFeature: function (feature, layer) {
        const p = feature.properties || {};
        const nom = getAttr(p, ["lock_name", "nom", "name", "nom_ouvrage"]) || "Ouvrage UTI";
        const pk = getAttr(p, ["pk", "PK", "pk_debut"]);
        const chute = getAttr(p, ["chute", "hauteur_chute", "chute_m", "lock_height"]);
        const dim = getAttr(p, ["dimensions", "dim_sas", "longueur_utile", "maxlength"]);

        const cardData = {
          titre: nom,
          sousTitre: "Ouvrage de navigation VNF",
          voie: getAttr(p, ["voie", "canal"]) || "Secteur UTI CMRE",
          pk: pk,
          hLibre: getAttr(p, ["hauteur_libre", "h_libre"]) || "3.60 m",
          mouillage: getAttr(p, ["mouillage", "mouillage_cible"]) || "2.20 m",
          details: `
            ${chute ? `<strong>Hauteur de chute :</strong> ${chute} m<br/>` : ""}
            ${dim ? `<strong>Dimensions sas :</strong> ${dim}<br/>` : "<strong>Dimensions sas :</strong> Gabarit Freycinet (39 m x 5.20 m)<br/>"}
            <strong>Gestion :</strong> UTI Canal de la Marne au Rhin Est (Nancy)
          `
        };

        layer.on("click", () => showBottomSheet(cardData));

        if (nom) {
          searchIndex.push({ label: `${nom} ${pk ? "(PK " + pk + ")" : ""}`, layer: layer, latlng: layer.getLatLng ? layer.getLatLng() : null });
        }
      }
    });
  }

  function initData() {
    for (let k in window) {
      if (k.startsWith("json") || k.includes("export") || k.includes("Marne") || k.includes("Segmentation")) {
        const obj = window[k];
        if (obj && obj.type === "FeatureCollection" && Array.isArray(obj.features)) {
          const sample = obj.features[0];
          if (!sample || !sample.geometry) continue;

          const geomType = sample.geometry.type;
          if (geomType.includes("Line") || geomType.includes("Polygon")) {
            processWaterways(obj);
          } else if (geomType.includes("Point")) {
            processPoints(obj);
          }
        }
      }
    }

    // Le seuil est abaissé (10 au lieu de 13) et l'état est évalué
    // immédiatement au chargement, pas seulement lors d'un futur zoom.
    function applyPkVisibility() {
      const z = map.getZoom();
      if (z >= PK_MIN_ZOOM) {
        if (!map.hasLayer(layerPK)) map.addLayer(layerPK);
      } else {
        if (map.hasLayer(layerPK)) map.removeLayer(layerPK);
      }
    }
    map.on("zoomend", applyPkVisibility);
    applyPkVisibility();
  }

  window.initSearchEngine = function () {
    const input = document.getElementById("search-input");
    const results = document.getElementById("search-results");
    if (!input || !results) return;

    input.addEventListener("input", function (e) {
      const val = e.target.value.toLowerCase().trim();
      results.innerHTML = "";
      if (val.length < 2) {
        results.style.display = "none";
        return;
      }

      const matches = searchIndex.filter((item) => item.label.toLowerCase().includes(val)).slice(0, 7);
      if (matches.length === 0) {
        results.style.display = "none";
        return;
      }

      matches.forEach((m) => {
        const div = document.createElement("div");
        div.className = "search-item";
        div.textContent = m.label;
        div.onclick = function () {
          if (m.latlng) {
            map.flyTo(m.latlng, 15, { duration: 1.2 });
            if (m.layer && m.layer.fire) m.layer.fire("click");
          }
          results.style.display = "none";
          input.value = m.label;
        };
        results.appendChild(div);
      });
      results.style.display = "block";
    });
  };

  window.locateUser = function () {
    map.locate({ setView: true, maxZoom: 16, enableHighAccuracy: true });
  };

  map.on("locationfound", function (e) {
    L.circle(e.latlng, e.accuracy / 2, { color: "#2980b9", fillColor: "#3498db", fillOpacity: 0.2 }).addTo(map);
    L.circleMarker(e.latlng, { radius: 7, color: "#ffffff", fillColor: "#2980b9", fillOpacity: 1 }).addTo(map);
  });

  window.openGlossary = function () {
    const modal = document.getElementById("glossary-modal");
    if (modal) modal.style.display = "flex";
  };

  window.closeGlossary = function () {
    const modal = document.getElementById("glossary-modal");
    if (modal) modal.style.display = "none";
  };

  initData();
  window.initSearchEngine();

})();
