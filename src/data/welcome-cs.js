
(function () {
  function onReady(fn){
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  onReady(function(){
    var closeBtn = document.getElementById("close");
    var setupBtn = document.getElementById("setup");

    if (closeBtn) {
      closeBtn.addEventListener("click", function(){
        try { self.port.emit("pf-close-tab"); } catch (e) {}
      });
    }

    if (setupBtn) {
      setupBtn.addEventListener("click", function(){
        try { self.port.emit("pf-open-options"); } catch (e) {}
      });
    }
  });
})();
