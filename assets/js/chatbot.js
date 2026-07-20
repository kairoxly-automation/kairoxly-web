(function () {
  "use strict";

  console.log("[Kairox] chatbot loaded: v98 visual-safe-direct-chat");

  const defaults = {
    brand: "Kairox AI Assistant",
    webhook: "https://workflows-n8nrunnerpostgresollama-cc30a1-187-127-191-113.sslip.io/webhook/leads",
    retellWebCallEndpoint: "https://workflows-n8nrunnerpostgresollama-cc30a1-187-127-191-113.sslip.io/webhook/retell_DV",
    retellAgentId: "agent_5ec6dc37c1772b2f9adc74074b",
    retellAgentVersion: "28",
    retellSdkUrl: "https://esm.sh/retell-client-js-sdk@2.0.8",
    logo: "/assets/img/kairox-mark.svg"
  };

  const sharedSettings = window.KairoxSettings || {};
  const sharedChatConfig = {
    webhook: sharedSettings.webhooks && sharedSettings.webhooks.leads ? sharedSettings.webhooks.leads : defaults.webhook,
    brand: sharedSettings.brand && sharedSettings.brand.assistantName ? sharedSettings.brand.assistantName : defaults.brand,
    logo: sharedSettings.brand && sharedSettings.brand.logoMark ? sharedSettings.brand.logoMark : defaults.logo,
    retellWebCallEndpoint: sharedSettings.webhooks && sharedSettings.webhooks.retellAccessToken ? sharedSettings.webhooks.retellAccessToken : defaults.retellWebCallEndpoint,
    retellAgentId: sharedSettings.retell && sharedSettings.retell.agentId ? sharedSettings.retell.agentId : defaults.retellAgentId,
    retellAgentVersion: sharedSettings.retell && sharedSettings.retell.agentVersion ? sharedSettings.retell.agentVersion : defaults.retellAgentVersion,
    retellSdkUrl: sharedSettings.retell && sharedSettings.retell.sdkUrl ? sharedSettings.retell.sdkUrl : defaults.retellSdkUrl
  };
  const config = Object.assign({}, defaults, sharedChatConfig, window.KairoxChatConfig || {});
  // v69: force confirmed live chat webhook. This prevents any older inline/page config from overriding chat to a stale URL.
  config.webhook = "https://workflows-n8nrunnerpostgresollama-cc30a1-187-127-191-113.sslip.io/webhook/leads";
  config.logo = config.logo && config.logo.includes("kairox-logo.svg") ? "/assets/img/kairox-mark.svg" : config.logo;

  const sessionKey = "kx_session";
  const historyKey = "kx_chat_history_v55";
  localStorage.removeItem(sessionKey);
  localStorage.removeItem(historyKey);

  const sessionId = "kx_" + Math.random().toString(36).slice(2, 10) + "_" + Date.now();

  const state = {
    isRibbonVisible: false,
    isOpen: false,
    isSending: false,
    hideTimer: null,
    history: [],
    pendingAction: "chat",
    leadStep: "form",
    lead: {
      name: "",
      phone: "",
      email: "",
      company: ""
    },
    retellClient: null,
    isVoiceCallActive: false,
    isVoiceCallStarting: false,
    currentVoiceCallPromise: null
  };

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function richText(text) {
    let html = escapeHtml(text || "");
    html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\n/g, "<br>");
    html = html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    return html;
  }

  function nowTime() {
    return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date());
  }

  function isMobile() {
    return window.matchMedia && window.matchMedia("(max-width: 767.98px)").matches;
  }

  function firstName() {
    return String(state.lead.name || "").trim().split(/\s+/)[0] || "there";
  }

  function isLeadComplete() {
    return state.leadStep === "complete";
  }

  function cleanLeadValue(value) {
    return String(value || "").trim();
  }

  function extractReply(data) {
    if (!data) return "";
    if (typeof data === "string") return data.trim();

    if (Array.isArray(data)) {
      for (const item of data) {
        const found = extractReply(item);
        if (found) return found;
      }
      return "";
    }

    const directKeys = [
      "output",
      "reply",
      "message",
      "answer",
      "response",
      "text",
      "content",
      "result",
      "aiReply",
      "chatReply",
      "assistant",
      "assistantReply"
    ];

    for (const key of directKeys) {
      if (typeof data[key] === "string" && data[key].trim()) return data[key].trim();
    }

    // Common OpenAI / n8n / LangChain response shapes.
    if (data.choices && Array.isArray(data.choices)) {
      for (const choice of data.choices) {
        const found = extractReply(choice && (choice.message || choice.delta || choice.text || choice));
        if (found) return found;
      }
    }

    if (data.generations && Array.isArray(data.generations)) {
      for (const generationGroup of data.generations) {
        const found = extractReply(generationGroup);
        if (found) return found;
      }
    }

    const wrappers = ["json", "body", "data", "payload", "item", "result", "response", "message"];
    for (const wrapper of wrappers) {
      if (data[wrapper] && data[wrapper] !== data) {
        const found = extractReply(data[wrapper]);
        if (found) return found;
      }
    }

    return "";
  }

  function resetStoredChatBuffer() {
    Object.keys(localStorage).forEach((key) => {
      if (key === sessionKey || key === historyKey || key === "kairox_chat_history" || key === "kairox_chat_session_id" || key.indexOf("kx_chat_history") === 0 || key.indexOf("kx_session") === 0) {
        localStorage.removeItem(key);
      }
    });
  }

  function buildWidget() {
    resetStoredChatBuffer();
    document.querySelectorAll(".kx-floating-actions, .kx-chat-window").forEach((el) => el.remove());
    document.querySelectorAll("script#retell-widget").forEach((el) => el.remove());

    const actions = document.createElement("div");
    actions.className = "kx-floating-actions is-collapsed";
    actions.setAttribute("aria-label", "Kairox quick actions");
    actions.innerHTML = `
      <button class="kx-ribbon-toggle" type="button" aria-label="Expand quick actions" aria-expanded="false">
        <span class="kx-ribbon-toggle-inner">
          <svg class="kx-svg-icon kx-toggle-expand" viewBox="0 0 16 16" aria-hidden="true"><path d="M10.7 3.3a1 1 0 0 1 0 1.4L7.4 8l3.3 3.3a1 1 0 0 1-1.4 1.4l-4-4a1 1 0 0 1 0-1.4l4-4a1 1 0 0 1 1.4 0z"/></svg>
          <svg class="kx-svg-icon kx-toggle-collapse" viewBox="0 0 16 16" aria-hidden="true"><path d="M5.3 12.7a1 1 0 0 1 0-1.4L8.6 8 5.3 4.7a1 1 0 1 1 1.4-1.4l4 4a1 1 0 0 1 0 1.4l-4 4a1 1 0 0 1-1.4 0z"/></svg>
        </span>
      </button>
      <div class="kx-action-ribbon">
        <div class="kx-ribbon-buttons">
          <a class="kx-float-btn kx-float-call" href="#" data-kx-call="true" data-kx-retell-call="true" data-kx-require-lead-form="true" aria-label="Start voice call form">
            <span class="kx-float-icon"><svg class="kx-svg-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.65 1.05a1.45 1.45 0 0 1 1.74.28l1.36 1.36c.42.42.55 1.05.32 1.6l-.55 1.32a.9.9 0 0 0 .2.98l2.69 2.69c.26.26.65.34.98.2l1.32-.55c.55-.23 1.18-.1 1.6.32l1.36 1.36c.48.48.6 1.22.28 1.74-.74 1.2-2.08 2.18-3.58 1.74C7.56 12.95 3.05 8.44 1.91 4.63c-.44-1.5.54-2.84 1.74-3.58z"/><path d="M10.5 1a.75.75 0 0 1 .75-.75h3.5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0V2.81l-3.22 3.22a.75.75 0 0 1-1.06-1.06L12.94 1.75H11.25A.75.75 0 0 1 10.5 1z"/></svg></span>
            <span class="kx-float-label">Call</span>
          </a>
          <button class="kx-float-btn kx-float-chat" type="button" data-kx-chat="true" aria-label="Open Kairox chat assistant">
            <span class="kx-float-icon"><svg class="kx-svg-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5c-4 0-7 2.45-7 5.7 0 1.85 1 3.48 2.58 4.52l-.44 2.1a.6.6 0 0 0 .9.63l2.34-1.42c.52.1 1.06.16 1.62.16 4 0 7-2.45 7-5.7S12 1.5 8 1.5zM4.7 8.15a.95.95 0 1 1 0-1.9.95.95 0 0 1 0 1.9zm3.3 0a.95.95 0 1 1 0-1.9.95.95 0 0 1 0 1.9zm3.3 0a.95.95 0 1 1 0-1.9.95.95 0 0 1 0 1.9z"/></svg></span>
            <span class="kx-float-label">Chat</span>
          </button>
        </div>
      </div>
    `;

    const panel = document.createElement("section");
    panel.className = "kx-chat-window";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Kairox AI chat assistant");
    panel.setAttribute("aria-hidden", "true");
    panel.innerHTML = `
      <div class="kx-chat-header">
        <div class="kx-chat-brand">
          <div class="kx-chat-avatar"><img src="${escapeHtml(config.logo)}" alt=""></div>
          <div>
            <div class="kx-chat-title">${escapeHtml(config.brand)}</div>
            <div class="kx-chat-status"><span></span> Online AI advisor</div>
          </div>
        </div>
        <div class="kx-chat-tools">
          <button class="kx-chat-close" type="button" aria-label="Close chat">×</button>
        </div>
      </div>
      <div class="kx-chat-messages" aria-live="polite"></div>
      <div class="kx-chat-quick">
        <button type="button" data-kx-question="What AI automation services does Kairox offer?">Services</button>
        <button type="button" data-kx-question="How much does Kairox AI cost?">Pricing</button>
        <button type="button" data-kx-question="Can Kairox automate WhatsApp leads and customer support?">WhatsApp automation</button>
      </div>
      <form class="kx-chat-input-row">
        <input class="kx-chat-input-field" type="text" placeholder="Please complete the contact form above first" autocomplete="off" aria-label="Please complete the contact form above first" disabled>
        <button type="submit" aria-label="Send message"><svg class="kx-svg-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M15.85.15a.5.5 0 0 1 .11.54l-5.7 14.25a.5.5 0 0 1-.94-.03L6.8 8.9.79 6.68a.5.5 0 0 1-.03-.94L15.31.04a.5.5 0 0 1 .54.11z"/></svg></button>
      </form>
      <div class="kx-chat-typing-note" aria-live="polite"></div>
    `;

    document.body.appendChild(actions);
    document.body.appendChild(panel);

    const toggleButton = actions.querySelector(".kx-ribbon-toggle");
    const chatButton = actions.querySelector(".kx-float-chat");
    const callButton = actions.querySelector(".kx-float-call");
    const closeButton = panel.querySelector(".kx-chat-close");
    const messages = panel.querySelector(".kx-chat-messages");
    const form = panel.querySelector(".kx-chat-input-row");
    const input = panel.querySelector(".kx-chat-input-field");
    const typingNote = panel.querySelector(".kx-chat-typing-note");
    const quickArea = panel.querySelector(".kx-chat-quick");

    function assetPrefix() {
      const script = document.querySelector("script[src*='assets/js/chatbot.js']");
      const src = script ? (script.getAttribute("src") || "") : "";
      const idx = src.indexOf("assets/js/");
      return idx >= 0 ? src.slice(0, idx) : "";
    }


    function forcePanelPlacement() {
      panel.style.setProperty("position", "fixed", "important");
      panel.style.setProperty("right", isMobile() ? "12px" : "22px", "important");
      panel.style.setProperty("left", isMobile() ? "12px" : "auto", "important");
      panel.style.setProperty("bottom", isMobile() ? "14px" : "24px", "important");
      panel.style.setProperty("top", "auto", "important");
      panel.style.setProperty("width", isMobile() ? "auto" : "min(410px, calc(100vw - 24px))", "important");
      panel.style.setProperty("max-height", isMobile() ? "calc(100vh - 28px)" : "min(720px, calc(100vh - 48px))", "important");
      panel.style.setProperty("transform", "none", "important");
      panel.style.setProperty("z-index", "2147483000", "important");
    }

    function loadWidgetStyles() {
      if (document.querySelector("link[data-kx-widget-css='v82'], link[href*='kairox-widget-v82.min.css']")) return;
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = assetPrefix() + "assets/css/kairox-widget-v82.min.css?v=kx-mobile-lcp-v82";
      link.setAttribute("data-kx-widget-css", "v82");
      document.head.appendChild(link);
      if (window.KairoxLoadIcons) window.KairoxLoadIcons();
    }

    function applyMobileLayout() {
      if (!isMobile()) {
        actions.style.removeProperty("transform");
        actions.style.removeProperty("width");
        actions.style.removeProperty("height");
        actions.style.removeProperty("max-width");
        actions.style.removeProperty("max-height");
        actions.style.removeProperty("right");
        actions.style.removeProperty("top");
        return;
      }
    }

    function syncRibbon() {
      const expanded = !!state.isRibbonVisible;
      const actionRibbon = actions.querySelector(".kx-action-ribbon");
      const ribbonButtons = actions.querySelector(".kx-ribbon-buttons");

      actions.classList.toggle("is-expanded", expanded);
      actions.classList.toggle("is-collapsed", !expanded);
      actions.setAttribute("data-kx-ribbon-state", expanded ? "expanded" : "collapsed");
      toggleButton.setAttribute("aria-expanded", String(expanded));
      toggleButton.setAttribute("aria-label", expanded ? "Collapse quick actions" : "Expand quick actions");

      applyMobileLayout();

      // Final hard layout override. The previous build changed the arrow but the
      // ribbon body stayed misaligned; this makes the toggle and body one unit.
      actions.style.setProperty("position", "fixed", "important");
      actions.style.setProperty("top", "50%", "important");
      actions.style.setProperty("right", "0", "important");
      actions.style.setProperty("bottom", "auto", "important");
      actions.style.setProperty("width", "129px", "important");
      actions.style.setProperty("max-width", "129px", "important");
      actions.style.setProperty("height", "178px", "important");
      actions.style.setProperty("display", "flex", "important");
      actions.style.setProperty("flex-direction", "row", "important");
      actions.style.setProperty("align-items", "center", "important");
      actions.style.setProperty("justify-content", "flex-start", "important");
      actions.style.setProperty("gap", "0", "important");
      actions.style.setProperty("overflow", "visible", "important");
      actions.style.setProperty("opacity", "1", "important");
      actions.style.setProperty("visibility", "visible", "important");
      actions.style.setProperty("pointer-events", "auto", "important");
      actions.style.setProperty("z-index", "2147482500", "important");
      actions.style.setProperty("transform", expanded ? "translate(0, -50%)" : "translate(85px, -50%)", "important");

      toggleButton.style.setProperty("position", "relative", "important");
      toggleButton.style.setProperty("left", "auto", "important");
      toggleButton.style.setProperty("right", "auto", "important");
      toggleButton.style.setProperty("top", "auto", "important");
      toggleButton.style.setProperty("bottom", "auto", "important");
      toggleButton.style.setProperty("transform", "none", "important");
      toggleButton.style.setProperty("flex", "0 0 44px", "important");
      toggleButton.style.setProperty("width", "44px", "important");
      toggleButton.style.setProperty("height", "92px", "important");
      toggleButton.style.setProperty("margin", "0", "important");
      toggleButton.style.setProperty("z-index", "2147482600", "important");
      toggleButton.style.setProperty("pointer-events", "auto", "important");

      if (actionRibbon) {
        actionRibbon.style.setProperty("position", "relative", "important");
        actionRibbon.style.setProperty("display", "grid", "important");
        actionRibbon.style.setProperty("grid-template-columns", "88px", "important");
        actionRibbon.style.setProperty("align-items", "center", "important");
        actionRibbon.style.setProperty("justify-items", "center", "important");
        actionRibbon.style.setProperty("width", "88px", "important");
        actionRibbon.style.setProperty("min-width", "88px", "important");
        actionRibbon.style.setProperty("max-width", "88px", "important");
        actionRibbon.style.setProperty("min-height", "178px", "important");
        actionRibbon.style.setProperty("height", "178px", "important");
        actionRibbon.style.setProperty("margin", "0", "important");
        actionRibbon.style.setProperty("margin-left", "-3px", "important");
        actionRibbon.style.setProperty("padding", "12px 10px", "important");
        actionRibbon.style.setProperty("overflow", "visible", "important");
        actionRibbon.style.setProperty("opacity", "1", "important");
        actionRibbon.style.setProperty("visibility", "visible", "important");
        actionRibbon.style.setProperty("pointer-events", expanded ? "auto" : "none", "important");
        actionRibbon.style.setProperty("transform", "none", "important");
      }

      if (ribbonButtons) {
        ribbonButtons.style.setProperty("display", "flex", "important");
        ribbonButtons.style.setProperty("flex-direction", "column", "important");
        ribbonButtons.style.setProperty("align-items", "center", "important");
        ribbonButtons.style.setProperty("justify-content", "center", "important");
        ribbonButtons.style.setProperty("gap", "12px", "important");
        ribbonButtons.style.setProperty("width", "68px", "important");
        ribbonButtons.style.setProperty("min-width", "68px", "important");
        ribbonButtons.style.setProperty("opacity", "1", "important");
        ribbonButtons.style.setProperty("visibility", "visible", "important");
        ribbonButtons.style.setProperty("pointer-events", expanded ? "auto" : "none", "important");
      }

      [chatButton, callButton].forEach((button) => {
        if (!button) return;
        button.style.setProperty("pointer-events", expanded ? "auto" : "none", "important");
        button.style.setProperty("position", "relative", "important");
        button.style.setProperty("z-index", "3", "important");
      });
    }

    function expandRibbon(event) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      }

      state.isRibbonVisible = true;
      clearTimeout(state.hideTimer);
      syncRibbon();
    }

    function collapseRibbon(event) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      }

      if (state.isOpen) closePanel();
      state.isRibbonVisible = false;
      clearTimeout(state.hideTimer);
      syncRibbon();
    }

    function toggleRibbon(event) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      }

      const expandedOnScreen = actions.classList.contains("is-expanded") || actions.getAttribute("data-kx-ribbon-state") === "expanded";
      state.isRibbonVisible = expandedOnScreen;

      if (expandedOnScreen) {
        collapseRibbon();
      } else {
        expandRibbon();
      }
    }

    function openPanel(event) {
      loadWidgetStyles();
      forcePanelPlacement();
      if (event) {
        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      }

      state.isOpen = true;
      state.isRibbonVisible = false;
      clearTimeout(state.hideTimer);
      syncRibbon();
      document.body.classList.add("kx-chat-panel-open");

      panel.classList.add("open");
      panel.setAttribute("aria-hidden", "false");
      panel.style.setProperty("display", "flex", "important");
      panel.style.setProperty("visibility", "visible", "important");
      panel.style.setProperty("opacity", "1", "important");
      panel.style.setProperty("pointer-events", "auto", "important");
      panel.style.setProperty("z-index", "1000001", "important");

      chatButton.classList.add("active");
      renderHistory();
      if (!isLeadComplete()) appendLeadForm();
      updateLeadFormMode();

      setTimeout(() => {
        const firstLeadField = messages.querySelector("[data-kx-lead-form='true'] input");
        if (firstLeadField) {
          try { firstLeadField.focus({ preventScroll: true }); } catch { firstLeadField.focus(); }
        } else {
          try { input.focus({ preventScroll: true }); } catch { input.focus(); }
        }
      }, 80);
    }

    function closePanel(event) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      }
      closeDirectCallPanel();
      state.isOpen = false;
      state.isRibbonVisible = false;
      document.body.classList.remove("kx-chat-panel-open");
      clearTimeout(state.hideTimer);
      panel.classList.remove("open");
      panel.setAttribute("aria-hidden", "true");
      panel.style.removeProperty("display");
      panel.style.removeProperty("visibility");
      panel.style.removeProperty("opacity");
      panel.style.removeProperty("pointer-events");
      chatButton.classList.remove("active");
      syncRibbon();
      applyMobileLayout();
    }

    function updateLeadUi() {
      const complete = isLeadComplete();
      const submitButton = form ? form.querySelector("button") : null;
      if (quickArea) quickArea.style.display = complete ? "" : "none";
      input.placeholder = complete ? "Type your message..." : "Please complete the contact form above first";
      input.setAttribute("aria-label", input.placeholder);
      input.disabled = !complete || state.isSending;
      if (submitButton) submitButton.disabled = !complete || state.isSending;
    }

    function updateLeadFormMode() {
      const formCard = messages ? messages.querySelector("[data-kx-lead-form='true']") : null;
      if (!formCard) return;
      const subtitle = formCard.querySelector(".kx-lead-form-subtitle");
      const submit = formCard.querySelector(".kx-lead-submit");
      if (state.pendingAction === "call") {
        if (subtitle) subtitle.textContent = "Complete this form to start your secure voice call with Zara.";
        if (submit) submit.textContent = "Start voice call";
      } else {
        if (subtitle) subtitle.textContent = "Complete this form to start your AI automation consultation.";
        if (submit) submit.textContent = "Start chat";
      }
    }

    function resetLeadCapture() {
      state.leadStep = "form";
      state.lead = { name: "", phone: "", email: "", company: "" };
      state.pendingAction = "chat";
      updateLeadUi();
    }

    function getLeadFormValues(leadForm) {
      return {
        name: String(leadForm.querySelector("[name='name']").value || "").trim(),
        phone: String(leadForm.querySelector("[name='phone']").value || "").trim(),
        email: String(leadForm.querySelector("[name='email']").value || "").trim(),
        company: String(leadForm.querySelector("[name='company']").value || "").trim()
      };
    }

    function validateLeadForm(values) {
      if (!values.name || !values.phone || !values.email || !values.company) return "Please complete all four fields before continuing.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) return "Please enter a valid email address.";
      return "";
    }

    function appendLeadForm() {
      messages.querySelectorAll("[data-kx-lead-form='true']").forEach((el) => el.remove());
      if (isLeadComplete()) return;

      const wrapper = document.createElement("div");
      wrapper.className = "kx-chat-msg assistant kx-lead-form-message";
      wrapper.setAttribute("data-kx-lead-form", "true");
      wrapper.innerHTML = `
        <div class="kx-lead-form-card">
          <div class="kx-lead-form-heading">Welcome to Kairox AI</div>
          <div class="kx-lead-form-subtitle">Complete this form to start your AI automation consultation.</div>
          <form class="kx-lead-form" novalidate>
            <label class="kx-lead-field"><span>Name</span><input type="text" name="name" autocomplete="name" placeholder="Your full name" required></label>
            <label class="kx-lead-field"><span>Phone</span><input type="tel" name="phone" autocomplete="tel" placeholder="+971 ..." required></label>
            <label class="kx-lead-field"><span>Email</span><input type="email" name="email" autocomplete="email" placeholder="you@company.com" required></label>
            <label class="kx-lead-field"><span>Company</span><input type="text" name="company" autocomplete="organization" placeholder="Company name" required></label>
            <div class="kx-lead-form-error" aria-live="polite"></div>
            <button type="submit" class="kx-lead-submit">Start chat</button>
          </form>
        </div>
      `;

      if (messages.firstChild) messages.insertBefore(wrapper, messages.firstChild);
      else messages.appendChild(wrapper);
      messages.scrollTop = 0;
      updateLeadFormMode();

      const leadForm = wrapper.querySelector(".kx-lead-form");
      const errorBox = wrapper.querySelector(".kx-lead-form-error");
      const firstInput = wrapper.querySelector("input");

      const existingLead = leadVariables();
      Object.keys(existingLead).forEach((key) => {
        const field = leadForm.querySelector("[name='" + key + "']");
        if (field && existingLead[key]) field.value = existingLead[key];
      });

      leadForm.addEventListener("submit", function (event) {
        event.preventDefault();
        const values = getLeadFormValues(leadForm);
        const error = validateLeadForm(values);
        if (error) {
          errorBox.textContent = error;
          const firstEmpty = leadForm.querySelector("input:invalid") || leadForm.querySelector("input");
          if (firstEmpty) firstEmpty.focus();
          return;
        }

        errorBox.textContent = "";
        state.lead = values;
        state.leadStep = "complete";
        const action = state.pendingAction || "chat";

        wrapper.remove();
        updateLeadUi();
        postLeadCapture(action);

        if (action === "call") {
          startRetellWebCall();
        } else {
          addMessage("assistant", "Thank you, " + firstName() + ". How can I help you today?");
          input.focus();
        }
      });

      setTimeout(() => {
        if (firstInput && !isLeadComplete()) firstInput.focus();
      }, 150);
    }

    function leadVariables() {
      const lead = state.lead || {};
      return {
        name: String(lead.name || ""),
        phone: String(lead.phone || ""),
        email: String(lead.email || ""),
        company: String(lead.company || "")
      };
    }

    function ensureLeadFormVisible() {
      if (!isLeadComplete() && !messages.querySelector("[data-kx-lead-form='true']")) appendLeadForm();
      updateLeadFormMode();
    }

    async function postLeadCapture(intent) {
      // v71: Do not call the live chat webhook on lead-form submission.
      // The /webhook/leads workflow is the AI chat workflow and expects an actual message.
      // Sending a lead_capture event without a customer message can make n8n return 500.
      // Lead details are still sent together with the visitor's first real chat message
      // and with the Retell voice-call request.
      console.log("[Kairox] lead form captured locally; webhook will be called on message/call.", {
        intent: intent || state.pendingAction || "chat",
        sessionId,
        lead: leadVariables()
      });
      return true;
    }

    function renderHistory() {
      messages.innerHTML = "";
      state.history.forEach((item) => appendMessage(item.role, item.text, item.time));
      if (!isLeadComplete()) appendLeadForm();
      updateLeadUi();
    }

    function appendMessage(role, text, time) {
      const msg = document.createElement("div");
      msg.className = "kx-chat-msg " + (role === "user" ? "user" : "assistant");
      msg.innerHTML = `<div>${richText(text)}</div><span>${escapeHtml(time || nowTime())}</span>`;
      messages.appendChild(msg);
      messages.scrollTop = messages.scrollHeight;
    }

    function addMessage(role, text) {
      const item = { role, text, time: nowTime() };
      state.history.push(item);
      appendMessage(role, text, item.time);
      localStorage.removeItem(historyKey);
    }

    function showTypingIndicator() {
      removeTypingIndicator();
      const typing = document.createElement("div");
      typing.className = "kx-chat-msg assistant";
      typing.setAttribute("data-kx-typing", "true");
      typing.setAttribute("aria-label", "Kairox is typing");

      const bubble = document.createElement("div");
      bubble.setAttribute("role", "status");
      bubble.setAttribute("aria-live", "polite");
      bubble.style.cssText = "display:inline-flex;align-items:center;gap:8px;min-height:38px;white-space:nowrap;";

      const label = document.createElement("span");
      label.textContent = "Kairox is typing";
      const dots = document.createElement("span");
      dots.setAttribute("aria-hidden", "true");
      dots.style.cssText = "display:inline-flex;gap:4px;";

      const dotEls = [];
      for (let i = 0; i < 3; i += 1) {
        const dot = document.createElement("span");
        dot.textContent = "●";
        dot.style.cssText = "font-size:10px;opacity:.35;transform:translateY(0);transition:opacity .16s ease, transform .16s ease;";
        dots.appendChild(dot);
        dotEls.push(dot);
      }

      bubble.appendChild(label);
      bubble.appendChild(dots);
      typing.appendChild(bubble);
      messages.appendChild(typing);
      messages.scrollTop = messages.scrollHeight;

      let step = 0;
      const paintDots = () => {
        dotEls.forEach((dot, index) => {
          const active = index === step % 3;
          dot.style.opacity = active ? "1" : ".35";
          dot.style.transform = active ? "translateY(-3px)" : "translateY(0)";
        });
        step += 1;
      };
      paintDots();
      typing.__kxTypingInterval = window.setInterval(paintDots, 260);
    }

    function removeTypingIndicator() {
      messages.querySelectorAll("[data-kx-typing='true']").forEach((el) => {
        if (el.__kxTypingInterval) window.clearInterval(el.__kxTypingInterval);
        el.remove();
      });
    }

    function setSending(isSending) {
      state.isSending = isSending;
      updateLeadUi();
    }

    async function readWebhookResponse(response) {
      const contentType = response.headers.get("content-type") || "";
      let data = "";
      if (contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const raw = await response.text();
        try { data = JSON.parse(raw); } catch { data = raw; }
      }
      return data;
    }

    function buildChatPayload(text) {
      const lead = leadVariables();
      const submittedAt = new Date().toISOString();
      return {
        message: text,
        sessionId,
        name: lead.name || "",
        phone: lead.phone || "",
        email: lead.email || "",
        company: lead.company || "",
        lead,
        page: window.location.href,
        source: "kairox-website-chat",
        channel: "website",
        submittedAt
      };
    }

    function payloadToSearchParams(payload) {
      const params = new URLSearchParams();
      Object.keys(payload).forEach((key) => {
        const value = payload[key];
        params.set(key, typeof value === "object" ? JSON.stringify(value) : String(value || ""));
      });
      return params;
    }

    function submitWebhookViaHiddenForm(endpoint, payload) {
      return new Promise((resolve) => {
        try {
          const frameName = "kx_chat_webhook_frame_" + Date.now();
          const iframe = document.createElement("iframe");
          iframe.name = frameName;
          iframe.style.display = "none";
          iframe.setAttribute("aria-hidden", "true");

          const form = document.createElement("form");
          form.method = "POST";
          form.action = endpoint;
          form.target = frameName;
          form.enctype = "application/x-www-form-urlencoded";
          form.style.display = "none";

          Object.keys(payload).forEach((key) => {
            const inputEl = document.createElement("input");
            inputEl.type = "hidden";
            inputEl.name = key;
            const value = payload[key];
            inputEl.value = typeof value === "object" ? JSON.stringify(value) : String(value || "");
            form.appendChild(inputEl);
          });

          iframe.addEventListener("load", () => {
            setTimeout(() => {
              iframe.remove();
              form.remove();
            }, 1200);
            resolve(true);
          }, { once: true });

          document.body.appendChild(iframe);
          document.body.appendChild(form);
          form.submit();

          // Resolve even when browser does not fire load for cross-origin form target.
          setTimeout(() => {
            iframe.remove();
            form.remove();
            resolve(true);
          }, 1600);
        } catch (error) {
          console.warn("[Kairox] hidden form webhook fallback failed", error);
          resolve(false);
        }
      });
    }

    async function postToWebhook(text) {
      const endpoint = "https://workflows-n8nrunnerpostgresollama-cc30a1-187-127-191-113.sslip.io/webhook/leads";
      const payload = buildChatPayload(text);
      const formPayload = payloadToSearchParams(payload);

      console.log("[Kairox] POST chat webhook:", endpoint, payload);

      // Direct POST first: this is the correct production n8n method for the active POST webhook.
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          mode: "cors",
          credentials: "omit",
          redirect: "follow",
          body: formPayload
        });

        const data = await readWebhookResponse(response);

        if (!response.ok && !extractReply(data)) {
          throw new Error("Webhook HTTP " + response.status + ": " + JSON.stringify(data).slice(0, 300));
        }

        console.log("[Kairox] Chat webhook response received", data);
        return data;
      } catch (error) {
        console.warn("[Kairox] readable POST to chat webhook failed. Trying hidden form execution fallback.", error);
      }

      // Hidden form fallback: this bypasses fetch/CORS and should still create an n8n execution.
      // It cannot read the AI response due browser cross-origin rules, so n8n still needs CORS/Respond-to-Webhook
      // for live replies. But it proves whether the active POST webhook receives browser submissions.
      await submitWebhookViaHiddenForm(endpoint, payload);

      throw new Error("Readable chat webhook POST failed. A hidden POST fallback was submitted for n8n execution diagnostics.");
    }

    async function sendMessage(value) {
      const text = String(value || "").trim();
      if (!text || state.isSending) return;
      if (!isLeadComplete()) {
        typingNote.textContent = "Please complete the contact form above first.";
        ensureLeadFormVisible();
        input.value = "";
        setTimeout(() => { typingNote.textContent = ""; }, 1400);
        return;
      }

      input.value = "";
      typingNote.textContent = "";
      addMessage("user", text);
      setSending(true);
      showTypingIndicator();

      try {
        const payload = await postToWebhook(text);
        removeTypingIndicator();
        const reply = extractReply(payload) || "Thanks. I received your message. Please share your business type, team size and the process you want to automate so I can guide you better.";
        addMessage("assistant", reply);
      } catch (error) {
        console.error("[Kairox] chat webhook connection error", error);
        removeTypingIndicator();
        addMessage("assistant", "The live chat workflow did not return a readable AI reply yet. Please check the browser Console/Network response or use the Call button for immediate voice assistance.");
      } finally {
        removeTypingIndicator();
        setSending(false);
        updateLeadUi();
        input.focus();
      }
    }

    function leadDynamicVariables() {
      const lead = state.lead || {};
      return {
        name: String(lead.name || ""),
        phone: String(lead.phone || ""),
        email: String(lead.email || ""),
        company: String(lead.company || ""),
        sessionId: String(sessionId || "")
      };
    }

    async function ensureRetellWebClient() {
      if (state.retellClient) return state.retellClient;

      const sdkUrl = config.retellSdkUrl || "https://esm.sh/retell-client-js-sdk@2.0.8";
      const sdk = await import(sdkUrl);
      const RetellWebClient = sdk.RetellWebClient || (sdk.default && sdk.default.RetellWebClient);

      if (!RetellWebClient) {
        throw new Error("RetellWebClient was not exported by the SDK module.");
      }

      state.retellClient = new RetellWebClient();
      return state.retellClient;
    }

    function ensureDirectCallPanel() {
      let callPanel = panel.querySelector("[data-kx-direct-call-panel='true']");
      if (callPanel) return callPanel;

      callPanel = document.createElement("div");
      callPanel.className = "kx-direct-call-panel";
      callPanel.setAttribute("data-kx-direct-call-panel", "true");
      callPanel.setAttribute("aria-hidden", "true");
      callPanel.innerHTML = `
        <div class="kx-direct-call-head">
          <div><strong>Talk to Zara</strong><span>Secure AI voice call</span></div>
          <button type="button" class="kx-direct-call-close" aria-label="Close voice call">×</button>
        </div>
        <div class="kx-direct-call-body">
          <div class="kx-voice-loading" data-kx-voice-loader aria-hidden="true">
            <span></span><span></span><span></span>
          </div>
          <div class="kx-direct-call-status" data-kx-voice-status>Complete the form, then allow microphone access when prompted.</div>
          <button type="button" class="kx-direct-call-primary" data-kx-voice-start>Start voice call</button>
          <button type="button" class="kx-direct-call-end" data-kx-voice-end>End call</button>
          <div class="kx-direct-call-help">The call uses your n8n Retell access-token webhook. Form values are sent as separate fields.</div>
        </div>
      `;

      panel.appendChild(callPanel);

      const closeVoice = callPanel.querySelector(".kx-direct-call-close");
      const startVoice = callPanel.querySelector("[data-kx-voice-start]");
      const endVoice = callPanel.querySelector("[data-kx-voice-end]");

      if (closeVoice) closeVoice.addEventListener("click", closeDirectCallPanel);
      if (startVoice) startVoice.addEventListener("click", startRetellWebCall);
      if (endVoice) endVoice.addEventListener("click", stopRetellWebCall);

      return callPanel;
    }

    function setVoiceLoading(isLoading, label) {
      const callPanel = ensureDirectCallPanel();
      const loader = callPanel.querySelector("[data-kx-voice-loader]");
      const startButton = callPanel.querySelector("[data-kx-voice-start]");
      const endButton = callPanel.querySelector("[data-kx-voice-end]");

      callPanel.classList.toggle("is-loading", !!isLoading);
      if (loader) loader.setAttribute("aria-hidden", isLoading ? "false" : "true");

      if (startButton) {
        startButton.disabled = !!isLoading || !!state.isVoiceCallActive;
        startButton.textContent = isLoading ? (label || "Preparing...") : (state.isVoiceCallActive ? "Call connected" : "Start voice call");
      }

      if (endButton) {
        endButton.disabled = !isLoading && !state.isVoiceCallActive;
      }
    }

    function setVoiceStatus(message, isError) {
      const callPanel = ensureDirectCallPanel();
      const status = callPanel.querySelector("[data-kx-voice-status]");
      if (status) {
        status.textContent = message;
        status.classList.toggle("is-error", !!isError);
      }
    }

    function openVoicePanel() {
      openPanel();

      const callPanel = ensureDirectCallPanel();
      callPanel.classList.add("open");
      callPanel.setAttribute("aria-hidden", "false");
      panel.classList.add("kx-direct-call-mode");

      if (messages) messages.style.display = "none";
      if (form) form.style.display = "none";
      if (quickArea) quickArea.style.display = "none";
      setVoiceLoading(state.isVoiceCallStarting, state.isVoiceCallStarting ? "Preparing..." : "");
    }

    function closeDirectCallPanel(event) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }

      const callPanel = panel.querySelector("[data-kx-direct-call-panel='true']");
      if (callPanel) {
        callPanel.classList.remove("open");
        callPanel.setAttribute("aria-hidden", "true");
      }

      panel.classList.remove("kx-direct-call-mode");

      if (messages) messages.style.removeProperty("display");
      if (form) form.style.removeProperty("display");
      if (quickArea) quickArea.style.removeProperty("display");

      updateLeadUi();
    }

    async function createRetellWebCall() {
      const variables = leadDynamicVariables();
      const endpoint = config.retellWebCallEndpoint || "https://workflows-n8nrunnerpostgresollama-cc30a1-187-127-191-113.sslip.io/webhook/retell_DV";

      const formPayload = new URLSearchParams();
      formPayload.set("agent_id", config.retellAgentId || "agent_5ec6dc37c1772b2f9adc74074b");
      formPayload.set("agent_version", String(config.retellAgentVersion || "28"));
      formPayload.set("name", variables.name);
      formPayload.set("phone", variables.phone);
      formPayload.set("email", variables.email);
      formPayload.set("company", variables.company);
      formPayload.set("sessionId", variables.sessionId);

      console.log("[Kairox] Requesting Retell access_token from n8n webhook as separate form fields:", endpoint, {
        agent_id: config.retellAgentId || "agent_5ec6dc37c1772b2f9adc74074b",
        agent_version: String(config.retellAgentVersion || "28"),
        name: variables.name,
        phone: variables.phone,
        email: variables.email,
        company: variables.company,
        sessionId: variables.sessionId
      });

      let response;
      try {
        response = await fetch(endpoint, {
          method: "POST",
          mode: "cors",
          credentials: "omit",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            "Accept": "application/json, text/plain, */*"
          },
          body: formPayload.toString()
        });
      } catch (error) {
        throw new Error(
          "Could not reach the Retell access-token webhook. Confirm the n8n workflow is Active and the production URL is correct: " + endpoint
        );
      }

      const text = await response.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = { raw: text };
      }

      if (!response.ok) {
        throw new Error("Retell access-token webhook returned " + response.status + ": " + JSON.stringify(data).slice(0, 400));
      }

      const payload = Array.isArray(data) ? data[0] : data;
      const accessToken = payload && (
        payload.access_token ||
        payload.accessToken ||
        (payload.json && payload.json.access_token) ||
        (payload.body && payload.body.access_token) ||
        (payload.data && payload.data.access_token)
      );

      if (!accessToken) {
        throw new Error("Retell access-token webhook responded, but did not return access_token. Response: " + JSON.stringify(data).slice(0, 400));
      }

      console.log("[Kairox] Retell access_token received. Separate fields sent:", variables);
      return accessToken;
    }

    async function startRetellWebCall(event) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      }

      if (state.isVoiceCallStarting) {
        openVoicePanel();
        setVoiceStatus("Zara is already preparing your voice call...");
        return state.currentVoiceCallPromise;
      }

      if (state.isVoiceCallActive) {
        openVoicePanel();
        setVoiceStatus("Voice call is already connected.");
        setVoiceLoading(false);
        return;
      }

      if (!isLeadComplete()) {
        state.pendingAction = "call";
        closeDirectCallPanel();
        openPanel();
        renderHistory();
        ensureLeadFormVisible();
        updateLeadFormMode();
        return;
      }

      openVoicePanel();
      state.isVoiceCallStarting = true;
      setVoiceLoading(true, "Preparing...");
      setVoiceStatus("Preparing secure voice call with Zara...");

      state.currentVoiceCallPromise = (async () => {
        try {
          const client = await ensureRetellWebClient();
          setVoiceStatus("Requesting secure access token...");
          const accessToken = await createRetellWebCall();

          setVoiceStatus("Starting voice call. Please allow microphone access when prompted.");

          await client.startCall({ accessToken });

          state.isVoiceCallActive = true;
          setVoiceStatus("Voice call connected.");
        } catch (error) {
          console.error("[Kairox] Retell web call error", error);
          state.isVoiceCallActive = false;
          setVoiceStatus(error.message || "Could not start the voice call. Please check the n8n Retell access-token workflow.", true);
        } finally {
          state.isVoiceCallStarting = false;
          state.currentVoiceCallPromise = null;
          setVoiceLoading(false);
        }
      })();

      return state.currentVoiceCallPromise;
    }

    function stopRetellWebCall(event) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      }

      try {
        if (state.retellClient) state.retellClient.stopCall();
      } catch (error) {
        console.warn("[Kairox] Retell stop call warning", error);
      }

      state.isVoiceCallActive = false;
      state.isVoiceCallStarting = false;
      state.currentVoiceCallPromise = null;
      setVoiceLoading(false);
      setVoiceStatus("Voice call ended.");
    }

    function openDirectVoiceCall(event) {
      requestVoiceCall(event);
    }

    function requestVoiceCall(event) {
      loadWidgetStyles();
      forcePanelPlacement();
      if (event) {
        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      }

      state.pendingAction = "call";
      openPanel();

      if (!isLeadComplete()) {
        renderHistory();
        ensureLeadFormVisible();
        updateLeadFormMode();
        const firstField = messages.querySelector("[data-kx-lead-form='true'] input");
        if (firstField) firstField.focus();
        return;
      }

      postLeadCapture("call");
      startRetellWebCall();
    }

    function requestChatStart(event) {
      loadWidgetStyles();
      forcePanelPlacement();
      if (event) {
        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      }

      state.pendingAction = "chat";
      closeDirectCallPanel();
      openPanel();

      if (!isLeadComplete()) {
        ensureLeadFormVisible();
        updateLeadFormMode();
      }
    }

    function requestVoiceCall(event) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      }

      state.pendingAction = "call";
      closeDirectCallPanel();

      // Phone/ribbon calls must always pass through the lead form first.
      // Existing details are prefilled, then the submitted values are sent
      // to the Retell access-token webhook as separate form fields.
      if (isLeadComplete()) state.leadStep = "form";

      openPanel();
      renderHistory();
      ensureLeadFormVisible();
      updateLeadFormMode();

      const firstField = messages.querySelector("[data-kx-lead-form='true'] input");
      if (firstField) {
        try { firstField.focus({ preventScroll: true }); } catch { firstField.focus(); }
      }
    }

    function bindRibbonToggleButton(element) {
      if (!element) return;

      let lastToggleAt = 0;

      const run = function (event) {
        const now = Date.now();
        if (now - lastToggleAt < 180) {
          if (event) {
            event.preventDefault();
            event.stopPropagation();
            if (event.stopImmediatePropagation) event.stopImmediatePropagation();
          }
          return;
        }

        lastToggleAt = now;
        toggleRibbon(event);
      };

      element.onclick = null;
      element.ontouchend = null;
      element.onpointerup = null;
      element.addEventListener("click", run, false);
      element.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          run(event);
        }
      }, false);
    }

    function bindOpenButton(element, handler) {
      if (!element) return;

      let last = 0;
      const run = function (event) {
        const now = Date.now();
        if (now - last < 800) {
          if (event) {
            event.preventDefault();
            event.stopPropagation();
            if (event.stopImmediatePropagation) event.stopImmediatePropagation();
          }
          return;
        }

        last = now;
        handler(event);
      };

      element.onclick = null;
      element.ontouchend = null;
      element.onpointerup = null;
      element.addEventListener("click", run, false);
      element.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") run(event);
      }, false);
    }

    let lastChatRibbonOpenAt = 0;

    function handleChatRibbonTrigger(event) {
      const target = event.target && event.target.closest ? event.target.closest("[data-kx-chat='true'], .kx-float-chat") : null;
      if (!target || !actions.contains(target)) return;

      const now = Date.now();
      if (now - lastChatRibbonOpenAt < 500) {
        if (event) {
          event.preventDefault();
          event.stopPropagation();
          if (event.stopImmediatePropagation) event.stopImmediatePropagation();
        }
        return;
      }

      lastChatRibbonOpenAt = now;
      requestChatStart(event);
    }

    // Capture-phase safety binding for the Chat icon. This does not move or restyle the ribbon;
    // it only ensures the Chat trigger opens the lead/chat panel reliably.
    actions.addEventListener("pointerup", handleChatRibbonTrigger, true);
    actions.addEventListener("click", handleChatRibbonTrigger, true);

    let lastCallRibbonOpenAt = 0;

    function handleCallRibbonTrigger(event) {
      const target = event.target && event.target.closest ? event.target.closest("[data-kx-call='true'], [data-kx-retell-call='true'], .kx-float-call") : null;
      if (!target || !actions.contains(target)) return;

      const now = Date.now();
      if (now - lastCallRibbonOpenAt < 500) {
        if (event) {
          event.preventDefault();
          event.stopPropagation();
          if (event.stopImmediatePropagation) event.stopImmediatePropagation();
        }
        return;
      }

      lastCallRibbonOpenAt = now;
      requestVoiceCall(event);
    }

    // Capture-phase safety binding for the Call icon.
    // It prevents the phone button from starting Retell directly and routes it through the lead form first.
    actions.addEventListener("pointerup", handleCallRibbonTrigger, true);
    actions.addEventListener("click", handleCallRibbonTrigger, true);


    bindRibbonToggleButton(toggleButton);
    bindOpenButton(chatButton, requestChatStart);
    bindOpenButton(callButton, requestVoiceCall);
    bindOpenButton(closeButton, closePanel);

    panel.querySelectorAll("[data-kx-question]").forEach((btn) => {
      btn.addEventListener("click", function () {
        state.pendingAction = "chat";
        if (!isLeadComplete()) {
          ensureLeadFormVisible();
          const firstField = messages.querySelector("[data-kx-lead-form='true'] input");
          if (firstField) firstField.focus();
          return;
        }
        sendMessage(btn.getAttribute("data-kx-question"));
      });
    });

    let typingTimer = null;
    input.addEventListener("input", function () {
      typingNote.textContent = input.value.trim() ? "You are typing..." : "";
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => { typingNote.textContent = ""; }, 900);
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      state.pendingAction = "chat";
      sendMessage(input.value);
    });

    document.addEventListener("click", function (event) {
      if (event.target && event.target.closest && event.target.closest(".kx-ribbon-toggle")) return;

      const trigger = event.target && event.target.closest ? event.target.closest("[data-kx-call], [data-kx-retell-call], .kx-call, .kx-chat-call") : null;
      if (!trigger || trigger.closest(".kx-direct-call-panel") || trigger.closest(".kx-floating-actions")) return;

      event.preventDefault();
      event.stopPropagation();
      requestVoiceCall(event);
    }, true);

    window.addEventListener("resize", applyMobileLayout, { passive: true });
    window.addEventListener("orientationchange", function () { setTimeout(applyMobileLayout, 250); });


    function shouldOpenChatFromUrl() {
      try {
        const params = new URLSearchParams(window.location.search || "");
        const hash = String(window.location.hash || "").replace(/^#/, "").toLowerCase();
        const queryValues = [
          params.get("chat"),
          params.get("open"),
          params.get("kxchat"),
          params.get("kairoxChat")
        ].map((value) => String(value || "").toLowerCase());

        return queryValues.some((value) => ["1", "true", "open", "chat", "start"].includes(value)) ||
          ["chat", "open-chat", "kairox-chat", "kairox-chat-open", "start-chat"].includes(hash);
      } catch (error) {
        return false;
      }
    }

    window.KairoxChatWidget = {
      open: requestChatStart,
      openCall: requestVoiceCall,
      close: closePanel,
      toggleRibbon,
      expandRibbon,
      collapseRibbon
    };

    state.isOpen = false;
    state.history = [];
    resetLeadCapture();
    input.value = "";
    typingNote.textContent = "";
    renderHistory();
    syncRibbon();

    if (shouldOpenChatFromUrl()) {
      setTimeout(function () {
        requestChatStart();
      }, 120);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildWidget, { once: true });
  } else {
    buildWidget();
  }
})();
