/* ============================================================
   CommuneResolver — resolution communale 100% locale (hors-ligne)
   Donnees attendues : ./data/communes.geojson (WGS84 / EPSG:4326)
   Genere par build-communes.mjs (Contours administratifs Etalab).
   ============================================================ */
(function () {
"use strict";

let readyPromise = null;
let communeFeatures = [];
let communeIndex = [];
const cache = new Map();

function bboxOfGeometry(geometry) {
  const out = [Infinity, Infinity, -Infinity, -Infinity];
  function walk(v) {
    if (!Array.isArray(v)) return;
    if (v.length >= 2 && typeof v[0] === "number" && typeof v[1] === "number") {
      if (v[0] < out[0]) out[0] = v[0];
      if (v[1] < out[1]) out[1] = v[1];
      if (v[0] > out[2]) out[2] = v[0];
      if (v[1] > out[3]) out[3] = v[1];
      return;
    }
    for (let i = 0; i < v.length; i++) walk(v[i]);
  }
  if (geometry && geometry.coordinates) walk(geometry.coordinates);
  return out;
}

function pointInRing(point, ring) {
  const x = point[0], y = point[1];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-15) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point, rings) {
  if (!rings || !rings.length) return false;
  if (!pointInRing(point, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(point, rings[i])) return false;
  }
  return true;
}

function pointInFeature(lon, lat, feature) {
  const g = feature && feature.geometry;
  if (!g) return false;
  const p = [lon, lat];
  if (g.type === "Polygon") return pointInPolygon(p, g.coordinates);
  if (g.type === "MultiPolygon") {
    for (let i = 0; i < g.coordinates.length; i++) {
      if (pointInPolygon(p, g.coordinates[i])) return true;
    }
  }
  return false;
}

function bboxContains(b, lon, lat) {
  return lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3];
}

function communeInfo(feature) {
  const p = feature.properties || {};
  return {
    code: p.code || p.commune || p.INSEE_COM || p.insee || null,
    name: p.nom || p.name || p.NOM || p.nom_comm || "Commune inconnue"
  };
}

function load() {
  if (readyPromise) return readyPromise;
  readyPromise = fetch("./data/communes.geojson", { cache: "force-cache" })
    .then(function (r) {
      if (!r.ok) throw new Error("Impossible de charger data/communes.geojson (HTTP " + r.status + ")");
      return r.json();
    })
    .then(function (fc) {
      communeFeatures = (fc && Array.isArray(fc.features)) ? fc.features : [];
      communeIndex = [];
      for (let i = 0; i < communeFeatures.length; i++) {
        const feature = communeFeatures[i];
        const bbox = bboxOfGeometry(feature.geometry);
        if (bbox[0] !== Infinity) communeIndex.push({ feature: feature, bbox: bbox });
      }
      window.__COMMUNES_READY__ = true;
      return communeFeatures.length;
    })
    .catch(function (e) {
      console.warn("[CommuneResolver]", e);
      window.__COMMUNES_READY__ = false;
      return 0;
    });
  return readyPromise;
}

function findAt(lon, lat) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  for (let i = 0; i < communeIndex.length; i++) {
    const item = communeIndex[i];
    if (!bboxContains(item.bbox, lon, lat)) continue;
    if (pointInFeature(lon, lat, item.feature)) return communeInfo(item.feature);
  }
  return null;
}

function candidatePointsForGeometry(geometry) {
  const pts = [];
  if (!geometry) return pts;
  function walk(v) {
    if (!Array.isArray(v)) return;
    if (v.length >= 2 && typeof v[0] === "number" && typeof v[1] === "number") {
      pts.push([v[0], v[1]]);
      return;
    }
    for (let i = 0; i < v.length; i++) walk(v[i]);
  }
  walk(geometry.coordinates);
  return pts;
}

function resolveGeometry(geometry, maxSamples) {
  const pts = candidatePointsForGeometry(geometry);
  if (!pts.length) return [];
  const samples = [];
  const limit = maxSamples || 25;
  if (pts.length <= limit) {
    for (let i = 0; i < pts.length; i++) samples.push(pts[i]);
  } else {
    for (let i = 0; i < limit; i++) {
      const idx = Math.round(i * (pts.length - 1) / (limit - 1));
      samples.push(pts[idx]);
    }
  }
  const mid = pts[Math.floor(pts.length / 2)];
  if (mid) samples.push(mid);

  const byCode = Object.create(null);
  for (let i = 0; i < samples.length; i++) {
    const c = findAt(samples[i][0], samples[i][1]);
    if (c) byCode[c.code || c.name] = c;
  }
  return Object.keys(byCode).map(function (k) { return byCode[k]; });
}

// Resolution avec cache par identifiant d'objet stable (evite de recalculer
// la meme geometrie a chaque ouverture de fiche).
function resolveForFeature(cacheKey, lon, lat, geometry) {
  if (cacheKey && cache.has(cacheKey)) return cache.get(cacheKey);
  let result;
  if (geometry && (geometry.type === "LineString" || geometry.type === "MultiLineString" || geometry.type === "Polygon" || geometry.type === "MultiPolygon")) {
    result = resolveGeometry(geometry, 25);
  } else if (Number.isFinite(lon) && Number.isFinite(lat)) {
    const c = findAt(lon, lat);
    result = c ? [c] : [];
  } else {
    result = [];
  }
  if (cacheKey) cache.set(cacheKey, result);
  return result;
}

function formatCommunes(list) {
  if (!list || !list.length) return "Localisation indisponible";
  return list.map(function (c) { return c.name; }).join(" \u00b7 ");
}

window.CommuneResolver = {
  ready: load,
  isReady: function () { return window.__COMMUNES_READY__ === true; },
  findAt: findAt,
  resolveGeometry: resolveGeometry,
  resolveForFeature: resolveForFeature,
  format: formatCommunes,
  count: function () { return communeFeatures.length; }
};

})();
