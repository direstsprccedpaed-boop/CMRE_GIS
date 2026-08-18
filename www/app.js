/* =====================================================================
   SIG DE POCHE — UTI CMRE-EN (VNF)
   Moteur cartographique Leaflet 100% embarqué — app.js (v2 - diagnostic)
   ===================================================================== */
(function () {
"use strict";

/* ---------------------------------------------------------------------
   0. UTILITAIRES GÉNÉRAUX
   --------------------------------------------------------------------- */
function getTag(props, keys) {
  if (!props) return null;
  for (const k of keys) {
    if (props[k] !== undefined && props[k] !== null && props[k] !== "") return props[k];
    const alt1 = k.replace(/_/g, "");
    const alt2 = k.replace(/:/g, "");
    const alt3 = k.replace(/:/g, "_");
    for (const cand of [alt1, alt2, alt3]) {
      if (props[cand] !== undefined && props[cand] !== null && props[cand] !== "") return props[cand];
    }
  }
  const normk = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
  const wanted = keys.map(normk);
  for (const realKey of Object.keys(props)) {
    const nk = normk(realKey);
    if (wanted.includes(nk) && props[realKey] !== null && props[realKey] !== "") return props[realKey];
  }
  return null;
}
function toNumber(v) {
  if (v === null || v === undefined) return null;
  const n = parseFloat(String(v).replace(",", "."));
  return isNaN(n) ? null : n;
}
function showToast(msg, ms) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), ms || 2400);
}
function norm(str) {
  return (str || "").toString().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.\s]/g, " ").replace(/\s+/g, " ").trim();
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }

/* ---------------------------------------------------------------------
   0-bis. BANDEAU DE DIAGNOSTIC (visible dans l'app, sans devtools)
   --------------------------------------------------------------------- */
const diagLog = [];
function diag(label, ok, detail) {
  diagLog.push({ label, ok, detail });
}
function renderDiagBanner() {
  const anyFail = diagLog.some((d) => !d.ok);
  if (!anyFail) return; // tout va bien : pas de bandeau intrusif
  const el = document.createElement("div");
  el.id = "diagBanner";
  el.style.cssText = "position:fixed;left:8px;right:8px;top:calc(env(safe-area-inset-top,0px)+64px);z-index:5000;" +
    "background:#fff3cd;border:1px solid #e0b400;border-radius:12px;padding:10px 12px;font-size:12.5px;" +
    "color:#5a4a10;max-height:40vh;overflow-y:auto;box-shadow:0 6px 18px rgba(0,0,0,.3);";
  el.innerHTML = "<b>Diagnostic chargement des données</b><br>" +
    diagLog.map((d) => `${d.ok ? "✅" : "❌"} ${escapeHtml(d.label)}${d.detail ? " — " + escapeHtml(d.detail) : ""}`).join("<br>") +
    `<br><button id="diagClose" style="margin-top:8px;padding:6px 12px;border:none;border-radius:8px;background:#e0b400;color:#3a2f05;font-weight:700;">Fermer</button>`;
  document.body.appendChild(el);
  document.getElementById("diagClose").addEventListener("click", () => el.remove());
}

// Recherche automatique d'une FeatureCollection dans les variables globales,
// même si son nom exact diffère de celui attendu (robustesse face aux exports).
function autoDetectFeatureCollection(expectedNames, matchFn) {
  for (const name of expectedNames) {
    try {
      const v = window[name];
      if (v && v.type === "FeatureCollection" && Array.isArray(v.features)) return { fc: v, foundAs: name };
    } catch (e) { /* ignore */ }
  }
  // Balayage de toutes les variables globales (fallback)
  for (const key of Object.keys(window)) {
    try {
      const v = window[key];
      if (v && typeof v === "object" && v.type === "FeatureCollection" && Array.isArray(v.features) && v.features.length) {
        if (!matchFn || matchFn(v)) return { fc: v, foundAs: key };
      }
    } catch (e) { /* ignore certaines propriétés protégées */ }
  }
  return { fc: null, foundAs: null };
}

/* ---------------------------------------------------------------------
   1. CARTE LEAFLET
   --------------------------------------------------------------------- */
const map = L.map("map", {
  zoomControl: false, attributionControl: true, minZoom: 8, maxZoom: 19,
  worldCopyJump: false, tap: true,
});
map.setView([48.66, 6.35], 12);
const baseLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19, attribution: "&copy; OpenStreetMap contributors — Données voies navigables : VNF / OSM",
}).addTo(map);

/* ---------------------------------------------------------------------
   2. NORMALISATION DES DONNÉES (clés OSM / VNF)
   --------------------------------------------------------------------- */
