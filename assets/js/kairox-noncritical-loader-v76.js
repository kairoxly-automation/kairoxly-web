(function () {
  "use strict";

  var loaded = false;

  function prefix() {
    var script = document.currentScript;
    if (script && script.getAttribute("src")) {
      var src = script.getAttribute("src");
      var idx = src.indexOf("assets/js/");
      if (idx >= 0) return src.slice(0, idx);
    }
    var probe = document.querySelector("script[src*='kairox-noncritical-loader-v76.js']");
    if (probe) {
      var src2 = probe.getAttribute("src") || "";
      var idx2 = src2.indexOf("assets/js/");
      if (idx2 >= 0) return src2.slice(0, idx2);
    }
    return "";
  }

  function loadStylesheet(href) {
    if (document.querySelector("link[href*='" + href.split("?")[0].split("/").pop() + "']")) return;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

  function loadScript(src) {
    if (document.querySelector("script[src*='" + src.split("?")[0].split("/").pop() + "']")) return;
    var s = document.createElement("script");
    s.src = src;
    s.defer = true;
    document.body.appendChild(s);
  }

  function loadNonCritical() {
    if (loaded) return;
    loaded = true;

    var root = prefix();
    loadStylesheet(root + "assets/css/kairox-chat-ribbon-v76.min.css?v=kx-pagespeed-v76");
    loadScript(root + "assets/js/chatbot.js?v=kx-pagespeed-v76");
  }

  window.KairoxLoadChat = loadNonCritical;

  ["pointerdown", "mousemove", "keydown", "touchstart", "scroll"].forEach(function (eventName) {
    window.addEventListener(eventName, loadNonCritical, { once: true, passive: true });
  });

  window.addEventListener("load", function () {
    if ("requestIdleCallback" in window) {
      requestIdleCallback(loadNonCritical, { timeout: 2500 });
    } else {
      setTimeout(loadNonCritical, 1400);
    }
  }, { once: true });
})();
