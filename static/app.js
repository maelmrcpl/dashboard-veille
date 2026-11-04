async function getJson(url) {
  const response = await fetch(url);
  return response.ok ? response.json() : null;
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

async function renderNav(activeId) {
  const categories = await getJson("/api/categories");
  const nav = document.getElementById("nav");
  nav.append(el("a", { href: "/", textContent: "Accueil", className: activeId ? "" : "active" }));
  for (const c of categories) {
    const link = el("a", { href: `/c/${c.id}`, textContent: c.label, className: c.id === activeId ? "active" : "" });
    link.dataset.cat = c.id;
    nav.append(link);
  }
  initBubble(nav);
  renderFooter(categories);
  return categories;
}

function renderFooter(categories) {
  const links = document.getElementById("footer-links");
  links.append(el("a", { href: "/", textContent: "Accueil" }));
  for (const c of categories) {
    const link = el("a", { href: `/c/${c.id}`, textContent: c.label });
    link.dataset.cat = c.id;
    links.append(link);
  }
  document.getElementById("year").textContent = new Date().getFullYear();
}

function initBubble(nav) {
  const DRAG_WIDTH = 120;
  const links = [...nav.querySelectorAll("a")];
  const active = nav.querySelector("a.active");
  const bubble = el("div", { className: "nav-bubble" });
  nav.append(bubble);

  const setUnder = (link) => links.forEach((l) => l.classList.toggle("active", l === link));
  const place = (link) => {
    bubble.style.left = `${link.offsetLeft}px`;
    bubble.style.top = `${link.offsetTop}px`;
    bubble.style.width = `${link.offsetWidth}px`;
    bubble.style.height = `${link.offsetHeight}px`;
  };
  const nearest = (center) =>
    links.reduce((best, l) => (Math.abs(l.offsetLeft + l.offsetWidth / 2 - center) < Math.abs(best.offsetLeft + best.offsetWidth / 2 - center) ? l : best));

  const previous = JSON.parse(sessionStorage.getItem("bubble") || "null");
  if (previous) Object.assign(bubble.style, previous);
  else place(active);
  bubble.style.opacity = "1";
  void bubble.offsetWidth;
  bubble.classList.add("animate");
  place(active);

  window.addEventListener("pagehide", () => sessionStorage.setItem("bubble", JSON.stringify({
    left: bubble.style.left, top: bubble.style.top, width: bubble.style.width, height: bubble.style.height,
  })));
  window.addEventListener("resize", () => { bubble.classList.remove("animate"); place(active); });

  let drag = null;
  active.addEventListener("dragstart", (e) => e.preventDefault());
  active.addEventListener("click", (e) => { if (drag || active.dataset.dragged) e.preventDefault(); });
  active.addEventListener("pointerdown", (e) => {
    active.setPointerCapture(e.pointerId);
    delete active.dataset.dragged;
    const center = active.offsetLeft + active.offsetWidth / 2;
    bubble.style.width = `${DRAG_WIDTH}px`;
    bubble.style.left = `${center - DRAG_WIDTH / 2}px`;
    drag = { x: e.clientX, left: center - DRAG_WIDTH / 2, target: active };
    bubble.classList.add("dragging");
  });
  active.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 3) active.dataset.dragged = "1";
    const left = Math.min(Math.max(drag.left + dx, 0), nav.clientWidth - bubble.offsetWidth);
    bubble.style.left = `${left}px`;
    drag.target = nearest(left + bubble.offsetWidth / 2);
    setUnder(drag.target);
  });
  const release = () => {
    if (!drag) return;
    const { target } = drag;
    drag = null;
    bubble.classList.remove("dragging");
    if (target === active) place(active);
    else setTimeout(() => { location.href = target.href; }, 200);
  };
  active.addEventListener("pointerup", release);
  active.addEventListener("pointercancel", release);
}

const glow = el("div", { id: "cursor-glow" });
document.body.append(glow);

document.addEventListener("pointermove", (e) => {
  const card = e.target.closest && e.target.closest(".tile, .card");
  glow.style.transform = `translate(${e.clientX - 220}px, ${e.clientY - 220}px)`;
  glow.classList.toggle("visible", !card);
  if (!card) return;
  const rect = card.getBoundingClientRect();
  card.style.setProperty("--mx", `${e.clientX - rect.left}px`);
  card.style.setProperty("--my", `${e.clientY - rect.top}px`);
  card.style.setProperty("--rx", `${-((e.clientY - rect.top) / rect.height - 0.5) * 10}deg`);
  card.style.setProperty("--ry", `${((e.clientX - rect.left) / rect.width - 0.5) * 10}deg`);
});

document.addEventListener("pointerout", (e) => {
  if (!e.relatedTarget) glow.classList.remove("visible");
  const card = e.target.closest && e.target.closest(".tile, .card");
  if (card && !card.contains(e.relatedTarget)) {
    card.style.removeProperty("--rx");
    card.style.removeProperty("--ry");
  }
});

function stagger(container, selector, offset = 0) {
  container.querySelectorAll(selector).forEach((node, i) => node.style.setProperty("--i", i + offset));
}

