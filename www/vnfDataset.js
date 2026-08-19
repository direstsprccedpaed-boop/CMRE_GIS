/* ============================================================
   VNFDataset — profils officiels VNF (Kit cartographique 2018,
   edition Nord-Est et Rhin, mise a jour novembre 2018).
   Donnees attendues : ./data/VNF_NordEst_Rhin_dataset.json
   Module 100% optionnel : si absent, l'app continue de fonctionner
   normalement (aucune section supplementaire n'est affichee).
   ============================================================ */
(function () {
"use strict";

let readyPromise = null;
let dataset = null;

function norm(s) {
  return (s || "").toString().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
}

function load() {
  if (readyPromise) return readyPromise;
  readyPromise = fetch("./data/VNF_NordEst_Rhin_dataset.json", { cache: "force-cache" })
    .then(function (r) {
      if (!r.ok) throw new Error("Impossible de charger VNF_NordEst_Rhin_dataset.json (HTTP " + r.status + ")");
      return r.json();
    })
    .then(function (json) {
      dataset = json;
      window.__VNFDATASET_READY__ = true;
      return true;
    })
    .catch(function (e) {
      console.warn("[VNFDataset]", e);
      window.__VNFDATASET_READY__ = false;
      return false;
    });
  return readyPromise;
}

function isReady() { return window.__VNFDATASET_READY__ === true; }

// Table des dimensions par classe CEMT (independante des noms de voie).
function cemtProfile(classValue) {
  if (!dataset || !classValue) return null;
  const target = String(classValue).trim().toUpperCase().replace("*", "");
  const list = dataset.cemt_profiles || [];
  for (let i = 0; i < list.length; i++) {
    const c = String(list[i].class || "").toUpperCase().replace("*", "");
    if (c === target) return list[i];
  }
  return null;
}

// Recherche un profil de route officiel dont les toponymes (extremites)
// correspondent aux communes resolues pour un bief/segment donne.
// communeNames : tableau de noms de communes (deja normalises via CommuneResolver).
function routeProfileForCommunes(communeNames) {
  if (!dataset || !communeNames || !communeNames.length) return null;
  const normCommunes = communeNames.map(norm);
  const profiles = dataset.validated_route_profiles || [];
  let best = null, bestScore = 0;
  for (let i = 0; i < profiles.length; i++) {
    const p = profiles[i];
    const tokens = String(p.name || "").split(/[-\/]/).map(norm).filter(Boolean);
    let score = 0;
    for (let t = 0; t < tokens.length; t++) {
      for (let c = 0; c < normCommunes.length; c++) {
        if (tokens[t] && normCommunes[c] && (tokens[t].indexOf(normCommunes[c]) !== -1 || normCommunes[c].indexOf(tokens[t]) !== -1)) {
          score++;
        }
      }
    }
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return bestScore > 0 ? best : null;
}

// Recherche un port de commerce officiel dont le nom correspond (substring)
// au nom OSM d'un quai/port deja affiche sur la carte.
function portInfoForName(name) {
  if (!dataset || !name) return null;
  const target = norm(name);
  const ports = dataset.public_commercial_ports || [];
  for (let i = 0; i < ports.length; i++) {
    const pname = norm(ports[i].name);
    if (pname.indexOf(target) !== -1 || target.indexOf(pname) !== -1) return ports[i];
    // Correspondance partielle sur le nom de commune (ex: "Frouard", "Metz").
    const targetTokens = target.split(" ");
    for (let t = 0; t < targetTokens.length; t++) {
      if (targetTokens[t].length > 3 && pname.indexOf(targetTokens[t]) !== -1) return ports[i];
    }
  }
  return null;
}

window.VNFDataset = {
  ready: load,
  isReady: isReady,
  cemtProfile: cemtProfile,
  routeProfileForCommunes: routeProfileForCommunes,
  portInfoForName: portInfoForName,
  raw: function () { return dataset; }
};

})();
