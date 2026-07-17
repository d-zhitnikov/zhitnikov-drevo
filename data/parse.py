#!/usr/bin/env python3
"""Convert MyHeritage GEDCOM 5.5.1 export to site/data.json."""
import json, re, html
from pathlib import Path

HERE = Path(__file__).parent
GED = HERE / "zhitnikov.ged"
OUT = HERE.parent / "docs" / "data.json"

MONTHS_RU = {
    "JAN": "января", "FEB": "февраля", "MAR": "марта", "APR": "апреля",
    "MAY": "мая", "JUN": "июня", "JUL": "июля", "AUG": "августа",
    "SEP": "сентября", "OCT": "октября", "NOV": "ноября", "DEC": "декабря",
}
MONTH_NUM = {m: i + 1 for i, m in enumerate(MONTHS_RU)}


def parse_lines(text):
    """Build a tree of nodes: dict(level, tag, value, children)."""
    root = {"level": -1, "tag": "ROOT", "value": "", "children": []}
    stack = [root]
    for raw in text.splitlines():
        line = raw.rstrip("\r\n")
        if not line.strip():
            continue
        m = re.match(r"^(\d+)\s+(@[^@]+@\s+)?(\S+)(?:\s(.*))?$", line)
        if not m:
            continue
        level = int(m.group(1))
        xref = (m.group(2) or "").strip().strip("@")
        tag = m.group(3)
        value = m.group(4) or ""
        if xref:  # level-0 record: "0 @I1@ INDI"
            node = {"level": level, "tag": tag, "xref": xref, "value": value, "children": []}
        else:
            node = {"level": level, "tag": tag, "xref": "", "value": value, "children": []}
        while stack and stack[-1]["level"] >= level:
            stack.pop()
        stack[-1]["children"].append(node)
        stack.append(node)
    return root


def child(node, tag):
    for c in node["children"]:
        if c["tag"] == tag:
            return c
    return None


def children(node, tag):
    return [c for c in node["children"] if c["tag"] == tag]


def text_with_cont(node):
    """Value plus CONC/CONT continuations."""
    parts = [node["value"]]
    for c in node["children"]:
        if c["tag"] == "CONC":
            parts.append(c["value"])
        elif c["tag"] == "CONT":
            parts.append("\n" + c["value"])
    joined = "".join(parts)
    # MyHeritage may split a multi-byte UTF-8 char across CONC lines;
    # the file is read with surrogateescape, so re-join at byte level.
    return joined.encode("utf-8", "surrogateescape").decode("utf-8", "replace")


def clean_note(s):
    """MyHeritage notes are HTML-ish; convert to plain paragraphs + links."""
    links = []
    def take_link(m):
        links.append({"url": m.group(1), "name": m.group(2)})
        return ""
    s = re.sub(r"Web content link:<LinkURL>(.*?)</LinkURL><LinkName>(.*?)</LinkName>", take_link, s, flags=re.S)
    s = re.sub(r"<br\s*/?>", "\n", s)
    s = re.sub(r"</p>\s*", "\n\n", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s)
    s = re.sub(r"\n{3,}", "\n\n", s).strip()
    return s, links


def parse_date(val):
    """GEDCOM date -> {text: Russian, year: int|None, sort: yyyymmdd int}."""
    if not val:
        return None
    v = val.strip().upper()
    prefix = ""
    m = re.match(r"^(ABT|EST|CAL)\s+(.*)$", v)
    if m:
        prefix, v = "около ", m.group(2)
    m = re.match(r"^BEF\s+(.*)$", v)
    if m:
        prefix, v = "до ", m.group(1)
    m = re.match(r"^AFT\s+(.*)$", v)
    if m:
        prefix, v = "после ", m.group(1)
    m = re.match(r"^BET\s+(.*)\s+AND\s+(.*)$", v)
    if m:
        a, b = parse_simple(m.group(1)), parse_simple(m.group(2))
        if a and b:
            return {"text": f"между {a['text']} и {b['text']}", "year": a["year"], "sort": a["sort"]}
        v = m.group(1)
    d = parse_simple(v)
    if not d:
        return {"text": val.strip(), "year": None, "sort": None}
    return {"text": prefix + d["text"], "year": d["year"], "sort": d["sort"]}


def parse_simple(v):
    v = v.strip()
    m = re.match(r"^(\d{1,2})\s+([A-Z]{3})\s+(\d{3,4})$", v)
    if m and m.group(2) in MONTHS_RU:
        day, mon, yr = int(m.group(1)), m.group(2), int(m.group(3))
        return {"text": f"{day} {MONTHS_RU[mon]} {yr}", "year": yr,
                "sort": yr * 10000 + MONTH_NUM[mon] * 100 + day}
    m = re.match(r"^([A-Z]{3})\s+(\d{3,4})$", v)
    if m and m.group(1) in MONTHS_RU:
        mon, yr = m.group(1), int(m.group(2))
        return {"text": f"{MONTHS_RU[mon][:3]}. {yr}" if False else f"{MONTHS_RU[mon]} {yr}", "year": yr,
                "sort": yr * 10000 + MONTH_NUM[mon] * 100}
    m = re.match(r"^(\d{3,4})$", v)
    if m:
        yr = int(m.group(1))
        return {"text": str(yr), "year": yr, "sort": yr * 10000}
    return None


def parse_event(node):
    ev = {}
    d = child(node, "DATE")
    if d:
        ev["date"] = parse_date(d["value"])
    p = child(node, "PLAC")
    if p:
        ev["place"] = p["value"].strip()
    c = child(node, "CAUS")
    if c:
        ev["cause"] = c["value"].strip()
    t = child(node, "TYPE")
    if t:
        ev["type"] = t["value"].strip()
    return ev if ev else None


