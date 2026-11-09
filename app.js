/* ytmock — YouTube appearance simulator */
"use strict";

const $ = (s) => document.querySelector(s);

const stage = $("#stage");
const player = $("#player");
const videoBox = $("#videoBox");
const videoImg = $("#videoImg");
const thumbBox = $("#thumbBox");
const cinemaSlot = $("#cinemaSlot");
const primarySlot = $("#primarySlot");
const arSlider = $("#arSlider");
const arLabel = $("#arLabel");
const videoTitle = $("#videoTitle");
const recTitle = $("#recTitle");

const AR_MIN = 0.5;
const AR_MAX = 2.4;
const AR_LABELS = [
  [9 / 16, "9:16"],
  [4 / 5, "4:5"],
  [1, "1:1"],
  [4 / 3, "4:3"],
  [3 / 2, "3:2"],
  [16 / 9, "16:9"],
  [1.85, "1.85:1"],
  [2.35, "2.35:1"],
];

const state = {
  ar: 16 / 9,
  cinema: false,
};

/* ---------------- aspect ratio ---------------- */

function arToSlider(ar) {
  const t = (Math.log(ar) - Math.log(AR_MIN)) / (Math.log(AR_MAX) - Math.log(AR_MIN));
  return Math.round(t * 1000);
}
function sliderToAr(v) {
  const t = v / 1000;
  return Math.exp(Math.log(AR_MIN) + t * (Math.log(AR_MAX) - Math.log(AR_MIN)));
}
function arText(ar) {
  for (const [v, label] of AR_LABELS) {
    if (Math.abs(ar - v) / v < 0.012) return label;
  }
  return ar >= 1 ? ar.toFixed(2) + ":1" : "1:" + (1 / ar).toFixed(2);
}

function setAr(ar, fromSlider) {
  state.ar = Math.min(AR_MAX, Math.max(AR_MIN, ar));
  if (!fromSlider) arSlider.value = arToSlider(state.ar);
  arLabel.value = arText(state.ar);
  document.querySelectorAll(".pbtn").forEach((b) => {
    const v = parseFloat(b.dataset.ar);
    b.classList.toggle("active", Math.abs(state.ar - v) / v < 0.012);
  });
  layoutBoxes();
}

/* The player frame follows the aspect ratio like the real watch page:
   wider than 16:9 shrinks the frame height (no letterbox bands),
   taller than 16:9 keeps the 16:9 frame and pillarboxes the video.
   In cinema mode the full-width band shrinks the same way, capped at
   its maximum height. */
function layoutBoxes() {
  player.style.height = "";
  const w = player.clientWidth;
  const maxH = state.cinema ? 870 : Math.round((w * 9) / 16);
  const h = Math.min(maxH, Math.round(w / state.ar));
  player.style.height = h + "px";

  // video content box at the chosen ratio, centered in the frame
  let bw, bh;
  if (state.ar >= w / h) {
    bw = w;
    bh = w / state.ar;
  } else {
    bh = h;
    bw = h * state.ar;
  }
  videoBox.style.width = bw + "px";
  videoBox.style.height = bh + "px";
}

/* ---------------- image import ---------------- */

let videoSrc = null;

