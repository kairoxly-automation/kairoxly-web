(function(){
"use strict";
var loaded=false;
function prefix(){var s=document.currentScript||document.querySelector("script[src*='kairox-noncritical-loader-v78.js']");if(s){var src=s.getAttribute("src")||"";var i=src.indexOf("assets/js/");if(i>=0)return src.slice(0,i)}return""}
function loadCSS(h,m){m=m||h.split("?")[0].split("/").pop();if(document.querySelector("link[data-kx-lazy='"+m+"'],link[href*='"+m+"']"))return;var l=document.createElement("link");l.rel="stylesheet";l.href=h;l.setAttribute("data-kx-lazy",m);document.head.appendChild(l)}
function loadJS(s,m){m=m||s.split("?")[0].split("/").pop();if(document.querySelector("script[data-kx-lazy='"+m+"'],script[src*='"+m+"']"))return;var e=document.createElement("script");e.src=s;e.defer=true;e.setAttribute("data-kx-lazy",m);document.body.appendChild(e)}
function loadNonCritical(){if(loaded)return;loaded=true;var r=prefix();loadCSS("https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css","bootstrap-icons.css");loadCSS(r+"assets/css/kairox-chat-ribbon-v76.min.css?v=kx-pagespeed-v78","kairox-chat-ribbon-v76.min.css");loadJS(r+"assets/js/chatbot.js?v=kx-pagespeed-v78","chatbot.js")}
window.KairoxLoadChat=loadNonCritical;
["pointerdown","keydown","touchstart","scroll"].forEach(function(n){window.addEventListener(n,loadNonCritical,{once:true,passive:true})});
})();
