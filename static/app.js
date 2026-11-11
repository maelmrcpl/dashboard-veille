"use strict";

/* Single-page front end: the shell (top bar, contour background, player dock) is built once,
   only the content of <main> is swapped on navigation, so the audio never stops between pages. */

const view = document.getElementById("view");
const ICONS = {
  play: '<svg class="icon i-play" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8.5 5.6v12.8a.6.6 0 0 0 .9.5l10.4-6.4a.6.6 0 0 0 0-1L9.4 5.1a.6.6 0 0 0-.9.5z"/></svg>',
  pause: '<svg class="icon i-pause" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M8.5 6v12M15.5 6v12"/></svg>',
  close: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" d="M7 7l10 10M17 7L7 17"/></svg>',
};

async function getJson(url) {
  try {
    const response = await fetch(url);
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function formatDate(iso, short = false) {
  const options = short ? { weekday: "short", day: "numeric", month: "short" } : { weekday: "long", day: "numeric", month: "long" };
  return new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", options);
}

function formatTime(seconds) {
  const total = Math.floor(seconds || 0);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function count(n, word) {
  return `${n} ${word}${n > 1 ? "s" : ""}`;
}

/* ---------- Contour lines ---------- */

const contours = (() => {
  const canvas = document.getElementById("contours");
  const ctx = canvas.getContext("2d");
  const STEP = 8; // grid resolution, px
  const GAP = 0.1; // height between two lines
  // Marching squares: for each corner mask, the pairs of cell edges a line crosses (0 top, 1 right, 2 bottom, 3 left).
  const CASES = [[], [[3, 2]], [[2, 1]], [[3, 1]], [[0, 1]], [[0, 1], [3, 2]], [[0, 2]], [[0, 3]],
    [[0, 3]], [[0, 2]], [[0, 3], [2, 1]], [[0, 1]], [[3, 1]], [[2, 1]], [[3, 2]], []];
  let seed = null;
  let timer = 0;

  function random(text) {
    let state = 2166136261;
    for (const char of text) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
    return () => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), state | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function draw() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    // The terrain is a handful of hills and hollows placed in page pixels, so resizing only crops it.
    const rand = random(seed);
    const hills = Array.from({ length: 12 }, () => ({
      x: rand() * 2400,
      y: rand() * 1500,
      radius: 150 + rand() * 360,
      height: (rand() < 0.3 ? -1 : 1) * (0.5 + rand()),
    }));
    const phase = rand() * 6.28;

    const cols = Math.ceil(width / STEP) + 1;
    const rows = Math.ceil(height / STEP) + 1;
    const field = new Float32Array(cols * rows);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const x = i * STEP;
        const y = j * STEP;
        let value = 0.14 * Math.sin(x / 210 + phase) * Math.cos(y / 170 - phase);
        for (const hill of hills) {
          const dx = x - hill.x;
          const dy = y - hill.y;
          value += hill.height * Math.exp(-(dx * dx + dy * dy) / (2 * hill.radius * hill.radius));
        }
        field[j * cols + i] = value;
      }
    }

    const thin = new Path2D();
    const bold = new Path2D();
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const a = field[j * cols + i];
        const b = field[j * cols + i + 1];
        const c = field[(j + 1) * cols + i + 1];
        const d = field[(j + 1) * cols + i];
        const high = Math.max(a, b, c, d);
        const x = i * STEP;
        const y = j * STEP;
        for (let k = Math.ceil(Math.min(a, b, c, d) / GAP); k * GAP < high; k++) {
          const t = k * GAP;
          const mask = (a > t ? 8 : 0) | (b > t ? 4 : 0) | (c > t ? 2 : 0) | (d > t ? 1 : 0);
          const path = k % 5 === 0 ? bold : thin;
          for (const pair of CASES[mask]) {
            for (let n = 0; n < 2; n++) {
              const edge = pair[n];
              const px = edge === 0 ? x + (STEP * (t - a)) / (b - a) : edge === 2 ? x + (STEP * (t - d)) / (c - d) : edge === 1 ? x + STEP : x;
              const py = edge === 1 ? y + (STEP * (t - b)) / (c - b) : edge === 3 ? y + (STEP * (t - a)) / (d - a) : edge === 2 ? y + STEP : y;
              if (n === 0) path.moveTo(px, py);
              else path.lineTo(px, py);
            }
          }
        }
      }
    }
    ctx.strokeStyle = getComputedStyle(canvas).color;
    ctx.lineCap = "round";
    ctx.lineWidth = 0.7;
    ctx.stroke(thin);
    ctx.lineWidth = 1.3;
    ctx.stroke(bold);
  }

  function set(next) {
    if (next === seed) return;
    const first = seed === null;
    seed = next;
    clearTimeout(timer);
    if (first) return draw();
    canvas.classList.add("swap");
    timer = setTimeout(() => { draw(); canvas.classList.remove("swap"); }, 300);
  }

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => seed !== null && draw(), 120);
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => seed !== null && draw());

  return { set };
})();