const KEYS = {
  cemt: ["CEMT", "cemt"],
  disusedCemt: ["disused_CEMT", "disusedCEMT"],
  waterway: ["waterway"],
  lock: ["lock"],
  lockName: ["lock_name", "lockname"],
  lockRef: ["lock_ref", "lockref"],
  lockHeight: ["lock_height", "lockheight"],
  name: ["name"],
  nameFr: ["name_fr", "namefr"],
  bridge: ["bridge"],
  tunnel: ["tunnel"],
  weirMovable: ["weir_movable", "weirmovable"],
  seamarkType: ["seamark_type", "seamark:type", "seamarktype"],
  seamarkHarbourCat: ["seamark_harbour_category", "seamark:harbour:category", "seamarkharbourcategory"],
  seamarkBridgeCat: ["seamark_bridge_category", "seamark:bridge:category", "seamarkbridgecategory"],
  seamarkBridgeClearance: ["seamark_bridge_clearance_height", "seamark:bridge:clearance_height", "seamarkbridgeclearanceheight"],
  seamarkBridgeClearanceSafe: ["seamark_bridge_clearance_height_safe", "seamarkbridgeclearanceheightsafe"],
  seamarkName: ["seamark_name", "seamark:name", "seamarkname"],
  maxdraft: ["maxdraft", "max_draft"],
  maxheight: ["maxheight", "max_height"],
  maxwidth: ["maxwidth", "max_width"],
  maxlength: ["maxlength", "max_length"],
  width: ["width"],
  height: ["height"],
  operator: ["operator"],
  note: ["note"],
  description: ["description"],
  addrCity: ["addr_city", "addrcity"],
  automated: ["automated"],
  mooring: ["mooring"],
  harbour: ["harbour"],
  manmade: ["man_made", "manmade"],
  leisure: ["leisure"],
  amenity: ["amenity"],
  railway: ["railway"],
  vhf: ["vhf", "contact_vhf"],
  passageTime: ["passage_time", "passagetime"],
  openingHours: ["opening_hours", "openinghours"],
  ref: ["ref"],
};
const VKEYS = {
  gid: ["gid"], cdSeg: ["CdSegDPF"], etat: ["Etat"], largeur: ["Largeur"], nature: ["Nature"],
  navigabilite: ["Navigabilite", "Navigabili"], gabarit: ["Gabarit"], toponyme1: ["Toponyme1"],
  voie: ["Voie"], itineraire: ["Itineraire"], section: ["Section"],
  statutDom: ["Statutdom", "StatutdomDPF"], autorite: ["Autorite", "Autorit"], exploitant: ["Exploitant"],
  fpkh: ["FPKH"], tpkh: ["TPKH"], departement: ["Departement", "Departemen"], region: ["Region", "Rgion"],
  longueur: ["longueur"], observation: ["Observation"],
};
function pkFromHecto(v) {
  const n = toNumber(v);
  if (n === null) return null;
  return +(n / 1000).toFixed(2);
}

/* ---------------------------------------------------------------------
   3. CLASSIFICATION SÉMIOLOGIQUE
   --------------------------------------------------------------------- */
const CEMT_STYLE = {
  "V":  { color: "#e67e22", weight: 6, dash: null, label: "Classe V — Grand gabarit (Moselle canalisée)" },
  "5":  { color: "#e67e22", weight: 6, dash: null, label: "Classe V — Grand gabarit (Moselle canalisée)" },
  "IV": { color: "#e08214", weight: 5, dash: null, label: "Classe IV" },
  "III":{ color: "#e08214", weight: 5, dash: null, label: "Classe III" },
  "II": { color: "#f0a93a", weight: 4.5, dash: null, label: "Classe II" },
  "I":  { color: "#f7ca18", weight: 4, dash: null, outline:"#3a2f05", label: "Classe I — Freycinet (CMR Est / Embr. de Nancy)" },
  "1":  { color: "#f7ca18", weight: 4, dash: null, outline:"#3a2f05", label: "Classe I — Freycinet (CMR Est / Embr. de Nancy)" },
  "0":  { color: "#f7ca18", weight: 3, dash: null, outline:"#3a2f05", label: "Classe 0 — Petit gabarit" },
};
const NONNAV_STYLE = { color: "#5bc0de", weight: 2.4, dash: "6 6", label: "Rigole d'alimentation / voie non navigable" };
const DEFAULT_WATER_STYLE = { color: "#7fb3c9", weight: 2, dash: "3 5", label: "Voie d'eau (gabarit non renseigné)" };

