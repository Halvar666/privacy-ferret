/*
 * CNAME uncloaking helper for XUL/SDK Privacy Ferret.
 *
 * Loads data/cname_domains.json into memory on-demand.
 */
"use strict";

const self = require("sdk/self");

let _map = null;

function _ensure() {
  if (_map) return _map;
  try {
    _map = JSON.parse(self.data.load("cname_domains.json"));
  } catch (e) {
    console.log("Failed to load cname_domains.json:", e);
    _map = {};
  }
  return _map;
}

/**
 * Resolve a host via the static CNAME mapping dataset.
 * @param {String} host
 * @returns {String} resolved host (or original)
 */
function resolveHost(host) {
  if (!host) return host;
  const map = _ensure();
  return map[host] || host;
}

exports.resolveHost = resolveHost;