function readFile(file) {
  return new Promise((resolve) => {
    if (!file || !file.type.startsWith("image/")) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

/* target "all": the image becomes the video (and the thumbnail,
   unless a dedicated thumbnail image was loaded).
   target "thumb": the image is used for the thumbnail only. */
async function loadFile(file, target = "all") {
  const src = await readFile(file);
  if (!src) return;
  if (target === "thumb") {
    setThumbSource(src, true);
    return;
  }
  videoSrc = src;
  videoImg.src = src;
  setPan(videoImg, 50, 50);
  stage.classList.add("has-img");
  document.body.classList.add("has-img");
  if (!thumb.custom) setThumbSource(src, false);
  updateLinkBtn();
}

$("#btnImport").addEventListener("click", () => $("#fileInput").click());
$("#fileInput").addEventListener("change", (e) => {
  loadFile(e.target.files[0]);
  e.target.value = "";
});
videoBox.addEventListener("click", () => {
  if (!stage.classList.contains("has-img")) $("#fileInput").click();
});

/* drop anywhere: onto the thumbnail panel / sidebar thumbnail it
   replaces only the thumbnail, elsewhere it loads the video image */
function dropTarget(el) {
  return el && el.closest && el.closest("#thumbPanel, .yt-thumb") ? "thumb" : "all";
}
document.addEventListener("dragover", (e) => {
  e.preventDefault();
  document.body.dataset.drop = dropTarget(e.target);
});
document.addEventListener("dragleave", (e) => {
  if (!e.relatedTarget) delete document.body.dataset.drop;
});
document.addEventListener("drop", (e) => {
  e.preventDefault();
  delete document.body.dataset.drop;
  loadFile(e.dataTransfer.files[0], dropTarget(e.target));
});
document.addEventListener("paste", (e) => {
  const inPanel = thumbPanel.contains(document.activeElement);
  if (inPanel && /^(TEXTAREA|INPUT)$/.test(document.activeElement.tagName)) return;
  for (const item of e.clipboardData.items) {
    if (item.type.startsWith("image/")) {
      e.preventDefault();
      loadFile(item.getAsFile(), inPanel ? "thumb" : "all");
      break;
    }
  }
});

/* ---------------- image pan (drag to choose the visible area) ---------------- */

function setPan(img, x, y) {
  img.dataset.px = x;
  img.dataset.py = y;
  img.style.objectPosition = x + "% " + y + "%";
}
function clamp01(v) {
  return Math.min(100, Math.max(0, v));
}

/* Dragging shifts object-position along the axis cropped by
   object-fit: cover. Pointer deltas are divided by the current stage
   scale so panning feels 1:1 at any window size. */
function enablePan(container, img) {
  let drag = null;
  container.addEventListener("pointerdown", (e) => {
    if (!stage.classList.contains("has-img") || !img.naturalWidth) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    drag = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      px: +img.dataset.px || 50,
      py: +img.dataset.py || 50,
      ox: img.naturalWidth * s - cw,
      oy: img.naturalHeight * s - ch,
      k: container.getBoundingClientRect().width / cw,
    };
    container.setPointerCapture(e.pointerId);
    container.classList.add("panning");
    e.preventDefault();
  });
  container.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = (e.clientX - drag.x) / drag.k;
    const dy = (e.clientY - drag.y) / drag.k;
    let x = drag.px;
    let y = drag.py;
    if (drag.ox > 1) x = clamp01(drag.px - (dx / drag.ox) * 100);
    if (drag.oy > 1) y = clamp01(drag.py - (dy / drag.oy) * 100);
    setPan(img, x, y);
  });
  const end = (e) => {
    if (drag && e.pointerId === drag.id) {
      drag = null;
      container.classList.remove("panning");
    }
  };
  container.addEventListener("pointerup", end);
  container.addEventListener("pointercancel", end);
}

enablePan(videoBox, videoImg);
videoBox.addEventListener("dblclick", () => setPan(videoImg, 50, 50));

/* ---------------- thumbnail editor ---------------- */

/* The thumbnail is a small composition (image + optional text layer)
   designed on a 1280x720 canvas — the size of a real uploaded
   thumbnail. Every place that shows it (sidebar, panel preview,
   real-size previews, export) is a ".tc" container rendered from the
   same state, scaled by container width / 1280. */

const TW = 1280;
const TH = 720;
const ZOOM_MAX = 5;

const FONTS = {
  gothic: ['"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", Meiryo, "Arial Black", sans-serif', 900],
  round: ['"Hiragino Maru Gothic ProN", "M PLUS Rounded 1c", "Arial Rounded MT Bold", "Yu Gothic", Meiryo, sans-serif', 800],
  mincho: ['"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", "Times New Roman", serif', 800],
  impact: ['Impact, Haettenschweiler, "Arial Narrow Bold", "Arial Black", sans-serif', 400],
};

const thumbPanel = $("#thumbPanel");
const tpPreview = $("#tpPreview");
const zoomSlider = $("#zoomSlider");
const zoomLabel = $("#zoomLabel");

const thumb = {
  src: null,
  custom: false, // true when a dedicated thumbnail image is loaded
  nw: 0,
  nh: 0,
  x: 50,
  y: 50,
  zoom: 1,
  flip: false,
  bri: 100,
  con: 100,
  sat: 100,
  text: "",
  font: "gothic",
  size: 130,
  color: "#ffffff",
  stroke: "#000000",
  strokeW: 12,
  shadow: true,
  band: false,
  bandColor: "#e8243c",
  tx: 50,
  ty: 84,
};

/* ----- containers ----- */