function styleForWaterway(props) {
  const cemt = getTag(props, KEYS.cemt);
  const disusedCemt = getTag(props, KEYS.disusedCemt);
  const wway = (getTag(props, KEYS.waterway) || "").toString().toLowerCase();
  if (cemt && CEMT_STYLE[String(cemt).toUpperCase()]) return CEMT_STYLE[String(cemt).toUpperCase()];
  if (wway === "canal" || wway === "river") {
    if (disusedCemt) return NONNAV_STYLE;
    return DEFAULT_WATER_STYLE;
  }
  if (["ditch", "drain", "stream"].includes(wway)) return NONNAV_STYLE;
  return DEFAULT_WATER_STYLE;
}
function styleForVnfSegment(props) {
  const gabarit = getTag(props, VKEYS.gabarit);
  const navig = (getTag(props, VKEYS.navigabilite) || "").toString().toLowerCase();
  const voie = (getTag(props, VKEYS.voie) || "").toString().toLowerCase();
  if (voie.includes("moselle")) return CEMT_STYLE["V"];
  if (voie.includes("marne au rhin") || voie.includes("embranchement")) return CEMT_STYLE["I"];
  if (navig.includes("non navigable") || navig.includes("en attente")) return NONNAV_STYLE;
  if (gabarit && CEMT_STYLE[String(gabarit).toUpperCase()]) return CEMT_STYLE[String(gabarit).toUpperCase()];
  return DEFAULT_WATER_STYLE;
}
function categorizePoint(props) {
  const lock = (getTag(props, KEYS.lock) || "").toString().toLowerCase();
  const wway = (getTag(props, KEYS.waterway) || "").toString().toLowerCase();
  const seaType = (getTag(props, KEYS.seamarkType) || "").toString().toLowerCase();
  const bridge = (getTag(props, KEYS.bridge) || "").toString().toLowerCase();
  const tunnel = (getTag(props, KEYS.tunnel) || "").toString().toLowerCase();
  const harbour = (getTag(props, KEYS.harbour) || "").toString().toLowerCase();
  const mooring = (getTag(props, KEYS.mooring) || "").toString().toLowerCase();
  const manmade = (getTag(props, KEYS.manmade) || "").toString().toLowerCase();
  const railway = (getTag(props, KEYS.railway) || "").toString().toLowerCase();
  const seaHarbourCat = (getTag(props, KEYS.seamarkHarbourCat) || "").toString().toLowerCase();
  if (lock === "yes" || wway === "lock_gate" || seaType === "gate") return "ecluse";
  if (wway === "weir" || manmade === "weir") return "barrage";
  if (wway === "dam") return "barrage";
  if (bridge === "yes" || seaType === "bridge") return "pont";
  if (tunnel === "yes" || tunnel === "canal" || wway === "tunnel") return "souterrain";
  if (seaHarbourCat === "marina" || harbour === "yes" || wway === "dock") {
    if (seaHarbourCat === "marina" || mooring === "yes") return "port_plaisance";
    return "quai_commerce";
  }
  if (mooring === "yes") return "halte";
  if (railway) return "acces_ferroviaire";
  if (wway === "turning_point" || manmade === "basin") return "bassin_virement";
  if (wway === "milestone") return "pk_borne";
  return "autre";
}
const CATS = {
  ecluse:            { label: "Écluse",                 color: "#0b2e45", svg: iconLock,      z: 5 },
  barrage:           { label: "Barrage / vanne",         color: "#c0392b", svg: iconWeir,      z: 4 },
  pont:              { label: "Pont",                    color: "#7f8c8d", svg: iconBridge,    z: 3 },
  souterrain:        { label: "Souterrain / voûte",       color: "#5b3a29", svg: iconTunnel,    z: 3 },
  quai_commerce:     { label: "Quai / port de commerce",  color: "#8e44ad", svg: iconQuay,      z: 4 },
  port_plaisance:    { label: "Port de plaisance",        color: "#1e88e5", svg: iconMarina,    z: 4 },
  halte:             { label: "Halte de plaisance",       color: "#3fa7d6", svg: iconMarina,    z: 3 },
  acces_ferroviaire: { label: "Accès ferroviaire",        color: "#2c3e50", svg: iconRail,      z: 3 },
  bassin_virement:   { label: "Bassin de virement",       color: "#16a085", svg: iconBasin,     z: 3 },
  pk_borne:          { label: "Point kilométrique",       color: "#34495e", svg: iconPk,        z: 2 },
  autre:             { label: "Ouvrage / point d'intérêt",color: "#7f8c8d", svg: iconGeneric,   z: 1 },
};
function iconLock(c){return `<svg width="26" height="26" viewBox="0 0 26 26"><rect x="1" y="1" width="24" height="24" rx="6" fill="${c}"/><path d="M13 5 L21 13 L13 21 L5 13 Z" fill="#f7ca18"/></svg>`;}
function iconWeir(c){return `<svg width="24" height="24" viewBox="0 0 24 24"><rect x="1" y="1" width="22" height="22" rx="5" fill="${c}"/><path d="M4 16 L8 10 L12 16 L16 10 L20 16" stroke="#fff" stroke-width="2" fill="none"/></svg>`;}
function iconBridge(c){return `<svg width="24" height="24" viewBox="0 0 24 24"><rect x="1" y="1" width="22" height="22" rx="5" fill="${c}"/><path d="M3 15 Q12 6 21 15" stroke="#fff" stroke-width="2" fill="none"/><line x1="3" y1="15" x2="21" y2="15" stroke="#fff" stroke-width="2"/></svg>`;}
function iconTunnel(c){return `<svg width="24" height="24" viewBox="0 0 24 24"><rect x="1" y="1" width="22" height="22" rx="5" fill="${c}"/><path d="M4 18 V12 A8 8 0 0 1 20 12 V18" stroke="#fff" stroke-width="2" fill="none"/></svg>`;}
function iconQuay(c){return `<svg width="24" height="24" viewBox="0 0 24 24"><rect x="1" y="1" width="22" height="22" rx="5" fill="${c}"/><rect x="5" y="6" width="14" height="6" fill="#fff"/><line x1="7" y1="12" x2="7" y2="19" stroke="#fff" stroke-width="2"/><line x1="17" y1="12" x2="17" y2="19" stroke="#fff" stroke-width="2"/></svg>`;}
function iconMarina(c){return `<svg width="24" height="24" viewBox="0 0 24 24"><rect x="1" y="1" width="22" height="22" rx="5" fill="${c}"/><path d="M6 16 L12 6 L18 16 Z" fill="#fff"/><line x1="4" y1="18" x2="20" y2="18" stroke="#fff" stroke-width="2"/></svg>`;}
function iconRail(c){return `<svg width="24" height="24" viewBox="0 0 24 24"><rect x="1" y="1" width="22" height="22" rx="5" fill="${c}"/><line x1="4" y1="8" x2="20" y2="8" stroke="#fff" stroke-width="2"/><line x1="4" y1="16" x2="20" y2="16" stroke="#fff" stroke-width="2"/><line x1="7" y1="6" x2="7" y2="18" stroke="#fff" stroke-width="1.5"/><line x1="12" y1="6" x2="12" y2="18" stroke="#fff" stroke-width="1.5"/><line x1="17" y1="6" x2="17" y2="18" stroke="#fff" stroke-width="1.5"/></svg>`;}
function iconBasin(c){return `<svg width="24" height="24" viewBox="0 0 24 24"><rect x="1" y="1" width="22" height="22" rx="5" fill="${c}"/><circle cx="12" cy="12" r="7" stroke="#fff" stroke-width="2" fill="none"/></svg>`;}
function iconPk(c){return `<svg width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="${c}" stroke="#fff" stroke-width="1.6"/></svg>`;}
function iconGeneric(c){return `<svg width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="9" fill="${c}" stroke="#fff" stroke-width="1.6"/></svg>`;}
function svgBoat(c){return `<svg width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="13" fill="${c}" opacity="0.18"/><circle cx="14" cy="14" r="6" fill="${c}" stroke="#fff" stroke-width="2"/></svg>`;}

