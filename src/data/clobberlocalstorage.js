/*
 * Runs in page context (loaded via subScriptLoader into the frame document).
 * Best-effort clobber of localStorage/sessionStorage in cookieblocked 3rd-party frames.
 */
(function () {
  function makeDummyStorage() {
    let store = Object.create(null);
    return {
      getItem: function (k) { return store.hasOwnProperty(k) ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); },
      removeItem: function (k) { delete store[k]; },
      clear: function () { store = Object.create(null); },
      key: function (i) { return Object.keys(store)[i] || null; },
      get length() { return Object.keys(store).length; }
    };
  }

  try {
    let dummy = makeDummyStorage();
    try { Object.defineProperty(window, "localStorage", { get: function () { return dummy; }, configurable: true }); } catch (e) {}
    try { Object.defineProperty(window, "sessionStorage", { get: function () { return dummy; }, configurable: true }); } catch (e) {}

    // Try to neuter Storage prototype too (best effort).
    try {
      if (window.Storage && window.Storage.prototype) {
        ["getItem","setItem","removeItem","clear","key"].forEach(function (m) {
          try { window.Storage.prototype[m] = dummy[m]; } catch (e) {}
        });
      }
    } catch (e) {}
  } catch (e) {}
}());
