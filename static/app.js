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

function currentNavId() {
  const id = currentCategoryId();
  return categories.some((c) => c.id === id) ? id : null;
}

async function route({ first = false, scroll = false } = {}) {
  const ticket = ++routeTicket;
  const id = currentCategoryId();
  const category = categories.find((c) => c.id === id) || null;
  setActive(currentNavId(), !first);
  const nodes = id ? await categoryPage(id, category) : await overviewPage();
  if (ticket !== routeTicket) return; // a newer navigation won
  if (category) document.body.dataset.cat = id;
  else delete document.body.dataset.cat;
  document.title = category ? `${category.label} · Veille` : "Veille";
  nodes.forEach((node, i) => node.style.setProperty("--i", i));
  view.replaceChildren(...nodes);
  contours.set(category ? id : "accueil");
  player.sync();
  // A search result links to one topic of a day: bring it into view and mark it.
  const target = location.hash ? document.getElementById(location.hash.slice(1)) : null;
  if (target) {
    target.classList.add("hit");
    target.scrollIntoView();
  } else if (scroll) {
    window.scrollTo(0, 0);
  }
}

function navigate(url) {
  if (url !== location.pathname + location.search + location.hash) history.pushState(null, "", url);
  route({ scroll: true });
}

document.addEventListener("click", (event) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest && event.target.closest("a[href]");
  if (!link || link.target || link.origin !== location.origin) return;
  if (link.pathname !== "/" && !link.pathname.startsWith("/c/")) return;
  event.preventDefault();
  navigate(link.pathname + link.search + link.hash);
});
window.addEventListener("popstate", () => route());
window.addEventListener("resize", () => setActive(currentNavId(), false));

/* ---------- Pages ---------- */

const MORE_TOPICS = 2; // titles listed under each category's lead topic on the overview
const MAX_SOURCES = 10; // rows in the overview's source ranking

function daysAgo(iso) {
  const now = new Date();
  const [year, month, day] = iso.split("-").map(Number);
  return Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(year, month - 1, day)) / 86400000);
}

// Lower-cases and strips accents one character at a time, so offsets in the result match the original text.
// Must stay in step with fold() in server.py, which decides what matches.
function fold(text) {
  return text.replace(/[\s\S]/g, (char) => {
    const base = char.normalize("NFD")[0].toLowerCase();
    return base.length === 1 ? base : char;
  });
}

// Splits `text` into strings and <mark> elements around every occurrence of the search terms.
function highlighted(text, terms) {
  const folded = fold(text);
  const ranges = [];
  for (const term of terms) {
    for (let at = folded.indexOf(term); at !== -1; at = folded.indexOf(term, at + term.length)) ranges.push([at, at + term.length]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const nodes = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start < cursor) continue; // overlaps the previous match
    nodes.push(text.slice(cursor, start), el("mark", { textContent: text.slice(start, end) }));
    cursor = end;
  }
  nodes.push(text.slice(cursor));
  return nodes;
}

/* Search palette: an overlay on top of the current page. Results follow the typing; picking one
   navigates to its topic, Escape closes and leaves the page as it was. */
