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
    var probe = document.querySelector("script[src*='kairox-noncritical-loader-v77.js']");
    if (probe) {
      var src2 = probe.getAttribute("src") || "";
      var idx2 = src2.indexOf("assets/js/");
      if (idx2 >= 0) return src2.slice(0, idx2);
    }
    return "";
  }

  function loadStylesheet(href, marker) {
    marker = marker || href.split("?")[0].split("/").pop();
    if (document.querySelector("link[data-kx-lazy='" + marker + "'],link[href*='" + marker + "']")) return;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.setAttribute("data-kx-lazy", marker);
    document.head.appendChild(link);
  }

  function loadScript(src, marker) {
    marker = marker || src.split("?")[0].split("/").pop();
    if (document.querySelector("script[data-kx-lazy='" + marker + "'],script[src*='" + marker + "']")) return;
    var s = document.createElement("script");
    s.src = src;
    s.defer = true;
    s.setAttribute("data-kx-lazy", marker);
    document.body.appendChild(s);
  }

  function loadNonCritical() {
    if (loaded) return;
    loaded = true;

    var root = prefix();

    loadStylesheet("https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css", "bootstrap-icons.css");

    loadStylesheet(root + "assets/css/kairox-chat-ribbon-v76.min.css?v=kx-pagespeed-v77", "kairox-chat-ribbon-v76.min.css");
    loadScript(root + "assets/js/chatbot.js?v=kx-pagespeed-v77", "chatbot.js");
  }

  window.KairoxLoadChat = loadNonCritical;

  ["pointerdown", "mousemove", "keydown", "touchstart", "scroll"].forEach(function (eventName) {
    window.addEventListener(eventName, loadNonCritical, { once: true, passive: true });
  });

  window.addEventListener("load", function () {
    if ("requestIdleCallback" in window) {
      requestIdleCallback(loadNonCritical, { timeout: 3500 });
    } else {
      setTimeout(loadNonCritical, 1800);
    }
  }, { once: true });
})();
