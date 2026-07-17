// Древо рода Житниковых — большое золотое дерево-жизни, во всю ширину экрана.
// Ствол ветвится фракталом на суки и ветви, на кончиках — листья-люди.
// Два цвета: коричневый и золото. Живая самопрорисовка при загрузке. Без кольца.

const NS = "http://www.w3.org/2000/svg";
const GOLD = "#d8a54e";       // листья
const GOLD_DIM = "#c08238";   // ветви
const GROW_YEARS = 16;

// ————— данные: люди главной линии по годам —————
function mainLinePeople(DB) {
  const { persons, families } = DB;
  const georgiy = Object.values(persons).find(
    p => p.given === "Георгий" && (p.surname || "").startsWith("Житник"));
  const rootId = georgiy?.id || "I500582";
  const seen = new Set(), list = [];
  let minY = 9999, maxY = 1850;
  (function walk(pid, py) {
    if (seen.has(pid)) return;
    seen.add(pid);
    const p = persons[pid];
    const y = p.birth?.date?.year ?? py + 27;
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    list.push({ p, y });
    for (const fid of p.fams || [])
      for (const c of families[fid]?.children || [])
        if (persons[c]) walk(c, y);
  })(rootId, 1845);
  list.sort((a, b) => a.y - b.y);
  return { list, minY, maxY };
}

