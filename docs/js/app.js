// Древо рода Житниковых — одностраничное приложение.
import { renderTree } from "./tree.js?v=d5";

const app = document.getElementById("app");
let DB = null;              // {persons, families}
let PHOTOS = [];            // уникальные фотографии (без вырезок-аватарок)
let DEFAULT_FOCUS = null;

// ————— утилиты —————
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function fullName(p) {
  return [(p.given || "").trim(), (p.surname || "").trim()].filter(Boolean).join(" ") || "Без имени";
}
function years(p) {
  const b = p.birth?.date?.year, d = p.death?.date?.year;
  if (b && d) return `${b} — ${d}`;
  if (b) return String(b) + (p.death ? " — †" : "");
  if (d) return `† ${d}`;
  return "";
}
function lifespan(p) {
  const b = p.birth?.date?.year, d = p.death?.date?.year;
  if (b && d && d >= b) return d - b;
  return null;
}
function avatarFile(p) {
  if (!p.photos) return null;
  const primCut = p.photos.find(ph => ph.cutout && ph.prim);
  if (primCut) return primCut.file;
  const cut = p.photos.find(ph => ph.cutout);
  if (cut) return cut.file;
  const prim = p.photos.find(ph => ph.prim);
  if (prim) return prim.file;
  return p.photos[0]?.file || null;
}
function displayPhotos(p) {
  // без вырезок (это crop-аватарки), без дублей
  const seen = new Set();
  return (p.photos || []).filter(ph => {
    if (ph.cutout) return false;
    if (seen.has(ph.file)) return false;
    seen.add(ph.file);
    return true;
  });
}
function parentsOf(p) {
  const out = [];
  for (const fid of p.famc || []) {
    const f = DB.families[fid];
    if (!f) continue;
    if (f.husband && DB.persons[f.husband]) out.push(DB.persons[f.husband]);
    if (f.wife && DB.persons[f.wife]) out.push(DB.persons[f.wife]);
  }
  return out;
}
function siblingsOf(p) {
  const sibs = new Map();
  for (const fid of p.famc || []) {
    const f = DB.families[fid];
    if (!f) continue;
    for (const c of f.children || []) if (c !== p.id && DB.persons[c]) sibs.set(c, DB.persons[c]);
  }
  return [...sibs.values()];
}
function spousesOf(p) {
  const out = [];
  for (const fid of p.fams || []) {
    const f = DB.families[fid];
    if (!f) continue;
    const sid = f.husband === p.id ? f.wife : f.husband;
    out.push({ spouse: sid ? DB.persons[sid] : null, family: f });
  }
  return out;
}

// ————— загрузка —————
async function boot() {
  // no-cache: GitHub Pages отдаёт max-age=600, а данные должны быть свежими сразу после пуша
  const res = await fetch("data.json", { cache: "no-cache" });
  DB = await res.json();

  // индекс уникальных фото для галереи
  const byFile = new Map();
  for (const p of Object.values(DB.persons)) {
    for (const ph of p.photos || []) {
      if (ph.cutout) continue;
      if (!byFile.has(ph.file)) byFile.set(ph.file, { ...ph, people: [] });
      byFile.get(ph.file).people.push(p.id);
    }
  }
  PHOTOS = [...byFile.values()];

  // фокус по умолчанию: Даниил Житников, иначе первый с фото
  const all = Object.values(DB.persons);
  DEFAULT_FOCUS =
    (all.find(p => p.given === "Даниил" && p.surname === "Житников") ||
     all.find(p => p.photos?.length) || all[0]).id;

  initChrome();
  renderFooter();
  window.addEventListener("hashchange", route);
  route();
}