/* ---------------------------------------------------------------------
   4. COUCHES LEAFLET & INDEX DE RECHERCHE
   --------------------------------------------------------------------- */
const layers = {
  waterwaysNav: L.layerGroup(), waterwaysNonNav: L.layerGroup(), vnfSegments: L.layerGroup(),
  locks: L.layerGroup(), structures: L.layerGroup(), harbours: L.layerGroup(),
  pkMarkers: L.layerGroup(), admin: L.layerGroup(),
};
const searchIndex = [];
const pkIndex = [];
function addSearchEntry(label, type, latlng, sub, ref) {
  if (!label || !latlng) return;
  searchIndex.push({ label, norm: norm(label), type, latlng, sub: sub || "", ref: ref || null });
}

function loadWaterways(fc) {
  if (!fc || !fc.features) return 0;
  let count = 0;
  fc.features.forEach((f) => {
    const props = f.properties || {};
    const geom = f.geometry;
    if (!geom || (geom.type !== "LineString")) return;
    const st = styleForWaterway(props);
    const isNav = st !== NONNAV_STYLE;
    const latlngs = geom.coordinates.map((c) => [c[1], c[0]]);
    const line = L.polyline(latlngs, { color: st.color, weight: st.weight, opacity: 0.95, dashArray: st.dash || null, lineCap: "round", lineJoin: "round" });
    line._vnfMeta = { kind: "waterway", props, styleLabel: st.label };
    line.on("click", () => openWaterwaySheet(props, st));
    (isNav ? layers.waterwaysNav : layers.waterwaysNonNav).addLayer(line);
    count++;
    const name = getTag(props, KEYS.name) || getTag(props, KEYS.nameFr);
    if (name) addSearchEntry(name, "bief", latlngs[Math.floor(latlngs.length / 2)], st.label);
  });
  return count;
}
function loadPoints(fc) {
  if (!fc || !fc.features) return 0;
  let count = 0;
  fc.features.forEach((f) => {
    const props = f.properties || {};
    const geom = f.geometry;
    if (!geom || geom.type !== "Point") return;
    const latlng = [geom.coordinates[1], geom.coordinates[0]];
    const cat = categorizePoint(props);
    const catDef = CATS[cat];
    const marker = L.marker(latlng, {
      icon: L.divIcon({ className: "vnf-icon", html: catDef.svg(catDef.color), iconSize: [cat === "ecluse" ? 26 : 24, cat === "ecluse" ? 26 : 24], iconAnchor: [13, 13] }),
      zIndexOffset: catDef.z * 100,
    });
    marker._vnfMeta = { kind: "point", cat, props };
    marker.on("click", () => openPointSheet(props, cat));
    if (cat === "ecluse") layers.locks.addLayer(marker);
    else if (["pont", "souterrain", "barrage"].includes(cat)) layers.structures.addLayer(marker);
    else if (["quai_commerce", "port_plaisance", "halte", "acces_ferroviaire", "bassin_virement"].includes(cat)) layers.harbours.addLayer(marker);
    else layers.structures.addLayer(marker);
    count++;
    const lockName = getTag(props, KEYS.lockName);
    const lockRef = getTag(props, KEYS.lockRef);
    const name = getTag(props, KEYS.name) || lockName;
    const seamarkName = getTag(props, KEYS.seamarkName);
    const label = name || seamarkName;
    if (label) {
      const subBits = [];
      if (lockRef) subBits.push("Écluse n°" + lockRef);
      subBits.push(catDef.label);
      addSearchEntry(label, cat, latlng, subBits.join(" · "), lockRef);
    } else if (lockRef) addSearchEntry("Écluse " + lockRef, cat, latlng, catDef.label, lockRef);
  });
  return count;
}
function loadVnfSegmentation(fc) {
  if (!fc || !fc.features) return 0;
  let count = 0;
  fc.features.forEach((f) => {
    const props = f.properties || {};
    const geom = f.geometry;
    if (!geom) return;
    const st = styleForVnfSegment(props);
    let latlngsSets = [];
    if (geom.type === "MultiLineString") latlngsSets = geom.coordinates.map((line) => line.map((c) => [c[1], c[0]]));
    else if (geom.type === "LineString") latlngsSets = [geom.coordinates.map((c) => [c[1], c[0]])];
    else return;
    const poly = L.polyline(latlngsSets, { color: st.color, weight: st.weight, opacity: 0.001, dashArray: st.dash || null });
    poly._vnfMeta = { kind: "vnfseg", props };
    poly.on("click", () => openVnfSegmentSheet(props));
    layers.vnfSegments.addLayer(poly);
    count++;
    const voie = getTag(props, VKEYS.voie);
    const fpkh = pkFromHecto(getTag(props, VKEYS.fpkh));
    const tpkh = pkFromHecto(getTag(props, VKEYS.tpkh));
    const first = latlngsSets[0] && latlngsSets[0][0];
    if (voie && fpkh !== null && first) {
      addSearchEntry(voie + " — PK " + fpkh, "pk", first, "Référentiel VNF", fpkh);
      const marker = L.marker(first, { icon: L.divIcon({ className: "vnf-icon", html: iconPk("#34495e"), iconSize: [16, 16], iconAnchor: [8, 8] }), zIndexOffset: 50 });
      marker._vnfMeta = { kind: "pkpoint", props, pk: fpkh };
      marker.bindTooltip("PK " + fpkh, { permanent: false, className: "pk-label" });
      marker.on("click", () => openVnfSegmentSheet(props));
      layers.pkMarkers.addLayer(marker);
      pkIndex.push({ pk: fpkh, latlng: first, voie });
      if (tpkh !== null) pkIndex.push({ pk: tpkh, latlng: latlngsSets[latlngsSets.length - 1].slice(-1)[0], voie });
    }
  });
  return count;
}

