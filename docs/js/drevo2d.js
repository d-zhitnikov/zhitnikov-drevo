// Одно графичное древо рода Житниковых. Два цвета: коричневый и золотой.
// Тонкие контурные ветви, никакого реализма. Ветвь — человек, лист — жизнь.
// Анимация живая: древо прорисовывает себя само при загрузке.

const NS = "http://www.w3.org/2000/svg";
const BROWN = "#8c6838";
const GOLD = "#d8a54e";
const GROW_YEARS = 16;

// ————— данные —————
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

function mkRand(seedStr) {
  let s = [...seedStr].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 233280, 7);
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

// ————— раскладка: веер кроны —————
function layoutTree(lin, cfg) {
  const { cx, baseY, spread, rStep, trunkH } = cfg;
  const top = { x: cx, y: baseY - trunkH };
  const items = [];
  let slot = 0;
  const totalLeaves = lin.root.leaves;
  function place(node, depth, px, py) {
    let x, y;
    if (depth === 0) {
      x = top.x; y = top.y;
    } else {
      const a0 = (slot + node.leaves / 2) / totalLeaves;
      const ang = (a0 - 0.5) * spread;
      const r = trunkH * 0.12 + depth * rStep * (0.84 + 0.3 * Math.abs(ang));
      x = top.x + Math.sin(ang) * (r * 1.3);
      y = top.y - Math.cos(ang) * r;
    }
    items.push({ node, x, y, px, py, depth });
    if (!node.children.length) slot += node.leaves;
    for (const c of node.children) place(c, depth + 1, x, y);
  }
  place(lin.root, 0, cx, baseY);
  return items;
}

