// Интерактивное семейное древо: раскладка «песочные часы» вокруг фокусной персоны.
// Предки — вверх, потомки — вниз, супруги — рядом. SVG + пан/зум.

const CW = 188, CH = 62;      // карточка
const SP = 10;                 // зазор между супругами
const GX = 26;                 // зазор между ветками
const GY = 118;                // расстояние между поколениями
const NS = "http://www.w3.org/2000/svg";

export function renderTree(svg, db, focusId, opts) {
  const { persons, families } = db;
  const maxUp = opts.maxUp ?? 3, maxDown = opts.maxDown ?? 3;
  svg.innerHTML = "";
  const root = document.createElementNS(NS, "g");
  svg.appendChild(root);

  const cards = [];   // {p, x, y, focus, hiddenUp, hiddenDown}
  const edges = [];   // path data strings
  const marrEdges = [];

  // ——— потомки ———
  // Узел: персона + все её супруги в одном ряду; дети каждой семьи под ними.
  function descUnit(pid, depth) {
    const p = persons[pid];
    const fams = (p.fams || []).map(f => families[f]).filter(Boolean);
    const row = [{ id: pid, main: true }];
    for (const f of fams) {
      const spId = f.husband === pid ? f.wife : f.husband;
      if (spId && persons[spId]) row.push({ id: spId, fam: f });
    }
    const rowW = row.length * CW + (row.length - 1) * SP;
    let kids = [];
    if (depth < maxDown) {
      for (const f of fams) {
        for (const c of f.children || []) {
          if (persons[c]) kids.push(descUnit(c, depth + 1));
        }
      }
    }
    const kidsW = kids.reduce((s, k) => s + k.w, 0) + Math.max(0, kids.length - 1) * GX;
    const hasHiddenKids = depth >= maxDown && fams.some(f => (f.children || []).length);
    return { pid, row, rowW, kids, w: Math.max(rowW, kidsW), depth, hasHiddenKids };
  }

  function placeDesc(unit, x0, y) {
    // ряд по центру блока
    const rx = x0 + (unit.w - unit.rowW) / 2;
    unit.row.forEach((m, i) => {
      m.x = rx + i * (CW + SP);
      m.y = y;
    });
    const main = unit.row[0];
    cards.push({
      p: persons[main.id], x: main.x, y: main.y,
      focus: unit.depth === 0,
      hiddenDown: unit.hasHiddenKids,
      hiddenUp: unit.depth > 0 && (persons[main.id].famc || []).length > 0,
    });
    for (let i = 1; i < unit.row.length; i++) {
      const m = unit.row[i];
      const sp = persons[m.id];
      cards.push({ p: sp, x: m.x, y: m.y, hiddenUp: (sp.famc || []).length > 0,
        hiddenDown: false });
      marrEdges.push({ x1: unit.row[i - 1].x + CW, x2: m.x, y: y + CH / 2, fam: m.fam });
    }
    // дети
    let cx = x0 + (unit.w - (unit.kids.reduce((s, k) => s + k.w, 0) + Math.max(0, unit.kids.length - 1) * GX)) / 2;
    for (const kid of unit.kids) {
      placeDesc(kid, cx, y + CH + GY);
      // ребро: от точки брака (или низа карточки главного) к ребёнку
      const kf = (persons[kid.pid].famc || [])[0];
      const anchor = anchorForFamily(unit, kf);
      const child = kid.row[0];
      edges.push(edgePath(anchor.x, anchor.y, child.x + CW / 2, y + CH + GY));
      cx += kid.w + GX;
    }
  }

  function anchorForFamily(unit, famId) {
    // точка, откуда идёт линия к детям этой семьи: середина брачного соединения
    for (let i = 1; i < unit.row.length; i++) {
      if (unit.row[i].fam && unit.row[i].fam.id === famId) {
        return { x: (unit.row[i - 1].x + CW + unit.row[i].x) / 2, y: unit.row[i].y + CH / 2 };
      }
    }
    const m = unit.row[0];
    return { x: m.x + CW / 2, y: m.y + CH };
  }

  // ——— предки ———
  // Узел: семья родителей (отец+мать), над каждым — его родительская семья.
  function ancUnit(pid, depth) {
    const p = persons[pid];
    const famId = (p.famc || [])[0];
    const f = famId ? families[famId] : null;
    if (!f || depth >= maxUp) return null;
    const fa = f.husband && persons[f.husband] ? f.husband : null;
    const mo = f.wife && persons[f.wife] ? f.wife : null;
    if (!fa && !mo) return null;
    const unit = { fam: f, fa, mo, depth };
    unit.faUp = fa ? ancUnit(fa, depth + 1) : null;
    unit.moUp = mo ? ancUnit(mo, depth + 1) : null;
    const pairW = (fa && mo) ? CW * 2 + SP : CW;
    const upW = (unit.faUp ? unit.faUp.w : (fa ? CW : 0)) +
                (unit.moUp ? unit.moUp.w : (mo ? CW : 0));
    const upGap = (fa && mo) ? GX : 0;
    unit.w = Math.max(pairW, upW ? upW + upGap : 0);
    return unit;
  }

  function placeAnc(unit, x0, y, childAnchorX, childY) {
    const { fa, mo } = unit;
    const pairW = (fa && mo) ? CW * 2 + SP : CW;
    // ширины верхних поддеревьев, чтобы выровнять пару по их центрам
    const faW = unit.faUp ? unit.faUp.w : (fa ? CW : 0);
    const moW = unit.moUp ? unit.moUp.w : (mo ? CW : 0);
    let px = x0 + (unit.w - pairW) / 2;
    if (fa && mo && (unit.faUp || unit.moUp)) {
      // центрируем пару между центрами поддеревьев
      const faCx = x0 + faW / 2;
      const moCx = x0 + faW + GX + moW / 2;
      px = Math.min(Math.max((faCx + moCx) / 2 - pairW / 2, x0), x0 + unit.w - pairW);
    }
    let faCard = null, moCard = null;
    if (fa) {
      faCard = { p: persons[fa], x: px, y,
        hiddenUp: !unit.faUp && (persons[fa].famc || []).length > 0 };
      cards.push(faCard);
    }
    if (mo) {
      moCard = { p: persons[mo], x: fa ? px + CW + SP : px, y,
        hiddenUp: !unit.moUp && (persons[mo].famc || []).length > 0 };
      cards.push(moCard);
    }
    let anchorX;
    if (fa && mo) {
      marrEdges.push({ x1: faCard.x + CW, x2: moCard.x, y: y + CH / 2, fam: unit.fam });
      anchorX = (faCard.x + CW + moCard.x) / 2;
      edges.push(edgePath(anchorX, y + CH / 2, childAnchorX, childY));
    } else {
      const c = faCard || moCard;
      anchorX = c.x + CW / 2;
      edges.push(edgePath(anchorX, y + CH, childAnchorX, childY));
    }
    if (unit.faUp) placeAnc(unit.faUp, x0, y - CH - GY, faCard.x + CW / 2, y);
    if (unit.moUp) placeAnc(unit.moUp, x0 + faW + GX, y - CH - GY, moCard.x + CW / 2, y);
  }

  // ——— сборка ———
  const desc = descUnit(focusId, 0);
  placeDesc(desc, 0, 0);
  const focusCard = cards.find(c => c.focus);
  const anc = ancUnit(focusId, 0);
  if (anc) {
    focusCard.hiddenUp = false;
    const cx = focusCard.x + CW / 2;
    placeAnc(anc, cx - anc.w / 2, -(CH + GY), cx, 0);
  } else {
    focusCard.hiddenUp = (persons[focusId].famc || []).length > 0;
  }

  // ——— отрисовка ———
  for (const d of edges) {
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", d);
    path.setAttribute("class", "edge");
    root.appendChild(path);
  }
  for (const m of marrEdges) {
    const line = document.createElementNS(NS, "path");
    line.setAttribute("d", `M ${m.x1} ${m.y} H ${m.x2}`);
    line.setAttribute("class", "edge edge-marr");
    root.appendChild(line);
    const ring = document.createElementNS(NS, "circle");
    ring.setAttribute("cx", (m.x1 + m.x2) / 2);
    ring.setAttribute("cy", m.y);
    ring.setAttribute("r", 3.2);
    ring.setAttribute("fill", "var(--gold)");
    root.appendChild(ring);
  }
  for (const c of cards) drawCard(root, c, db, opts);

  // ——— пан/зум ———
  setupPanZoom(svg, root, cards);
  return cards;
}