// ————— роутер —————
function route() {
  const hash = location.hash.replace(/^#\/?/, "");
  const [view, arg] = hash.split("/");
  document.querySelectorAll(".nav a").forEach(a => {
    a.classList.toggle("active", a.dataset.route === (view || ""));
  });
  // древо — полноэкранный слой, подвал под ним всё равно недостижим
  document.body.classList.toggle("route-tree", view === "tree");
  disposeHome3D();
  document.getElementById("nav").classList.remove("open");
  closeLightbox();
  window.scrollTo(0, 0);
  switch (view) {
    case "":
    case undefined: return renderHome();
    case "tree": return renderTreeView(arg || DEFAULT_FOCUS);
    case "person": return renderPerson(arg);
    case "people": return renderPeople();
    case "gallery": return renderGallery();
    case "timeline": return renderTimeline();
    case "stats": return renderStats();
    default: return renderHome();
  }
}

// ————— главная: 3D-древо и глобус —————
let home3d = { drevo: null, globe: null };
function disposeHome3D() {
  home3d.drevo?.dispose(); home3d.globe?.dispose();
  home3d = { drevo: null, globe: null };
}

function renderHome() {
  const ps = Object.values(DB.persons);
  const yearsAll = ps.flatMap(p => [p.birth?.date?.year, p.death?.date?.year]).filter(Boolean);
  const minY = Math.min(...yearsAll), maxY = Math.max(...yearsAll);
  const gens = generationsCount();
  const surnames = new Set(ps.map(p => p.surname).filter(Boolean));

  app.innerHTML = `
  <div class="hero3d" id="hero3d">
    <div class="hero3d-ui">
      <div class="hero3d-head">
        <div class="hero3d-kicker">${minY} — ${maxY} · ${gens} поколений</div>
        <h1>Древо рода<br><em>Житниковых</em></h1>
        <div class="hero3d-sub">Каждая ветвь — человек. Каждый лист — жизнь.</div>
        <div class="hero3d-cta">
          <a class="btn btn-primary" href="#/tree">Открыть древо рода</a>
          <a class="btn btn-ghost" href="#/timeline">Хроника</a>
        </div>
      </div>

    </div>
  </div>

  <section class="globe-sec" id="globeSec">
    <div class="globe-head">
      <div class="page-kicker">География рода</div>
      <h2>Где жили и куда шли</h2>
      <p>Страны, где жил род, — залиты светом. Точки — места рождений и смертей, дуги — путь от родителей к детям.</p>
    </div>
    <div class="globe-stage" id="globeStage">
      <div class="globe-legend"><b>залитая страна</b> — здесь жил род · точка — место · дуга — переезд поколения · клик по точке — кто здесь жил</div>
      <aside class="globe-panel" id="globePanel" hidden></aside>
    </div>
  </section>

  <div class="home-cards">
    <a class="home-card" href="#/tree">
      <div class="hc-num">I</div><h3>Древо</h3>
      <p>Рабочая карта рода: предки и потомки каждой персоны, браки и ветви семьи.</p>
    </a>
    <a class="home-card" href="#/people">
      <div class="hc-num">II</div><h3>Люди</h3>
      <p>Все ${ps.length} человек и ${surnames.size} фамилий — с поиском по имени и месту рождения.</p>
    </a>
    <a class="home-card" href="#/gallery">
      <div class="hc-num">III</div><h3>Галерея</h3>
      <p>${PHOTOS.length} фотографий семейного архива — от дореволюционных портретов до наших дней.</p>
    </a>
    <a class="home-card" href="#/stats">
      <div class="hc-num">IV</div><h3>Статистика</h3>
      <p>Род в цифрах: поколения, география, долголетие и самые распространённые фамилии.</p>
    </a>
  </div>`;

  initHome3D();
}

async function initHome3D() {
  const heroEl = document.getElementById("hero3d");
  try {
    const [{ mountDrevo }, { mountMap }] = await Promise.all([
      import("./drevo2d.js?v=d5"),
      import("./map2d.js?v=d5"),
    ]);
    if (!document.getElementById("hero3d")) return; // уже ушли со страницы
    home3d.drevo = mountDrevo(heroEl, DB, {
      onOpenPerson: (id) => { location.hash = `#/person/${id}`; },
    });
    home3d.globe = await mountMap(document.getElementById("globeStage"), DB, {
      onOpenSpot: showGlobeSpot,
    });
  } catch (e) {
    console.error("3D init failed:", e);
    heroEl.classList.add("no3d");
  }
}

function showGlobeSpot(spot) {
  const panel = document.getElementById("globePanel");
  if (!panel) return;
  const seen = new Set();
  const rows = spot.people.filter(({ id }) => {
    if (seen.has(id)) return false;
    seen.add(id); return true;
  }).map(({ id, kind }) => {
    const p = DB.persons[id];
    return `<div style="display:flex;align-items:center;gap:4px">${pchip(p)}<span class="gp-kind">${kind}</span></div>`;
  }).join("");
  panel.innerHTML = `
    <button class="gp-close" id="gpClose">✕</button>
    <h4>${esc(spot.label)}</h4>
    <div class="gp-sub">${spot.people.length} ${peopleWord(spot.people.length)} рода</div>
    ${rows}`;
  panel.hidden = false;
  document.getElementById("gpClose").onclick = () => { panel.hidden = true; };
}

function generationsCount() {
  // самая длинная цепочка «родитель → ребёнок»
  const memo = new Map();
  const depth = (pid, guard) => {
    if (memo.has(pid)) return memo.get(pid);
    if (guard.has(pid)) return 1;
    guard.add(pid);
    let best = 1;
    const p = DB.persons[pid];
    for (const fid of p.fams || []) {
      const f = DB.families[fid];
      for (const c of f?.children || []) {
        if (DB.persons[c]) best = Math.max(best, 1 + depth(c, guard));
      }
    }
    guard.delete(pid);
    memo.set(pid, best);
    return best;
  };
  let g = 1;
  for (const pid of Object.keys(DB.persons)) g = Math.max(g, depth(pid, new Set()));
  return g;
}

// ————— древо —————
function renderTreeView(focusId) {
  if (!DB.persons[focusId]) focusId = DEFAULT_FOCUS;
  const p = DB.persons[focusId];
  app.innerHTML = `
  <div class="tree-wrap">
    <svg class="tree-svg" id="treeSvg"></svg>
    <div class="tree-title">В фокусе: <b>${esc(fullName(p))}</b> · клик по карточке — страница персоны, ↑↓ — раскрыть ветвь</div>
    <div class="tree-legend">
      <span><span class="dot" style="background:var(--azure)"></span>мужчины</span>
      <span><span class="dot" style="background:var(--bordeaux)"></span>женщины</span>
      <span><span class="dot" style="background:var(--gold)"></span>брак</span>
    </div>
    <div class="tree-hud">
      <button id="zin" title="Приблизить">+</button>
      <button id="zout" title="Отдалить">−</button>
      <button id="zfit" title="Вписать">⌂</button>
    </div>
  </div>`;
  const svg = document.getElementById("treeSvg");
  renderTree(svg, DB, focusId, {
    maxUp: 3, maxDown: 3,
    avatar: avatarFile,
    years,
    onOpen: (id) => { location.hash = `#/person/${id}`; },
    onFocus: (id) => { location.hash = `#/tree/${id}`; },
  });
  document.getElementById("zin").onclick = () => svg._zoom(1.3);
  document.getElementById("zout").onclick = () => svg._zoom(1 / 1.3);
  document.getElementById("zfit").onclick = () => svg._fit();
}

// ————— персона —————
function renderPerson(pid) {
  const p = DB.persons[pid];
  if (!p) { app.innerHTML = `<div class="page"><p>Персона не найдена.</p></div>`; return; }

  const av = avatarFile(p);
  const photos = displayPhotos(p);
  const parents = parentsOf(p);
  const sibs = siblingsOf(p);
  const spouses = spousesOf(p);

  const events = [];
  if (p.birth) events.push({ icon: "✶", label: p.sex === "F" ? "Родилась" : "Родился", ev: p.birth, cls: "birth" });
  if (p.christening) events.push({ icon: "✠", label: "Крещение", ev: p.christening, cls: "birth" });
  for (const { spouse, family } of spouses) {
    if (family.marriage) {
      events.push({ icon: "⚭", label: `Брак — ${spouse ? `<a href="#/person/${spouse.id}">${esc(fullName(spouse))}</a>` : "супруг(а) неизвестен(на)"}`, ev: family.marriage, cls: "marr", html: true });
    }
  }
  for (const e of p.events || []) {
    events.push({ icon: "•", label: esc(e.type || "Событие"), ev: e, cls: "" });
  }
  if (p.death) events.push({ icon: "†", label: (p.sex === "F" ? "Умерла" : "Умер") + (p.death.cause ? ` — ${esc(p.death.cause)}` : ""), ev: p.death, cls: "death" });
  if (p.burial) events.push({ icon: "▭", label: "Погребение", ev: p.burial, cls: "death" });
  events.sort((a, b) => (a.ev.date?.sort ?? 9e9) - (b.ev.date?.sort ?? 9e9));

  const ls = lifespan(p);
  const chips = [
    ...(p.occupation || []).map(o => `<span class="chip">💼 ${esc(o)}</span>`),
    ...(p.education || []).map(o => `<span class="chip">🎓 ${esc(o)}</span>`),
    ...(p.religion ? [`<span class="chip">✠ ${esc(p.religion)}</span>`] : []),
    ...(ls !== null ? [`<span class="chip">${ls} ${yearsWord(ls)} жизни</span>`] : []),
  ].join("");

  app.innerHTML = `
  <div class="page">
    <div class="person-hero">
      <div>
        <div class="portrait-frame">
          ${av
            ? `<img src="media/full/${av}" alt="${esc(fullName(p))}">`
            : `<div class="portrait-placeholder avatar-bg-${p.sex}" style="opacity:.85">${esc((p.given || "?").slice(0, 1))}</div>`}
        </div>
        <div class="person-id-chip">запись ${esc(p.id)}</div>
      </div>
      <div class="person-head">
        <div class="page-kicker">${p.sex === "F" ? "Летопись · Она" : p.sex === "M" ? "Летопись · Он" : "Летопись"}</div>
        <h2>${esc(fullName(p))}</h2>
        ${p.marriedName ? `<div class="maiden">в браке — ${esc(p.marriedName)}</div>` : ""}
        <div class="person-dates">
          ${p.birth ? `✶ <b>${esc(p.birth.date?.text || "?")}</b>${p.birth.place ? ` · ${esc(p.birth.place)}` : ""}<br>` : ""}
          ${p.death ? `† <b>${esc(p.death.date?.text || "?")}</b>${p.death.place ? ` · ${esc(p.death.place)}` : ""}` : ""}
        </div>
        ${chips ? `<div class="chips">${chips}</div>` : ""}
        <div class="person-actions">
          <a class="btn btn-primary" href="#/tree/${p.id}">Показать в древе</a>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title"><h3>Семья</h3></div>
      <div class="rel-groups">
        ${relGroup("Родители", parents)}
        ${relGroup("Братья и сёстры", sibs)}
        ${spouseGroup(spouses)}
        ${childrenGroups(spouses, p)}
      </div>
    </div>

    ${events.length ? `
    <div class="section">
      <div class="section-title"><h3>Жизненный путь</h3></div>
      <div class="life-events">
        ${events.map(e => `
          <div class="levent ${e.cls}">
            <div class="le-when">${esc(e.ev.date?.text || "дата неизвестна")}</div>
            <div class="le-what">${e.icon} ${e.html ? e.label : esc(stripTags(e.label))}</div>
            ${e.ev.place ? `<div class="le-where">${esc(e.ev.place)}</div>` : ""}
          </div>`).join("")}
      </div>
    </div>` : ""}

    ${p.notes?.length || p.links?.length ? `
    <div class="section">
      <div class="section-title"><h3>Биография</h3></div>
      <div class="bio">${(p.notes || []).map(n => n.split(/\n{2,}/).map(par => `<p>${esc(par).replace(/\n/g, "<br>")}</p>`).join("")).join("")}</div>
      ${p.links?.length ? `<div class="bio-links">${p.links.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener">🔗 ${esc(l.name || l.url)}</a>`).join("")}</div>` : ""}
    </div>` : ""}

    ${photos.length ? `
    <div class="section">
      <div class="section-title"><h3>Фотографии</h3><span class="count">${photos.length}</span></div>
      <div class="photo-grid" id="pgrid">
        ${photos.map((ph, i) => `
          <figure data-i="${i}">
            <img src="media/t/${ph.file}" alt="${esc(ph.title || fullName(p))}" loading="lazy">
            ${ph.title ? `<figcaption>${esc(ph.title)}</figcaption>` : ""}
          </figure>`).join("")}
      </div>
    </div>` : ""}

    ${p.sources?.length ? `
    <div class="section">
      <div class="section-title"><h3>Источники</h3></div>
      <ul class="sources">${p.sources.map(s => `<li>${esc(s.title)}${s.page ? ` — ${esc(s.page)}` : ""}</li>`).join("")}</ul>
    </div>` : ""}
  </div>`;

  const grid = document.getElementById("pgrid");
  if (grid) grid.addEventListener("click", (e) => {
    const fig = e.target.closest("figure");
    if (fig) openLightbox(photos, +fig.dataset.i);
  });
}

function stripTags(s) { return s.replace(/<[^>]+>/g, ""); }

function yearsWord(n) {
  const m10 = n % 10, m100 = n % 100;
  if (m100 >= 11 && m100 <= 14) return "лет";
  if (m10 === 1) return "год";
  if (m10 >= 2 && m10 <= 4) return "года";
  return "лет";
}

function relGroup(title, list, note) {
  if (!list.length) return "";
  return `<div class="rel-group"><h4>${title}</h4>${note ? `<div class="rel-note">${note}</div>` : ""}${list.map(p => pchip(p)).join("")}</div>`;
}
function spouseGroup(spouses) {
  const items = spouses.filter(s => s.spouse);
  if (!items.length) return "";
  return `<div class="rel-group"><h4>${items.length > 1 ? "Супруги" : "Супруг(а)"}</h4>
    ${items.map(({ spouse, family }) => {
      const meta = [family.marriage?.date?.text ? `⚭ ${family.marriage.date.text}` : null,
        family.divorced ? "в разводе" : null].filter(Boolean).join(" · ");
      return pchip(spouse, meta);
    }).join("")}</div>`;
}
function childrenGroups(spouses, p) {
  const kids = [];
  for (const { family } of spouses) {
    for (const c of family.children || []) if (DB.persons[c]) kids.push(DB.persons[c]);
  }
  kids.sort((a, b) => (a.birth?.date?.sort ?? 9e9) - (b.birth?.date?.sort ?? 9e9));
  return relGroup("Дети", kids);
}
function pchip(p, metaOverride) {
  const av = avatarFile(p);
  const meta = metaOverride || years(p) || p.birth?.place || "";
  return `<a class="pchip" href="#/person/${p.id}">
    ${av ? `<img class="ava ${p.sex}" src="media/t/${av}" alt="" loading="lazy">`
         : `<span class="ava init avatar-bg-${p.sex}" style="opacity:.85">${esc((p.given || "?").slice(0, 1))}</span>`}
    <span><b>${esc(fullName(p))}</b><span>${esc(meta)}</span></span>
  </a>`;
}

// ————— люди —————
let peopleState = { q: "", sort: "surname" };
function renderPeople() {
  app.innerHTML = `
  <div class="page">
    <div class="page-head">
      <div class="page-kicker">Каталог</div>
      <h2>Люди рода</h2>
      <p>Все, кто вписан в семейную летопись: ${Object.keys(DB.persons).length} человек.</p>
    </div>
    <div class="people-tools">
      <input id="pq" placeholder="Имя, фамилия или место рождения…" value="${esc(peopleState.q)}">
      <div class="seg">
        <button data-s="surname" class="${peopleState.sort === "surname" ? "on" : ""}">По фамилии</button>
        <button data-s="year" class="${peopleState.sort === "year" ? "on" : ""}">По году рождения</button>
      </div>
    </div>
    <div id="plist"></div>
  </div>`;
  const input = document.getElementById("pq");
  input.addEventListener("input", () => { peopleState.q = input.value; drawPeople(); });
  document.querySelectorAll(".seg button").forEach(b => b.onclick = () => {
    peopleState.sort = b.dataset.s;
    document.querySelectorAll(".seg button").forEach(x => x.classList.toggle("on", x === b));
    drawPeople();
  });
  drawPeople();
}
function drawPeople() {
  const box = document.getElementById("plist");
  const q = peopleState.q.trim().toLowerCase();
  let list = Object.values(DB.persons);
  if (q) list = list.filter(p =>
    fullName(p).toLowerCase().includes(q) ||
    (p.marriedName || "").toLowerCase().includes(q) ||
    (p.birth?.place || "").toLowerCase().includes(q));
  if (!list.length) { box.innerHTML = `<div class="people-empty">Никого не нашлось — попробуйте иначе.</div>`; return; }

  if (peopleState.sort === "year") {
    list.sort((a, b) => (a.birth?.date?.sort ?? 9e9) - (b.birth?.date?.sort ?? 9e9));
    box.innerHTML = `<div class="people-grid">${list.map(p => pchip(p)).join("")}</div>`;
    return;
  }
  list.sort((a, b) =>
    (a.surname || "я").localeCompare(b.surname || "я", "ru") ||
    (a.given || "").localeCompare(b.given || "", "ru"));
  const groups = new Map();
  for (const p of list) {
    const L = (p.surname || "—").slice(0, 1).toUpperCase();
    if (!groups.has(L)) groups.set(L, []);
    groups.get(L).push(p);
  }
  box.innerHTML = [...groups.entries()].map(([L, ps]) => `
    <div class="letter-head">${esc(L)}</div>
    <div class="people-grid">${ps.map(p => pchip(p)).join("")}</div>`).join("");
}

// ————— галерея —————
function renderGallery() {
  const sorted = [...PHOTOS].sort((a, b) => (a.date?.sort ?? 9e9) - (b.date?.sort ?? 9e9));
  app.innerHTML = `
  <div class="page">
    <div class="page-head">
      <div class="page-kicker">Архив</div>
      <h2>Галерея</h2>
      <p>${sorted.length} фотографий семейного архива. Нажмите, чтобы рассмотреть.</p>
    </div>
    <div class="masonry" id="gal">
      ${sorted.map((ph, i) => {
        const names = ph.people.slice(0, 2).map(id => fullName(DB.persons[id])).join(", ");
        const cap = ph.title || names;
        return `<figure data-i="${i}">
          <img src="media/t/${ph.file}" alt="${esc(cap)}" loading="lazy">
          ${cap ? `<figcaption>${esc(cap)}${ph.date?.text ? ` · ${esc(ph.date.text)}` : ""}</figcaption>` : ""}
        </figure>`;
      }).join("")}
    </div>
  </div>`;
  document.getElementById("gal").addEventListener("click", (e) => {
    const fig = e.target.closest("figure");
    if (fig) openLightbox(sorted, +fig.dataset.i);
  });
}

// ————— хроника —————
function renderTimeline() {
  const items = [];
  for (const p of Object.values(DB.persons)) {
    if (p.birth?.date?.year) items.push({ y: p.birth.date.year, s: p.birth.date.sort, cls: "birth", icon: "✶",
      html: `<a href="#/person/${p.id}">${esc(fullName(p))}</a> ${p.sex === "F" ? "родилась" : "родился"}${p.birth.place ? ` <span class="place">· ${esc(p.birth.place)}</span>` : ""}` });
    if (p.death?.date?.year) items.push({ y: p.death.date.year, s: p.death.date.sort, cls: "death", icon: "†",
      html: `<a href="#/person/${p.id}">${esc(fullName(p))}</a> ${p.sex === "F" ? "умерла" : "умер"}${lifespan(p) !== null ? ` <span class="place">· ${lifespan(p)} ${yearsWord(lifespan(p))}</span>` : ""}` });
  }
  for (const f of Object.values(DB.families)) {
    if (f.marriage?.date?.year && f.husband && f.wife && DB.persons[f.husband] && DB.persons[f.wife]) {
      items.push({ y: f.marriage.date.year, s: f.marriage.date.sort, cls: "marr", icon: "⚭",
        html: `<a href="#/person/${f.husband}">${esc(fullName(DB.persons[f.husband]))}</a> и <a href="#/person/${f.wife}">${esc(fullName(DB.persons[f.wife]))}</a> — свадьба${f.marriage.place ? ` <span class="place">· ${esc(f.marriage.place)}</span>` : ""}` });
    }
  }
  items.sort((a, b) => (a.s ?? a.y * 10000) - (b.s ?? b.y * 10000));
  const decades = new Map();
  for (const it of items) {
    const d = Math.floor(it.y / 10) * 10;
    if (!decades.has(d)) decades.set(d, []);
    decades.get(d).push(it);
  }
  app.innerHTML = `
  <div class="page">
    <div class="page-head">
      <div class="page-kicker">Летопись</div>
      <h2>Хроника рода</h2>
      <p>${items.length} событий: рождения ✶, браки ⚭ и уходы † — год за годом, с ${items[0]?.y} до ${items[items.length - 1]?.y} года.</p>
    </div>
    ${[...decades.entries()].map(([d, its]) => `
      <div class="tl-decade"><h3>${d}-е</h3></div>
      <div class="tl-rows">
        ${its.map(it => `
          <div class="tl-row ${it.cls}">
            <div class="tl-year">${it.y}</div>
            <div class="tl-icon">${it.icon}</div>
            <div class="tl-text">${it.html}</div>
          </div>`).join("")}
      </div>`).join("")}
  </div>`;
}

// ————— статистика —————
function renderStats() {
  const ps = Object.values(DB.persons);
  const alive = ps.filter(p => !p.death && p.birth?.date?.year && p.birth.date.year > 1926);
  const spans = ps.map(lifespan).filter(s => s !== null && s >= 0 && s < 115);
  const avgSpan = spans.length ? Math.round(spans.reduce((a, b) => a + b, 0) / spans.length) : 0;
  const yearsAll = ps.map(p => p.birth?.date?.year).filter(Boolean);

  // рождения по десятилетиям
  const byDecade = new Map();
  for (const y of yearsAll) {
    const d = Math.floor(y / 10) * 10;
    byDecade.set(d, (byDecade.get(d) || 0) + 1);
  }
  const decades = [...byDecade.entries()].sort((a, b) => a[0] - b[0]);

  // топ фамилий
  const bySurname = new Map();
  for (const p of ps) if (p.surname) bySurname.set(p.surname, (bySurname.get(p.surname) || 0) + 1);
  const topSurnames = [...bySurname.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  // топ мест рождения (нормализуем грубо: первые 2-3 слова)
  const byPlace = new Map();
  for (const p of ps) {
    let pl = p.birth?.place;
    if (!pl) continue;
    pl = pl.replace(/^(Россия|СССР|Российская империя)[,\s]*/i, "").trim() || pl;
    pl = pl.split(",")[0].trim();
    byPlace.set(pl, (byPlace.get(pl) || 0) + 1);
  }
  const topPlaces = [...byPlace.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  // продолжительность жизни по корзинам
  const bins = new Map();
  for (const s of spans) {
    const b = Math.min(Math.floor(s / 10) * 10, 100);
    bins.set(b, (bins.get(b) || 0) + 1);
  }
  const spanBins = [...bins.entries()].sort((a, b) => a[0] - b[0]);

  app.innerHTML = `
  <div class="page">
    <div class="page-head">
      <div class="page-kicker">Род в цифрах</div>
      <h2>Статистика</h2>
    </div>
    <div class="stat-tiles">
      <div class="stat-tile"><b>${ps.length}</b><span>человек в древе</span></div>
      <div class="stat-tile"><b>${generationsCount()}</b><span>поколений</span></div>
      <div class="stat-tile"><b>${Math.min(...yearsAll)}</b><span>самое раннее рождение</span></div>
      <div class="stat-tile"><b>${avgSpan}</b><span>средняя жизнь, лет</span></div>
      <div class="stat-tile"><b>${bySurname.size}</b><span>фамилий</span></div>
    </div>
    <div class="charts">
      <div class="chart-card wide">
        <h3>Рождения по десятилетиям</h3>
        <div class="sub">Сколько человек из древа родилось в каждое десятилетие</div>
        ${barChartV(decades.map(([d, n]) => ({ label: `${d}-е`, v: n })))}
      </div>
      <div class="chart-card">
        <h3>Фамилии рода</h3>
        <div class="sub">Десять самых частых фамилий</div>
        ${barChartH(topSurnames.map(([s, n]) => ({ label: s, v: n })))}
      </div>
      <div class="chart-card">
        <h3>География рождений</h3>
        <div class="sub">Где чаще всего рождались</div>
        ${barChartH(topPlaces.map(([s, n]) => ({ label: s, v: n })))}
      </div>
      <div class="chart-card wide">
        <h3>Сколько жили</h3>
        <div class="sub">Распределение продолжительности жизни, по ${spans.length} людям с известными датами</div>
        ${barChartV(spanBins.map(([b, n]) => ({ label: b === 100 ? "100+" : `${b}–${b + 9}`, v: n })))}
      </div>
    </div>
  </div>`;
  attachTips();
}

// вертикальные столбики: тонкие, скруглённый верх, зазор 2px+, сетка, тултипы
function barChartV(items) {
  const W = 900, H = 260, padL = 34, padB = 26, padT = 12;
  const max = Math.max(...items.map(i => i.v));
  const step = niceStep(max);
  const innerW = W - padL - 8, innerH = H - padT - padB;
  const bw = Math.min(44, innerW / items.length - 6);
  const gap = innerW / items.length;
  let grid = "", bars = "", labels = "";
  for (let v = step; v <= max; v += step) {
    const y = padT + innerH - (v / max) * innerH;
    grid += `<line class="grid-line" x1="${padL}" x2="${W - 8}" y1="${y}" y2="${y}"/>
      <text class="axis-label" x="${padL - 6}" y="${y + 3.5}" text-anchor="end">${v}</text>`;
  }
  items.forEach((it, i) => {
    const h = Math.max(2, (it.v / max) * innerH);
    const x = padL + i * gap + (gap - bw) / 2;
    const y = padT + innerH - h;
    bars += `<path class="bar-rect" data-tip="<b>${esc(it.label)}</b><br>${it.v} чел." d="${topRoundedBar(x, y, bw, h, 4)}"/>`;
    if (items.length <= 14 || i % 2 === 0) {
      labels += `<text class="axis-label" x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(it.label)}</text>`;
    }
  });
  return `<svg viewBox="0 0 ${W} ${H}">${grid}<line class="grid-line" x1="${padL}" x2="${W - 8}" y1="${padT + innerH}" y2="${padT + innerH}" style="stroke:var(--line-2)"/>${bars}${labels}</svg>`;
}

// горизонтальные полосы с подписями значений на концах
function barChartH(items) {
  const W = 460, rowH = 30, padT = 4;
  const H = items.length * rowH + padT + 4;
  const labelW = 130, valW = 34;
  const innerW = W - labelW - valW - 12;
  const max = Math.max(...items.map(i => i.v));
  let rows = "";
  items.forEach((it, i) => {
    const y = padT + i * rowH;
    const w = Math.max(3, (it.v / max) * innerW);
    rows += `
      <text class="axis-label" x="${labelW}" y="${y + rowH / 2 + 4}" text-anchor="end" style="font-size:12.5px; fill:var(--ink-2)">${esc(trunc(it.label, 18))}</text>
      <path class="bar-rect" data-tip="<b>${esc(it.label)}</b><br>${it.v} чел." d="${rightRoundedBar(labelW + 10, y + 6, w, rowH - 12, 4)}"/>
      <text class="d-label" x="${labelW + 10 + w + 7}" y="${y + rowH / 2 + 4}">${it.v}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}">${rows}</svg>`;
}

