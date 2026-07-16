(function(){
  "use strict";
  var done = false;
  function loadIcons(){
    if(done) return;
    done = true;
    if(document.querySelector("link[href*='bootstrap-icons.css']")) return;
    var l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css";
    document.head.appendChild(l);
  }
  window.KairoxLoadIcons = loadIcons;
  ["pointerdown","keydown","touchstart","scroll"].forEach(function(evt){
    window.addEventListener(evt, loadIcons, {once:true, passive:true});
  });
})();