const SIZES = [
  [168, "サイドバー"],
  [120, "小"],
  [96, "最小"],
];
const tpSizes = $("#tpSizes");
const thumbViews = [thumbBox, tpPreview];
for (const [w, label] of SIZES) {
  const fig = document.createElement("figure");
  fig.innerHTML =
    '<div class="tc tp-mini" style="width:' + w + "px;height:" + Math.round((w * 9) / 16) + 'px">' +
    '<img class="tc-img" alt="" draggable="false"><div class="tc-text"></div>' +
    '<span class="yt-dur">12:08</span></div>' +
    "<figcaption>" + label + " " + w + "px</figcaption>";
  tpSizes.appendChild(fig);
  thumbViews.push(fig.firstChild);
}

// off-screen 1280x720 composition used for export
const thumbExport = document.createElement("div");
thumbExport.className = "tc tc-export";
thumbExport.innerHTML = '<img class="tc-img" alt=""><div class="tc-text"></div>';
document.body.appendChild(thumbExport);

/* ----- rendering ----- */

function coverScale(cw, ch) {
  return Math.max(cw / thumb.nw, ch / thumb.nh) * thumb.zoom;
}

function renderInto(cont, cw, ch) {
  const img = cont.querySelector(".tc-img");
  const txt = cont.querySelector(".tc-text");
  const k = cw / TW;

  if (thumb.src && thumb.nw) {
    if (img.getAttribute("src") !== thumb.src) img.src = thumb.src;
    const s = coverScale(cw, ch);
    const dw = thumb.nw * s;
    const dh = thumb.nh * s;
    img.style.display = "block";
    img.style.width = dw + "px";
    img.style.height = dh + "px";
    img.style.left = (-(dw - cw) * thumb.x) / 100 + "px";
    img.style.top = (-(dh - ch) * thumb.y) / 100 + "px";
    img.style.transform = thumb.flip ? "scaleX(-1)" : "none";
    const f = [];
    if (thumb.bri !== 100) f.push("brightness(" + thumb.bri + "%)");
    if (thumb.con !== 100) f.push("contrast(" + thumb.con + "%)");
    if (thumb.sat !== 100) f.push("saturate(" + thumb.sat + "%)");
    img.style.filter = f.join(" ") || "none";
  } else {
    img.style.display = "none";
  }

  if (thumb.text.trim()) {
    const [family, weight] = FONTS[thumb.font];
    txt.textContent = thumb.text;
    txt.style.display = "block";
    txt.style.left = thumb.tx + "%";
    txt.style.top = thumb.ty + "%";
    txt.style.fontFamily = family;
    txt.style.fontWeight = weight;
    txt.style.fontSize = thumb.size * k + "px";
    txt.style.color = thumb.color;
    // stroke is drawn centered on the glyph edge; paint-order puts it
    // behind the fill so the visible outline width is strokeW
    txt.style.webkitTextStroke = thumb.strokeW ? thumb.strokeW * 2 * k + "px " + thumb.stroke : "0";
    txt.style.textShadow = thumb.shadow
      ? Math.max(1, 6 * k) + "px " + Math.max(1, 6 * k) + "px " + 14 * k + "px rgba(0,0,0,.55)"
      : "none";
    txt.style.background = thumb.band ? thumb.bandColor : "transparent";
    txt.style.padding = thumb.band ? 0.08 * thumb.size * k + "px " + 0.4 * thumb.size * k + "px" : "0";
  } else {
    txt.style.display = "none";
  }
}

let renderQueued = false;
function renderThumb() {
  for (const cont of thumbViews) {
    if (!cont.clientWidth) continue;
    renderInto(cont, cont.clientWidth, cont.clientHeight);
  }
  document.body.classList.toggle("has-thumb", !!thumb.src);
  zoomLabel.value = Math.round(thumb.zoom * 100) + "%";
}
function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderThumb();
  });
}

/* ----- image source ----- */

function setThumbSource(src, custom) {
  const probe = new Image();
  probe.onload = () => {
    thumb.src = src;
    thumb.custom = custom;
    thumb.nw = probe.naturalWidth;
    thumb.nh = probe.naturalHeight;
    resetThumb();
    updateLinkBtn();
  };
  probe.src = src;
}

function updateLinkBtn() {
  $("#btnThumbLink").disabled = !(thumb.custom && videoSrc);
}