const palette = (() => {
  const MIN_QUERY = 2; // same minimum as the server
  const HINT = "Titres, textes et sources des 14 derniers jours";
  const dialog = document.getElementById("palette");
  const input = document.getElementById("palette-input");
  const list = document.getElementById("palette-results");
  const status = document.getElementById("palette-status");
  let active = -1;
  let timer = 0;
  let ticket = 0;

  function setActive(index, reveal = true) {
    const items = list.querySelectorAll(".palette-item");
    active = items.length ? (index + items.length) % items.length : -1;
    items.forEach((item, i) => {
      item.classList.toggle("active", i === active);
      item.setAttribute("aria-selected", String(i === active));
    });
    if (active >= 0) {
      input.setAttribute("aria-activedescendant", items[active].id);
      if (reveal) items[active].scrollIntoView({ block: "nearest" });
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  }

  function message(text) {
    list.replaceChildren(el("p", { className: "palette-empty", textContent: text }));
    setActive(-1);
  }

  async function search() {
    const mine = ++ticket;
    const query = input.value.trim();
    if (query.length < MIN_QUERY) {
      list.replaceChildren();
      setActive(-1);
      status.textContent = HINT;
      return;
    }
    const data = await getJson(`/api/search?q=${encodeURIComponent(query)}`);
    if (mine !== ticket) return; // a newer keystroke won
    if (!data) {
      status.textContent = HINT;
      return message("La recherche a échoué.");
    }
    if (!data.results.length) {
      status.textContent = "Aucun résultat";
      return message(`Aucun sujet ne correspond à « ${query} ».`);
    }
    const terms = fold(query).split(/\s+/).filter(Boolean);
    list.replaceChildren(...data.results.map((result, i) => {
      const category = categories.find((c) => c.id === result.category);
      const item = el("a", { className: "palette-item", id: `resultat-${i}`, role: "option", href: `/c/${result.category}?d=${result.date}#sujet-${result.rank}` }, [
        el("span", { className: "palette-meta" }, [
          el("span", { className: "label", textContent: category ? category.label : result.category }),
          el("span", { textContent: formatDate(result.date, true) }),
        ]),
        el("strong", {}, highlighted(result.title, terms)),
        el("span", { className: "palette-snippet" }, highlighted(result.snippet, terms)),
      ]);
      item.dataset.cat = result.category;
      item.addEventListener("pointermove", () => { if (active !== i) setActive(i, false); });
      return item;
    }));
    list.scrollTop = 0;
    setActive(0);
    status.textContent = data.total > data.results.length
      ? `${count(data.total, "résultat")} · les ${data.results.length} plus récents affichés`
      : count(data.total, "résultat");
  }

  function open() {
    if (dialog.open) return;
    dialog.showModal();
    input.select(); // the previous query stays, ready to be reused or typed over
  }

  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(search, 150);
  });
  input.addEventListener("keydown", (event) => {
    const items = list.querySelectorAll(".palette-item");
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (items.length) setActive(active + (event.key === "ArrowDown" ? 1 : -1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (active >= 0) items[active].click();
    }
  });
  // Picking a result closes the palette; the document's link handler then does the navigation.
  list.addEventListener("click", (event) => { if (event.target.closest(".palette-item")) dialog.close(); });
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); }); // click on the backdrop
  document.getElementById("search-open").addEventListener("click", open);
  document.addEventListener("keydown", (event) => {
    const shortcut = (event.key === "k" && (event.ctrlKey || event.metaKey))
      || (event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName));
    if (!shortcut) return;
    event.preventDefault();
    open();
  });
  status.textContent = HINT;

  return { open };
})();

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
  // Sources ranked by how many of today's topics cite them.
  const citations = new Map();
  for (const name of live.flatMap((r) => r.topics.flatMap((t) => t.sources.map((s) => s.name)))) {
    citations.set(name, (citations.get(name) || 0) + 1);
  }
  const sources = [...citations].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"));

  const hero = el("section", { className: "hero" }, [
    el("p", { className: "eyebrow" }, [
      el("span", { textContent: latest ? formatDate(latest) : "En attente de données" }),
      el("span", { className: "mark", textContent: count(topicCount, "sujet") }),
      el("span", { textContent: count(sources.length, "source") }),
    ]),
    el("h1", { textContent: "Votre veille du jour" }),
  ]);
  if (journal) {
    const track = { src: journal.url, title: "Le journal du jour", subtitle: formatDate(journal.date), cat: null, page: "/" };
    hero.append(listenButton(track, "Le journal du jour", `Écouter · ${formatDate(journal.date, true)}`));
  }

  // One entry per category: its lead topic in full, then the titles of the next ones.
  const feed = el("div", { className: "feed" });
  categories.forEach((c, i) => {
    const report = reports[i];
    const [top, ...others] = report ? report.topics : [];
    const rank = (topic) => el("span", { className: "index", textContent: String(topic.rank).padStart(2, "0") });
    const body = top
      ? [el("div", { className: "entry-lead" }, [rank(top), el("div", {}, [el("h3", { textContent: top.title }), el("p", { textContent: top.text })])])]
      : [el("p", { className: "empty", textContent: "Pas encore de données." })];
    if (others.length) {
      body.push(el("ol", { className: "entry-more" }, others.slice(0, MORE_TOPICS).map((topic) => el("li", {}, [rank(topic), topic.title]))));
    }
    const side = el("div", { className: "entry-side" }, [
      el("span", { className: "label", textContent: c.label }),
      el("span", { className: "entry-count" }, [
        report ? count(report.topics.length, "sujet") : "Bientôt",
        el("span", { className: "arrow", textContent: "→" }),
      ]),
    ]);
    // Say so when the latest report is not today's (the agent has not run, or failed, for this category).
    const age = report ? daysAgo(report.date) : 0;
    if (age > 0) side.append(el("span", { className: "entry-stale", textContent: age === 1 ? "Rapport d'hier" : `Rapport d'il y a ${age} jours` }));
    const entry = el("a", { className: "entry", href: `/c/${c.id}` }, [side, el("div", {}, body)]);
    entry.dataset.cat = c.id;
    feed.append(entry);
  });

  const layout = el("div", { className: "layout" }, [
    el("section", {}, [
      el("div", { className: "section-title" }, [
        el("h2", { textContent: "À la une" }),
        el("span", { textContent: "Par catégorie" }),
      ]),
      feed,
    ]),
  ]);
  if (sources.length) {
    const rows = sources.slice(0, MAX_SOURCES).map(([name, cited]) => {
      const row = el("li", {}, [name, el("b", { textContent: String(cited) })]);
      row.style.setProperty("--share", cited / sources[0][1]);
      return row;
    });
    if (sources.length > MAX_SOURCES) {
      rows.push(el("li", { className: "more", textContent: `+ ${count(sources.length - MAX_SOURCES, "autre")}` }));
    }
    layout.append(el("aside", {}, [
      el("div", { className: "section-title" }, [
        el("h2", { textContent: "Sources du jour" }),
        el("span", { textContent: "Citations" }),
      ]),
      el("ul", { className: "sources" }, rows),
    ]));
  }
  return [hero, layout];
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
    const article = el("article", { className: "topic", id: `sujet-${topic.rank}` }, [
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
