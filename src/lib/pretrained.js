/*
 * This file is part of Privacy Ferret <https://www.eff.org/privacybadger>
 *
 * Loads modern datasets (seed.json + pbconfig.json) into memory.
 * We intentionally avoid sdk/simple-storage due to quota/size limitations.
 */

"use strict";

const self = require("sdk/self");

let _seed = null;
let _pbconfig = null;
let _yellowSet = null;

function _loadJson(dataPath) {
  try {
    return JSON.parse(self.data.load(dataPath));
  } catch (e) {
    console.log("Failed to load JSON:", dataPath, e);
    return null;
  }
}

function _ensureSeed() {
  if (_seed) return _seed;
  _seed = _loadJson("seed.json") || { action_map: {} };
  return _seed;
}

function _ensurePbconfig() {
  if (_pbconfig) return _pbconfig;
  _pbconfig = _loadJson("pbconfig.json") || { yellowlist: [] };
  _yellowSet = null;
  return _pbconfig;
}

/**
 * Returns heuristic action for a base domain from seed.json.
 * @param {String} baseDomain
 * @returns {String|null} One of: "block", "cookieblock", "allow", "noaction", or null.
 */
function getSeedAction(baseDomain) {
  if (!baseDomain) return null;
  const seed = _ensureSeed();
  const entry = seed.action_map && seed.action_map[baseDomain];
  if (!entry) return null;
  return entry.heuristicAction || null;
}

/**
 * Returns true if host appears in pbconfig yellowlist.
 * Yellowlist is used to downgrade block -> cookieblock and reduce breakage.
 * @param {String} host
 */
function isYellowlistedHost(host) {
  if (!host) return false;
  _ensurePbconfig();
  if (!_yellowSet) {
    _yellowSet = new Set((_pbconfig && _pbconfig.yellowlist) || []);
  }
  return _yellowSet.has(host);
}

exports.getSeedAction = getSeedAction;
exports.isYellowlistedHost = isYellowlistedHost;