$("#btnThumbImport").addEventListener("click", () => $("#thumbFileInput").click());
$("#thumbFileInput").addEventListener("change", (e) => {
  loadFile(e.target.files[0], "thumb");
  e.target.value = "";
});
$("#btnThumbLink").addEventListener("click", () => {
  if (videoSrc) setThumbSource(videoSrc, false);
});

/* ----- zoom / pan / flip ----- */

function setThumbZoom(z) {
  thumb.zoom = Math.min(ZOOM_MAX, Math.max(1, z));
  zoomSlider.value = Math.round(thumb.zoom * 100);
  queueRender();
}

/* Zoom keeping the image point under (mx, my) — container px — fixed. */
function zoomAt(cont, z, mx, my) {
  if (!thumb.nw) return;
  const cw = cont.clientWidth;
  const ch = cont.clientHeight;
  const s0 = coverScale(cw, ch);
  const dw0 = thumb.nw * s0;
  const dh0 = thumb.nh * s0;
  const u = (mx + ((dw0 - cw) * thumb.x) / 100) / dw0;
  const v = (my + ((dh0 - ch) * thumb.y) / 100) / dh0;
  thumb.zoom = Math.min(ZOOM_MAX, Math.max(1, z));
  const s1 = coverScale(cw, ch);
  const dw1 = thumb.nw * s1;
  const dh1 = thumb.nh * s1;
  if (dw1 - cw > 0.5) thumb.x = clamp01(((u * dw1 - mx) / (dw1 - cw)) * 100);
  if (dh1 - ch > 0.5) thumb.y = clamp01(((v * dh1 - my) / (dh1 - ch)) * 100);
  zoomSlider.value = Math.round(thumb.zoom * 100);
  queueRender();
}

function resetThumb() {
  thumb.x = 50;
  thumb.y = 50;
  setThumbZoom(1);
}

/* nudge the view by a fraction of the visible frame */
function nudge(cont, fx, fy) {
  if (!thumb.nw) return;
  const cw = cont.clientWidth;
  const ch = cont.clientHeight;
  const s = coverScale(cw, ch);
  const ox = thumb.nw * s - cw;
  const oy = thumb.nh * s - ch;
  if (ox > 1) thumb.x = clamp01(thumb.x + ((fx * cw) / ox) * 100);
  if (oy > 1) thumb.y = clamp01(thumb.y + ((fy * ch) / oy) * 100);
  queueRender();
}

zoomSlider.addEventListener("input", () => {
  // slider zooms around the frame center
  zoomAt(tpPreview, +zoomSlider.value / 100, tpPreview.clientWidth / 2, tpPreview.clientHeight / 2);
});
$("#btnThumbReset").addEventListener("click", resetThumb);

$("#btnThumbFlip").addEventListener("click", (e) => {
  thumb.flip = !thumb.flip;
  e.currentTarget.setAttribute("aria-pressed", String(thumb.flip));
  queueRender();
});
$("#btnThumbGrid").addEventListener("click", (e) => {
  const on = tpPreview.classList.toggle("grid");
  e.currentTarget.setAttribute("aria-pressed", String(on));
});

/* local pointer position in container px (works inside the scaled stage) */
function localPoint(cont, e) {
  const r = cont.getBoundingClientRect();
  const k = r.width / cont.clientWidth;
  return [(e.clientX - r.left) / k, (e.clientY - r.top) / k, k];
}

function thumbWheel(e) {
  if (!thumb.nw) return;
  e.preventDefault();
  const [mx, my] = localPoint(this, e);
  const step = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.001));
  zoomAt(this, thumb.zoom * step, mx, my);
}

const SNAP = 1.6; // % distance at which text snaps to the center lines