/* ---------------------------------------------------------------------
   5. EXÉCUTION DU CHARGEMENT (avec auto-détection + diagnostic visible)
   --------------------------------------------------------------------- */
// Noms attendus en priorité, puis balayage automatique si absents.
const det2 = autoDetectFeatureCollection(
  ["jsonexport2", "jsonExport2", "json_export2"],
  (fc) => { const p = fc.features[0] && fc.features[0].properties; return p && (("waterway" in p) || ("CEMT" in p)) && !("CdSegDPF" in p); }
);
const det3 = autoDetectFeatureCollection(
  ["jsonexport3", "jsonExport3", "json_export3"],
  (fc) => { const p = fc.features[0] && fc.features[0].properties; return p && (("lock" in p) || ("waterway" in p) || ("seamark_type" in p) || ("seamark:type" in p)) && fc.features[0].geometry && fc.features[0].geometry.type === "Point"; }
);
const detSeg = autoDetectFeatureCollection(
  ["jsonSegmentationMarneauRhinMoselle1", "jsonSegmentationMarneauRhinMoselle", "jsonsegmentationmarneaurhinmoselle1"],
  (fc) => { const p = fc.features[0] && fc.features[0].properties; return p && ("CdSegDPF" in p || "Voie" in p); }
);

let n2 = 0, n3 = 0, nSeg = 0;
try {
  n2 = loadWaterways(det2.fc);
  diag("export_2.js (voies navigables)", !!det2.fc && n2 > 0, det2.fc ? `variable "${det2.foundAs}", ${n2} lignes chargées` : "variable introuvable dans le contexte global (vérifiez le <script src> et le nom de variable dans le fichier)");
} catch (e) { diag("export_2.js (voies navigables)", false, "Exception JS : " + e.message); console.error("export_2", e); }

try {
  n3 = loadPoints(det3.fc);
  diag("export_3.js (écluses, ponts, ouvrages)", !!det3.fc && n3 > 0, det3.fc ? `variable "${det3.foundAs}", ${n3} points chargés` : "variable introuvable dans le contexte global");
} catch (e) { diag("export_3.js (écluses, ponts, ouvrages)", false, "Exception JS : " + e.message); console.error("export_3", e); }

try {
  nSeg = loadVnfSegmentation(detSeg.fc);
  diag("Segmentation VNF (référentiel PK officiel)", !!detSeg.fc && nSeg > 0, detSeg.fc ? `variable "${detSeg.foundAs}", ${nSeg} segments chargés` : "variable introuvable dans le contexte global");
} catch (e) { diag("Segmentation VNF (référentiel PK officiel)", false, "Exception JS : " + e.message); console.error("segmentation", e); }

Object.values(layers).forEach((lg) => lg.addTo(map));

try {
  const bounds = layers.waterwaysNav.getBounds();
  if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24] });
} catch (e) { /* garde la vue par défaut */ }

renderDiagBanner();

/* ---------------------------------------------------------------------
   6. GESTION DU NIVEAU DE DÉTAIL (LOD)
   --------------------------------------------------------------------- */
function applyLOD() {
  const z = map.getZoom();
  const fine = z >= 14;
  const veryFine = z >= 16;
  toggleLayerVisibility(layers.structures, fine);
  toggleLayerVisibility(layers.harbours, fine);
  toggleLayerVisibility(layers.pkMarkers, fine);
  toggleLayerVisibility(layers.waterwaysNonNav, z >= 12);
  toggleLayerVisibility(layers.admin, z >= 10 && z < 15);
  if (!map.hasLayer(layers.locks)) layers.locks.addTo(map);
  layers.pkMarkers.eachLayer((m) => {
    if (m.getTooltip) { if (veryFine) { if (!m.isTooltipOpen()) m.openTooltip(); } else m.closeTooltip(); }
  });
}
function toggleLayerVisibility(layerGroup, show) {
  const has = map.hasLayer(layerGroup);
  if (show && !has) layerGroup.addTo(map);
  if (!show && has) map.removeLayer(layerGroup);
}
map.on("zoomend", applyLOD);
applyLOD();

/* ---------------------------------------------------------------------
   7. RECHERCHE LOCALE INSTANTANÉE
   --------------------------------------------------------------------- */