function mkRand(seed) {
  let s = seed % 233280 || 7;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

const LEAF_D = "M0 0 C 4.2 -1.6, 5.8 -7.6, 0 -12 C -5.8 -7.6, -4.2 -1.6, 0 0 Z";

export function mountDrevo(container, DB, ui) {
  // широкий кадр под пропорции экрана: дерево во всю ширину, стоит у низа
  const W = 1440, H = 820;
  const CX = W / 2;
  const baseY = H - 90;               // основание ствола
  const forkY = H * 0.52;             // где ствол переходит в крону
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMax meet");
  svg.classList.add("drevo2d");
  container.appendChild(svg);

  const tip = document.getElementById("w3dTip");
  const { list, minY, maxY } = mainLinePeople(DB);
  const rnd = mkRand([...(list[0]?.p.id || "x")].reduce((a, c) => a + c.charCodeAt(0), 0));

  const g = document.createElementNS(NS, "g");
  svg.appendChild(g);
  const growables = [];

  // ————— абстрактное дерево ветвления с ~N кончиками —————
  const N = list.length;
  function buildShape(nTips) {
    const root = { children: [], depth: 0 };
    let leaves = [root];
    while (leaves.length < nTips) {
      leaves.sort((a, b) => a.depth - b.depth);
      const node = leaves.shift();
      const k = leaves.length + 2 < nTips && node.depth < 2 && rnd() < 0.5 ? 3 : 2;
      for (let i = 0; i < k; i++) {
        const ch = { children: [], depth: node.depth + 1 };
        node.children.push(ch);
        leaves.push(ch);
      }
    }
    return root;
  }
  const shape = buildShape(N);

  // ————— геометрия: рекурсивный рост, широкая крона —————
  const tips = [];
  const branchEls = [];
  let maxGen = 0;
  function grow(node, x, y, ang, len, width, gen) {
    maxGen = Math.max(maxGen, gen);
    const x2 = x + Math.sin(ang) * len;
    const y2 = y - Math.cos(ang) * len;
    const cbow = (rnd() - 0.5) * len * 0.42;
    const nx = Math.cos(ang), ny = Math.sin(ang);
    const mx = (x + x2) / 2 + nx * cbow, my = (y + y2) / 2 + ny * cbow;
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", `M ${x.toFixed(1)} ${y.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`);
    path.setAttribute("stroke", GOLD_DIM);
    path.setAttribute("stroke-width", Math.max(1, width).toFixed(1));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke-linecap", "round");
    g.appendChild(path);
    branchEls.push({ el: path, gen });

    if (!node.children.length) { tips.push({ x: x2, y: y2, ang, gen }); return; }
    const k = node.children.length;
    const spreadBase = 0.86 - gen * 0.03;      // сильный развал, крона раскидывается вширь
    node.children.forEach((ch, i) => {
      const off = (i - (k - 1) / 2) * (spreadBase / Math.max(1, k - 1) * 2 || spreadBase);
      // угол копится (без возврата к вертикали) → ветви уходят в стороны
      const childAng = ang + off + (rnd() - 0.5) * 0.14;
      const childLen = len * (0.76 + rnd() * 0.10);
      grow(ch, x2, y2, childAng, childLen, width * 0.72, gen + 1);
    });
  }
  grow(shape, CX, forkY, 0, (forkY - 30) * 0.5, 13, 0);

  // назначаем людей кончикам слева-направо
  tips.sort((a, b) => a.x - b.x);
  tips.forEach((t, i) => { t.person = list[i % list.length]?.p; t.birth = list[i % list.length]?.y; });

  // ————— ствол —————
  const trunkW = 54, neckW = 15;
  const trunk = document.createElementNS(NS, "path");
  trunk.setAttribute("d", `
    M ${CX - trunkW / 2} ${baseY}
    C ${CX - trunkW / 2 + 5} ${baseY - (baseY - forkY) * 0.5}, ${CX - neckW / 2 - 4} ${forkY + 46}, ${CX - neckW / 2} ${forkY}
    L ${CX + neckW / 2} ${forkY}
    C ${CX + neckW / 2 + 4} ${forkY + 46}, ${CX + trunkW / 2 - 5} ${baseY - (baseY - forkY) * 0.5}, ${CX + trunkW / 2} ${baseY} Z`);
  trunk.setAttribute("fill", GOLD_DIM);
  g.insertBefore(trunk, g.firstChild);
  growables.push({ el: trunk, birth: minY - 15, kind: "trunk", baseY });

  // ————— корни + земля —————
  for (let i = 0; i < 9; i++) {
    const t = (i / 8 - 0.5) * 2;
    const ex = CX + t * 240;
    const ey = baseY + 58 - Math.abs(t) * 20;
    const root = document.createElementNS(NS, "path");
    root.setAttribute("d", `M ${CX + t * 9} ${baseY - 4} Q ${CX + t * 90} ${baseY + 26}, ${ex.toFixed(1)} ${ey.toFixed(1)}`);
    root.setAttribute("stroke", GOLD_DIM);
    root.setAttribute("stroke-width", (3.6 - Math.abs(t) * 1.9).toFixed(1));
    root.setAttribute("fill", "none");
    root.setAttribute("stroke-linecap", "round");
    g.appendChild(root);
    growables.push({ el: root, birth: minY - 15, kind: "branch" });
  }
  const ground = document.createElementNS(NS, "path");
  ground.setAttribute("d", `M ${CX - 300} ${baseY + 56} Q ${CX} ${baseY + 40}, ${CX + 300} ${baseY + 56}`);
  ground.setAttribute("stroke", GOLD_DIM);
  ground.setAttribute("stroke-width", "1.8");
  ground.setAttribute("fill", "none");
  ground.setAttribute("opacity", "0.6");
  ground.setAttribute("stroke-linecap", "round");
  g.appendChild(ground);
  growables.push({ el: ground, birth: minY - 14, kind: "branch" });

  // послойный рост ветвей
  for (const b of branchEls) {
    const frac = maxGen ? b.gen / maxGen : 0;
    growables.push({ el: b.el, birth: minY + frac * (maxY - minY), kind: "branch" });
  }

  // ————— листья-люди на кончиках —————
  for (const t of tips) {
    const p = t.person;
    const dead = !!p?.death;
    const cluster = document.createElementNS(NS, "g");
    cluster.setAttribute("transform", `translate(${t.x.toFixed(1)}, ${t.y.toFixed(1)})`);
    cluster.classList.add("leaf-hit");
    g.appendChild(cluster);
    const inner = document.createElementNS(NS, "g");
    cluster.appendChild(inner);
    const deg = (t.ang * 180 / Math.PI).toFixed(1);

    const me = document.createElementNS(NS, "path");
    me.setAttribute("d", LEAF_D);
    if (dead) { me.setAttribute("fill", "none"); me.setAttribute("stroke", GOLD); me.setAttribute("stroke-width", "1.5"); }
    else me.setAttribute("fill", GOLD);
    me.setAttribute("transform", `rotate(${deg}) translate(0 1) scale(1.4)`);
    me.classList.add("leaf-person", "leaf-live");
    me.style.animationDelay = (-rnd() * 7).toFixed(1) + "s";
    inner.appendChild(me);
    for (const side of [-1, 1]) {
      const d = document.createElementNS(NS, "path");
      d.setAttribute("d", LEAF_D);
      d.setAttribute("fill", GOLD);
      d.setAttribute("opacity", "0.85");
      d.setAttribute("transform", `rotate(${(+deg + side * (32 + rnd() * 14)).toFixed(0)}) translate(0 3) scale(${(0.62 + rnd() * 0.22).toFixed(2)})`);
      d.classList.add("leaf-live");
      d.style.animationDelay = (-rnd() * 9).toFixed(1) + "s";
      inner.appendChild(d);
    }

    if (p) {
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
    }
    growables.push({ el: inner, birth: (t.birth ?? maxY) + 2, kind: "leaf" });
  }

  // ————— вписываем всё дерево в кадр (по фактическим границам) —————
  {
    const bb = g.getBBox();
    const padX = 60, topY = 6, botY = H - 6;
    const sc = Math.min((W - 2 * padX) / bb.width, (botY - topY) / bb.height);
    const tx = W / 2 - (bb.x + bb.width / 2) * sc;
    const ty = botY - (bb.y + bb.height) * sc;
    g.setAttribute("transform", `translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${sc.toFixed(3)})`);
  }

  // ————— живая прорисовка —————
  for (const gr of growables) {
    if (gr.kind === "branch") { gr.len = gr.el.getTotalLength(); gr.el.style.strokeDasharray = gr.len; }
  }
  const YEAR_START = minY - 16, YEAR_END = maxY + GROW_YEARS;
  let raf = 0;
  function setYear(year) {
    for (const gr of growables) {
      const tt = (year - gr.birth) / GROW_YEARS;
      const s = tt <= 0 ? 0 : tt >= 1 ? 1 : tt * tt * (3 - 2 * tt);
      if (gr.kind === "branch") gr.el.style.strokeDashoffset = ((1 - s) * gr.len).toFixed(1);
      else if (gr.kind === "trunk") {
        const sc = Math.max(s, 0.001);
        gr.el.setAttribute("transform", `translate(0 ${(gr.baseY * (1 - sc)).toFixed(1)}) scale(1 ${sc.toFixed(3)})`);
        gr.el.style.opacity = s > 0 ? 1 : 0;
      } else { gr.el.setAttribute("transform", `scale(${Math.max(s, 0.001).toFixed(3)})`); gr.el.style.opacity = s > 0 ? 1 : 0; }
    }
  }
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) setYear(YEAR_END);
  else {
    setYear(YEAR_START);
    const DUR = 6, t0 = performance.now();
    const step = (t) => {
      const k = Math.min((t - t0) / 1000 / DUR, 1);
      setYear(YEAR_START + (YEAR_END - YEAR_START) * k);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  return { dispose() { cancelAnimationFrame(raf); tip.hidden = true; svg.remove(); } };
}