function topRoundedBar(x, y, w, h, r) {
  r = Math.min(r, w / 2, h);
  return `M ${x} ${y + h} V ${y + r} Q ${x} ${y} ${x + r} ${y} H ${x + w - r} Q ${x + w} ${y} ${x + w} ${y + r} V ${y + h} Z`;
}
function rightRoundedBar(x, y, w, h, r) {
  r = Math.min(r, h / 2, w);
  return `M ${x} ${y} H ${x + w - r} Q ${x + w} ${y} ${x + w} ${y + r} V ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} H ${x} Z`;
}
function niceStep(max) {
  const raw = max / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 5, 10]) if (raw <= m * pow) return m * pow;
  return 10 * pow;
}
function trunc(s, n) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }

let tipEl = null;
function attachTips() {
  if (!tipEl) {
    tipEl = document.createElement("div");
    tipEl.className = "viz-tip";
    document.body.appendChild(tipEl);
  }
  document.querySelectorAll("[data-tip]").forEach(el => {
    el.addEventListener("mousemove", (e) => {
      tipEl.innerHTML = el.dataset.tip;
      tipEl.style.opacity = 1;
      tipEl.style.left = Math.min(e.clientX + 14, innerWidth - 200) + "px";
      tipEl.style.top = (e.clientY - 40) + "px";
    });
    el.addEventListener("mouseleave", () => { tipEl.style.opacity = 0; });
  });
}