/* ---------- Player ---------- */

const player = (() => {
  const RATES = [1, 1.25, 1.5, 1.75, 2];
  const KEY = "veille.player";
  const audio = new Audio();
  audio.preload = "metadata";
  let track = null;
  let resumeAt = 0;
  let lastSave = 0;

  const playButton = el("button", { className: "dock-play", type: "button", innerHTML: ICONS.play + ICONS.pause });
  const title = el("strong");
  const subtitle = el("small");
  const meta = el("a", { className: "dock-meta", href: "/", title: "Ouvrir la page de cet audio" }, [title, subtitle]);
  const current = el("span", { textContent: "0:00" });
  const total = el("span", { textContent: "–:––" });
  const seek = el("input", { type: "range", className: "seek", min: 0, max: 1000, value: 0, ariaLabel: "Position de lecture" });
  const back = el("button", { className: "dock-skip", type: "button", textContent: "−15", ariaLabel: "Reculer de 15 secondes" });
  const forward = el("button", { className: "dock-skip", type: "button", textContent: "+30", ariaLabel: "Avancer de 30 secondes" });
  const rate = el("button", { type: "button", textContent: "1×", ariaLabel: "Vitesse de lecture" });
  const close = el("button", { className: "dock-close", type: "button", innerHTML: ICONS.close, ariaLabel: "Fermer le lecteur" });
  const dock = el("div", { className: "dock", role: "region", ariaLabel: "Lecteur audio" }, [
    playButton,
    meta,
    el("div", { className: "dock-timeline" }, [current, seek, total]),
    el("div", { className: "dock-tools" }, [back, forward, rate, close]),
  ]);
  document.body.append(dock);

  const known = () => Number.isFinite(audio.duration) && audio.duration > 0;
  const play = () => audio.play().catch(() => {});

  function save() {
    lastSave = Date.now();
    if (!track) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ track, time: audio.currentTime || resumeAt, rate: audio.playbackRate }));
    } catch { /* storage unavailable: the player still works, it just won't survive a reload */ }
  }

  function forget() {
    try { localStorage.removeItem(KEY); } catch { /* same as above */ }
  }

  function refresh() {
    const position = known() ? audio.currentTime / audio.duration : 0;
    seek.value = Math.round(position * 1000);
    seek.style.setProperty("--p", `${position * 100}%`);
    current.textContent = formatTime(audio.currentTime);
    total.textContent = known() ? formatTime(audio.duration) : "–:––";
  }

  // Reflects the playing state on the dock and on every "listen" button currently on the page.
  function sync() {
    const playing = Boolean(track) && !audio.paused && !audio.ended;
    dock.classList.toggle("playing", playing);
    playButton.ariaLabel = playing ? "Pause" : "Lecture";
    document.querySelectorAll(".listen").forEach((button) => {
      const mine = Boolean(track) && button.dataset.src === track.src;
      button.classList.toggle("current", mine);
      button.classList.toggle("playing", mine && playing);
      button.ariaPressed = String(mine && playing);
      button.querySelector("small").textContent = mine ? (playing ? "En lecture" : "En pause") : button.dataset.hint;
    });
  }

  function setRate(value) {
    audio.defaultPlaybackRate = audio.playbackRate = value;
    rate.textContent = `${String(value).replace(".", ",")}×`;
  }

  function skip(seconds) {
    if (known()) audio.currentTime = Math.min(Math.max(audio.currentTime + seconds, 0), audio.duration);
  }

  function load(next, { time = 0, autoplay = true } = {}) {
    track = next;
    resumeAt = time;
    dock.classList.remove("error");
    if (next.cat) dock.dataset.cat = next.cat;
    else delete dock.dataset.cat;
    title.textContent = next.title;
    subtitle.textContent = next.subtitle;
    meta.href = typeof next.page === "string" && /^\/(?!\/)/.test(next.page) ? next.page : "/";
    audio.src = next.src;
    dock.classList.add("open");
    document.body.classList.add("has-dock");
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: next.title, artist: "Veille", album: next.subtitle });
    }
    refresh();
    sync();
    save();
    if (autoplay) play();
  }

  function toggle(next) {
    if (!track || track.src !== next.src || dock.classList.contains("error")) load(next);
    else if (audio.paused) play();
    else audio.pause();
  }

  function shut() {
    track = null;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    dock.classList.remove("open");
    document.body.classList.remove("has-dock");
    if ("mediaSession" in navigator) navigator.mediaSession.metadata = null;
    forget();
    sync();
  }

  audio.addEventListener("loadedmetadata", () => {
    if (resumeAt && resumeAt < audio.duration - 1) audio.currentTime = resumeAt;
    resumeAt = 0;
    refresh();
  });
  audio.addEventListener("timeupdate", () => {
    refresh();
    if (Date.now() - lastSave > 3000) save();
  });
  audio.addEventListener("play", sync);
  audio.addEventListener("pause", () => { sync(); save(); });
  audio.addEventListener("ended", () => { sync(); save(); });
  audio.addEventListener("error", () => {
    if (!track) return;
    dock.classList.add("error");
    subtitle.textContent = "Audio indisponible";
    forget();
    sync();
  });
  window.addEventListener("pagehide", save);

  playButton.addEventListener("click", () => (audio.paused ? play() : audio.pause()));
  seek.addEventListener("input", () => {
    if (!known()) return;
    audio.currentTime = (seek.value / 1000) * audio.duration;
    refresh();
  });
  back.addEventListener("click", () => skip(-15));
  forward.addEventListener("click", () => skip(30));
  rate.addEventListener("click", () => { setRate(RATES[(RATES.indexOf(audio.playbackRate) + 1) % RATES.length]); save(); });
  close.addEventListener("click", shut);

  if ("mediaSession" in navigator) {
    const handlers = {
      play, pause: () => audio.pause(),
      seekbackward: () => skip(-15),
      seekforward: () => skip(30),
      seekto: (event) => { if (known() && event.seekTime != null) audio.currentTime = event.seekTime; },
    };
    for (const [action, handler] of Object.entries(handlers)) {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* action not supported by this browser */ }
    }
  }

  // After a reload, bring back the last track where it stopped (paused: browsers block autoplay here).
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (saved && saved.track && typeof saved.track.src === "string" && saved.track.src.startsWith("/api/")) {
      setRate(RATES.includes(saved.rate) ? saved.rate : 1);
      load(saved.track, { time: Number(saved.time) || 0, autoplay: false });
    }
  } catch { /* corrupt or unavailable storage: start with no track */ }

  return { toggle, sync };
})();

