// Плоское образное древо рода (SVG): родственники выстроены в форме дерева.
// Ветвь — человек, лист — жизнь; рост управляется годом. Вокруг — роща других линий.

const NS = "http://www.w3.org/2000/svg";
const GROW_YEARS = 16;

// ————— данные (общее с 3D-версией) —————
function buildLineage(DB, rootId) {
  const { persons, families } = DB;
  const seen = new Set();
  let minY = 9999, maxY = 1850, count = 0;
  function node(pid, parentYear) {
    if (seen.has(pid)) return null;
    seen.add(pid);
    const p = persons[pid];
    const birth = p.birth?.date?.year ?? parentYear + 27;
    minY = Math.min(minY, birth); maxY = Math.max(maxY, birth);
    count++;
    const children = [];
    for (const fid of p.fams || []) {
      for (const c of families[fid]?.children || []) {
        if (persons[c]) {
          const n = node(c, birth);
          if (n) children.push(n);
        }
      }
    }
    children.sort((a, b) => a.birth - b.birth);
    const size = 1 + children.reduce((s, c) => s + c.size, 0);
    const leaves = children.length ? children.reduce((s, c) => s + c.leaves, 0) : 1;
    return { p, birth, children, size, leaves };
  }
  const root = node(rootId, 1845);
  return { root, ids: seen, minY, maxY, count };
}

function findGeorgiy(DB) {
  const byName = Object.values(DB.persons).find(
    p => p.given === "Георгий" && (p.surname || "").startsWith("Житник"));
  return byName?.id || "I500582";
}

function otherLineages(DB, excludeIds, limit = 8) {
  const { persons, families } = DB;
  const descIds = (rootId) => {
    const seen = new Set(), stack = [rootId];
    while (stack.length) {
      const cur = stack.pop();
      if (seen.has(cur)) continue;
      seen.add(cur);
      for (const fid of persons[cur].fams || [])
        for (const c of families[fid]?.children || [])
          if (persons[c]) stack.push(c);
    }
    return seen;
  };
  const roots = Object.values(persons)
    .filter(p => !(p.famc || []).length && (p.fams || []).length)
    .map(p => ({ id: p.id, ids: descIds(p.id) }))
    .sort((a, b) => b.ids.size - a.ids.size);
  const taken = new Set(excludeIds);
  const out = [];
  for (const r of roots) {
    if (r.ids.size < 12 || out.length >= limit) continue;
    let overlap = 0;
    for (const id of r.ids) if (taken.has(id)) overlap++;
    if (overlap / r.ids.size > 0.5) continue;
    out.push(r.id);
    for (const id of r.ids) taken.add(id);
  }
  return out;
}

// детерминированный псевдослучай
function pruneTree(node, cap, d = 0) {
  const children = d >= cap ? [] : node.children.map(c => pruneTree(c, cap, d + 1));
  const size = 1 + children.reduce((s, c) => s + c.size, 0);
  const leaves = children.length ? children.reduce((s, c) => s + c.leaves, 0) : 1;
  return { ...node, children, size, leaves };
}

function mkRand(seedStr) {
  let s = [...seedStr].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 233280, 7);
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

// ————— раскладка: веер кроны —————
// Каждому листу — угловой слот; узел — посередине своих детей; радиус растёт с поколением.
function layoutTree(lin, cfg) {
  const { cx, baseY, spread, rStep, trunkH } = cfg;
  const top = { x: cx, y: baseY - trunkH };            // вершина ствола
  const items = [];                                     // {node, x, y, px, py, depth, w}
  let slot = 0;
  const totalLeaves = lin.root.leaves;
  function place(node, depth, px, py) {
    let x, y;
    if (depth === 0) {
      x = top.x; y = top.y;
    } else {
      const mySlots = node.leaves;
      const a0 = (slot + mySlots / 2) / totalLeaves;    // центр моих слотов [0..1]
      const ang = (a0 - 0.5) * spread;                  // радианы от вертикали
      const r = trunkH * 0.15 + depth * rStep * (0.86 + 0.24 * Math.abs(ang));
      x = top.x + Math.sin(ang) * (r * 1.25);
      y = top.y - Math.cos(ang) * r;
    }
    const w = Math.max(1.6, cfg.trunkW * Math.pow(node.size / (lin.root.size + 1), 0.55));
    items.push({ node, x, y, px, py, depth, w });
    if (!node.children.length) slot += node.leaves;
    for (const c of node.children) place(c, depth + 1, x, y);
  }
  place(lin.root, 0, cx, baseY);
  return { items, top };
}