function enableThumbDrag(cont, textDraggable) {
  let drag = null;
  cont.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const [, , k] = localPoint(cont, e);
    const cw = cont.clientWidth;
    const ch = cont.clientHeight;
    if (textDraggable && e.target.classList.contains("tc-text")) {
      drag = { mode: "text", id: e.pointerId, x: e.clientX, y: e.clientY, k, cw, ch, sx: thumb.tx, sy: thumb.ty };
    } else {
      if (!thumb.nw) return;
      const s = coverScale(cw, ch);
      drag = {
        mode: "pan",
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        k,
        sx: thumb.x,
        sy: thumb.y,
        ox: thumb.nw * s - cw,
        oy: thumb.nh * s - ch,
      };
    }
    cont.setPointerCapture(e.pointerId);
    cont.classList.add(drag.mode === "text" ? "moving-text" : "panning");
    e.preventDefault();
    cont.focus({ preventScroll: true });
  });
  cont.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = (e.clientX - drag.x) / drag.k;
    const dy = (e.clientY - drag.y) / drag.k;
    if (drag.mode === "text") {
      let tx = Math.min(100, Math.max(0, drag.sx + (dx / drag.cw) * 100));
      let ty = Math.min(100, Math.max(0, drag.sy + (dy / drag.ch) * 100));
      const snapX = !e.altKey && Math.abs(tx - 50) < SNAP;
      const snapY = !e.altKey && Math.abs(ty - 50) < SNAP;
      if (snapX) tx = 50;
      if (snapY) ty = 50;
      cont.classList.toggle("snap-v", snapX);
      cont.classList.toggle("snap-h", snapY);
      thumb.tx = tx;
      thumb.ty = ty;
      updatePosSeg();
    } else {
      if (drag.ox > 1) thumb.x = clamp01(drag.sx - (dx / drag.ox) * 100);
      if (drag.oy > 1) thumb.y = clamp01(drag.sy - (dy / drag.oy) * 100);
    }
    queueRender();
  });
  const end = (e) => {
    if (drag && e.pointerId === drag.id) {
      drag = null;
      cont.classList.remove("panning", "moving-text", "snap-v", "snap-h");
    }
  };
  cont.addEventListener("pointerup", end);
  cont.addEventListener("pointercancel", end);
  cont.addEventListener("wheel", thumbWheel, { passive: false });
  cont.addEventListener("dblclick", (e) => {
    if (!e.target.classList.contains("tc-text")) resetThumb();
  });
}

enableThumbDrag(thumbBox, false);
enableThumbDrag(tpPreview, true);

tpPreview.addEventListener("click", () => {
  if (!thumb.src) $("#thumbFileInput").click();
});

/* keyboard on the focused preview: arrows pan (Shift = larger step),
   +/- zoom, 0 reset, F flip */
tpPreview.addEventListener("keydown", (e) => {
  const step = e.shiftKey ? 0.1 : 0.02;
  const map = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  const cw = tpPreview.clientWidth;
  const ch = tpPreview.clientHeight;
  if (map[e.key]) nudge(tpPreview, ...map[e.key]);
  else if (e.key === "+" || e.key === "=") zoomAt(tpPreview, thumb.zoom * 1.1, cw / 2, ch / 2);
  else if (e.key === "-") zoomAt(tpPreview, thumb.zoom / 1.1, cw / 2, ch / 2);
  else if (e.key === "0") resetThumb();
  else if (e.key === "f" || e.key === "F") $("#btnThumbFlip").click();
  else return;
  e.preventDefault();
});

/* ----- text layer ----- */

function bindInput(id, key, conv = (v) => v, ev = "input") {
  const el = $(id);
  el.addEventListener(ev, () => {
    thumb[key] = conv(el.type === "checkbox" ? el.checked : el.value);
    queueRender();
  });
}
bindInput("#ttText", "text");
bindInput("#ttFont", "font", String, "change");
bindInput("#ttColor", "color");
bindInput("#ttStroke", "stroke");
bindInput("#ttStrokeW", "strokeW", Number);
bindInput("#ttShadow", "shadow", Boolean, "change");
bindInput("#ttBand", "band", Boolean, "change");
bindInput("#ttBandColor", "bandColor");
$("#ttSize").addEventListener("input", (e) => {
  thumb.size = +e.target.value;
  $("#ttSizeVal").value = thumb.size;
  queueRender();
});
// picking a band color implies turning the band on
$("#ttBandColor").addEventListener("input", () => {
  if (!thumb.band) {
    thumb.band = $("#ttBand").checked = true;
    queueRender();
  }
});

function updatePosSeg() {
  document.querySelectorAll("#ttPos button").forEach((b) => {
    b.classList.toggle("active", thumb.tx === 50 && Math.abs(thumb.ty - +b.dataset.ty) < 0.5);
  });
}
document.querySelectorAll("#ttPos button").forEach((b) => {
  b.addEventListener("click", () => {
    thumb.tx = 50;
    thumb.ty = +b.dataset.ty;
    updatePosSeg();
    queueRender();
  });
});
updatePosSeg();

/* ----- color adjustments ----- */

