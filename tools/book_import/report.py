"""Write the HTML review report. Flagged entries come first."""
import html
import json
from pathlib import Path


def esc(v):
    return html.escape(str(v))


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


def write_report(path, book, classes, problems_by_id, fixes):
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
    css = ("body{font:14px system-ui;max-width:1100px;margin:1em auto;padding:0 1em}"
           "section{border:1px solid #ccc;border-radius:6px;padding:0 1em 1em;margin:1em 0}"
           ".flagged{border-color:#c33;background:#fff6f6}small{color:#666;font-weight:normal}"
           "table{border-collapse:collapse;margin:.5em 0}td,th{border:1px solid #ddd;padding:2px 6px;text-align:left}"
           ".flags{color:#b00}.bad{color:#b00;font-weight:normal}.kv th{width:12em}")
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(f"<!doctype html><meta charset='utf-8'><title>Import report {esc(book)}</title><style>{css}</style>"
                          + "\n".join(body), encoding="utf-8")
