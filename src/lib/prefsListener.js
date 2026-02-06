/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { on, off } = require('sdk/event/core');
const prefsService = require("sdk/preferences/service");
const { PrefsTarget } = require("sdk/preferences/event-target");
const { pbPanel } = require("./ui");
const main = require("./main");
const utils = require("./utils");
const heuristicBlocker = require("./heuristicBlocker");
const userStorage = require("./userStorage");
const events = require("sdk/system/events");

/*
 * Listen for Firefox pref changes that affect the operation of Privacy Ferret.
 * At the moment, relevant prefs are:
 *
 *   * network.cookie.cookieBehavior
 *     * 0 = enable all cookies (default)
 *     * 1 = reject all third party cookies
 *     * 2 = disable all cookies
 *     * 3 = reject third party cookies unless at least one is already set for the eTLD+1
 *   * network.cookie.lifetimePolicy
 *     * 0 = keep until they expire (default)
 *     * 1 = ask every time
 *     * 2 = until I close Firefox
 *     * 3 = cookie lasts for number of days specified by network.cookie.lifetime.days
 *  * privacy.donottrackheader.enabled
 *    * true = set dnt header
 *    * false = don't set dnt header (default)
 *  * privacy.donottrackheader.value
 *    * 1 = standard value (default)
 *    * otherwise, see https://bugzilla.mozilla.org/show_bug.cgi?id=765398#c24
 *
 */

const cookiePrefsBranch = "network.cookie.";
const cookiePrefsTarget = PrefsTarget({ branchName: cookiePrefsBranch });
const cookieBehaviorPref = "cookieBehavior";
const cookieLifetimePref = "lifetimePolicy";

const dntEnabledPref = "privacy.donottrackheader.enabled";
const dntValuePref = "privacy.donottrackheader.value";

// Firefox/Goanna prefs we may optionally control
const gpcEnabledPref = "privacy.globalprivacycontrol.enabled";
const sendPingsPref = "browser.send_pings";
const prefetchNextPref = "network.prefetch-next";
const dnsDisablePrefetchPref = "network.dns.disablePrefetch";

let storedPrefetchDefaults = false;
let storedSendPingsDefault = false;

let prefBlocksCookies;
let prefDeletesCookies;

let checkCookiePrefs = function(prefName) {
  // Get new pref value
  let pref = prefsService.get(cookiePrefsBranch + prefName);
  switch(prefName) {
    case cookieBehaviorPref:
      prefBlocksCookies = pref !== 0;
      if (prefBlocksCookies) {
        events.on("http-on-examine-response", main.onExamineResponse, false);
      } else {
        events.off("http-on-examine-response", main.onExamineResponse, false);
      }
      break;
    case cookieLifetimePref:
      prefDeletesCookies = pref === 2;
      if (pref === 1 || pref === 3) {
        pbPanel && pbPanel.port.emit("cookiePrefsChange", true);
      } else {
        pbPanel && pbPanel.port.emit("cookiePrefsChange", false);
      }
      if (prefDeletesCookies) {
        // When PB clobbers/allows cookies for a domain, that domain becomes an
        // exception to the default lifetimePolicy. For now, assume user wants
        // to delete these cookies when browser is closed if their
        // cookieLifeTimePref is set to 2.
        // TODO: Do something similarly appropriate if pref is 1 or 3
        events.on("quit-application-granted", main.onQuitApplicationGranted, false);
      } else {
        events.off("quit-application-granted", main.onQuitApplicationGranted, false);
      }
      break;
  }
};

let checkDntPrefs = function(prefName) {
  // Only enforce DNT/GPC if the user opted in via PB settings
  if (!prefs.prefs.sendSignals) {
    return;
  }

  let pref = prefsService.get(prefName);
  switch(prefName) {
    case dntEnabledPref:
      // remember the original pref
      prefs.prefs.doNotTrackDefaultEnabled = pref;
      prefsService.set(dntEnabledPref, true);
      break;
    case dntValuePref:
      prefsService.set(dntValuePref, 1);
      break;
  }
};

function checkGpcPref() {
  if (!prefs.prefs.sendSignals) {
    return;
  }
  // Some platforms (incl. Pale Moon) may not implement this pref.
  try {
    let current = prefsService.get(gpcEnabledPref);
    // store the original value for restoration (this is a hidden PB pref)
    prefs.prefs.globalPrivacyControlDefaultEnabled = current;
    prefsService.set(gpcEnabledPref, true);
  } catch (e) {
    // ignore if pref is unsupported
  }
}

function resetGpcPref() {
  try {
    let oldPref = prefs.prefs.globalPrivacyControlDefaultEnabled;
    prefsService.set(gpcEnabledPref, oldPref);
  } catch (e) {
    // ignore
  }
}