const ADJ = { adjBri: "bri", adjCon: "con", adjSat: "sat" };
function syncAdj() {
  for (const [id, key] of Object.entries(ADJ)) {
    $("#" + id).value = thumb[key];
    document.querySelector('output[for="' + id + '"]').value = thumb[key];
  }
}
for (const [id, key] of Object.entries(ADJ)) {
  const el = $("#" + id);
  el.addEventListener("input", () => {
    thumb[key] = +el.value;
    document.querySelector('output[for="' + id + '"]').value = el.value;
    queueRender();
  });
  // double-click a slider to reset it
  el.addEventListener("dblclick", () => {
    thumb[key] = 100;
    syncAdj();
    queueRender();
  });
}
$("#btnAdjReset").addEventListener("click", () => {
  thumb.bri = thumb.con = thumb.sat = 100;
  syncAdj();
  queueRender();
});

/* ----- duration badge ----- */

$("#durInput").addEventListener("input", (e) => {
  const v = e.target.value.trim();
  document.querySelectorAll("#thumbDur, .tc .yt-dur").forEach((d) => {
    d.textContent = v;
    d.style.display = v ? "" : "none";
  });
});

/* ----- export (1280x720 JPG) ----- */

$("#btnThumbSave").addEventListener("click", async () => {
  if (!thumb.src && !thumb.text.trim()) return;
  renderInto(thumbExport, TW, TH);
  const img = thumbExport.querySelector(".tc-img");
  if (thumb.src) await img.decode().catch(() => {});
  rasterize(thumbExport, TW, TH, stamp("thumbnail")).catch((err) => console.error("thumbnail export failed:", err));
});

/* ----- panel open / close ----- */

function setPanel(open) {
  thumbPanel.hidden = !open;
  $("#btnThumbPanel").setAttribute("aria-pressed", String(open));
  if (open) renderThumb();
}
$("#btnThumbPanel").addEventListener("click", () => setPanel(thumbPanel.hidden));
$("#btnThumbClose").addEventListener("click", () => setPanel(false));
document.addEventListener("keydown", (e) => {
  const t = e.target;
  const typing = t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
  if (e.key === "Escape" && !thumbPanel.hidden && !(typing && t.tagName === "TEXTAREA")) {
    setPanel(false);
  } else if ((e.key === "t" || e.key === "T") && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
    setPanel(thumbPanel.hidden);
  }
});
// clicking the sidebar thumbnail opens the editor
thumbBox.addEventListener("click", () => {
  if (thumbPanel.hidden && !thumb.src) setPanel(true);
});

/* ---------------- toggles ---------------- */

$("#btnTheme").addEventListener("click", () => {
  const dark = document.documentElement.dataset.theme === "dark";
  document.documentElement.dataset.theme = dark ? "light" : "dark";
  stage.classList.toggle("dark", !dark);
  stage.classList.toggle("light", dark);
});

$("#btnCinema").addEventListener("click", () => {
  state.cinema = !state.cinema;
  $("#btnCinema").setAttribute("aria-pressed", String(state.cinema));
  (state.cinema ? cinemaSlot : primarySlot).appendChild(player);
  layoutBoxes();
});

$("#btnSeek").addEventListener("click", () => {
  const on = stage.classList.toggle("seek");
  $("#btnSeek").setAttribute("aria-pressed", String(on));
});

/* ---------------- aspect controls ---------------- */

arSlider.addEventListener("input", () => setAr(sliderToAr(+arSlider.value), true));
document.querySelectorAll(".pbtn").forEach((b) => {
  b.addEventListener("click", () => setAr(parseFloat(b.dataset.ar)));
});

/* ---------------- title editing ---------------- */

function singleLine(el) {
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      el.blur();
    }
  });
}
function syncTitle(from, to) {
  from.addEventListener("input", () => {
    to.textContent = from.textContent;
  });
  singleLine(from);
}
recTitle.contentEditable = "true";
recTitle.spellcheck = false;
syncTitle(videoTitle, recTitle);
syncTitle(recTitle, videoTitle);

/* editable view / like counts (the pills auto-size to the content) */
singleLine($("#viewCount"));
singleLine($("#likeCount"));

$("#btnEdit").addEventListener("click", () => {
  videoTitle.focus();
  const range = document.createRange();
  range.selectNodeContents(videoTitle);
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
});

/* ---------------- recommended list (solid, eye-friendly colors) ---------------- */