function branchPath(x1, y1, x2, y2, sway, rnd) {
  // кубическая кривая с лёгким органичным изгибом
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const dx = x2 - x1, dy = y2 - y1;
  const n = Math.hypot(dx, dy) || 1;
  const ox = -dy / n, oy = dx / n;
  const k = sway * (rnd() - 0.5) * 2;
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${(x1 + dx * 0.25 + ox * k).toFixed(1)} ${(y1 + dy * 0.25 + oy * k).toFixed(1)}, ${(mx + ox * k).toFixed(1)} ${(my + oy * k).toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

const LEAF_D = "M0 0 C 5 -2, 7 -9, 0 -14 C -7 -9, -5 -2, 0 0 Z";

// ————— главный вход —————
export function mountDrevo(container, DB, ui) {
  const W = 1600, H = 900, GROUND = 810;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMax slice");
  svg.classList.add("drevo2d");
  container.appendChild(svg);

  const defs = document.createElementNS(NS, "defs");
  defs.innerHTML = `
    <radialGradient id="dawn" cx="50%" cy="78%" r="75%">
      <stop offset="0%" stop-color="#573c14"/>
      <stop offset="34%" stop-color="#32250e"/>
      <stop offset="70%" stop-color="#131c14"/>
      <stop offset="100%" stop-color="#0a120d"/>
    </radialGradient>
    <linearGradient id="soil" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2a3315"/>
      <stop offset="100%" stop-color="#161c0d"/>
    </linearGradient>
    <filter id="soft" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="4"/>
    </filter>`;
  svg.appendChild(defs);

  // фон и земля
  const bg = document.createElementNS(NS, "rect");
  bg.setAttribute("width", W); bg.setAttribute("height", H);
  bg.setAttribute("fill", "url(#dawn)");
  svg.appendChild(bg);
  const hills = document.createElementNS(NS, "path");
  hills.setAttribute("d", `M0 ${GROUND + 14} Q ${W * 0.28} ${GROUND - 26}, ${W * 0.55} ${GROUND + 2} T ${W} ${GROUND - 10} V ${H} H 0 Z`);
  hills.setAttribute("fill", "url(#soil)");
  svg.appendChild(hills);

  const barkColor = (depth) => ["#4d3117", "#5a3b1d", "#684624", "#75522b", "#815d31", "#8c6838"][Math.min(depth, 5)];
  const aliveFills = ["#6f9c3c", "#82ab4a", "#5c8a33"];
  const deadFills = ["#c9913f", "#b87f33"];

  const growables = [];   // {el, birth, len?, kind}
  const tip = document.getElementById("w3dTip");

  function drawLineage(lin, cfg, interactive, label) {
    const g = document.createElementNS(NS, "g");
    if (cfg.opacity) g.setAttribute("opacity", cfg.opacity);
    svg.appendChild(g);
    const rnd = mkRand(lin.root.p.id + (label || ""));
    const { items } = layoutTree(lin, cfg);

    // ствол
    const trunk = document.createElementNS(NS, "path");
    trunk.setAttribute("d", branchPath(cfg.cx, cfg.baseY, cfg.cx, cfg.baseY - cfg.trunkH, cfg.trunkH * 0.05, rnd));
    trunk.setAttribute("stroke", barkColor(0));
    trunk.setAttribute("stroke-width", cfg.trunkW);
    trunk.setAttribute("fill", "none");
    trunk.setAttribute("stroke-linecap", "round");
    g.appendChild(trunk);
    growables.push({ el: trunk, birth: lin.minY - 14, kind: "branch" });

    // корни
    for (let i = 0; i < 5; i++) {
      const rx = cfg.cx + (rnd() - 0.5) * cfg.trunkW * 4;
      const root = document.createElementNS(NS, "path");
      root.setAttribute("d", branchPath(cfg.cx, cfg.baseY - 4, rx + (rnd() - 0.5) * cfg.trunkH * 0.5, cfg.baseY + 10 + rnd() * 12, 8, rnd));
      root.setAttribute("stroke", barkColor(0));
      root.setAttribute("stroke-width", cfg.trunkW * (0.28 + rnd() * 0.2));
      root.setAttribute("fill", "none");
      root.setAttribute("stroke-linecap", "round");
      g.appendChild(root);
      growables.push({ el: root, birth: lin.minY - 14, kind: "branch" });
    }

    // ветви
    for (const it of items) {
      if (it.depth === 0) continue;
      const path = document.createElementNS(NS, "path");
      path.setAttribute("d", branchPath(it.px, it.py, it.x, it.y, 14, rnd));
      path.setAttribute("stroke", barkColor(it.depth));
      path.setAttribute("stroke-width", it.w.toFixed(1));
      path.setAttribute("fill", "none");
      path.setAttribute("stroke-linecap", "round");
      g.appendChild(path);
      growables.push({ el: path, birth: it.node.birth, kind: "branch" });
    }

    // листья поверх ветвей
    for (const it of items) {
      const dead = !!it.node.p.death;
      const fills = interactive ? (dead ? deadFills : aliveFills) : aliveFills;
      const cluster = document.createElementNS(NS, "g");
      cluster.setAttribute("transform", `translate(${it.x.toFixed(1)}, ${it.y.toFixed(1)})`);
      g.appendChild(cluster);
      const inner = document.createElementNS(NS, "g");
      cluster.appendChild(inner);
      const n = interactive ? (it.node.children.length ? 4 : 6) : 3;
      const sc = cfg.leafScale * (interactive ? 1 : 0.8);
      for (let i = 0; i < n; i++) {
        const leaf = document.createElementNS(NS, "path");
        leaf.setAttribute("d", LEAF_D);
        leaf.setAttribute("fill", fills[Math.floor(rnd() * fills.length)]);
        const a = rnd() * 360, d = rnd() * 16 * sc;
        leaf.setAttribute("transform",
          `rotate(${(a).toFixed(0)}) translate(0 ${(-d).toFixed(1)}) scale(${(sc * (0.8 + rnd() * 0.6)).toFixed(2)})`);
        inner.appendChild(leaf);
      }
      // лист-человек
      if (interactive) {
        const me = document.createElementNS(NS, "path");
        me.setAttribute("d", LEAF_D);
        me.setAttribute("fill", dead ? "#d8a54e" : "#8fbf50");
        me.setAttribute("transform", `rotate(${((rnd() - 0.5) * 70).toFixed(0)}) scale(${(cfg.leafScale * 1.5).toFixed(2)})`);
        me.classList.add("leaf-person");
        inner.appendChild(me);
        const p = it.node.p;
        cluster.classList.add("leaf-hit");
        cluster.addEventListener("pointerenter", (e) => {
          const yrs = [p.birth?.date?.year, p.death?.date?.year].filter(Boolean).join(" — ");
          tip.innerHTML = `<b>${[p.given, p.surname].filter(Boolean).join(" ")}</b><span>${yrs || "годы неизвестны"} · открыть страницу</span>`;
          tip.classList.remove("neon");
          tip.hidden = false;
        });
        cluster.addEventListener("pointermove", (e) => {
          tip.style.left = Math.min(e.clientX + 16, innerWidth - 240) + "px";
          tip.style.top = (e.clientY - 14) + "px";
        });
        cluster.addEventListener("pointerleave", () => { tip.hidden = true; });
        cluster.addEventListener("click", () => ui.onOpenPerson?.(p.id));
      }
      growables.push({ el: inner, birth: it.node.birth + 4, kind: "leaf" });
    }

    if (!interactive && label) {
      g.classList.add("grove-tree");
      g.addEventListener("pointerenter", (e) => {
        tip.innerHTML = `<b>${label.title}</b><span>${label.n} чел. · открыть в древе</span>`;
        tip.classList.remove("neon");
        tip.hidden = false;
      });
      g.addEventListener("pointermove", (e) => {
        tip.style.left = Math.min(e.clientX + 16, innerWidth - 240) + "px";
        tip.style.top = (e.clientY - 14) + "px";
      });
      g.addEventListener("pointerleave", () => { tip.hidden = true; });
      g.addEventListener("click", () => ui.onFocusLineage?.(label.rootId));
    }
  }

  // ——— роща других линий (позади главного) ———
  const georgiy = findGeorgiy(DB);
  const main = buildLineage(DB, georgiy);
  const others = otherLineages(DB, main.ids);
  const sideX = [0.09, 0.91, 0.2, 0.8, 0.3, 0.7, 0.13, 0.87];
  others.forEach((rootId, i) => {
    const lin0 = buildLineage(DB, rootId);
    const lin = { ...lin0, root: pruneTree(lin0.root, 3) };
    const rp = DB.persons[rootId];
    const k = 0.55 + Math.min(0.35, lin0.count / 200);
    drawLineage(lin, {
      cx: W * sideX[i % sideX.length] + (i % 2 ? 14 : -14),
      baseY: GROUND - 6 - (i % 3) * 8,
      trunkH: 150 * k, trunkW: 13 * k,
      spread: 1.8, rStep: 62 * k, leafScale: 0.72,
      opacity: 0.55 + 0.1 * (i % 2),
    }, false, {
      title: `Род: ${[rp.given, rp.surname].filter(Boolean).join(" ")}`,
      n: lin0.count, rootId,
    });
  });

  // ——— главное древо ———
  drawLineage(main, {
    cx: W / 2, baseY: GROUND,
    trunkH: 240, trunkW: 30,
    spread: 2.35, rStep: 84, leafScale: 1.15,
  }, true);

  // тёплое свечение за кроной
  const glow = document.createElementNS(NS, "ellipse");
  glow.setAttribute("cx", W / 2); glow.setAttribute("cy", GROUND - 380);
  glow.setAttribute("rx", 430); glow.setAttribute("ry", 300);
  glow.setAttribute("fill", "#e8b06a"); glow.setAttribute("opacity", "0.07");
  glow.setAttribute("filter", "url(#soft)");
  svg.insertBefore(glow, svg.children[3]); // за деревьями, поверх фона

  // светлячки
  for (let i = 0; i < 26; i++) {
    const f = document.createElementNS(NS, "circle");
    f.setAttribute("r", (1.2 + Math.random() * 1.8).toFixed(1));
    f.setAttribute("cx", (W * 0.1 + Math.random() * W * 0.8).toFixed(0));
    f.setAttribute("cy", (GROUND - 40 - Math.random() * 420).toFixed(0));
    f.setAttribute("fill", "#ffd98a");
    f.classList.add("firefly");
    f.style.animationDelay = (-Math.random() * 9).toFixed(1) + "s";
    f.style.animationDuration = (6 + Math.random() * 7).toFixed(1) + "s";
    svg.appendChild(f);
  }

  // ——— рост по годам ———
  for (const gr of growables) {
    if (gr.kind === "branch") {
      const len = gr.el.getTotalLength();
      gr.len = len;
      gr.el.style.strokeDasharray = len;
    }
  }
  const YEAR_START = main.minY - 14;
  const YEAR_SHOW_END = Math.max(main.maxY, 2026);
  const YEAR_END = main.maxY + GROW_YEARS;
  let year = YEAR_END, playing = false, raf = 0, lastT = 0;

  function setYear(y, fromSlider) {
    year = Math.max(YEAR_START, Math.min(YEAR_END, y));
    if (fromSlider) playing = false;
    for (const gr of growables) {
      const t = (year - gr.birth) / GROW_YEARS;
      const s = t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
      if (gr.kind === "branch") {
        gr.el.style.strokeDashoffset = ((1 - s) * gr.len).toFixed(1);
      } else {
        gr.el.setAttribute("transform", `scale(${Math.max(s, 0.001).toFixed(3)})`);
        gr.el.style.opacity = s > 0 ? 1 : 0;
      }
    }
    if (ui.yearEl) ui.yearEl.textContent = Math.round(Math.min(year, YEAR_SHOW_END));
    if (ui.sliderEl && !fromSlider) ui.sliderEl.value = Math.round(year);
  }
  if (ui.sliderEl) {
    ui.sliderEl.min = YEAR_START; ui.sliderEl.max = YEAR_END; ui.sliderEl.value = YEAR_END;
    ui.sliderEl.addEventListener("input", () => setYear(+ui.sliderEl.value, true));
  }
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  setYear(YEAR_END);

  // повторный рост по кнопке-году (клик по цифре) — маленькая пасхалка
  ui.yearEl?.addEventListener("click", () => {
    if (reduced) return;
    setYear(YEAR_START);
    playing = true;
    lastT = performance.now();
    cancelAnimationFrame(raf);
    const step = (t) => {
      if (!playing) return;
      const dt = Math.min((t - lastT) / 1000, 0.1);
      lastT = t;
      setYear(year + dt * 30);
      if (year < YEAR_END) raf = requestAnimationFrame(step);
      else playing = false;
    };
    raf = requestAnimationFrame(step);
  });

  return {
    dispose() {
      cancelAnimationFrame(raf);
      tip.hidden = true;
      svg.remove();
    },
  };
}
