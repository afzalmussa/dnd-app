"""Write the HTML review report. Flagged entries come first."""
import html
import json
from pathlib import Path


def esc(v):
    return "" if v is None else html.escape(str(v))


def class_card(e, problems):
    flags = e["source"]["flags"] + problems
    p = e["source"]["page"]
    out = [f'<section class="{"flagged" if flags else "clean"}">',
           f'<h2>{esc(e["name"])} <small>{esc(e["id"])} · PDF page {p} · OCR used: {"yes" if e["source"]["ocrUsed"] else "no"}</small></h2>']
    if flags:
        out.append("<ul class='flags'>" + "".join(f"<li>{esc(f)}</li>" for f in flags) + "</ul>")
    out.append("<table class='kv'>")
    for k in ("hitDie", "primaryAbilities", "savingThrows", "skillChoices", "weaponProficiencies", "armorTraining",
              "toolProficiencies", "startingEquipment", "subclassLevel", "spellcasting"):
        out.append(f"<tr><th>{k}</th><td>{esc(json.dumps(e[k]))}</td></tr>")
    out.append("</table>")
    cols = e["columnNames"]
    slots = e["progression"][0]["spellSlots"] is not None
    out.append("<table><tr><th>Lvl</th><th>Prof</th><th>Features</th>" + "".join(f"<th>{esc(c)}</th>" for c in cols)
               + ("".join(f"<th>S{i}</th>" for i in range(1, 10)) if slots else "") + "</tr>")
    for r in e["progression"]:
        out.append(f"<tr><td>{r['level']}</td><td>{esc(r['proficiencyBonus'])}</td><td>{esc(', '.join(r['featuresPrinted']))}</td>"
                   + "".join(f"<td>{esc(r['columns'][c])}</td>" for c in cols)
                   + ("".join(f"<td>{esc(s)}</td>" for s in r["spellSlots"]) if slots else "") + "</tr>")
    out.append("</table><h3>Features</h3>")
    for f in e["features"]:
        ff = f["source"]["flags"]
        out.append(f"<details {'open' if ff else ''}><summary>Level {f['level']}: {esc(f['name'])}"
                   + (f" <span class='bad'>{esc('; '.join(ff))}</span>" if ff else "") + f"</summary><p>{esc(f['text'])}</p></details>")
    out.append("</section>")
    return "\n".join(out)


def write_report(path, book, classes, problems_by_id, fixes, spells=(), spell_problems=None, extras=()):
    flagged = [c for c in classes if c["source"]["flags"] or problems_by_id.get(c["id"])]
    clean = [c for c in classes if c not in flagged]
    by_rule = {}
    for f in fixes:
        by_rule[f["rule"]] = by_rule.get(f["rule"], 0) + 1
    body = [f"<h1>Import report: {esc(book)}</h1>",
            f"<p>{len(classes)} classes parsed. {len(flagged)} flagged, {len(clean)} clean.</p>",
            "<p>OCR fixes applied: " + (", ".join(f"{esc(k)} x{v}" for k, v in sorted(by_rule.items())) or "none")
            + ". Every fix is listed in <code>fixes-" + esc(book) + ".json</code>.</p>"]
    for c in flagged + clean:
        body.append(class_card(c, problems_by_id.get(c["id"], [])))
    if spells:
        body.append(spell_section(spells, spell_problems or {}))
    for html_part in extras:
        body.append(html_part)
    css = ("body{font:14px system-ui;max-width:1100px;margin:1em auto;padding:0 1em}"
           "section{border:1px solid #ccc;border-radius:6px;padding:0 1em 1em;margin:1em 0}"
           ".flagged{border-color:#c33;background:#fff6f6}small{color:#666;font-weight:normal}"
           "table{border-collapse:collapse;margin:.5em 0}td,th{border:1px solid #ddd;padding:2px 6px;text-align:left}"
           "tr.flagged{background:#fff6f6}.flags{color:#b00}.bad{color:#b00;font-weight:normal}.kv th{width:12em}")
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(f"<!doctype html><meta charset='utf-8'><title>Import report {esc(book)}</title><style>{css}</style>"
                          + "\n".join(body), encoding="utf-8")


def spell_section(spells, problems_by_id):
    """One row per spell, flagged spells first."""
    def flags(s):
        return s["source"]["flags"] + problems_by_id.get(s["id"], [])
    ordered = sorted(spells, key=lambda s: (not flags(s), s["source"]["page"] or 0))
    out = [f"<h1>Spells ({len(spells)})</h1>",
           f"<p>{sum(1 for s in spells if flags(s))} flagged. Flagged first, then by page.</p>",
           "<table><tr><th>Name</th><th>Page</th><th>OCR</th><th>Lvl</th><th>School</th><th>Cast</th><th>Range</th>"
           "<th>Components</th><th>Duration</th><th>Classes</th><th>Flags</th></tr>"]
    for s in ordered:
        c = s["components"]
        comp = "" if not c else ", ".join(k.upper() for k in "vsm" if c[k]) + (f" ({c['material']})" if c["material"] else "")
        f = flags(s)
        out.append(f"<tr class='{'flagged' if f else ''}'><td>{esc(s['name'])}</td><td>{esc(s['source']['page'])}</td>"
                   f"<td>{'yes' if s['source']['ocrUsed'] else ''}</td><td>{esc(s['level'])}</td><td>{esc(s['school'])}</td>"
                   f"<td>{esc(s['castingTime'])}{' (ritual)' if s['ritual'] else ''}</td><td>{esc(s['range'])}</td>"
                   f"<td>{esc(comp)}</td><td>{esc(s['duration'])}</td><td>{esc(', '.join(s['classLists']))}</td>"
                   f"<td class='bad'>{esc('; '.join(f))}</td></tr>")
    out.append("</table>")
    return "\n".join(out)