function listenButton(track, label, hint) {
  const button = el("button", { className: "listen", type: "button" }, [
    el("span", { className: "listen-icon", innerHTML: ICONS.play + ICONS.pause }),
    el("span", { className: "listen-text" }, [el("strong", { textContent: label }), el("small", { textContent: hint })]),
  ]);
  button.dataset.src = track.src;
  button.dataset.hint = hint;
  button.addEventListener("click", () => player.toggle(track));
  return button;
}

/* ---------- Navigation ---------- */

let categories = [];
let routeTicket = 0;
const nav = document.getElementById("nav");
const navLine = el("span", { className: "nav-line" });

function renderNav() {
  const footerLinks = document.getElementById("footer-links");
  for (const item of [{ id: "", label: "Accueil" }, ...categories]) {
    const href = item.id ? `/c/${item.id}` : "/";
    const link = el("a", { href, textContent: item.label });
    link.dataset.id = item.id;
    nav.append(link);
    footerLinks.append(el("a", { href, textContent: item.label }));
  }
  nav.append(navLine);
  document.getElementById("year").textContent = new Date().getFullYear();
}

function setActive(id, animate = true) {
  let active = null;
  for (const link of nav.querySelectorAll("a")) {
    const isActive = link.dataset.id === (id || "");
    link.classList.toggle("active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
      active = link;
    } else {
      link.removeAttribute("aria-current");
    }
  }
  if (!animate) navLine.style.transition = "none";
  navLine.style.left = `${active ? active.offsetLeft : 0}px`;
  navLine.style.width = `${active ? active.offsetWidth : 0}px`;
  if (!animate) {
    void navLine.offsetWidth;
    navLine.style.transition = "";
  }
  if (active && animate) active.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function currentCategoryId() {
  const match = location.pathname.match(/^\/c\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function route({ first = false, scroll = false } = {}) {
  const ticket = ++routeTicket;
  const id = currentCategoryId();
  const category = categories.find((c) => c.id === id) || null;
  setActive(category ? id : null, !first);
  const nodes = id ? await categoryPage(id, category) : await overviewPage();
  if (ticket !== routeTicket) return; // a newer navigation won
  if (category) document.body.dataset.cat = id;
  else delete document.body.dataset.cat;
  document.title = category ? `${category.label} · Veille` : "Veille";
  nodes.forEach((node, i) => node.style.setProperty("--i", i));
  view.replaceChildren(...nodes);
  contours.set(category ? id : "accueil");
  player.sync();
  if (scroll) window.scrollTo(0, 0);
}

function navigate(url) {
  if (url !== location.pathname + location.search) history.pushState(null, "", url);
  route({ scroll: true });
}

document.addEventListener("click", (event) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest && event.target.closest("a[href]");
  if (!link || link.target || link.origin !== location.origin) return;
  if (link.pathname !== "/" && !link.pathname.startsWith("/c/")) return;
  event.preventDefault();
  navigate(link.pathname + link.search);
});
window.addEventListener("popstate", () => route());
window.addEventListener("resize", () => setActive(currentCategoryId(), false));

/* ---------- Pages ---------- */

async function overviewPage() {
  const [reports, journal] = await Promise.all([
    Promise.all(categories.map(async (c) => {
      const days = await getJson(`/api/${c.id}/days`);
      return days && days.length ? getJson(`/api/${c.id}/${days[0]}`) : null;
    })),
    getJson("/api/global-audio/latest"),
  ]);
  const live = reports.filter(Boolean);
  const latest = live.reduce((max, r) => (r.date > max ? r.date : max), "");
  const topicCount = live.reduce((n, r) => n + r.topics.length, 0);
  const sourceNames = [...new Set(live.flatMap((r) => r.topics.flatMap((t) => t.sources.map((s) => s.name))))]
    .sort((a, b) => a.localeCompare(b, "fr"));

  const hero = el("section", { className: "hero" }, [
    el("p", { className: "eyebrow" }, [
      el("span", { textContent: latest ? formatDate(latest) : "En attente de données" }),
      el("span", { className: "mark", textContent: count(topicCount, "sujet") }),
      el("span", { textContent: count(sourceNames.length, "source") }),
    ]),
    el("h1", { textContent: "Votre veille du jour" }),
  ]);
  if (journal) {
    const track = { src: journal.url, title: "Le journal du jour", subtitle: formatDate(journal.date), cat: null, page: "/" };
    hero.append(listenButton(track, "Le journal du jour", `Écouter · ${formatDate(journal.date, true)}`));
  }

  const tiles = el("div", { className: "tiles" });
  const feed = el("div", { className: "feed" });
  categories.forEach((c, i) => {
    const report = reports[i];
    const top = report && report.topics[0];
    const tile = el("a", { className: "tile", href: `/c/${c.id}` }, [
      el("span", { className: "label", textContent: c.label }),
      el("span", { className: top ? "tile-headline" : "tile-headline none", textContent: top ? top.title : "Pas encore de données" }),
      el("span", { className: "tile-foot" }, [
        el("span", { textContent: report ? count(report.topics.length, "sujet") : "Bientôt" }),
        el("span", { className: "arrow", textContent: "→" }),
      ]),
    ]);
    tile.dataset.cat = c.id;
    tiles.append(tile);
    if (!top) return;
    const entry = el("a", { className: "entry", href: `/c/${c.id}` }, [
      el("span", { className: "index", textContent: String(feed.children.length + 1).padStart(2, "0") }),
      el("div", {}, [
        el("div", { className: "label" }, [el("b", { textContent: c.label }), count(top.sources.length, "source")]),
        el("h3", { textContent: top.title }),
        el("p", { textContent: top.text }),
      ]),
    ]);
    entry.dataset.cat = c.id;
    feed.append(entry);
  });
  if (!feed.children.length) feed.append(el("p", { className: "empty", textContent: "Aucun sujet pour le moment." }));

  const layout = el("div", { className: "layout" }, [
    el("section", {}, [
      el("div", { className: "section-title" }, [
        el("h2", { textContent: "À la une" }),
        el("span", { textContent: "Le sujet n°1 de chaque catégorie" }),
      ]),
      feed,
    ]),
  ]);
  if (sourceNames.length) {
    layout.append(el("aside", {}, [
      el("div", { className: "section-title" }, [
        el("h2", { textContent: "Sources du jour" }),
        el("span", { textContent: String(sourceNames.length) }),
      ]),
      el("ul", { className: "sources" }, sourceNames.map((name) => el("li", { textContent: name }))),
    ]));
  }
  return [hero, tiles, layout];
}

function reportNodes(report, category) {
  const nodes = [];
  if (report.has_audio) {
    const track = {
      src: `/api/${category.id}/${report.date}/audio`,
      title: category.label,
      subtitle: formatDate(report.date),
      cat: category.id,
      page: `/c/${category.id}?d=${report.date}`,
    };
    nodes.push(listenButton(track, "Écouter la veille", formatDate(report.date, true)));
  }
  report.topics.forEach((topic, i) => {
    const body = [el("h2", { textContent: topic.title }), el("p", { textContent: topic.text })];
    if (topic.sources.length) {
      body.push(el("details", {}, [
        el("summary", { textContent: count(topic.sources.length, "source") }),
        el("ul", {}, topic.sources.map((s) =>
          el("li", {}, [el("a", { href: s.url, target: "_blank", rel: "noopener", textContent: s.title }), ` · ${s.name}`]))),
      ]));
    }
    const article = el("article", { className: "topic" }, [
      el("div", { className: "index", textContent: String(topic.rank).padStart(2, "0") }),
      el("div", {}, body),
    ]);
    article.style.setProperty("--i", i);
    nodes.push(article);
  });
  return nodes;
}

async function categoryPage(id, category) {
  if (!category) {
    return [el("header", { className: "page-head" }, [
      el("p", { className: "eyebrow", textContent: "Erreur 404" }),
      el("h1", { textContent: "Catégorie introuvable" }),
    ])];
  }
  const days = (await getJson(`/api/${id}/days`)) || [];
  const head = el("header", { className: "page-head" }, [
    el("p", { className: "eyebrow" }, [
      el("span", { className: "mark", textContent: "Catégorie" }),
      el("span", { textContent: days.length ? `${count(days.length, "jour")} d'archives` : "Aucune archive" }),
    ]),
    el("h1", { textContent: category.label }),
  ]);
  if (!days.length) return [head, el("p", { className: "empty", textContent: "Aucune donnée pour le moment." })];

  const daysBox = el("div", { className: "days" });
  const content = el("div", { className: "report" });
  let showTicket = 0;
  const show = async (day) => {
    const ticket = ++showTicket;
    for (const button of daysBox.children) {
      button.classList.toggle("active", button.dataset.day === day);
      button.ariaPressed = String(button.dataset.day === day);
    }
    const report = await getJson(`/api/${id}/${day}`);
    if (ticket !== showTicket) return;
    content.replaceChildren(...(report ? reportNodes(report, category) : [el("p", { className: "empty", textContent: "Ce jour n'est plus disponible." })]));
    player.sync();
  };
  for (const day of days) {
    const button = el("button", { type: "button", textContent: formatDate(day, true) });
    button.dataset.day = day;
    button.addEventListener("click", () => {
      history.replaceState(null, "", day === days[0] ? `/c/${id}` : `/c/${id}?d=${day}`);
      show(day);
    });
    daysBox.append(button);
  }
  const wanted = new URLSearchParams(location.search).get("d");
  await show(days.includes(wanted) ? wanted : days[0]);
  return [head, daysBox, content];
}

(async () => {
  categories = (await getJson("/api/categories")) || [];
  renderNav();
  route({ first: true });
})();