async function loadOverview() {
  const categories = await renderNav(null);
  const tiles = document.getElementById("tiles");
  const feed = document.getElementById("feed");
  const sourceNames = new Set();
  let latest = "";
  let totalTopics = 0;
  for (const c of categories) {
    const days = await getJson(`/api/${c.id}/days`);
    const report = days && days.length ? await getJson(`/api/${c.id}/${days[0]}`) : null;
    const top = report ? report.topics[0] : null;
    if (report) {
      if (report.date > latest) latest = report.date;
      totalTopics += report.topics.length;
      report.topics.forEach((t) => t.sources.forEach((s) => sourceNames.add(s.name)));
    }
    const tile = el("a", { className: "tile", href: `/c/${c.id}` }, [
      el("div", { className: "tile-top" }, [
        el("span", { className: "dot" }),
        el("h2", { textContent: c.label }),
        el("span", { className: "arrow", textContent: "→" }),
      ]),
      el("span", { className: "headline", textContent: top ? top.title : "Pas encore de données" }),
      el("div", { className: "tile-foot mono", textContent: report ? `${report.topics.length} sujets` : "Bientôt" }),
    ]);
    tile.dataset.cat = c.id;
    tiles.append(tile);
    if (top) {
      const card = el("a", { className: "card", href: `/c/${c.id}` }, [
        el("div", { className: "card-meta mono" }, [
          el("span", { className: "chip", textContent: c.label }),
          `${top.sources.length} source${top.sources.length > 1 ? "s" : ""}`,
        ]),
        el("h3", { textContent: top.title }),
        el("p", { textContent: top.text }),
      ]);
      card.dataset.cat = c.id;
      feed.append(card);
    }
  }
  if (latest) document.getElementById("date").textContent = formatDate(latest);
  document.getElementById("count").textContent = `${totalTopics} sujets analysés`;
  document.getElementById("sources").append(...[...sourceNames].sort().map((n) => el("span", { textContent: n })));
  stagger(tiles, ".tile");
  stagger(feed, ".card", categories.length);
  const globalAudio = await getJson("/api/global-audio/latest");
  if (globalAudio) {
    document.getElementById("global-player").append(
      renderPlayer(globalAudio.url, `Le journal du jour · ${formatDate(globalAudio.date, true)}`));
  }
}

let currentAudio = null;

function formatTime(seconds) {
  const total = Math.floor(seconds || 0);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function renderPlayer(src, title = "Écouter la veille") {
  const audio = el("audio", { src, preload: "metadata" });
  const button = el("button", { className: "play", textContent: "▶", ariaLabel: "Lecture" });
  const seek = el("input", { type: "range", className: "seek", min: 0, max: 1000, value: 0 });
  const time = el("span", { className: "time mono", textContent: "0:00 / –:––" });
  const update = () => { time.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`; };

  button.addEventListener("click", () => (audio.paused ? audio.play() : audio.pause()));
  audio.addEventListener("play", () => { button.textContent = "❚❚"; });
  audio.addEventListener("pause", () => { button.textContent = "▶"; });
  audio.addEventListener("loadedmetadata", update);
  audio.addEventListener("timeupdate", () => {
    if (audio.duration) seek.value = (audio.currentTime / audio.duration) * 1000;
    update();
  });
  seek.addEventListener("input", () => { if (audio.duration) audio.currentTime = (seek.value / 1000) * audio.duration; });
  currentAudio = audio;

  return el("div", { className: "player" }, [
    button,
    el("div", { className: "player-body" }, [el("strong", { textContent: title }), seek]),
    time,
  ]);
}

function renderReport(container, report, id) {
  if (currentAudio) currentAudio.pause();
  currentAudio = null;
  container.replaceChildren();
  if (report.has_audio) container.append(renderPlayer(`/api/${id}/${report.date}/audio`));
  for (const t of report.topics) {
    const body = [
      el("h2", { textContent: t.title }),
      el("p", { textContent: t.text }),
    ];
    if (t.sources.length) {
      const links = t.sources.map((s) =>
        el("li", {}, [el("a", { href: s.url, target: "_blank", rel: "noopener", textContent: s.title }), ` · ${s.name}`]));
      body.push(el("details", {}, [
        el("summary", { textContent: `${t.sources.length} source${t.sources.length > 1 ? "s" : ""}` }),
        el("ul", {}, links),
      ]));
    }
    container.append(el("article", { className: "topic" }, [
      el("div", { className: "rank", textContent: String(t.rank).padStart(2, "0") }),
      el("div", {}, body),
    ]));
  }
  stagger(container, ".topic");
}

async function loadCategory() {
  const id = location.pathname.split("/").pop();
  document.body.dataset.cat = id;
  const categories = await renderNav(id);
  document.getElementById("title").textContent = categories.find((c) => c.id === id).label;
  const days = await getJson(`/api/${id}/days`);
  const daysBox = document.getElementById("days");
  const content = document.getElementById("content");
  if (!days.length) {
    content.append(el("p", { className: "empty", textContent: "Aucune donnée pour le moment." }));
    return;
  }
  const show = async (day, button) => {
    daysBox.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === button));
    renderReport(content, await getJson(`/api/${id}/${day}`), id);
  };
  days.forEach((day, i) => {
    const button = el("button", { textContent: formatDate(day, true) });
    button.addEventListener("click", () => show(day, button));
    daysBox.append(button);
    if (i === 0) show(day, button);
  });
}