const REC_COLORS = ["#9db4a0", "#a3b6c6", "#c6b49d", "#b0a4c0", "#c0a4a8", "#9fbfb8", "#bfb89f", "#a8adb8"];
const REC_DUR = ["3:42", "10:15", "0:58", "24:30", "7:21", "1:05:44", "15:08", "4:56"];
const recList = $("#recList");
REC_COLORS.forEach((color, i) => {
  const item = document.createElement("div");
  item.className = "yt-rec";
  item.innerHTML =
    '<div class="yt-thumb solid"><div class="yt-thumb-fill"></div>' +
    '<span class="yt-dur">' + REC_DUR[i] + "</span></div>" +
    '<div class="yt-rec-info">' +
    '<span class="bar-line w' + (i % 2 ? 85 : 95) + '"></span>' +
    '<span class="bar-line w' + (i % 3 ? 55 : 70) + '"></span>' +
    '<span class="bar-line thin w60"></span>' +
    "</div>";
  item.querySelector(".yt-thumb-fill").style.background = color;
  recList.appendChild(item);
});

/* ---------------- stage scaling (fit any screen) ---------------- */

const stageOuter = $("#stageOuter");
const stageFrame = $("#stageFrame");

let stageScale = 1;

function fitStage() {
  const availW = stageOuter.clientWidth - 30;
  const availH = stageOuter.clientHeight - 30;
  stageScale = Math.max(0.05, Math.min(availW / 1920, availH / 1080));
  stage.style.transform = "scale(" + stageScale + ")";
  stageFrame.style.width = 1920 * stageScale + "px";
  stageFrame.style.height = 1080 * stageScale + "px";
}
addEventListener("resize", () => {
  fitStage();
  renderThumb();
});

/* ---------------- screenshot (JPG, 1920x1080) ---------------- */

/* Renders the stage to a canvas without external libraries:
   deep-clones the stage with all computed styles inlined, then
   rasterizes it through an SVG <foreignObject>. Works offline because
   every resource in the stage is a data URL or plain CSS. */
function cloneWithStyles(node) {
  const clone = node.cloneNode(true);
  const src = [node, ...node.querySelectorAll("*")];
  const dst = [clone, ...clone.querySelectorAll("*")];
  for (let i = 0; i < src.length; i++) {
    const cs = getComputedStyle(src[i]);
    let css = "";
    for (let j = 0; j < cs.length; j++) {
      const p = cs[j];
      css += p + ":" + cs.getPropertyValue(p) + ";";
    }
    dst[i].setAttribute("style", css);
  }
  return clone;
}

/* rasterize a DOM node (laid out at w x h) to a JPG download */
async function rasterize(node, w, h, filename) {
  const clone = cloneWithStyles(node);
  // the inlined computed styles also carry logical insets, which would
  // win over a plain left/top override — drop them first
  for (const prop of ["inset-inline-start", "inset-inline-end", "inset-block-start", "inset-block-end", "right", "bottom"]) {
    clone.style.removeProperty(prop);
  }
  clone.style.transform = "none";
  clone.style.position = "relative";
  clone.style.left = "0";
  clone.style.top = "0";
  clone.style.width = w + "px";
  clone.style.height = h + "px";
  const fl = clone.querySelector(".flash");
  if (fl) fl.remove();

  const wrap = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
  wrap.appendChild(clone);
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">' +
    '<foreignObject width="100%" height="100%">' +
    new XMLSerializer().serializeToString(wrap) +
    "</foreignObject></svg>";

  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = getComputedStyle(node).backgroundColor || "#000";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/jpeg", 0.92);
  a.download = filename;
  a.click();
}

function stamp(prefix) {
  const ts = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    prefix + "_" + ts.getFullYear() + pad(ts.getMonth() + 1) + pad(ts.getDate()) +
    "_" + pad(ts.getHours()) + pad(ts.getMinutes()) + pad(ts.getSeconds()) + ".jpg"
  );
}

async function screenshot() {
  await rasterize(stage, 1920, 1080, stamp("ytmock"));
  const flash = $("#flash");
  flash.classList.remove("on");
  void flash.offsetWidth;
  flash.classList.add("on");
}

$("#btnShot").addEventListener("click", () => {
  screenshot().catch((err) => console.error("screenshot failed:", err));
});

/* ---------------- init ---------------- */

fitStage();
setAr(16 / 9);
