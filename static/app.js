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
  return categories;
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
}

function renderReport(container, report) {
  container.replaceChildren();
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
    renderReport(content, await getJson(`/api/${id}/${day}`));
  };
  days.forEach((day, i) => {
    const button = el("button", { textContent: formatDate(day, true) });
    button.addEventListener("click", () => show(day, button));
    daysBox.append(button);
    if (i === 0) show(day, button);
  });
}
