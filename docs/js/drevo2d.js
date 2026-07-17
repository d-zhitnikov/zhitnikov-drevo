// Эмблема рода Житниковых: золотое древо-жизни в кольце.
// Ствол делится на суки, суки — на ветви (фрактал), на кончиках — листья-люди.
// Два цвета: коричневый и золото. Живая самопрорисовка при загрузке.

const NS = "http://www.w3.org/2000/svg";
const GOLD = "#d8a54e";       // листья
const GOLD_DIM = "#c08238";   // ветви, кольцо
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
  const W = 900, H = 900, R = 396, CX = 450, CY = 450;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.classList.add("drevo2d");
  container.appendChild(svg);

  const defs = document.createElementNS(NS, "defs");
  defs.innerHTML = `
    <radialGradient id="field" cx="50%" cy="42%" r="70%">
      <stop offset="0%" stop-color="#2c1e0b"/>
      <stop offset="78%" stop-color="#241809"/>
      <stop offset="100%" stop-color="#1c1206"/>
    </radialGradient>`;
  svg.appendChild(defs);

  const tip = document.getElementById("w3dTip");
  const { list, minY, maxY } = mainLinePeople(DB);
  const rnd = mkRand([...(list[0]?.p.id || "x")].reduce((a, c) => a + c.charCodeAt(0), 0));

  // ——— поле и кольцо ———
  const field = document.createElementNS(NS, "circle");
  field.setAttribute("cx", CX); field.setAttribute("cy", CY); field.setAttribute("r", R + 26);
  field.setAttribute("fill", "url(#field)");
  svg.appendChild(field);
  const growables = [];
  for (const rr of [R + 26, R + 14]) {
    const ring = document.createElementNS(NS, "circle");
    ring.setAttribute("cx", CX); ring.setAttribute("cy", CY); ring.setAttribute("r", rr);
    ring.setAttribute("fill", "none");
    ring.setAttribute("stroke", GOLD_DIM);
    ring.setAttribute("stroke-width", rr === R + 26 ? "2.6" : "1");
    if (rr !== R + 26) ring.setAttribute("opacity", "0.55");
    svg.appendChild(ring);
    growables.push({ el: ring, birth: minY - 16, kind: "branch" });
  }

  const g = document.createElementNS(NS, "g");
  svg.appendChild(g);

  // ————— фрактальное древо —————
  // Сначала строим абстрактное дерево ветвления с ~N кончиками (N = число людей),
  // затем раскладываем геометрию, затем назначаем людей кончикам по годам.
  const N = list.length;
  // структура: узел {children:[]}; растим до нужного числа листьев
  function buildShape(nTips) {
    const root = { children: [], depth: 0 };
    let leaves = [root];
    while (leaves.length < nTips) {
      // берём самый «мелкий» лист, делим на 2–3
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

  // геометрия: рекурсивный рост
  const forkY = CY + R * 0.16;        // где ствол переходит в крону
  const baseY = CY + R * 0.74;        // основание ствола
  const tips = [];                     // {x,y,ang}
  const branchEls = [];                // {el, gen} для послойной анимации
  let maxGen = 0;

  function grow(node, x, y, ang, len, width, gen) {
    maxGen = Math.max(maxGen, gen);
    const x2 = x + Math.sin(ang) * len;
    const y2 = y - Math.cos(ang) * len;
    // изогнутая сужающаяся ветвь
    const cbow = (rnd() - 0.5) * len * 0.5;
    const nx = Math.cos(ang), ny = Math.sin(ang);   // нормаль к направлению
    const mx = (x + x2) / 2 + nx * cbow, my = (y + y2) / 2 + ny * cbow;
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", `M ${x.toFixed(1)} ${y.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`);
    path.setAttribute("stroke", GOLD_DIM);
    path.setAttribute("stroke-width", Math.max(1, width).toFixed(1));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke-linecap", "round");
    g.appendChild(path);
    branchEls.push({ el: path, gen });

    if (!node.children.length) {
      tips.push({ x: x2, y: y2, ang, gen });
      return;
    }
    const k = node.children.length;
    const spreadBase = 0.62 - gen * 0.04;
    node.children.forEach((ch, i) => {
      const off = (i - (k - 1) / 2) * (spreadBase / Math.max(1, k - 1) * 2 || spreadBase);
      let childAng = ang + off + (rnd() - 0.5) * 0.12;
      childAng *= 0.94;                              // мягко стремим вверх
      const childLen = len * (0.70 + rnd() * 0.10);
      grow(ch, x2, y2, childAng, childLen, width * 0.72, gen + 1);
    });
  }
  grow(shape, CX, forkY, 0, R * 0.30, 11, 0);

  // назначаем людей кончикам: раскладываем по x, чтобы старшие ближе к центру не важно —
  // просто по порядку слева-направо к людям по годам (условная метафора)
  tips.sort((a, b) => a.x - b.x);
  const people = list.slice();
  tips.forEach((t, i) => { t.person = people[i % people.length]?.p; t.birth = people[i % people.length]?.y; });

  // ——— ствол ———
  const trunkW = 46, neckW = 13;
  const trunk = document.createElementNS(NS, "path");
  trunk.setAttribute("d", `
    M ${CX - trunkW / 2} ${baseY}
    C ${CX - trunkW / 2 + 4} ${baseY - R * 0.34}, ${CX - neckW / 2 - 3} ${forkY + 40}, ${CX - neckW / 2} ${forkY}
    L ${CX + neckW / 2} ${forkY}
    C ${CX + neckW / 2 + 3} ${forkY + 40}, ${CX + trunkW / 2 - 4} ${baseY - R * 0.34}, ${CX + trunkW / 2} ${baseY} Z`);
  trunk.setAttribute("fill", GOLD_DIM);
  g.insertBefore(trunk, g.firstChild);
  growables.push({ el: trunk, birth: minY - 15, kind: "trunk", baseY });

  // ——— корни + земля ———
  for (let i = 0; i < 7; i++) {
    const t = (i / 6 - 0.5) * 2;
    const ex = CX + t * R * 0.5;
    const ey = baseY + R * 0.16 - Math.abs(t) * R * 0.05;
    const root = document.createElementNS(NS, "path");
    root.setAttribute("d", `M ${CX + t * 8} ${baseY - 4} Q ${CX + t * R * 0.2} ${baseY + R * 0.06}, ${ex.toFixed(1)} ${ey.toFixed(1)}`);
    root.setAttribute("stroke", GOLD_DIM);
    root.setAttribute("stroke-width", (3.4 - Math.abs(t) * 1.8).toFixed(1));
    root.setAttribute("fill", "none");
    root.setAttribute("stroke-linecap", "round");
    g.appendChild(root);
    growables.push({ el: root, birth: minY - 15, kind: "branch" });
  }
  for (let i = 0; i < 2; i++) {
    const wy = baseY + R * 0.125 + i * 13, ww = R * (0.54 - i * 0.13);
    const wave = document.createElementNS(NS, "path");
    wave.setAttribute("d", `M ${CX - ww} ${wy} Q ${CX - ww / 2} ${wy - 9}, ${CX} ${wy} T ${CX + ww} ${wy}`);
    wave.setAttribute("stroke", GOLD_DIM);
    wave.setAttribute("stroke-width", "1.6");
    wave.setAttribute("fill", "none");
    wave.setAttribute("opacity", "0.72");
    wave.setAttribute("stroke-linecap", "round");
    g.appendChild(wave);
    growables.push({ el: wave, birth: minY - 14, kind: "branch" });
  }

  // послойный «рост» ветвей во времени по поколению
  for (const b of branchEls) {
    const frac = maxGen ? b.gen / maxGen : 0;
    growables.push({ el: b.el, birth: minY + frac * (maxY - minY), kind: "branch" });
  }

  // ——— листья-люди на кончиках ———
  for (const t of tips) {
    const p = t.person;
    const dead = !!p?.death;
    const cluster = document.createElementNS(NS, "g");
    cluster.setAttribute("transform", `translate(${t.x.toFixed(1)}, ${t.y.toFixed(1)})`);
    cluster.classList.add("leaf-hit");
    g.appendChild(cluster);
    const inner = document.createElementNS(NS, "g");
    cluster.appendChild(inner);
    const deg = (t.ang * 180 / Math.PI).toFixed(1);   // остриё вдоль ветви (наружу)

    const me = document.createElementNS(NS, "path");
    me.setAttribute("d", LEAF_D);
    if (dead) { me.setAttribute("fill", "none"); me.setAttribute("stroke", GOLD); me.setAttribute("stroke-width", "1.5"); }
    else me.setAttribute("fill", GOLD);
    me.setAttribute("transform", `rotate(${deg}) translate(0 1) scale(1.32)`);
    me.classList.add("leaf-person", "leaf-live");
    me.style.animationDelay = (-rnd() * 7).toFixed(1) + "s";
    inner.appendChild(me);
    for (const side of [-1, 1]) {
      const d = document.createElementNS(NS, "path");
      d.setAttribute("d", LEAF_D);
      d.setAttribute("fill", GOLD);
      d.setAttribute("opacity", "0.85");
      d.setAttribute("transform", `rotate(${(+deg + side * (32 + rnd() * 14)).toFixed(0)}) translate(0 3) scale(${(0.6 + rnd() * 0.2).toFixed(2)})`);
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