const searchInput = document.getElementById("searchInput");
const searchResults = document.getElementById("searchResults");
const searchClear = document.getElementById("searchClear");
function extractPkQuery(q) {
  const m = q.match(/pk\s*([0-9]+(?:[.,][0-9]+)?)/i) || q.match(/^([0-9]+(?:[.,][0-9]+)?)$/);
  if (!m) return null;
  return parseFloat(m[1].replace(",", "."));
}
function runSearch(qRaw) {
  const q = norm(qRaw);
  if (!q) { searchResults.classList.remove("show"); searchResults.innerHTML = ""; return; }
  const pkQuery = extractPkQuery(qRaw);
  let results = [];
  if (pkQuery !== null && pkIndex.length) {
    results = results.concat(pkIndex.map((p) => ({ ...p, dist: Math.abs(p.pk - pkQuery) }))
      .sort((a, b) => a.dist - b.dist).slice(0, 6)
      .map((p) => ({ label: (p.voie || "Voie") + " — PK " + p.pk.toFixed(2), sub: "Correspondance kilométrique", latlng: p.latlng, type: "pk" })));
  }
  results = results.concat(searchIndex.filter((e) => e.norm.includes(q)).slice(0, 30).map((e) => ({ label: e.label, sub: e.sub, latlng: e.latlng, type: e.type })));
  const seen = new Set();
  results = results.filter((r) => { const key = r.label + "|" + r.latlng.join(","); if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 25);
  renderResults(results);
}
function renderResults(results) {
  if (!results.length) {
    searchResults.innerHTML = `<div class="sr-item"><div class="sr-text"><div class="sr-title">Aucun résultat</div><div class="sr-sub">Essayez un PK, un nom d'écluse ou une commune</div></div></div>`;
    searchResults.classList.add("show"); return;
  }
  searchResults.innerHTML = results.map((r, i) => {
    const catDef = CATS[r.type] || { color: "#7f8c8d", label: r.type };
    const badge = r.type === "pk" ? "PK" : (r.label[0] || "•").toUpperCase();
    return `<div class="sr-item" data-idx="${i}"><div class="sr-badge" style="background:${catDef.color || "#7f8c8d"}">${badge}</div><div class="sr-text"><div class="sr-title">${escapeHtml(r.label)}</div><div class="sr-sub">${escapeHtml(r.sub || "")}</div></div></div>`;
  }).join("");
  searchResults.classList.add("show");
  Array.from(searchResults.children).forEach((el, i) => {
    el.addEventListener("click", () => {
      const r = results[i];
      map.flyTo(r.latlng, Math.max(map.getZoom(), 16), { duration: 0.9 });
      searchResults.classList.remove("show");
      searchInput.value = r.label; searchClear.style.display = "flex";
      showToast(r.label);
    });
  });
}
let searchDebounce;
searchInput.addEventListener("input", () => {
  clearTimeout(searchDebounce);
  searchClear.style.display = searchInput.value ? "flex" : "none";
  searchDebounce = setTimeout(() => runSearch(searchInput.value), 120);
});
searchClear.addEventListener("click", () => { searchInput.value = ""; searchClear.style.display = "none"; searchResults.classList.remove("show"); searchInput.blur(); });
searchInput.addEventListener("focus", () => { if (searchInput.value) searchResults.classList.add("show"); });
map.on("dragstart", () => searchResults.classList.remove("show"));

/* ---------------------------------------------------------------------
   8. BOTTOM SHEET — FICHES D'ATTRIBUTS
   --------------------------------------------------------------------- */
const sheet = document.getElementById("bottomSheet");
const sheetCategory = document.getElementById("sheetCategory");
const sheetTitle = document.getElementById("sheetTitle");
const sheetIconEl = document.getElementById("sheetIcon");
const sheetBody = document.getElementById("sheetBody");
function openSheet() { sheet.classList.remove("peek"); sheet.classList.add("open"); }
function closeSheet() { sheet.classList.remove("open"); sheet.classList.remove("peek"); }
document.getElementById("sheetClose").addEventListener("click", closeSheet);
function attrCard(label, value, full) {
  if (value === null || value === undefined || value === "") return "";
  return `<div class="attr-card${full ? " full" : ""}"><div class="lbl">${escapeHtml(label)}</div><div class="val">${escapeHtml(value)}</div></div>`;
}
function openWaterwaySheet(props, st) {
  const name = getTag(props, KEYS.name) || getTag(props, KEYS.nameFr) || "Voie d'eau";
  sheetCategory.textContent = "Bief / voie navigable";
  sheetTitle.textContent = name;
  sheetIconEl.style.background = st.color;
  sheetIconEl.innerHTML = svgBoat("#fff");
  const cemt = getTag(props, KEYS.cemt) || getTag(props, KEYS.disusedCemt);
  const maxdraft = getTag(props, KEYS.maxdraft);
  const maxheight = getTag(props, KEYS.maxheight);
  const maxwidth = getTag(props, KEYS.maxwidth);
  const width = getTag(props, KEYS.width);
  const note = getTag(props, KEYS.note) || getTag(props, KEYS.description);
  sheetBody.innerHTML = `
    <div class="sheet-section"><h4>Classification</h4><div class="tag-row"><span class="tag-chip" style="background:${st.color}22;color:${st.color}">${escapeHtml(st.label)}</span></div></div>
    <div class="sheet-section"><h4>Caractéristiques de gabarit</h4><div class="attr-grid">
      ${attrCard("Classe CEMT", cemt)}${attrCard("Largeur (m)", width)}${attrCard("Tirant d'eau max (m)", maxdraft)}${attrCard("Tirant d'air max (m)", maxheight)}${attrCard("Largeur navigable max (m)", maxwidth)}
    </div></div>
    ${note ? `<div class="sheet-section"><h4>Notes</h4><div class="note-box">${escapeHtml(note)}</div></div>` : ""}`;
  openSheet();
}
function openPointSheet(props, cat) {
  const catDef = CATS[cat];
  const name = getTag(props, KEYS.name) || getTag(props, KEYS.lockName) || getTag(props, KEYS.seamarkName) || catDef.label;
  sheetCategory.textContent = catDef.label;
  sheetTitle.textContent = name;
  sheetIconEl.style.background = catDef.color;
  sheetIconEl.innerHTML = catDef.svg("#fff");
  const lockRef = getTag(props, KEYS.lockRef);
  const lockHeight = getTag(props, KEYS.lockHeight);
  const maxlength = getTag(props, KEYS.maxlength);
  const maxwidth = getTag(props, KEYS.maxwidth);
  const automated = getTag(props, KEYS.automated);
  const operatorTag = getTag(props, KEYS.operator);
  const openingHours = getTag(props, KEYS.openingHours);
  const vhf = getTag(props, KEYS.vhf);
  const clearance = getTag(props, KEYS.seamarkBridgeClearance) || getTag(props, KEYS.seamarkBridgeClearanceSafe);
  const note = getTag(props, KEYS.note) || getTag(props, KEYS.description);
  const addrCity = getTag(props, KEYS.addrCity);
  let bodyHtml = "";
  if (cat === "ecluse") {
    bodyHtml += `<div class="sheet-section"><h4>Identification</h4><div class="attr-grid">
      ${attrCard("Numéro d'écluse", lockRef)}${attrCard("Commune", addrCity)}${attrCard("Chute d'eau (m)", lockHeight)}${attrCard("Dimensions utiles du sas", (maxlength && maxwidth) ? (maxlength + " × " + maxwidth + " m") : null)}
    </div></div>
    <div class="sheet-section"><h4>Exploitation</h4><div class="attr-grid">
      ${attrCard("Automatisme", automated)}${attrCard("Gestionnaire", operatorTag)}${attrCard("Horaires", openingHours)}${attrCard("Canal VHF", vhf)}
    </div></div>`;
  } else if (cat === "pont" || cat === "souterrain") {
    bodyHtml += `<div class="sheet-section"><h4>Franchissement</h4><div class="attr-grid">${attrCard("Hauteur libre (m)", clearance)}${attrCard("Commune", addrCity)}</div></div>`;
  } else {
    bodyHtml += `<div class="sheet-section"><h4>Informations</h4><div class="attr-grid">${attrCard("Commune", addrCity)}${attrCard("Gestionnaire", operatorTag)}${attrCard("Horaires", openingHours)}</div></div>`;
  }
  if (note) bodyHtml += `<div class="sheet-section"><h4>Notes d'exploitation</h4><div class="note-box">${escapeHtml(note)}</div></div>`;
  sheetBody.innerHTML = bodyHtml;
  openSheet();
}
function openVnfSegmentSheet(props) {
  const voie = getTag(props, VKEYS.voie) || "Segment DPF";
  const fpkh = pkFromHecto(getTag(props, VKEYS.fpkh));
  const tpkh = pkFromHecto(getTag(props, VKEYS.tpkh));
  const nature = getTag(props, VKEYS.nature);
  const navigabilite = getTag(props, VKEYS.navigabilite);
  const gabarit = getTag(props, VKEYS.gabarit);
  const largeur = getTag(props, VKEYS.largeur);
  const autorite = getTag(props, VKEYS.autorite);
  const exploitant = getTag(props, VKEYS.exploitant);
  const longueur = getTag(props, VKEYS.longueur);
  const statutDom = getTag(props, VKEYS.statutDom);
  sheetCategory.textContent = "Référentiel officiel VNF (DPF)";
  sheetTitle.textContent = voie + (fpkh !== null ? " — PK " + fpkh : "");
  sheetIconEl.style.background = "#34495e";
  sheetIconEl.innerHTML = iconPk("#fff");
  sheetBody.innerHTML = `
    <div class="sheet-section"><h4>Positionnement</h4><div class="attr-grid">${attrCard("PK début", fpkh)}${attrCard("PK fin", tpkh)}${attrCard("Longueur (km)", longueur)}${attrCard("Nature", nature)}</div></div>
    <div class="sheet-section"><h4>Navigation</h4><div class="attr-grid">${attrCard("Navigabilité", navigabilite)}${attrCard("Gabarit", gabarit)}${attrCard("Largeur", largeur)}</div></div>
    <div class="sheet-section"><h4>Domanialité</h4><div class="attr-grid">${attrCard("Statut domanial", statutDom)}${attrCard("Autorité", autorite)}${attrCard("Exploitant", exploitant)}</div></div>`;
  openSheet();
}
(function enableSheetDrag() {
  const zone = document.getElementById("sheetHandleZone");
  let startY = 0, startTransform = 0, dragging = false;
  function getTranslateY() { const t = getComputedStyle(sheet).transform; if (t === "none") return 0; const m = t.match(/matrix\(([^)]+)\)/); return m ? parseFloat(m[1].split(",")[5]) : 0; }
  function onStart(y) { dragging = true; startY = y; startTransform = getTranslateY(); sheet.style.transition = "none"; }
  function onMove(y) { if (!dragging) return; const delta = y - startY; const next = Math.max(0, startTransform + delta); sheet.style.transform = `translateY(${next}px)`; }
  function onEnd(y) { if (!dragging) return; dragging = false; sheet.style.transition = ""; const delta = y - startY; sheet.style.transform = ""; if (delta > 120) closeSheet(); else openSheet(); }
  zone.addEventListener("touchstart", (e) => onStart(e.touches[0].clientY), { passive: true });
  zone.addEventListener("touchmove", (e) => onMove(e.touches[0].clientY), { passive: true });
  zone.addEventListener("touchend", (e) => onEnd(e.changedTouches[0].clientY));
  zone.addEventListener("mousedown", (e) => { onStart(e.clientY); const mm = (ev) => onMove(ev.clientY); const mu = (ev) => { onEnd(ev.clientY); window.removeEventListener("mousemove", mm); window.removeEventListener("mouseup", mu); }; window.addEventListener("mousemove", mm); window.addEventListener("mouseup", mu); });
})();