function applyPrefetchPrefs() {
  try {
    // Remember defaults once per session
    if (!storedPrefetchDefaults) {
      prefs.prefs.prefetchNextDefault = prefsService.get(prefetchNextPref);
      prefs.prefs.dnsPrefetchDefault = prefsService.get(dnsDisablePrefetchPref);
      storedPrefetchDefaults = true;
    }

    if (prefs.prefs.disablePrefetching) {
      prefsService.set(prefetchNextPref, false);
      prefsService.set(dnsDisablePrefetchPref, true);
    } else {
      prefsService.set(prefetchNextPref, prefs.prefs.prefetchNextDefault);
      prefsService.set(dnsDisablePrefetchPref, prefs.prefs.dnsPrefetchDefault);
    }
  } catch (e) {
    // ignore unsupported prefs
  }
}

function applyHyperlinkAuditingPrefs() {
  try {
    if (!storedSendPingsDefault) {
      prefs.prefs.sendPingsDefault = prefsService.get(sendPingsPref);
      storedSendPingsDefault = true;
    }
    if (prefs.prefs.preventHyperlinkAuditing) {
      prefsService.set(sendPingsPref, false);
    } else {
      prefsService.set(sendPingsPref, prefs.prefs.sendPingsDefault);
    }
  } catch (e) {
    // ignore
  }
}

function applySignalsPrefs() {
  if (prefs.prefs.sendSignals) {
    checkDntPrefs(dntEnabledPref);
    checkDntPrefs(dntValuePref);
    checkGpcPref();
  } else {
    // restore DNT and GPC to previous values
    resetDntPrefs(dntEnabledPref);
    resetDntPrefs(dntValuePref);
    resetGpcPref();
  }
}

let resetDntPrefs = function(prefName) {
  let pref = prefsService.get(prefName);
  let oldPref;
  switch(prefName) {
    case dntEnabledPref:
      oldPref = prefs.prefs.doNotTrackDefaultEnabled;
      prefsService.set(dntEnabledPref, oldPref);
      break;
    case dntValuePref:
      oldPref = prefs.prefs.doNotTrackDefaultValue;
      prefsService.set(dntValuePref, oldPref);
      break;
  }
};

function initCookiePrefListener() {
  // Register listener for pref changes on startup.
  //
  // "" tells the EventTarget to respond to all changes on the cookie prefs
  // branch. This could be useful if we want to monitor other cookie-related
  // prefs in the future.
  on(cookiePrefsTarget, "", checkCookiePrefs);
  // Do initial check for the relevant pref values at startup
  checkCookiePrefs(cookieBehaviorPref);
  checkCookiePrefs(cookieLifetimePref);
  // Apply PB-controlled browser prefs
  applySignalsPrefs();
  applyPrefetchPrefs();
  applyHyperlinkAuditingPrefs();
}

function cleanupCookiePrefListener() {
  off(cookiePrefsTarget, "", checkCookiePrefs);
  events.off("http-on-examine-response", main.onExamineResponse, false);
  events.off("quit-application-granted", main.onQuitApplicationGranted, false);
  // restore any browser prefs we may have changed
  resetDntPrefs(dntEnabledPref);
  resetDntPrefs(dntValuePref);
  resetGpcPref();
  try {
    if (storedPrefetchDefaults) {
      prefsService.set(prefetchNextPref, prefs.prefs.prefetchNextDefault);
      prefsService.set(dnsDisablePrefetchPref, prefs.prefs.dnsPrefetchDefault);
    }
    if (storedSendPingsDefault) {
      prefsService.set(sendPingsPref, prefs.prefs.sendPingsDefault);
    }
  } catch (e) {
    // ignore
  }
}

/*
 * Listeners for Privacy Ferret's own pref changes.
 * Controls settings accessible via the PB panel.
 */

const prefs = require("sdk/simple-prefs");

// To be used if we ever add an option to disable heuristic blocker
function heuristicToggle() {
  if (prefs.prefs.heuristicEnabled) {
    heuristicBlocker.init();
    userStorage.init();
    userStorage.sync();
    return;
  }
  let nb = utils.getMostRecentWindow().gBrowser.getNotificationBox();
  nb.appendNotification("WARNING: This feature is not fully supported yet and will probably cause unexpected behavior!",
                        "notify-id", require("sdk/self").data.url("icons/badger-32.png"),
                         nb.PRIORITY_CRITICAL_HIGH);

}
let initHeuristicEnabledPrefListener = function() {
  prefs.on("heuristicEnabled", heuristicToggle);
  prefs.on("sendSignals", applySignalsPrefs);
  prefs.on("disablePrefetching", applyPrefetchPrefs);
  prefs.on("preventHyperlinkAuditing", applyHyperlinkAuditingPrefs);
};
let cleanupHeuristicEnabledPrefListener = function() {
  prefs.removeListener("heuristicEnabled", heuristicToggle);
  prefs.removeListener("sendSignals", applySignalsPrefs);
  prefs.removeListener("disablePrefetching", applyPrefetchPrefs);
  prefs.removeListener("preventHyperlinkAuditing", applyHyperlinkAuditingPrefs);
};

// Events to be fired on global enable/disable from within main
exports.init = function() {
  initCookiePrefListener();
  initHeuristicEnabledPrefListener();
};
exports.cleanup = function() {
  cleanupCookiePrefListener();
  cleanupHeuristicEnabledPrefListener();
};
