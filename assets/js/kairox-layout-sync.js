(function () {
  "use strict";

  const settings = window.KairoxSettings || {};

  function prefix() {
    const path = (window.location && window.location.pathname ? window.location.pathname : "").replace(/\\/g, "/");
    const parts = path.split("/").filter(Boolean);
    const oneLevelFolders = ["industries", "blog", "case-studies"];

    // Works for /case-studies/example.html, /case-studies/example/,
    // /blog/example.html and /industries/example.html.
    if (parts.length >= 2 && oneLevelFolders.includes(parts[parts.length - 2])) return "../";

    // Also catch direct folder URLs where the browser resolves relative links from that folder.
    if (parts.length === 1 && oneLevelFolders.includes(parts[0])) return "../";

    // When a local file is opened from the root folder, do not count computer folder segments.
    return "";
  }

  function cleanLocalPath(path) {
    let clean = String(path || "").split(String.fromCharCode(92)).join("/");
    if (/^(https?:|data:|mailto:|tel:|#|javascript:|blob:)/i.test(clean) || clean.startsWith("//")) return clean;
    if (clean.toLowerCase().indexOf("file:") === 0) clean = clean.slice(5);
    clean = clean.replace(/^\/+/, "");
    if (clean.length > 2 && clean.charAt(1) === ":") clean = clean.slice(2).replace(/^\/+/, "");
    return clean.replace(/^(\.\.\/)+/, "").replace(/^\.\//, "").replace(/^\/+/, "");
  }

  function toRootPath(path) {
    if (!path) return "";
    if (/^(https?:|data:|mailto:|tel:|#|javascript:|blob:)/i.test(path)) return path;
    if (String(path).startsWith("//")) return path;
    return prefix() + cleanLocalPath(path);
  }


  function toAsset(path) {
    if (!path) return "";
    if (/^(https?:|data:|mailto:|tel:)/i.test(path)) return path;
    return prefix() + cleanLocalPath(path);
  }

  function normalizeHref(href) {
    if (!href) return "";
    if (/^(https?:|mailto:|tel:|#|javascript:)/i.test(href)) return href;
    return prefix() + cleanLocalPath(href);
  }


  function needsRootPrefix(href) {
    if (!href) return false;
    const value = String(href);
    if (/^(https?:|mailto:|tel:|#|javascript:|data:|blob:)/i.test(value) || value.startsWith("//") || value.startsWith("../") || value.startsWith("./")) return false;
    const clean = cleanLocalPath(value);
    return /^(index|about|ai-automation-uae-guide|ai-employees|blog|case-studies|contact|industries|pricing|sales-presentations|solutions|trainings)\.html(?:[?#].*)?$/i.test(clean)
      || /^(industries|blog|case-studies)\//i.test(clean);
  }

  function fixSubfolderLinks() {
    const pre = prefix();
    if (!pre) return;
    document.querySelectorAll("a[href]").forEach((a) => {
      const href = a.getAttribute("href") || "";
      if (needsRootPrefix(href)) a.setAttribute("href", pre + cleanLocalPath(href));
    });
  }

  function installSubfolderLinkGuard() {
    if (window.__KairoxSubfolderLinkGuardV94) return;
    window.__KairoxSubfolderLinkGuardV94 = true;
    document.addEventListener("click", (event) => {
      const a = event.target && event.target.closest ? event.target.closest("a[href]") : null;
      if (!a) return;
      const pre = prefix();
      if (!pre) return;
      const href = a.getAttribute("href") || "";
      if (needsRootPrefix(href)) a.setAttribute("href", pre + cleanLocalPath(href));
    }, true);
  }


  function setActiveNav() {
    const current = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
    document.querySelectorAll(".navbar .nav-link").forEach((link) => {
      const href = (link.getAttribute("href") || "").split("#")[0].split("?")[0].split("/").pop().toLowerCase() || "index.html";
      link.classList.toggle("active", href === current);
    });
  }


  function renderSolutionNavigation() {
    const s = window.KairoxSettings || {};
    const links = s.navigation && Array.isArray(s.navigation.solutions) ? s.navigation.solutions : [];
    if (!links.length) return;

    document.querySelectorAll(".navbar-nav").forEach((navList) => {
      const oldSolutions = Array.from(navList.children).find((li) => {
        const a = li.querySelector("a.nav-link");
        return a && /solutions\.html/i.test(a.getAttribute("href") || "") && !li.classList.contains("kx-solutions-menu");
      });

      if (!oldSolutions) return;

      const item = document.createElement("li");
      item.className = "nav-item dropdown kx-solutions-menu";
      item.innerHTML = `
        <a aria-expanded="false" class="nav-link dropdown-toggle" data-bs-toggle="dropdown" href="${normalizeHref("solutions.html")}" role="button">Solutions</a>
        <ul class="dropdown-menu dropdown-menu-xl-end"></ul>
      `;

      const menu = item.querySelector(".dropdown-menu");
      links.forEach((link) => {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.className = "dropdown-item";
        a.href = normalizeHref(link.href);
        a.textContent = link.label;
        li.appendChild(a);
        menu.appendChild(li);
      });

      oldSolutions.replaceWith(item);
    });
  }

  function renderFooterSolutions() {
    const s = window.KairoxSettings || {};
    const links = s.navigation && Array.isArray(s.navigation.footerSolutions) ? s.navigation.footerSolutions : [];
    if (!links.length) return;

    document.querySelectorAll("footer h6").forEach((heading) => {
      if ((heading.textContent || "").trim().toLowerCase() !== "solutions") return;
      const col = heading.parentElement;
      if (!col) return;

      Array.from(col.querySelectorAll("a")).forEach((a) => a.remove());

      links.forEach((link) => {
        const a = document.createElement("a");
        a.href = normalizeHref(link.href);
        a.textContent = link.label;
        col.appendChild(a);
      });
    });
  }

  function syncLayoutSettings() {
    const s = window.KairoxSettings || {};
    const contact = s.contact || {};
    const brand = s.brand || {};
    const footer = s.footer || {};

    renderSolutionNavigation();
    renderFooterSolutions();
    fixSubfolderLinks();
    installSubfolderLinkGuard();

    document.querySelectorAll("nav .navbar-brand img").forEach((img) => {
      img.src = toAsset(brand.logoMark || "/assets/img/kairox-mark.svg");
      img.alt = brand.company || "Kairox FZC LLC";
    });

    document.querySelectorAll("footer img.footer-logo").forEach((img) => {
      img.src = toAsset(brand.logoLight || "/assets/img/kairox-logo-light.svg");
      img.alt = brand.company || "Kairox logo";
    });

    document.querySelectorAll('a[href*="wa.me/"]').forEach((a) => {
      if (contact.whatsappHref) a.href = contact.whatsappHref;
    });

    document.querySelectorAll('a[href^="mailto:"]').forEach((a) => {
      if (contact.email) a.href = "mailto:" + contact.email;
    });

    const footerIntro = document.querySelector("footer .col-lg-4 p");
    if (footerIntro && footer.description) footerIntro.textContent = footer.description;

    const footerSpans = document.querySelectorAll("footer .small span");
    if (footerSpans[0] && footer.copyright) footerSpans[0].textContent = footer.copyright;
    if (footerSpans[1] && footer.tagline) footerSpans[1].textContent = footer.tagline;

    document.querySelectorAll("footer a[href], nav a[href]").forEach((a) => {
      const raw = a.getAttribute("href");
      if (!raw || /^(https?:|mailto:|tel:|#|javascript:)/i.test(raw)) return;
      a.setAttribute("href", normalizeHref(raw));
    });

    setActiveNav();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", syncLayoutSettings, { once: true });
  } else {
    syncLayoutSettings();
  }
})();