PHOTO_FIXES = json.load(open(HERE / "photo_fixes.json")) if (HERE / "photo_fixes.json").exists() else {"exclude": []}


def parse_photo(node):
    f = child(node, "FILE")
    if not f or not f["value"].startswith("http"):
        return None
    ph = {"file": f["value"].rsplit("/", 1)[-1]}
    if ph["file"] in PHOTO_FIXES["exclude"]:
        return None
    t = child(node, "TITL")
    if t and t["value"].strip():
        ph["title"] = t["value"].strip()
    rin = child(node, "_PHOTO_RIN")
    if rin:
        ph["rin"] = rin["value"].replace("MH:", "")
    prin = child(node, "_PARENTRIN")
    if prin:
        ph["parentRin"] = prin["value"].replace("MH:", "")
    if child(node, "_PRIM"):
        ph["prim"] = True
    if child(node, "_CUTOUT"):
        ph["cutout"] = True
    if child(node, "_PERSONALPHOTO"):
        ph["personal"] = True
    d = child(node, "_DATE")
    if d:
        ph["date"] = parse_date(d["value"])
    pl = child(node, "_PLACE")
    if pl:
        ph["place"] = pl["value"].strip()
    n = child(node, "NOTE")
    if n:
        txt, _ = clean_note(text_with_cont(n))
        if txt:
            ph["note"] = txt
    return ph


EVENT_TAGS = {
    "BIRT": "birth", "DEAT": "death", "BURI": "burial", "CHR": "christening",
}

root = parse_lines(GED.read_text(encoding="utf-8-sig", errors="surrogateescape"))

sources = {}
for rec in root["children"]:
    if rec["tag"] == "SOUR" and rec.get("xref"):
        t = child(rec, "TITL")
        sources[rec["xref"]] = t["value"].strip() if t else rec["xref"]

persons = {}
for rec in root["children"]:
    if rec["tag"] != "INDI":
        continue
    pid = rec["xref"]
    p = {"id": pid}
    name = child(rec, "NAME")
    given = surname = ""
    if name:
        g = child(name, "GIVN")
        s = child(name, "SURN")
        given = g["value"].strip() if g else ""
        surname = s["value"].strip() if s else ""
        if not given and not surname:
            m = re.match(r"^(.*?)\s*/(.*?)/", name["value"])
            if m:
                given, surname = m.group(1).strip(), m.group(2).strip()
        mn = child(name, "_MARNM")
        if mn and mn["value"].strip() and mn["value"].strip() != surname:
            p["marriedName"] = mn["value"].strip()
    p["given"] = given
    p["surname"] = surname
    sex = child(rec, "SEX")
    p["sex"] = sex["value"].strip() if sex else "U"
    for tag, key in EVENT_TAGS.items():
        n = child(rec, tag)
        if n:
            ev = parse_event(n)
            if ev:
                p[key] = ev
    occ = [c["value"].strip() for c in children(rec, "OCCU") if c["value"].strip()]
    if occ:
        p["occupation"] = occ
    edu = [c["value"].strip() for c in children(rec, "EDUC") if c["value"].strip()]
    if edu:
        p["education"] = edu
    dscr = [c["value"].strip() for c in children(rec, "DSCR") if c["value"].strip()]
    if dscr:
        p["description"] = dscr
    reli = child(rec, "RELI")
    if reli and reli["value"].strip():
        p["religion"] = reli["value"].strip()
    notes, links = [], []
    for n in children(rec, "NOTE"):
        txt, lks = clean_note(text_with_cont(n))
        if txt:
            notes.append(txt)
        links.extend(lks)
    for ev in children(rec, "EVEN"):
        e = parse_event(ev)
        if e:
            p.setdefault("events", []).append(e)
    if notes:
        p["notes"] = notes
    if links:
        p["links"] = links
    srcs = []
    for s in children(rec, "SOUR"):
        ref = s["value"].strip().strip("@")
        pg = child(s, "PAGE")
        srcs.append({"title": sources.get(ref, ref), "page": pg["value"].strip() if pg else ""})
    if srcs:
        p["sources"] = srcs
    photos = []
    for o in children(rec, "OBJE"):
        ph = parse_photo(o)
        if ph:
            photos.append(ph)
    if photos:
        p["photos"] = photos
    p["famc"] = [c["value"].strip().strip("@") for c in children(rec, "FAMC")]
    p["fams"] = [c["value"].strip().strip("@") for c in children(rec, "FAMS")]
    persons[pid] = p

families = {}
for rec in root["children"]:
    if rec["tag"] != "FAM":
        continue
    fid = rec["xref"]
    f = {"id": fid}
    h = child(rec, "HUSB")
    w = child(rec, "WIFE")
    if h:
        f["husband"] = h["value"].strip().strip("@")
    if w:
        f["wife"] = w["value"].strip().strip("@")
    f["children"] = [c["value"].strip().strip("@") for c in children(rec, "CHIL")]
    mr = child(rec, "MARR")
    if mr:
        ev = parse_event(mr)
        if ev:
            f["marriage"] = ev
    dv = child(rec, "DIV")
    if dv is not None:
        f["divorced"] = True
        ev = parse_event(dv) if dv else None
        if ev:
            f["divorce"] = ev
    families[fid] = f

data = {"persons": persons, "families": families}
OUT.parent.mkdir(exist_ok=True)
OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

n_photos = sum(len(p.get("photos", [])) for p in persons.values())
print(f"persons={len(persons)} families={len(families)} photo_refs={n_photos}")
print(f"wrote {OUT} ({OUT.stat().st_size//1024} KB)")