/* ---------------------------------------------------------------------
   9. MODALE GLOSSAIRE — RECTANGLE DE NAVIGATION AVEC BATEAU (SVG)
   --------------------------------------------------------------------- */
function buildNavSvg() {
  return `
    <img
      src="./icons/rectangle-navigation-bateau.svg"
      alt="Coupe technique du rectangle de navigation avec bateau"
      style="display:block;width:100%;height:auto;max-height:360px;object-fit:contain;"
    >
  `;
}
document.getElementById("navSvgWrap").innerHTML = buildNavSvg();

const glossModal = document.getElementById("glossModal");
document.getElementById("glossBtn").addEventListener("click", () => glossModal.classList.add("show"));
document.getElementById("glossClose").addEventListener("click", () => glossModal.classList.remove("show"));
glossModal.addEventListener("click", (e) => { if (e.target === glossModal) glossModal.classList.remove("show"); });

/* ---------------------------------------------------------------------
   10. GESTIONNAIRE DE COUCHES
   --------------------------------------------------------------------- */
const layerPanel = document.getElementById("layerPanel");
const layerDefs = [
  { key: "waterwaysNav", label: "Biefs / voies navigables", color: "#e67e22" },
  { key: "waterwaysNonNav", label: "Rigoles / voies non navigables", color: "#5bc0de" },
  { key: "locks", label: "Écluses", color: "#0b2e45" },
  { key: "structures", label: "Ponts, souterrains, barrages", color: "#7f8c8d" },
  { key: "harbours", label: "Quais, ports, haltes, accès ferré", color: "#8e44ad" },
  { key: "pkMarkers", label: "Bornage PK (référentiel VNF)", color: "#34495e" },
];
function buildLayerPanel() {
  const list = document.getElementById("layerList");
  list.innerHTML = layerDefs.map((d) => `
    <div class="layer-row"><div class="sw-icon" style="background:${d.color}"></div><div class="lbl">${d.label} (${layers[d.key].getLayers().length})</div>
      <label class="switch"><input type="checkbox" data-layer="${d.key}" ${map.hasLayer(layers[d.key]) ? "checked" : ""}><div class="track"></div><div class="thumb"></div></label>
    </div>`).join("");
  list.querySelectorAll("input[type=checkbox]").forEach((cb) => {
    cb.addEventListener("change", () => { const key = cb.dataset.layer; if (cb.checked) layers[key].addTo(map); else map.removeLayer(layers[key]); });
  });
}
document.getElementById("layersBtn").addEventListener("click", () => { buildLayerPanel(); layerPanel.classList.add("show"); });
document.getElementById("layerClose").addEventListener("click", () => layerPanel.classList.remove("show"));
layerPanel.addEventListener("click", (e) => { if (e.target === layerPanel) layerPanel.classList.remove("show"); });