// ————— лайтбокс —————
let lb = { list: [], i: 0 };
function openLightbox(list, i) {
  lb = { list, i };
  drawLightbox();
  document.getElementById("lightbox").hidden = false;
  document.body.style.overflow = "hidden";
}
function drawLightbox() {
  const ph = lb.list[lb.i];
  if (!ph) return;
  document.getElementById("lbImg").src = "media/full/" + ph.file;
  const people = (ph.people || []).map(id =>
    `<a href="#/person/${id}">${esc(fullName(DB.persons[id]))}</a>`).join(", ");
  document.getElementById("lbCap").innerHTML = [
    ph.title ? `<b>${esc(ph.title)}</b>` : "",
    ph.date?.text || "", ph.place ? esc(ph.place) : "", people,
    ph.note ? esc(ph.note) : "",
  ].filter(Boolean).join(" · ");
}
function closeLightbox() {
  const el = document.getElementById("lightbox");
  if (el && !el.hidden) { el.hidden = true; document.body.style.overflow = ""; }
}

// ————— подвал: авторы летописи —————
// Ищем по имени, а не по id: при новом экспорте из MyHeritage id может смениться.
const AUTHORS = [
  { given: "Надежда", surname: "Житникова" },
  { given: "Даниил", surname: "Житников" },
];