function edgePath(x1, y1, x2, y2) {
  const my = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`;
}

function drawCard(root, c, db, opts) {
  const g = document.createElementNS(NS, "g");
  g.setAttribute("class", "node-card" + (c.focus ? " focus" : ""));
  g.setAttribute("transform", `translate(${c.x},${c.y})`);

  const box = document.createElementNS(NS, "rect");
  box.setAttribute("class", "node-box");
  box.setAttribute("width", CW); box.setAttribute("height", CH);
  box.setAttribute("rx", 12);
  g.appendChild(box);

  // аватар
  const av = opts.avatar(c.p);
  const cx = 31, cy = CH / 2, r = 21;
  if (av) {
    const clipId = "clip" + c.p.id + Math.random().toString(36).slice(2, 7);
    const clip = document.createElementNS(NS, "clipPath");
    clip.setAttribute("id", clipId);
    const cc = document.createElementNS(NS, "circle");
    cc.setAttribute("cx", cx); cc.setAttribute("cy", cy); cc.setAttribute("r", r);
    clip.appendChild(cc);
    g.appendChild(clip);
    const img = document.createElementNS(NS, "image");
    img.setAttribute("href", "media/t/" + av);
    img.setAttribute("x", cx - r); img.setAttribute("y", cy - r);
    img.setAttribute("width", r * 2); img.setAttribute("height", r * 2);
    img.setAttribute("preserveAspectRatio", "xMidYMid slice");
    img.setAttribute("clip-path", `url(#${clipId})`);
    g.appendChild(img);
  } else {
    const bg = document.createElementNS(NS, "circle");
    bg.setAttribute("cx", cx); bg.setAttribute("cy", cy); bg.setAttribute("r", r);
    bg.setAttribute("class", "avatar-bg-" + (c.p.sex || "U"));
    bg.setAttribute("opacity", "0.8");
    g.appendChild(bg);
    const t = document.createElementNS(NS, "text");
    t.setAttribute("x", cx); t.setAttribute("y", cy + 6);
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("class", "avatar-initials");
    t.textContent = (c.p.given || "?").slice(0, 1);
    g.appendChild(t);
  }
  const ring = document.createElementNS(NS, "circle");
  ring.setAttribute("cx", cx); ring.setAttribute("cy", cy); ring.setAttribute("r", r + 1.5);
  ring.setAttribute("fill", "none");
  ring.setAttribute("stroke-width", "2");
  ring.setAttribute("class", "node-ring-" + (c.p.sex || "U"));
  g.appendChild(ring);

  // имя (до двух строк) и годы
  const nameParts = wrapName(c.p, 17);
  nameParts.forEach((line, i) => {
    const t = document.createElementNS(NS, "text");
    t.setAttribute("x", 60);
    t.setAttribute("y", nameParts.length > 1 ? 22 + i * 15 : 27);
    t.setAttribute("class", "node-name");
    t.textContent = line;
    g.appendChild(t);
  });
  const yrs = document.createElementNS(NS, "text");
  yrs.setAttribute("x", 60);
  yrs.setAttribute("y", nameParts.length > 1 ? 52 : 45);
  yrs.setAttribute("class", "node-years");
  yrs.textContent = opts.years(c.p);
  g.appendChild(yrs);

  g.addEventListener("click", (e) => { e.stopPropagation(); opts.onOpen(c.p.id); });

  // стрелки к скрытым поколениям — перефокус
  if (c.hiddenUp) g.appendChild(expandBadge(CW / 2, -1, "↑", () => opts.onFocus(c.p.id)));
  if (c.hiddenDown) g.appendChild(expandBadge(CW / 2, CH + 1, "↓", () => opts.onFocus(c.p.id)));

  root.appendChild(g);
}

