/* מערכת מסמכים — אבי קהתי יועץ נדל"ן */
(function () {
  "use strict";

  var FORM_ID = document.body.getAttribute("data-form");
  if (!FORM_ID) return;
  var STORE_KEY = "kehati-forms:" + FORM_ID;

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

  /* ===== טוסט ===== */
  var toastEl = document.createElement("div");
  toastEl.className = "toast";
  document.body.appendChild(toastEl);
  var toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 2200);
  }

  /* ===== חתימה בהחלקה ===== */
  function SignaturePad(box) {
    this.box = box;
    this.canvas = $("canvas", box);
    this.ctx = this.canvas.getContext("2d");
    this.dataUrl = null;
    this.drawing = false;
    this.last = null;
    var self = this;

    this.resize();
    window.addEventListener("resize", function () { self.resize(); });

    this.canvas.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      self.canvas.setPointerCapture(e.pointerId);
      self.drawing = true;
      self.last = self.pos(e);
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
      ctx.quadraticCurveTo(self.last.x, self.last.y, (self.last.x + p.x) / 2, (self.last.y + p.y) / 2);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      self.last = p;
    });
    function end() {
      if (!self.drawing) return;
      self.drawing = false;
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
  SignaturePad.prototype.resize = function () {
    var r = this.canvas.getBoundingClientRect();
    if (!r.width) return;
    var dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.dataUrl) this.load(this.dataUrl);
  };
  SignaturePad.prototype.clear = function () {
    var r = this.canvas.getBoundingClientRect();
    this.ctx.clearRect(0, 0, r.width, r.height);
    this.dataUrl = null;
    this.box.classList.remove("signed");
  };
  SignaturePad.prototype.load = function (dataUrl) {
    var self = this;
    var img = new Image();
    img.onload = function () {
      var r = self.canvas.getBoundingClientRect();
      self.ctx.clearRect(0, 0, r.width, r.height);
      self.ctx.drawImage(img, 0, 0, r.width, r.height);
      self.dataUrl = dataUrl;
      self.box.classList.add("signed");
    };
    img.src = dataUrl;
  };

  var pads = {};
  $$(".sig-box").forEach(function (box) {
    pads[box.getAttribute("data-sig")] = new SignaturePad(box);
  });

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

  /* ===== שמירה אוטומטית ===== */
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

  /* ===== אתחול ===== */
  var hadDraft = restore();
  autoFill();
  updateProgress();
  if (hadDraft) toast("טיוטה שמורה נטענה");
})();