function renderFooter() {
  const people = AUTHORS
    .map(a => Object.values(DB.persons).find(p => p.given === a.given && p.surname === a.surname))
    .filter(Boolean);
  if (!people.length) return;

  const ps = Object.values(DB.persons);
  const yearsAll = ps.flatMap(p => [p.birth?.date?.year, p.death?.date?.year]).filter(Boolean);

  const cards = people.map(p => {
    const av = avatarFile(p);
    return `<a class="author" href="#/person/${p.id}">
      ${av
        ? `<img class="author-ava" src="media/t/${av}" alt="${esc(fullName(p))}" loading="lazy">`
        : `<span class="author-ava init avatar-bg-${p.sex}">${esc((p.given || "?").slice(0, 1))}</span>`}
      <span class="author-name">${esc(fullName(p))}</span>
      ${p.marriedName ? `<span class="author-meta">в браке — ${esc(p.marriedName)}</span>` : ""}
    </a>`;
  }).join("");

  const el = document.getElementById("siteFooter");
  el.innerHTML = `
    <div class="footer-inner">
      <div class="footer-kicker">Летопись собрали</div>
      <div class="authors">${cards}</div>
      <p class="footer-note">
        Собрано по семейным архивам, письмам и памяти рода —
        ${ps.length} ${peopleWord(ps.length)}, ${Math.min(...yearsAll)}—${Math.max(...yearsAll)}.
      </p>
    </div>`;
  el.hidden = false;
}

