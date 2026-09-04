/* Kehati Nadlan — floating WhatsApp + accessibility widget (self-contained) */
(function () {
  "use strict";

  var LS_KEY = "kehati-a11y";

  /* ---------- styles ---------- */
  var css = [
    ".kn-float{position:fixed;bottom:22px;z-index:900;width:56px;height:56px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 18px rgba(0,0,0,.45);border:none;transition:transform .2s;text-decoration:none}",
    ".kn-float:hover{transform:scale(1.08)}",
    ".kn-float:focus-visible{outline:3px solid #C9A45C;outline-offset:3px}",
    ".kn-wa{left:22px;background:#25D366}",
    ".kn-wa svg{width:30px;height:30px;fill:#fff}",
    ".kn-acc{right:22px;background:#0B1622;border:2px solid #C9A45C}",
    ".kn-acc svg{width:28px;height:28px;fill:#C9A45C}",
    ".kn-panel{position:fixed;bottom:90px;right:22px;z-index:901;width:min(300px,calc(100vw - 44px));background:#101f2f;border:1px solid rgba(201,164,92,.4);border-radius:10px;padding:16px;box-shadow:0 10px 40px rgba(0,0,0,.6);font-family:Heebo,Arial,sans-serif;color:#EDE3CE;direction:rtl}",
    ".kn-panel[hidden]{display:none!important}",
    ".kn-panel h2{font-size:16px;margin:0 0 12px;color:#C9A45C;font-weight:600}",
    ".kn-panel .kn-row{display:flex;gap:8px;margin-bottom:8px}",
    ".kn-panel button{flex:1;background:rgba(237,227,206,.06);border:1px solid rgba(201,164,92,.35);border-radius:6px;color:#EDE3CE;font:inherit;font-size:13.5px;padding:9px 6px;cursor:pointer;text-align:center}",
    ".kn-panel button:hover{border-color:#C9A45C}",
    ".kn-panel button:focus-visible{outline:2px solid #C9A45C;outline-offset:1px}",
    ".kn-panel button[aria-pressed=true]{background:#C9A45C;color:#0B1622;font-weight:600}",
    ".kn-panel .kn-reset{background:transparent;border-color:rgba(237,227,206,.25)}",
    ".kn-panel a{display:block;text-align:center;color:#8fa0b2;font-size:12.5px;margin-top:10px;text-decoration:underline}",
    ".kn-panel a:hover{color:#C9A45C}",
    /* effect classes on <html> */
    "html.kn-grayscale{filter:grayscale(1)}",
    "html.kn-contrast{filter:contrast(1.35) brightness(1.1)}",
    "html.kn-grayscale.kn-contrast{filter:grayscale(1) contrast(1.35) brightness(1.1)}",
    "html.kn-links a{text-decoration:underline!important;background:rgba(201,164,92,.25)!important;color:#fff!important}",
    "html.kn-readable body,html.kn-readable body *{font-family:Arial,Helvetica,sans-serif!important;letter-spacing:0!important}",
    "html.kn-nomotion *,html.kn-nomotion *::before,html.kn-nomotion *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}",
    "@media print{.kn-float,.kn-panel{display:none!important}}"
  ].join("\n");
  var style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  /* ---------- state ---------- */
  var state = { font: 0, grayscale: false, contrast: false, links: false, readable: false, nomotion: false };
  try { var saved = JSON.parse(localStorage.getItem(LS_KEY)); if (saved) state = Object.assign(state, saved); } catch (e) {}

  function apply() {
    var html = document.documentElement;
    html.style.fontSize = state.font ? (100 + state.font * 12.5) + "%" : "";
    html.classList.toggle("kn-grayscale", state.grayscale);
    html.classList.toggle("kn-contrast", state.contrast);
    html.classList.toggle("kn-links", state.links);
    html.classList.toggle("kn-readable", state.readable);
    html.classList.toggle("kn-nomotion", state.nomotion);
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
    if (panel) {
      panel.querySelectorAll("[data-toggle]").forEach(function (b) {
        b.setAttribute("aria-pressed", String(!!state[b.getAttribute("data-toggle")]));
      });
    }
  }

  /* ---------- WhatsApp float ---------- */
  var wa = document.createElement("a");
  wa.className = "kn-float kn-wa";
  wa.href = "https://wa.me/972528119445";
  wa.target = "_blank";
  wa.rel = "noopener";
  wa.setAttribute("aria-label", "שיחת וואטסאפ עם אבי קהתי — 052-8119445");
  wa.title = "וואטסאפ 052-8119445";
  wa.innerHTML = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3C9.4 3 4 8.3 4 14.9c0 2.6.8 5 2.3 7L4 29l7.3-2.2c1.9 1 3.9 1.5 4.7 1.5 6.6 0 12-5.3 12-11.9S22.6 3 16 3zm0 21.7c-1.5 0-3.2-.4-4.6-1.2l-.5-.3-4.3 1.3 1.3-4.1-.4-.6c-1.2-1.7-1.9-3.7-1.9-5.9 0-5.4 4.7-9.8 10.4-9.8s10.4 4.4 10.4 9.8-4.7 9.8-10.4 9.8zm5.6-7.3c-.3-.2-1.8-.9-2.1-1-.3-.1-.5-.2-.7.2s-.8 1-1 1.2c-.2.2-.4.2-.7.1-.3-.2-1.3-.5-2.5-1.6-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.5-.6c.2-.2.2-.4.3-.6.1-.2 0-.4 0-.6-.1-.2-.7-1.7-1-2.3-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.1 1.1-1.1 2.7s1.2 3.1 1.3 3.3c.2.2 2.3 3.6 5.6 5 .8.3 1.4.5 1.9.7.8.2 1.5.2 2.1.1.6-.1 1.8-.8 2.1-1.5.3-.7.3-1.3.2-1.5-.1-.1-.3-.2-.6-.3z"/></svg>';

  /* ---------- accessibility button + panel ---------- */
  var acc = document.createElement("button");
  acc.type = "button";
  acc.className = "kn-float kn-acc";
  acc.setAttribute("aria-label", "תפריט נגישות");
  acc.setAttribute("aria-expanded", "false");
  acc.setAttribute("aria-controls", "kn-a11y-panel");
  acc.title = "נגישות";
  acc.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm9 5.5c.1.5-.2 1-.8 1.1l-4.7 1v2.1l2.4 6.9c.2.5-.1 1.1-.6 1.3-.5.2-1.1-.1-1.3-.6L14 14h-1.6l-2 5.3c-.2.5-.8.8-1.3.6-.5-.2-.8-.8-.6-1.3l2.4-6.9V9.6l-4.7-1c-.6-.1-.9-.6-.8-1.1.1-.6.6-.9 1.2-.8l5.4 1.1 5.4-1.1c.6-.1 1.1.2 1.2.8z"/></svg>';

  var panel = document.createElement("div");
  panel.className = "kn-panel";
  panel.id = "kn-a11y-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "אפשרויות נגישות");
  panel.hidden = true;
  panel.innerHTML =
    '<h2>נגישות</h2>' +
    '<div class="kn-row"><button type="button" data-font="1">א+ הגדלת טקסט</button><button type="button" data-font="-1">א− הקטנת טקסט</button></div>' +
    '<div class="kn-row"><button type="button" data-toggle="contrast">ניגודיות גבוהה</button><button type="button" data-toggle="grayscale">גווני אפור</button></div>' +
    '<div class="kn-row"><button type="button" data-toggle="links">הדגשת קישורים</button><button type="button" data-toggle="readable">פונט קריא</button></div>' +
    '<div class="kn-row"><button type="button" data-toggle="nomotion">עצירת אנימציות</button><button type="button" class="kn-reset" data-reset>איפוס הגדרות</button></div>' +
    '<a href="accessibility.html">הצהרת נגישות</a>';

  function openPanel(open) {
    panel.hidden = !open;
    acc.setAttribute("aria-expanded", String(open));
    if (open) { var f = panel.querySelector("button"); if (f) f.focus(); }
  }

  acc.addEventListener("click", function () { openPanel(panel.hidden); });
  panel.addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    if (b.hasAttribute("data-reset")) {
      state = { font: 0, grayscale: false, contrast: false, links: false, readable: false, nomotion: false };
    } else if (b.hasAttribute("data-font")) {
      state.font = Math.max(-2, Math.min(4, state.font + parseInt(b.getAttribute("data-font"), 10)));
    } else if (b.hasAttribute("data-toggle")) {
      var k = b.getAttribute("data-toggle");
      state[k] = !state[k];
    }
    apply();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !panel.hidden) { openPanel(false); acc.focus(); }
  });
  document.addEventListener("click", function (e) {
    if (!panel.hidden && !panel.contains(e.target) && !acc.contains(e.target)) openPanel(false);
  });

  function mount() {
    document.body.appendChild(wa);
    document.body.appendChild(acc);
    document.body.appendChild(panel);
    apply();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
