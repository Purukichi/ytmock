/* ytmock — YouTube appearance simulator */
"use strict";

const $ = (s) => document.querySelector(s);

const stage = $("#stage");
const player = $("#player");
const videoBox = $("#videoBox");
const videoImg = $("#videoImg");
const thumbBox = $("#thumbBox");
const thumbImg = $("#thumbImg");
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

function loadFile(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const reader = new FileReader();
  reader.onload = () => {
    videoImg.src = reader.result;
    thumbImg.src = reader.result;
    setPan(videoImg, 50, 50);
    setPan(thumbImg, 50, 50);
    stage.classList.add("has-img");
  };
  reader.readAsDataURL(file);
}

$("#btnImport").addEventListener("click", () => $("#fileInput").click());
$("#fileInput").addEventListener("change", (e) => loadFile(e.target.files[0]));
videoBox.addEventListener("click", () => {
  if (!stage.classList.contains("has-img")) $("#fileInput").click();
});
player.addEventListener("dragover", (e) => e.preventDefault());
player.addEventListener("drop", (e) => {
  e.preventDefault();
  loadFile(e.dataTransfer.files[0]);
});
document.addEventListener("paste", (e) => {
  for (const item of e.clipboardData.items) {
    if (item.type.startsWith("image/")) {
      loadFile(item.getAsFile());
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
    };
    container.setPointerCapture(e.pointerId);
    container.classList.add("panning");
    e.preventDefault();
  });
  container.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = (e.clientX - drag.x) / stageScale;
    const dy = (e.clientY - drag.y) / stageScale;
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
enablePan(thumbBox, thumbImg);

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
addEventListener("resize", fitStage);

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

async function screenshot() {
  const clone = cloneWithStyles(stage);
  clone.style.transform = "none";
  clone.style.width = "1920px";
  clone.style.height = "1080px";
  clone.querySelector(".flash").remove();

  const wrap = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
  wrap.appendChild(clone);
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">' +
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
  canvas.width = 1920;
  canvas.height = 1080;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = getComputedStyle(stage).backgroundColor;
  ctx.fillRect(0, 0, 1920, 1080);
  ctx.drawImage(img, 0, 0, 1920, 1080);

  const ts = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const name =
    "ytmock_" + ts.getFullYear() + pad(ts.getMonth() + 1) + pad(ts.getDate()) +
    "_" + pad(ts.getHours()) + pad(ts.getMinutes()) + pad(ts.getSeconds()) + ".jpg";

  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/jpeg", 0.92);
  a.download = name;
  a.click();

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