function peopleWord(n) {
  const m10 = n % 10, m100 = n % 100;
  if (m100 >= 11 && m100 <= 14) return "человек";
  if (m10 >= 2 && m10 <= 4) return "человека";
  return "человек";
}

// ————— поиск и общий UI —————
function initChrome() {
  const overlay = document.getElementById("searchOverlay");
  const input = document.getElementById("searchInput");
  const results = document.getElementById("searchResults");
  const open = () => {
    overlay.hidden = false;
    input.value = "";
    results.innerHTML = `<div class="search-hint">Начните вводить имя — например, «Житников» или «Серафима»</div>`;
    setTimeout(() => input.focus(), 30);
  };
  const close = () => { overlay.hidden = true; };
  document.getElementById("searchBtn").onclick = open;
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && overlay.hidden && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); open(); }
    if (e.key === "Escape") { close(); closeLightbox(); }
    if (!document.getElementById("lightbox").hidden) {
      if (e.key === "ArrowRight") { lb.i = (lb.i + 1) % lb.list.length; drawLightbox(); }
      if (e.key === "ArrowLeft") { lb.i = (lb.i - 1 + lb.list.length) % lb.list.length; drawLightbox(); }
    }
  });
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) { results.innerHTML = `<div class="search-hint">Введите хотя бы две буквы</div>`; return; }
    const found = Object.values(DB.persons).filter(p =>
      fullName(p).toLowerCase().includes(q) || (p.marriedName || "").toLowerCase().includes(q)).slice(0, 12);
    results.innerHTML = found.length
      ? found.map(p => pchip(p)).join("")
      : `<div class="search-hint">Никого не нашлось</div>`;
  });
  results.addEventListener("click", (e) => { if (e.target.closest("a")) close(); });

  document.getElementById("lbClose").onclick = closeLightbox;
  document.getElementById("lbPrev").onclick = () => { lb.i = (lb.i - 1 + lb.list.length) % lb.list.length; drawLightbox(); };
  document.getElementById("lbNext").onclick = () => { lb.i = (lb.i + 1) % lb.list.length; drawLightbox(); };
  document.getElementById("lightbox").addEventListener("click", (e) => {
    if (e.target.id === "lightbox") closeLightbox();
  });
  document.getElementById("lbCap").addEventListener("click", (e) => {
    if (e.target.closest("a")) closeLightbox();
  });

  document.getElementById("burger").onclick = () =>
    document.getElementById("nav").classList.toggle("open");
}

boot();
