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
     #env=...    — מסמך שנשלח ללקוח לחתימה (מצב לקוח)
     #signed=... — מסמך חתום שחזר מהלקוח (מצב קבלה אצל קהתי) */
  var MODE = "normal";
  var envelope = null;
  (function () {
    var m = location.hash.match(/^#(env|signed)=(.+)$/);
    if (!m) return;
    try {
      envelope = decB64(m[2]);
      if (envelope && envelope.form === FORM_ID) MODE = m[1] === "env" ? "client" : "received";
      else if (envelope) MODE = m[1] === "env" ? "client" : "received"; // טופס אחר — עדיין ננסה להציג
    } catch (e) { envelope = null; }
  })();

  /* מעבר למעטפה כשהעמוד כבר פתוח — ניווט מלא מחדש כדי להחיל את המצב
     (שינוי פרמטר השאילתה כופה טעינת עמוד אמיתית, בשונה מניווט-hash) */
  window.addEventListener("hashchange", function () {
    if (/^#(env|signed)=/.test(location.hash)) {
      setTimeout(function () {
        location.href = location.pathname + "?r=" + Date.now() + location.hash;
      }, 0);
    }
  });

  function encB64(obj) {
    var bytes = new TextEncoder().encode(JSON.stringify(obj));
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function decB64(s) {
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    var bin = atob(s);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes));
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
    this.strokes = [];      // וקטורים — משמשים לשליחה בקישור (קומפקטי)
    this.drawing = false;
    this.last = null;
    this.cur = null;
    var self = this;

    this.resize();
    window.addEventListener("resize", function () { self.resize(); });

    this.canvas.addEventListener("pointerdown", function (e) {
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
      self.last = p;
      self.cur.push([Math.round(p.x), Math.round(p.y)]);
    });
    function end() {
      if (!self.drawing) return;
      self.drawing = false;
      if (self.cur && self.cur.length > 1) self.strokes.push(self.cur);
      self.cur = null;
      self.dataUrl = self.canvas.toDataURL("image/png");
      self.box.classList.add("signed");
      scheduleSave();
    }
    this.canvas.addEventListener("pointerup", end);
    this.canvas.addEventListener("pointercancel", end);

    var clearBtn = $(".sig-clear", box);
    if (clearBtn) clearBtn.addEventListener("click", function () { self.clear(); scheduleSave(); });
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
    this.refH = r.height;
    if (this.dataUrl) this.load(this.dataUrl);
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
  /* ציור חתימה מוקטורים שהגיעו בקישור */
  SignaturePad.prototype.loadStrokes = function (sig) {
    var r = this.rect();
    if (!r.width || !sig || !sig.s || !sig.s.length) return;
    var sc = r.width / (sig.w || r.width);
    var ctx = this.ctx;
    ctx.clearRect(0, 0, r.width, r.height);
    ctx.strokeStyle = "#18344a";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    sig.s.forEach(function (stroke) {
      ctx.beginPath();
      stroke.forEach(function (p, i) {
        if (i === 0) ctx.moveTo(p[0] * sc, p[1] * sc);
        else ctx.lineTo(p[0] * sc, p[1] * sc);
      });
      ctx.stroke();
    });
    this.strokes = sig.s;
    this.refW = sig.w || r.width;
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
    if (sig.s) this.loadStrokes(sig);
    else if (sig.d) this.load(sig.d);
  };

  var pads = {};
  $$(".sig-box").forEach(function (box) {
    pads[box.getAttribute("data-sig")] = new SignaturePad(box);
  });
  /* איזה פנקס חותם הלקוח מרחוק */
  var CLIENT_PAD = pads.client ? "client" : Object.keys(pads)[0];

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
      if (pads[k].dataUrl) data.sigs[k] = pads[k].dataUrl;
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
      if (pads[k]) pads[k].load(data.sigs[k]);
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
      var env = buildEnvelope();
      delete env.sigs[CLIENT_PAD];   // הלקוח יחתום בעצמו
      var link = pageBase() + "#env=" + encB64(env);
      if (link.length > 30000) { toast("המסמך גדול מדי לשליחה בקישור — צמצמו תוכן"); return; }
      var name = clientName();
      logPush("kehati-sent", {
        form: FORM_ID, title: document.title.split("—")[0].trim(),
        name: name || "(ללא שם)", at: env.t, url: link
      });
      var msg = "שלום" + (name ? " " + name : "") + ",\n" +
        "מצורף מסמך לחתימתך הדיגיטלית מאת אבי קהתי — יועץ נדל\"ן.\n" +
        "פותחים את הקישור, חותמים באצבע ולוחצים \"אישור ושליחה\":\n\n" + link;
      if (navigator.clipboard) navigator.clipboard.writeText(link).catch(function () {});
      window.open("https://wa.me/?text=" + encodeURIComponent(msg), "_blank");
      toast("הקישור הועתק ונפתח וואטסאפ לבחירת הלקוח");
    });
  }

  /* ===== אתחול לפי מצב ===== */
  if (MODE === "client" && envelope) {
    document.body.classList.add("env-client");
    applyEnvelope(envelope);
    showBanner(
      '<b>✍️ מסמך לחתימתך</b> — נשלח אליך על ידי אבי קהתי, יועץ נדל"ן. ' +
      'ניתן להשלים פרטים חסרים, לחתום בהחלקת אצבע בתחתית המסמך, וללחוץ על <b>"אישור ושליחה"</b>.'
    );
    // כפתור אישור גדול
    var approve = document.createElement("button");
    approve.type = "button";
    approve.className = "btn btn-primary approve-btn no-print";
    approve.textContent = "✅ אישור ושליחה לאבי קהתי";
    approve.addEventListener("click", function () {
      var pad = pads[CLIENT_PAD];
      if (!pad || !pad.dataUrl) {
        toast("נא לחתום תחילה בשדה החתימה");
        var box = pad && pad.box;
        if (box) box.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      var out = buildEnvelope();
      out.signedAt = Date.now();
      var link = pageBase() + "#signed=" + encB64(out);
      if (link.length > 30000) { toast("המסמך גדול מדי — פנו לאבי טלפונית"); return; }
      if (navigator.clipboard) navigator.clipboard.writeText(link).catch(function () {});
      var msg = "שלום אבי, חתמתי על המסמך ✍️\n" + (clientName() ? "מאת: " + clientName() + "\n" : "") + "\n" + link;
      window.open("https://wa.me/" + BROKER_PHONE + "?text=" + encodeURIComponent(msg), "_blank");
      // מסך סיום
      var done = document.createElement("div");
      done.className = "env-done no-print";
      done.innerHTML = '<div class="env-done-card"><div style="font-size:44px">✅</div>' +
        "<h2>המסמך נחתם</h2>" +
        "<p>נפתח עבורך וואטסאפ עם קישור המסמך החתום — יש רק ללחוץ שליחה.<br>" +
        'אם וואטסאפ לא נפתח, הקישור הועתק — הדביקו ושלחו אותו לאבי: 052-8119445.</p>' +
        '<button type="button" class="btn btn-primary" onclick="window.print()">🖨️ שמירת עותק (PDF)</button></div>';
      document.body.appendChild(done);
    });
    var toolbar = $(".toolbar");
    if (toolbar) toolbar.insertBefore(approve, toolbar.firstChild);
    autoFill();
    updateProgress();
  } else if (MODE === "received" && envelope) {
    document.body.classList.add("env-received");
    applyEnvelope(envelope);
    var when = envelope.signedAt ? new Date(envelope.signedAt) : null;
    var p2 = function (n) { return (n < 10 ? "0" : "") + n; };
    showBanner(
      '<b>📥 מסמך חתום התקבל מהלקוח</b>' +
      (clientName() ? " — " + clientName() : "") +
      (when ? " · נחתם ב-" + p2(when.getDate()) + "/" + p2(when.getMonth() + 1) + "/" + when.getFullYear() +
        " " + p2(when.getHours()) + ":" + p2(when.getMinutes()) : "") +
      '. המסמך נשמר ברשימת "מסמכים שהתקבלו" באזור האישי. מומלץ להדפיס או לשמור כ-PDF.',
      "received"
    );
    logPush("kehati-inbox", {
      form: FORM_ID, title: document.title.split("—")[0].trim(),
      name: clientName() || "(ללא שם)", at: envelope.signedAt || envelope.t, url: location.href
    }, "at");
    updateProgress();
  } else {
    var hadDraft = restore();
    autoFill();
    updateProgress();
    if (hadDraft) toast("טיוטה שמורה נטענה");
  }
})();
