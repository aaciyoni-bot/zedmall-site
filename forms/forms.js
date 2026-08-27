/* מערכת מסמכים — אבי קהתי יועץ נדל"ן */
(function () {
  "use strict";

  var FORM_ID = document.body.getAttribute("data-form");
  if (!FORM_ID) return;
  var STORE_KEY = "kehati-forms:" + FORM_ID;
  var BROKER_PHONE = "972528119445";

  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, val) {
    try { localStorage.setItem(key, val); } catch (e) { /* מצב פרטי */ }
  }
  function storageRemove(key) {
    try { localStorage.removeItem(key); } catch (e) { /* מצב פרטי */ }
  }

  /* ===== מצב מעטפה (חתימה מרחוק) =====
     קישור קצר (המסמך שמור בענן):   #eid=<id> — ללקוח לחתימה, #sid=<id> — חתום שחזר
     קישור גיבוי (המסמך בתוך הקישור): #env=<data> / #signed=<data> */
  var MODE = "normal";
  var HASH_KIND = null, HASH_RAW = null, DOC_ID = null;
  (function () {
    var m = location.hash.match(/^#(env|signed|eid|sid)=(.+)$/);
    if (!m) return;
    HASH_KIND = m[1];
    HASH_RAW = m[2];
    MODE = (HASH_KIND === "env" || HASH_KIND === "eid") ? "client" : "received";
    if (HASH_KIND === "eid" || HASH_KIND === "sid") DOC_ID = HASH_RAW;
  })();

  /* מעבר למעטפה כשהעמוד כבר פתוח — ניווט מלא מחדש כדי להחיל את המצב */
  window.addEventListener("hashchange", function () {
    if (/^#(env|signed|eid|sid)=/.test(location.hash)) {
      setTimeout(function () {
        location.href = location.pathname + "?r=" + Date.now() + location.hash;
      }, 0);
    }
  });

  function b64FromBytes(bytes) {
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function bytesFromB64(s) {
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    var bin = atob(s);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  function encB64(obj) { return b64FromBytes(new TextEncoder().encode(JSON.stringify(obj))); }
  function decB64(s) { return JSON.parse(new TextDecoder().decode(bytesFromB64(s))); }

  /* דחיסת deflate — מקצרת את המטען פי 2-3. פורמט: "z." + base64url */
  function encodePayload(obj) {
    if (typeof CompressionStream === "undefined") return Promise.resolve(encB64(obj));
    var stream = new Blob([new TextEncoder().encode(JSON.stringify(obj))])
      .stream().pipeThrough(new CompressionStream("deflate-raw"));
    return new Response(stream).arrayBuffer().then(function (ab) {
      return "z." + b64FromBytes(new Uint8Array(ab));
    }).catch(function () { return encB64(obj); });
  }
  function decodePayload(s) {
    if (s.slice(0, 2) !== "z.") return Promise.resolve(decB64(s));
    var stream = new Blob([bytesFromB64(s.slice(2))])
      .stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Response(stream).arrayBuffer().then(function (ab) {
      return JSON.parse(new TextDecoder().decode(new Uint8Array(ab)));
    });
  }

  /* ===== אחסון מעטפות בענן (Firestore) — קישורים קצרים וחזרה ישירה לאתר =====
     אם הענן לא זמין, נופלים אוטומטית לקישור ארוך שמכיל את המסמך עצמו. */
  var FS_KEY = "AIzaSyAqkEfNwKZzofId0XCGcs17sVFh5NYryrM";
  var FS_PID = "zedmall-4301c";
  function fsUrl(id, extra) {
    return "https://firestore.googleapis.com/v1/projects/" + FS_PID +
      "/databases/(default)/documents/kehati_envelopes" + (id ? "/" + id : "") +
      "?key=" + FS_KEY + (extra || "");
  }
  /* fetch עם מגבלת זמן — כדי שכשל ענן לא יתקע את המשתמש */
  function fsFetch(url, opts, ms) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    opts = opts || {};
    if (ctrl) opts.signal = ctrl.signal;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, ms || 6000) : null;
    return fetch(url, opts).finally(function () { if (timer) clearTimeout(timer); });
  }
  function fsCreate(payload) {
    return fsFetch(fsUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: {
        data: { stringValue: payload },
        status: { stringValue: "sent" },
        created: { integerValue: String(Date.now()) }
      } })
    }).then(function (r) {
      if (!r.ok) throw new Error("fs create " + r.status);
      return r.json();
    }).then(function (j) { return j.name.split("/").pop(); });
  }
  function fsGet(id) {
    return fsFetch(fsUrl(id)).then(function (r) {
      if (!r.ok) throw new Error("fs get " + r.status);
      return r.json();
    }).then(function (j) { return j.fields || {}; });
  }
  function fsSign(id, payload) {
    return fsFetch(fsUrl(id, "&updateMask.fieldPaths=signed&updateMask.fieldPaths=status"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: {
        signed: { stringValue: payload },
        status: { stringValue: "signed" }
      } })
    }).then(function (r) { if (!r.ok) throw new Error("fs sign " + r.status); });
  }

  /* ===== טוסט ===== */
  var toastEl = document.createElement("div");
  toastEl.className = "toast";
  document.body.appendChild(toastEl);
  var toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 2600);
  }

  /* ===== חתימה בהחלקה ===== */
  function SignaturePad(box) {
    this.box = box;
    this.canvas = $("canvas", box);
    this.ctx = this.canvas.getContext("2d");
    this.dataUrl = null;
    this.strokes = [];      // וקטורים — קומפקטיים לשמירה ולשליחה
    this.drawing = false;
    this.locked = false;
    this.last = null;
    this.cur = null;
    var self = this;

    this.resize();
    window.addEventListener("resize", function () { self.resize(); });

    this.canvas.addEventListener("pointerdown", function (e) {
      if (self.locked) return;
      e.preventDefault();
      self.canvas.setPointerCapture(e.pointerId);
      self.drawing = true;
      self.last = self.pos(e);
      self.cur = [[Math.round(self.last.x), Math.round(self.last.y)]];
    });
    this.canvas.addEventListener("pointermove", function (e) {
      if (!self.drawing) return;
      e.preventDefault();
      var p = self.pos(e);
      var ctx = self.ctx;
      ctx.strokeStyle = "#18344a";
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(self.last.x, self.last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      // דילול נקודות — שומרים נקודה רק אם זזה מספיק
      var lp = self.cur[self.cur.length - 1];
      var dx = p.x - lp[0], dy = p.y - lp[1];
      if (dx * dx + dy * dy >= 4) self.cur.push([Math.round(p.x), Math.round(p.y)]);
      self.last = p;
    });
    function end() {
      if (!self.drawing) return;
      self.drawing = false;
      if (self.cur && self.cur.length > 1) self.strokes.push(self.cur);
      self.cur = null;
      self.dataUrl = self.canvas.toDataURL("image/png");
      self.box.classList.add("signed");
      self.onchange && self.onchange();
      scheduleSave();
    }
    this.canvas.addEventListener("pointerup", end);
    this.canvas.addEventListener("pointercancel", end);

    var clearBtn = $(".sig-clear", box);
    if (clearBtn) clearBtn.addEventListener("click", function () {
      if (self.locked) return;
      self.clear();
      scheduleSave();
    });
  }
  SignaturePad.prototype.pos = function (e) {
    var r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  SignaturePad.prototype.rect = function () { return this.canvas.getBoundingClientRect(); };
  SignaturePad.prototype.resize = function () {
    var r = this.rect();
    if (!r.width) return;
    var dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.refW = r.width;
    if (this.strokes.length) this.loadStrokes({ s: this.strokes, w: this.refW });
    else if (this.dataUrl) this.load(this.dataUrl);
  };
  SignaturePad.prototype.clear = function () {
    var r = this.rect();
    this.ctx.clearRect(0, 0, r.width, r.height);
    this.dataUrl = null;
    this.strokes = [];
    this.box.classList.remove("signed");
  };
  SignaturePad.prototype.load = function (dataUrl) {
    var self = this;
    var img = new Image();
    img.onload = function () {
      var r = self.rect();
      self.ctx.clearRect(0, 0, r.width, r.height);
      self.ctx.drawImage(img, 0, 0, r.width, r.height);
      self.dataUrl = dataUrl;
      self.box.classList.add("signed");
    };
    img.src = dataUrl;
  };
  /* ציור חתימה מוקטורים, מנורמלת לרוחב הנוכחי */
  SignaturePad.prototype.loadStrokes = function (sig) {
    var r = this.rect();
    if (!r.width || !sig || !sig.s || !sig.s.length) return;
    var sc = r.width / (sig.w || r.width);
    var scaled = sig.s.map(function (stroke) {
      return stroke.map(function (p) { return [Math.round(p[0] * sc), Math.round(p[1] * sc)]; });
    });
    var ctx = this.ctx;
    ctx.clearRect(0, 0, r.width, r.height);
    ctx.strokeStyle = "#18344a";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    scaled.forEach(function (stroke) {
      ctx.beginPath();
      stroke.forEach(function (p, i) {
        if (i === 0) ctx.moveTo(p[0], p[1]);
        else ctx.lineTo(p[0], p[1]);
      });
      ctx.stroke();
    });
    this.strokes = scaled;
    this.refW = r.width;
    this.dataUrl = this.canvas.toDataURL("image/png");
    this.box.classList.add("signed");
  };
  SignaturePad.prototype.sigData = function () {
    if (this.strokes.length) return { s: this.strokes, w: Math.round(this.refW || 0) };
    if (this.dataUrl) return { d: this.dataUrl };
    return null;
  };
  SignaturePad.prototype.loadSig = function (sig) {
    if (!sig) return;
    if (typeof sig === "string") this.load(sig);        // טיוטות ישנות
    else if (sig.s) this.loadStrokes(sig);
    else if (sig.d) this.load(sig.d);
  };
  SignaturePad.prototype.lock = function () {
    this.locked = true;
    this.box.classList.add("sig-locked");
  };

  var pads = {};
  $$(".sig-box").forEach(function (box) {
    pads[box.getAttribute("data-sig")] = new SignaturePad(box);
  });
  /* איזה פנקס חותם הלקוח מרחוק */
  var CLIENT_PAD = pads.client ? "client" : Object.keys(pads)[0];

  /* חתימת ברירת מחדל של המתווך — נשמרת פעם אחת ומוטבעת מראש בכל טופס חדש */
  var DEFAULT_SIG_KEY = "kehati-default-sig";
  if (pads.broker && MODE === "normal") {
    pads.broker.onchange = function () {
      var sig = pads.broker.sigData();
      if (sig && sig.s) {
        storageSet(DEFAULT_SIG_KEY, JSON.stringify(sig));
        toast("החתימה נשמרה ותוטבע אוטומטית בטפסים הבאים");
      }
    };
  }
  function stampDefaultSig() {
    if (!pads.broker || pads.broker.dataUrl) return;
    var raw = storageGet(DEFAULT_SIG_KEY);
    if (!raw) return;
    try { pads.broker.loadSig(JSON.parse(raw)); } catch (e) {}
  }

  /* ===== סעיפים: כפתורי הסתרה + שמירת מקור ===== */
  var clauseOriginals = {};
  $$(".clause").forEach(function (li, i) {
    if (!li.getAttribute("data-id")) li.setAttribute("data-id", "c" + (i + 1));
    var id = li.getAttribute("data-id");
    var body = $(".clause-body", li);
    clauseOriginals[id] = body ? body.innerHTML : "";

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "clause-toggle no-print";
    btn.textContent = "הסתר";
    btn.setAttribute("aria-label", "הסתרת סעיף מההדפסה");
    btn.addEventListener("click", function () {
      li.classList.toggle("clause-hidden");
      btn.textContent = li.classList.contains("clause-hidden") ? "החזר" : "הסתר";
      scheduleSave();
    });
    li.appendChild(btn);
  });

  /* ===== מצב עריכת סעיפים ===== */
  var editBtn = $("#edit-toggle");
  var editing = false;
  function setEditing(on) {
    editing = on;
    document.body.classList.toggle("editing", on);
    $$(".clause-body").forEach(function (b) {
      b.setAttribute("contenteditable", on ? "true" : "false");
    });
    if (editBtn) {
      editBtn.classList.toggle("is-on", on);
      editBtn.querySelector(".btn-label").textContent = on ? "סיום עריכה" : "עריכת סעיפים";
    }
    if (!on) scheduleSave();
  }
  if (editBtn) editBtn.addEventListener("click", function () { setEditing(!editing); });
  $$(".clause-body").forEach(function (b) {
    b.addEventListener("input", scheduleSave);
    b.addEventListener("blur", scheduleSave);
  });

  /* ===== שורות נכסים דינמיות (טופס קנייה) ===== */
  var repeatWrap = $("[data-repeat]");
  var addRowBtn = $("#add-prop-row");
  function propRowCount() { return repeatWrap ? $$(".prop-row", repeatWrap).length : 0; }
  function addPropRow(silent) {
    if (!repeatWrap) return;
    var n = propRowCount() + 1;
    var row = document.createElement("div");
    row.className = "prop-row";
    row.innerHTML =
      '<span class="prop-num">נכס ' + n + "</span>" +
      '<button type="button" class="prop-remove no-print">הסר</button>' +
      '<div class="frow">' +
      '<label class="f grow"><span>כתובת הנכס:</span><input type="text" name="prop' + n + '_addr" placeholder=" "></label>' +
      "</div>" +
      '<div class="frow">' +
      '<label class="f grow"><span>פרטי הנכס:</span><input type="text" name="prop' + n + '_details" placeholder=" "></label>' +
      '<label class="f w-l"><span>מחיר מבוקש:</span><input type="text" name="prop' + n + '_price" inputmode="numeric" placeholder=" "></label>' +
      "</div>";
    repeatWrap.appendChild(row);
    bindPropRow(row);
    if (!silent) { scheduleSave(); toast("נוספה שורת נכס"); }
    return row;
  }
  function bindPropRow(row) {
    var rm = $(".prop-remove", row);
    if (rm) rm.addEventListener("click", function () {
      if (propRowCount() <= 1) { toast("חייבת להישאר לפחות שורה אחת"); return; }
      row.parentNode.removeChild(row);
      renumberPropRows();
      scheduleSave();
    });
    $$("input", row).forEach(bindField);
  }
  function renumberPropRows() {
    $$(".prop-row", repeatWrap).forEach(function (row, i) {
      var n = i + 1;
      $(".prop-num", row).textContent = "נכס " + n;
      $$("input", row).forEach(function (inp) {
        inp.name = inp.name.replace(/^prop\d+_/, "prop" + n + "_");
      });
    });
  }
  if (addRowBtn) addRowBtn.addEventListener("click", function () { addPropRow(false); });
  if (repeatWrap) $$(".prop-row", repeatWrap).forEach(bindPropRow);

  /* ===== שמירה אוטומטית (רק במצב רגיל) ===== */
  var saveNote = $("#save-note");
  var saveTimer = null;

  function serialize() {
    var data = { fields: {}, clauses: {}, sigs: {}, propRows: propRowCount() || undefined };
    $$("input[name], textarea[name], select[name]").forEach(function (el) {
      data.fields[el.name] = el.value;
    });
    $$(".clause").forEach(function (li) {
      var id = li.getAttribute("data-id");
      var body = $(".clause-body", li);
      data.clauses[id] = {
        html: body ? body.innerHTML : "",
        hidden: li.classList.contains("clause-hidden")
      };
    });
    Object.keys(pads).forEach(function (k) {
      var sig = pads[k].sigData();
      if (sig) data.sigs[k] = sig;
    });
    return data;
  }

  function doSave() {
    if (MODE !== "normal") return;   // מסמך של לקוח לא דורס את הטיוטה המקומית
    storageSet(STORE_KEY, JSON.stringify(serialize()));
    if (saveNote) {
      saveNote.textContent = "הטיוטה נשמרה ✓";
      saveNote.classList.add("show");
      setTimeout(function () { saveNote.classList.remove("show"); }, 1800);
    }
    updateProgress();
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(doSave, 400);
  }

  function restore() {
    var raw = storageGet(STORE_KEY);
    if (!raw) return false;
    var data;
    try { data = JSON.parse(raw); } catch (e) { return false; }

    if (repeatWrap && data.propRows) {
      while (propRowCount() < data.propRows) addPropRow(true);
    }
    Object.keys(data.fields || {}).forEach(function (name) {
      var el = document.querySelector('[name="' + name + '"]');
      if (el) el.value = data.fields[name];
    });
    Object.keys(data.clauses || {}).forEach(function (id) {
      var li = document.querySelector('.clause[data-id="' + id + '"]');
      if (!li) return;
      var c = data.clauses[id];
      var body = $(".clause-body", li);
      if (body && typeof c.html === "string") body.innerHTML = c.html;
      li.classList.toggle("clause-hidden", !!c.hidden);
      var btn = $(".clause-toggle", li);
      if (btn) btn.textContent = c.hidden ? "החזר" : "הסתר";
    });
    Object.keys(data.sigs || {}).forEach(function (k) {
      if (pads[k]) pads[k].loadSig(data.sigs[k]);
    });
    return true;
  }

  function bindField(el) {
    el.addEventListener("input", scheduleSave);
    el.addEventListener("change", scheduleSave);
  }
  $$("input[name], textarea[name], select[name]").forEach(bindField);

  /* ===== מד התקדמות ===== */
  var progressBar = $("#progress-bar");
  var progressText = $("#progress-text");
  function updateProgress() {
    if (!progressBar) return;
    var inputs = $$("input[name], textarea[name]");
    var filled = inputs.filter(function (el) { return el.value.trim() !== ""; }).length;
    var sigTotal = Object.keys(pads).length;
    var sigDone = Object.keys(pads).filter(function (k) { return !!pads[k].dataUrl; }).length;
    var total = inputs.length + sigTotal;
    var done = filled + sigDone;
    var pct = total ? Math.round((done / total) * 100) : 0;
    progressBar.style.width = pct + "%";
    if (progressText) progressText.textContent = pct + "% מולא";
  }

  /* ===== תאריך ומספר טופס אוטומטיים ===== */
  function todayStr() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear();
  }
  function autoFill() {
    $$("input[data-today]").forEach(function (el) {
      if (!el.value) el.value = todayStr();
    });
    var numEl = $("input[data-autonum]");
    if (numEl && !numEl.value) {
      var n = parseInt(storageGet("kehati-forms:counter") || "0", 10) + 1;
      storageSet("kehati-forms:counter", String(n));
      var d = new Date();
      var p = function (x) { return (x < 10 ? "0" : "") + x; };
      numEl.value = String(d.getFullYear()).slice(2) + p(d.getMonth() + 1) + "-" + n;
    }
  }

  /* ===== בניית מעטפה ===== */
  function clientName() {
    var el = document.querySelector('[name="c1_name"]') || document.querySelector('[name="o_first"]');
    var name = el ? el.value.trim() : "";
    var last = document.querySelector('[name="o_last"]');
    if (last && last.value.trim()) name += " " + last.value.trim();
    return name;
  }

  function buildEnvelope() {
    var env = { v: 1, form: FORM_ID, t: Date.now(), f: {}, ce: {}, hid: [], sigs: {}, rows: propRowCount() || undefined };
    $$("input[name], textarea[name]").forEach(function (el) {
      if (el.value.trim() !== "") env.f[el.name] = el.value;
    });
    $$(".clause").forEach(function (li) {
      var id = li.getAttribute("data-id");
      var body = $(".clause-body", li);
      if (body && body.innerHTML !== clauseOriginals[id]) env.ce[id] = body.innerHTML;
      if (li.classList.contains("clause-hidden")) env.hid.push(id);
    });
    Object.keys(pads).forEach(function (k) {
      var sig = pads[k].sigData();
      if (sig) env.sigs[k] = sig;
    });
    return env;
  }

  function applyEnvelope(env) {
    if (repeatWrap && env.rows) {
      while (propRowCount() < env.rows) addPropRow(true);
    }
    Object.keys(env.f || {}).forEach(function (name) {
      var el = document.querySelector('[name="' + name + '"]');
      if (el) el.value = env.f[name];
    });
    Object.keys(env.ce || {}).forEach(function (id) {
      var body = document.querySelector('.clause[data-id="' + id + '"] .clause-body');
      if (body) body.innerHTML = env.ce[id];
    });
    (env.hid || []).forEach(function (id) {
      var li = document.querySelector('.clause[data-id="' + id + '"]');
      if (li) {
        li.classList.add("clause-hidden");
        var btn = $(".clause-toggle", li);
        if (btn) btn.textContent = "החזר";
      }
    });
    Object.keys(env.sigs || {}).forEach(function (k) {
      if (pads[k]) pads[k].loadSig(env.sigs[k]);
    });
  }

  function pageBase() {
    return location.origin + location.pathname;
  }

  /* ===== יומני שליחה/קבלה (בדפדפן של קהתי) ===== */
  function logPush(key, rec, dedupeBy) {
    var list;
    try { list = JSON.parse(storageGet(key) || "[]"); } catch (e) { list = []; }
    if (dedupeBy && list.some(function (r) { return r[dedupeBy] === rec[dedupeBy]; })) return;
    list.unshift(rec);
    if (list.length > 100) list = list.slice(0, 100);
    storageSet(key, JSON.stringify(list));
  }

  /* ===== באנר מצב ===== */
  function showBanner(html, cls) {
    var b = document.createElement("div");
    b.className = "env-banner no-print " + (cls || "");
    b.innerHTML = html;
    var wrap = $(".sheet-wrap");
    wrap.insertBefore(b, wrap.firstChild);
  }

  /* ===== כפתורי סרגל ===== */
  var printBtn = $("#print-btn");
  if (printBtn) printBtn.addEventListener("click", function () {
    if (editing) setEditing(false);
    window.print();
  });

  var clearBtn = $("#clear-btn");
  if (clearBtn) clearBtn.addEventListener("click", function () {
    if (!window.confirm("לנקות את כל הטופס? הפעולה תמחק את הנתונים, החתימות והשינויים בסעיפים.")) return;
    storageRemove(STORE_KEY);
    $$("input[name], textarea[name]").forEach(function (el) { el.value = ""; });
    Object.keys(pads).forEach(function (k) { pads[k].clear(); });
    $$(".clause").forEach(function (li) {
      var id = li.getAttribute("data-id");
      var body = $(".clause-body", li);
      if (body) body.innerHTML = clauseOriginals[id];
      li.classList.remove("clause-hidden");
      var btn = $(".clause-toggle", li);
      if (btn) btn.textContent = "הסתר";
    });
    if (repeatWrap) {
      $$(".prop-row", repeatWrap).slice(3).forEach(function (r) { r.parentNode.removeChild(r); });
      renumberPropRows();
    }
    autoFill();
    stampDefaultSig();
    updateProgress();
    toast("הטופס נוקה");
  });

  var shareBtn = $("#share-btn");
  if (shareBtn) shareBtn.addEventListener("click", function () {
    var url = window.location.href;
    var title = document.title;
    if (navigator.share) {
      navigator.share({ title: title, url: url }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function () { toast("הקישור הועתק"); });
    } else {
      window.prompt("העתקת קישור:", url);
    }
  });

  /* ===== שליחה ללקוח לחתימה מרחוק ===== */
  var sendBtn = $("#send-btn");
  if (sendBtn && MODE === "normal") {
    sendBtn.addEventListener("click", function () {
      sendBtn.disabled = true;
      var env = buildEnvelope();
      delete env.sigs[CLIENT_PAD];   // הלקוח יחתום בעצמו
      var name = clientName();

      encodePayload(env).then(function (payload) {
        // קודם מנסים ענן — קישור קצר; אם לא זמין, הקישור מכיל את המסמך
        return fsCreate(payload).then(function (id) {
          return { link: pageBase() + "#eid=" + id, docId: id, cloud: true };
        }).catch(function () {
          return { link: pageBase() + "#env=" + payload, docId: null, cloud: false };
        });
      }).then(function (res) {
        if (res.link.length > 30000) { toast("המסמך גדול מדי לשליחה בקישור — צמצמו תוכן"); return; }
        logPush("kehati-sent", {
          form: FORM_ID, title: document.title.split("—")[0].trim(),
          name: name || "(ללא שם)", at: env.t, url: res.link, docId: res.docId
        });
        var msg = "שלום" + (name ? " " + name : "") + ",\n" +
          "מסמך לחתימתך הדיגיטלית מאת אבי קהתי — יועץ נדל\"ן.\n" +
          "פותחים, חותמים באצבע ולוחצים \"אישור\":\n" + res.link;
        if (navigator.clipboard) navigator.clipboard.writeText(res.link).catch(function () {});
        window.open("https://wa.me/?text=" + encodeURIComponent(msg), "_blank");
        toast(res.cloud ? "הקישור מוכן — נפתח וואטסאפ לבחירת הלקוח" : "הקישור מוכן (מצב ללא ענן) — נפתח וואטסאפ");
      }).finally(function () { sendBtn.disabled = false; });
    });
  }

  /* ===== מסך סיום ללקוח ===== */
  function showDone(html) {
    var done = document.createElement("div");
    done.className = "env-done no-print";
    done.innerHTML = '<div class="env-done-card">' + html + "</div>";
    document.body.appendChild(done);
  }

  /* ===== אתחול לפי מצב ===== */
  function initClient(env) {
    document.body.classList.add("env-client");
    applyEnvelope(env);
    // חתימת המתווך ושאר הפנקסים נעולים — הלקוח חותם רק בפנקס שלו
    Object.keys(pads).forEach(function (k) {
      if (k !== CLIENT_PAD) pads[k].lock();
    });
    showBanner(
      '<b>✍️ מסמך לחתימתך</b> — נשלח אליך על ידי אבי קהתי, יועץ נדל"ן. ' +
      'ניתן להשלים פרטים חסרים, לחתום בהחלקת אצבע בשדה <b>"' +
      ($(".sig-box[data-sig=\"" + CLIENT_PAD + "\"] .sig-label") ? $(".sig-box[data-sig=\"" + CLIENT_PAD + "\"] .sig-label").textContent : "החתימה") +
      '"</b>, וללחוץ על <b>"אישור"</b>.'
    );
    var approve = document.createElement("button");
    approve.type = "button";
    approve.className = "btn btn-primary approve-btn no-print";
    approve.textContent = "✅ אישור המסמך";
    approve.addEventListener("click", function () {
      var pad = pads[CLIENT_PAD];
      if (!pad || !pad.dataUrl) {
        toast("נא לחתום תחילה בשדה החתימה");
        if (pad && pad.box) pad.box.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      approve.disabled = true;
      var out = buildEnvelope();
      out.signedAt = Date.now();
      encodePayload(out).then(function (payload) {
        if (DOC_ID) {
          // חזרה ישירה לענן — קהתי רואה את המסמך באתר, בלי לשלוח כלום
          return fsSign(DOC_ID, payload).then(function () {
            showDone('<div style="font-size:44px">✅</div><h2>המסמך נחתם ונשלח</h2>' +
              "<p>המסמך החתום הועבר ישירות לאבי קהתי ויופיע אצלו במערכת.<br>אין צורך בפעולה נוספת.</p>" +
              '<button type="button" class="btn btn-primary" onclick="window.print()">🖨️ שמירת עותק (PDF)</button>' +
              '<a class="btn" style="margin-top:8px" href="https://wa.me/' + BROKER_PHONE +
              '?text=' + encodeURIComponent("שלום אבי, חתמתי על המסמך באתר ✍️✓") + '" target="_blank" rel="noopener">💬 שליחת עדכון לאבי בוואטסאפ (לא חובה)</a>');
          });
        }
        throw new Error("no cloud doc");
      }).catch(function () {
        // גיבוי: המסמך החתום חוזר כקישור בוואטסאפ
        encodePayload(out).then(function (payload) {
          var link = pageBase() + "#signed=" + payload;
          if (navigator.clipboard) navigator.clipboard.writeText(link).catch(function () {});
          var msg = "שלום אבי, חתמתי על המסמך ✍️\n" + (clientName() ? "מאת: " + clientName() + "\n" : "") + link;
          window.open("https://wa.me/" + BROKER_PHONE + "?text=" + encodeURIComponent(msg), "_blank");
          showDone('<div style="font-size:44px">✅</div><h2>המסמך נחתם</h2>' +
            "<p>נפתח וואטסאפ עם קישור המסמך החתום לאבי — יש רק ללחוץ שליחה.<br>" +
            "אם וואטסאפ לא נפתח, הקישור הועתק — הדביקו ושלחו לאבי: 052-8119445.</p>" +
            '<button type="button" class="btn btn-primary" onclick="window.print()">🖨️ שמירת עותק (PDF)</button>');
        });
      }).finally(function () { approve.disabled = false; });
    });
    var toolbar = $(".toolbar");
    if (toolbar) toolbar.insertBefore(approve, toolbar.firstChild);
    autoFill();
    updateProgress();
  }

  function initReceived(env, sourceUrl) {
    document.body.classList.add("env-received");
    applyEnvelope(env);
    var when = env.signedAt ? new Date(env.signedAt) : null;
    var p2 = function (n) { return (n < 10 ? "0" : "") + n; };
    showBanner(
      '<b>📥 מסמך חתום התקבל מהלקוח</b>' +
      (clientName() ? " — " + clientName() : "") +
      (when ? " · נחתם ב-" + p2(when.getDate()) + "/" + p2(when.getMonth() + 1) + "/" + when.getFullYear() +
        " " + p2(when.getHours()) + ":" + p2(when.getMinutes()) : "") +
      '. מומלץ להדפיס או לשמור כ-PDF.',
      "received"
    );
    logPush("kehati-inbox", {
      form: FORM_ID, title: document.title.split("—")[0].trim(),
      name: clientName() || "(ללא שם)", at: env.signedAt || env.t, url: sourceUrl
    }, "at");
    updateProgress();
  }

  function initFailed(msg) {
    showBanner("<b>⚠️ " + msg + "</b> — ייתכן שהקישור שגוי או שהמסמך אינו זמין. פנו לאבי: 052-8119445.", "");
  }

  if (MODE === "client") {
    if (HASH_KIND === "eid") {
      fsGet(DOC_ID).then(function (fields) {
        var raw = fields.data && fields.data.stringValue;
        if (!raw) throw new Error("empty");
        return decodePayload(raw).then(initClient);
      }).catch(function () { initFailed("לא ניתן לטעון את המסמך"); });
    } else {
      decodePayload(HASH_RAW).then(initClient).catch(function () { initFailed("לא ניתן לפענח את הקישור"); });
    }
  } else if (MODE === "received") {
    if (HASH_KIND === "sid") {
      fsGet(DOC_ID).then(function (fields) {
        var raw = (fields.signed && fields.signed.stringValue) || (fields.data && fields.data.stringValue);
        if (!raw) throw new Error("empty");
        var isSigned = !!(fields.signed && fields.signed.stringValue);
        return decodePayload(raw).then(function (env) {
          if (isSigned) initReceived(env, location.href);
          else {
            applyEnvelope(env);
            showBanner("<b>⏳ המסמך עדיין לא נחתם על ידי הלקוח</b> — זהו העותק שנשלח אליו.", "");
          }
        });
      }).catch(function () { initFailed("לא ניתן לטעון את המסמך"); });
    } else {
      decodePayload(HASH_RAW).then(function (env) { initReceived(env, location.href); })
        .catch(function () { initFailed("לא ניתן לפענח את הקישור"); });
    }
  } else {
    var hadDraft = restore();
    autoFill();
    stampDefaultSig();
    updateProgress();
    if (hadDraft) toast("טיוטה שמורה נטענה");
  }
})();