function branchPath(x1, y1, x2, y2, sway, rnd) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const dx = x2 - x1, dy = y2 - y1;
  const n = Math.hypot(dx, dy) || 1;
  const ox = -dy / n, oy = dx / n;
  const k = sway * (rnd() - 0.5) * 2;
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${(x1 + dx * 0.25 + ox * k).toFixed(1)} ${(y1 + dy * 0.25 + oy * k).toFixed(1)}, ${(mx + ox * k).toFixed(1)} ${(my + oy * k).toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

const LEAF_D = "M0 0 C 4.6 -1.8, 6.4 -8.2, 0 -13 C -6.4 -8.2, -4.6 -1.8, 0 0 Z";

// ————— главный вход —————
export function mountDrevo(container, DB, ui) {
  const W = 1600, H = 900, GROUND = 828;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMax meet");
  svg.classList.add("drevo2d");
  container.appendChild(svg);

  const tip = document.getElementById("w3dTip");
  const georgiy = findGeorgiy(DB);
  const lin = buildLineage(DB, georgiy);
  const rnd = mkRand(georgiy);

  // тонкая линия земли
  const groundLine = document.createElementNS(NS, "path");
  groundLine.setAttribute("d", `M ${W * 0.16} ${GROUND} H ${W * 0.84}`);
  groundLine.setAttribute("stroke", BROWN);
  groundLine.setAttribute("stroke-width", "1.4");
  groundLine.setAttribute("opacity", "0.55");
  groundLine.setAttribute("stroke-linecap", "round");
  svg.appendChild(groundLine);

  const g = document.createElementNS(NS, "g");
  svg.appendChild(g);

  const cfg = { cx: W / 2, baseY: GROUND, trunkH: 250, trunkW: 7, spread: 2.55, rStep: 82 };
  const items = layoutTree(lin, cfg);
  const growables = []; // {el, birth, len?, kind}

  // ствол
  const trunk = document.createElementNS(NS, "path");
  trunk.setAttribute("d", branchPath(cfg.cx, GROUND, cfg.cx, GROUND - cfg.trunkH, 6, rnd));
  trunk.setAttribute("stroke", BROWN);
  trunk.setAttribute("stroke-width", cfg.trunkW);
  trunk.setAttribute("fill", "none");
  trunk.setAttribute("stroke-linecap", "round");
  g.appendChild(trunk);
  growables.push({ el: trunk, birth: lin.minY - 14, kind: "branch" });

  // корни — три тонких штриха
  for (let i = 0; i < 3; i++) {
    const dirx = (i - 1) * 60 + (rnd() - 0.5) * 24;
    const root = document.createElementNS(NS, "path");
    root.setAttribute("d", branchPath(cfg.cx, GROUND - 2, cfg.cx + dirx, GROUND + 16 + rnd() * 8, 7, rnd));
    root.setAttribute("stroke", BROWN);
    root.setAttribute("stroke-width", (2.2 - i * 0.4).toFixed(1));
    root.setAttribute("fill", "none");
    root.setAttribute("stroke-linecap", "round");
    g.appendChild(root);
    growables.push({ el: root, birth: lin.minY - 14, kind: "branch" });
  }

  // ветви — очень тонкие, толщина едва намекает на вес поддерева
  for (const it of items) {
    if (it.depth === 0) continue;
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", branchPath(it.px, it.py, it.x, it.y, 13, rnd));
    path.setAttribute("stroke", BROWN);
    path.setAttribute("stroke-width", Math.max(1.1, 4.6 * Math.pow(it.node.size / lin.root.size, 0.5)).toFixed(1));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke-linecap", "round");
    g.appendChild(path);
    growables.push({ el: path, birth: it.node.birth, kind: "branch" });
  }

  // листья: человек — золотой лист; рядом один контурный
  for (const it of items) {
    const p = it.node.p;
    const cluster = document.createElementNS(NS, "g");
    cluster.setAttribute("transform", `translate(${it.x.toFixed(1)}, ${it.y.toFixed(1)})`);
    cluster.classList.add("leaf-hit");
    g.appendChild(cluster);
    const inner = document.createElementNS(NS, "g");
    cluster.appendChild(inner);

    const me = document.createElementNS(NS, "path");
    me.setAttribute("d", LEAF_D);
    me.setAttribute("fill", GOLD);
    me.setAttribute("transform", `rotate(${((rnd() - 0.5) * 90).toFixed(0)})`);
    me.classList.add("leaf-person", "leaf-live");
    me.style.animationDelay = (-rnd() * 7).toFixed(1) + "s";
    inner.appendChild(me);

    const outline = document.createElementNS(NS, "path");
    outline.setAttribute("d", LEAF_D);
    outline.setAttribute("fill", "none");
    outline.setAttribute("stroke", GOLD);
    outline.setAttribute("stroke-width", "1");
    outline.setAttribute("transform",
      `rotate(${((rnd() - 0.5) * 200).toFixed(0)}) translate(0 ${(-4 - rnd() * 7).toFixed(1)}) scale(${(0.7 + rnd() * 0.4).toFixed(2)})`);
    outline.classList.add("leaf-live");
    outline.style.animationDelay = (-rnd() * 9).toFixed(1) + "s";
    inner.appendChild(outline);

    cluster.addEventListener("pointerenter", () => {
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
    growables.push({ el: inner, birth: it.node.birth + 4, kind: "leaf" });
  }

  // ————— живая прорисовка при загрузке —————
  for (const gr of growables) {
    if (gr.kind === "branch") {
      gr.len = gr.el.getTotalLength();
      gr.el.style.strokeDasharray = gr.len;
    }
  }
  const YEAR_START = lin.minY - 14;
  const YEAR_END = lin.maxY + GROW_YEARS;
  let raf = 0;

  function setYear(year) {
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
  }

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    setYear(YEAR_END);
  } else {
    setYear(YEAR_START);
    const DUR = 6.5; // всё древо за ~6.5 c реального времени
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min((t - t0) / 1000 / DUR, 1);
      setYear(YEAR_START + (YEAR_END - YEAR_START) * k);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  return {
    dispose() {
      cancelAnimationFrame(raf);
      tip.hidden = true;
      svg.remove();
    },
  };
}