/* ---------------------------------------------------------------------
   11. GÉOLOCALISATION (Capacitor natif + repli HTML5)
   --------------------------------------------------------------------- */
let geoMarker = null, geoCircle = null, watchId = null, tracking = false;
const geoBtn = document.getElementById("geoBtn");
function placeGeoMarker(lat, lng, accuracy) {
  const latlng = [lat, lng];
  if (!geoMarker) geoMarker = L.marker(latlng, { icon: L.divIcon({ className: "vnf-icon", html: '<div class="pulse-dot"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }) }).addTo(map);
  else geoMarker.setLatLng(latlng);
  if (accuracy) {
    if (!geoCircle) geoCircle = L.circle(latlng, { radius: accuracy, color: "#1e88e5", weight: 1, fillOpacity: 0.12 }).addTo(map);
    else { geoCircle.setLatLng(latlng); geoCircle.setRadius(accuracy); }
  }
}
async function centerOnUser() {
  tracking = !tracking;
  geoBtn.classList.toggle("tracking", tracking);
  if (!tracking) {
    if (watchId !== null) {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Geolocation) window.Capacitor.Plugins.Geolocation.clearWatch({ id: watchId });
      else navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    return;
  }
  try {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Geolocation) {
      const Geolocation = window.Capacitor.Plugins.Geolocation;
      const perm = await Geolocation.requestPermissions();
      if (perm.location !== "granted" && perm.coarseLocation !== "granted") { showToast("Permission de localisation refusée"); tracking = false; geoBtn.classList.remove("tracking"); return; }
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
      placeGeoMarker(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
      map.flyTo([pos.coords.latitude, pos.coords.longitude], 16, { duration: 0.8 });
      watchId = await Geolocation.watchPosition({ enableHighAccuracy: true }, (pos2, err) => { if (err || !pos2) return; placeGeoMarker(pos2.coords.latitude, pos2.coords.longitude, pos2.coords.accuracy); });
    } else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => { placeGeoMarker(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy); map.flyTo([pos.coords.latitude, pos.coords.longitude], 16, { duration: 0.8 }); }, () => showToast("Géolocalisation indisponible"), { enableHighAccuracy: true });
      watchId = navigator.geolocation.watchPosition((pos) => { placeGeoMarker(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy); }, null, { enableHighAccuracy: true });
    } else showToast("Géolocalisation non supportée");
  } catch (e) { console.error(e); showToast("Erreur de géolocalisation"); tracking = false; geoBtn.classList.remove("tracking"); }
}
geoBtn.addEventListener("click", centerOnUser);

/* ---------------------------------------------------------------------
   12. ZOOM CUSTOM
   --------------------------------------------------------------------- */
document.getElementById("zoomInBtn").addEventListener("click", () => map.zoomIn());
document.getElementById("zoomOutBtn").addEventListener("click", () => map.zoomOut());

/* ---------------------------------------------------------------------
   13. ÉTAT INITIAL
   --------------------------------------------------------------------- */
map.on("click", () => { searchResults.classList.remove("show"); });
sheet.classList.remove("open");
showToast("Chargé : " + n2 + " lignes, " + n3 + " points, " + nSeg + " segments VNF, " + searchIndex.length + " indexés", 4000);

})();