function expandBadge(x, y, glyph, onClick) {
  const g = document.createElementNS(NS, "g");
  g.setAttribute("class", "node-expand");
  g.setAttribute("transform", `translate(${x},${y})`);
  const c = document.createElementNS(NS, "circle");
  c.setAttribute("r", 10);
  g.appendChild(c);
  const t = document.createElementNS(NS, "text");
  t.setAttribute("text-anchor", "middle"); t.setAttribute("y", 4.5);
  t.textContent = glyph;
  g.appendChild(t);
  g.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
  return g;
}

function wrapName(p, maxLen) {
  const given = p.given || "", surname = p.surname || "";
  const full = (given + " " + surname).trim() || "Без имени";
  if (full.length <= maxLen) return [full];
  const lines = [given || full, surname].filter(Boolean);
  return lines.map(l => l.length > maxLen + 4 ? l.slice(0, maxLen + 3) + "…" : l).slice(0, 2);
}

function setupPanZoom(svg, root, cards) {
  let t = { x: 0, y: 0, k: 1 };
  const apply = () => root.setAttribute("transform", `translate(${t.x},${t.y}) scale(${t.k})`);

  // вписать всё в окно
  const pad = 60;
  const xs = cards.map(c => c.x), ys = cards.map(c => c.y);
  const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + CW + pad;
  const minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + CH + pad;
  const bw = maxX - minX, bh = maxY - minY;
  const fit = () => {
    const W = svg.clientWidth, H = svg.clientHeight;
    t.k = Math.min(W / bw, H / bh, 1.1);
    if (t.k < 0.22) t.k = 0.22; // не мельчить: пусть будет прокрутка
    t.x = (W - bw * t.k) / 2 - minX * t.k;
    t.y = (H - bh * t.k) / 2 - minY * t.k;
    // фокус в центре по горизонтали, по вертикали чуть выше середины
    const f = cards.find(c => c.focus);
    if (f && (bw * t.k > W || bh * t.k > H)) {
      t.x = svg.clientWidth / 2 - (f.x + CW / 2) * t.k;
      t.y = svg.clientHeight / 2 - (f.y + CH / 2) * t.k;
    }
    apply();
  };
  fit();
  svg._fit = fit;
  const onResize = () => { if (svg.isConnected) fit(); else window.removeEventListener("resize", onResize); };
  window.addEventListener("resize", onResize);
  svg._zoom = (dk) => {
    const W = svg.clientWidth, H = svg.clientHeight;
    zoomAt(W / 2, H / 2, dk);
  };

  function zoomAt(px, py, factor) {
    const nk = Math.min(2.5, Math.max(0.1, t.k * factor));
    t.x = px - (px - t.x) * (nk / t.k);
    t.y = py - (py - t.y) * (nk / t.k);
    t.k = nk;
    apply();
  }

  svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = svg.getBoundingClientRect();
    if (e.ctrlKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.pow(1.0015, -e.deltaY * (e.ctrlKey ? 4 : 1)));
    } else {
      t.x -= e.deltaX; apply();
    }
  }, { passive: false });

  let drag = null;
  const pointers = new Map();
  svg.addEventListener("pointerdown", (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      drag = { x: e.clientX, y: e.clientY, tx: t.x, ty: t.y, moved: false, pid: e.pointerId };
    }
  });
  svg.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    if (pointers.size === 2) {
      // pinch
      const pts = [...pointers.values()];
      const before = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pts2 = [...pointers.values()];
      const after = Math.hypot(pts2[0].x - pts2[1].x, pts2[0].y - pts2[1].y);
      const rect = svg.getBoundingClientRect();
      const mx = (pts2[0].x + pts2[1].x) / 2 - rect.left;
      const my = (pts2[0].y + pts2[1].y) / 2 - rect.top;
      if (before > 0) zoomAt(mx, my, after / before);
      return;
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 5) {
        // захватываем указатель только когда реально тащат —
        // иначе click по карточкам/стрелкам не доходит до них
        drag.moved = true;
        svg.classList.add("dragging");
        try { svg.setPointerCapture(drag.pid); } catch {}
      }
      if (drag.moved) {
        t.x = drag.tx + dx; t.y = drag.ty + dy;
        apply();
      }
    }
  });
  const up = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) { drag = null; svg.classList.remove("dragging"); }
  };
  svg.addEventListener("pointerup", up);
  svg.addEventListener("pointercancel", up);
}