def feat_section(feats, problems_by_id):
    def flags(f):
        return f["source"]["flags"] + problems_by_id.get(f["id"], [])
    out = [f"<h1>Feats ({len(feats)})</h1>", "<table><tr><th>Name</th><th>Page</th><th>Category</th><th>Prerequisite</th><th>Repeatable</th><th>Flags</th></tr>"]
    for f in sorted(feats, key=lambda f: (not flags(f), f["source"]["page"] or 0)):
        pre = (f["prerequisite"] or {}).get("printed", "")
        out.append(f"<tr class='{'flagged' if flags(f) else ''}'><td>{esc(f['name'])}</td><td>{esc(f['source']['page'])}</td><td>{esc(f['category'])}</td>"
                   f"<td>{esc(pre)}</td><td>{'yes' if f['repeatable'] else ''}</td><td class='bad'>{esc('; '.join(flags(f)))}</td></tr>")
    out.append("</table>")
    return "\n".join(out)


def species_section(species, problems_by_id):
    def flags(s):
        return s["source"]["flags"] + problems_by_id.get(s["id"], [])
    out = [f"<h1>Species ({len(species)})</h1>"]
    for s in sorted(species, key=lambda s: (not flags(s), s["source"]["page"] or 0)):
        out.append(f"<section class='{'flagged' if flags(s) else ''}'><h2>{esc(s['name'])} <small>PDF page {esc(s['source']['page'])}</small></h2>")
        if flags(s):
            out.append("<ul class='flags'>" + "".join(f"<li>{esc(x)}</li>" for x in flags(s)) + "</ul>")
        out.append(f"<p>{esc(s['creatureType'])} · {esc(s['size'])} · {esc(s['speed'])}</p><ul>")
        out += [f"<li><b>{esc(t['name'])}</b>: {esc(t['text'][:300])}</li>" for t in s["traits"]]
        out.append("</ul></section>")
    return "\n".join(out)


def subclass_section(subs, problems_by_id):
    def flags(x):
        return x["source"]["flags"] + problems_by_id.get(x["id"], [])
    out = [f"<h1>Subclasses ({len(subs)})</h1>"]
    for x in sorted(subs, key=lambda x: (not flags(x), x["source"]["page"] or 0)):
        out.append(f"<section class='{'flagged' if flags(x) else ''}'><h2>{esc(x['name'])} <small>{esc(x['classId'])} · PDF page {esc(x['source']['page'])}</small></h2>")
        if flags(x):
            out.append("<ul class='flags'>" + "".join(f"<li>{esc(f)}</li>" for f in flags(x)) + "</ul>")
        out.append(f"<p><i>{esc(x['summary'])}</i></p>")
        for f in x["features"]:
            ff = f["source"]["flags"]
            out.append(f"<details {'open' if ff else ''}><summary>Level {esc(f['level'])}: {esc(f['name'])}"
                       + (f" <span class='bad'>{esc('; '.join(ff))}</span>" if ff else "") + f"</summary><p>{esc(f['text'])}</p></details>")
        out.append("</section>")
    return "\n".join(out)


def background_section(bgs, problems_by_id):
    def flags(b):
        return b["source"]["flags"] + problems_by_id.get(b["id"], [])
    out = [f"<h1>Backgrounds ({len(bgs)})</h1>", "<table><tr><th>Name</th><th>Page</th><th>Abilities</th><th>Origin feat</th><th>Skills</th><th>Tool</th><th>Equipment</th><th>Flags</th></tr>"]
    for b in sorted(bgs, key=lambda b: (not flags(b), b["source"]["page"] or 0)):
        feat = (b["originFeatId"] or "") + (f" ({b['originFeatChoice']})" if b["originFeatChoice"] else "")
        out.append(f"<tr class='{'flagged' if flags(b) else ''}'><td>{esc(b['name'])}</td><td>{esc(b['source']['page'])}</td><td>{esc(', '.join(b['abilityOptions']))}</td>"
                   f"<td>{esc(feat)}</td><td>{esc(', '.join(b['skillProficiencies']))}</td><td>{esc(b['toolProficiency'])}</td><td>{esc(b['equipment'])}</td>"
                   f"<td class='bad'>{esc('; '.join(flags(b)))}</td></tr>")
    out.append("</table>")
    return "\n".join(out)


def item_section(items, problems_by_id):
    def flags(i):
        return i["source"]["flags"] + problems_by_id.get(i["id"], [])
    out = [f"<h1>Weapons and armor ({len(items)})</h1>", "<table><tr><th>Name</th><th>Page</th><th>Kind</th><th>Details</th><th>Weight</th><th>Cost</th><th>Flags</th></tr>"]
    for i in sorted(items, key=lambda i: (not flags(i), i["source"]["page"] or 0)):
        d = i.get("weapon") or i.get("armor")
        out.append(f"<tr class='{'flagged' if flags(i) else ''}'><td>{esc(i['name'])}</td><td>{esc(i['source']['page'])}</td><td>{esc(i['category'])}</td>"
                   f"<td>{esc(json.dumps(d))}</td><td>{esc(i['weight'])}</td><td>{esc(i['cost'])}</td><td class='bad'>{esc('; '.join(flags(i)))}</td></tr>")
    out.append("</table>")
    return "\n".join(out)
