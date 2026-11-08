"""Fetch free (CC0) fantasy audio from OpenGameArt into <project>/audio for the DM's Sound tab.

    python tools/audio_fetch/fetch_audio.py            # download
    python tools/audio_fetch/fetch_audio.py --dry-run  # list what would be downloaded, with sizes

Rules it follows:
  - only pages whose licence list is CC0 (or the licences named in queries.json) are used;
  - nothing over max_file_mb, and it stops when the total reaches budget_mb;
  - audio/credits.json records the page, author and licence of every file;
  - files already present are skipped, so it can be re-run.
"""
import argparse
import html
import io
import json
import re
import sys
import time
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).parent
OUT = ROOT / "audio"
AUDIO = (".ogg", ".mp3", ".wav", ".flac", ".opus", ".m4a")
PREFERRED = {".ogg": 0, ".opus": 0, ".mp3": 1, ".m4a": 2, ".flac": 3, ".wav": 4}
LICENCE_IDS = {"CC0": 4, "CC-BY 3.0": 2, "CC-BY 4.0": 17981}
EXCLUDE = re.compile(r"8-?bit|chiptune|nes|space|sci-?fi|tiki|menu|loading|shooter|retro|arcade|synthwave|techno|cyber|platformer|racing|happy|lullaby|christmas|holiday|c64|underwater|fmod|adaptive|jrpg trailer", re.I)
UA = {"User-Agent": "Mozilla/5.0 (DnD Character Manager audio fetch; personal use)"}
BASE = "https://opengameart.org"


def get(url, binary=False, retries=2):
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                data = r.read()
            return data if binary else data.decode("utf-8", "replace")
        except Exception as e:  # network hiccup: retry, then give up on this one
            if attempt == retries:
                print(f"  ! {url}: {e}")
                return None
            time.sleep(2)


def size_of(url):
    try:
        req = urllib.request.Request(url, headers=UA, method="HEAD")
        with urllib.request.urlopen(req, timeout=30) as r:
            return int(r.headers.get("Content-Length", 0))
    except Exception:
        return 0


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:60] or "pack"


def search(keys, type_id, licences):
    params = [("keys", keys), ("field_art_type_tid[]", type_id), ("sort_by", "count"), ("sort_order", "DESC")]
    params += [("field_art_licenses_tid[]", LICENCE_IDS[l]) for l in licences]
    page = get(f"{BASE}/art-search-advanced?" + urllib.parse.urlencode(params))
    if not page:
        return []
    seen, out = set(), []
    for href in re.findall(r'href="(/content/[^"#?]+)"', page):
        if href not in seen and href not in ("/content/faq", "/content/terms"):
            seen.add(href)
            out.append(href)
    return out


def read_page(path):
    page = get(BASE + path)
    if not page:
        return None
    title = html.unescape(re.search(r"<title>(.*?) \|", page, re.S).group(1).strip()) if re.search(r"<title>(.*?) \|", page, re.S) else path
    licences = re.findall(r"class='license-name'>([^<]+)<", page)
    author = re.search(r'class="username"[^>]*>([^<]+)<', page)
    files = [u for u in re.findall(r'href="(https://opengameart\.org/sites/default/files/[^"]+)"', page)
             if "/css/" not in u and "/js/" not in u and "/styles/" not in u and Path(urllib.parse.urlparse(u).path).suffix.lower() in AUDIO + (".zip",)]
    return {"title": title, "licences": licences, "author": html.unescape(author.group(1)) if author else "unknown", "files": list(dict.fromkeys(files)), "url": BASE + path}


def pick_audio(names):
    """Of files that share a stem (a .wav and an .ogg of the same sound), keep the smallest format."""
    best = {}
    for n in names:
        stem = str(Path(n).with_suffix(""))
        if Path(n).suffix.lower() not in PREFERRED:
            continue
        if stem not in best or PREFERRED[Path(n).suffix.lower()] < PREFERRED[Path(best[stem]).suffix.lower()]:
            best[stem] = n
    return list(best.values())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    cfg = json.loads((HERE / "queries.json").read_text(encoding="utf-8"))
    budget = cfg["budget_mb"] * 1024 * 1024
    max_file = cfg["max_file_mb"] * 1024 * 1024
    credits_path = OUT / "credits.json"
    credits = json.loads(credits_path.read_text(encoding="utf-8")) if credits_path.exists() else {}
    used = sum(p.stat().st_size for p in OUT.rglob("*") if p.is_file() and p.suffix.lower() in AUDIO) if OUT.exists() else 0
    done_pages = {c["page"] for c in credits.values()}
    total_new = 0
    print(f"Already in audio/: {used / 1e6:.0f} MB. Budget {cfg['budget_mb']} MB.")

    for s in cfg["searches"]:
        licences = s.get("licences", ["CC0"])
        taken = 0
        for path in search(s["keys"], s["type"], licences):
            if taken >= s["take"]:
                break
            if used + total_new >= budget:
                print("Budget reached.")
                break
            time.sleep(0.4)
            info = read_page(path)
            if not info or info["url"] in done_pages:
                continue
            done_pages.add(info["url"])
            if EXCLUDE.search(info["title"]):
                continue  # not fantasy (chiptune, sci-fi, menus...)
            if s["type"] == 12 and any(u.lower().endswith((".mp3", ".ogg")) for u in info["files"]):
                info["files"] = [u for u in info["files"] if not u.lower().endswith(".wav")]  # music wavs are huge copies of the mp3
            if not info["licences"] or any(l not in LICENCE_IDS for l in info["licences"]) or not all(l in licences for l in info["licences"]):
                continue  # not clearly free to use: skip
            taken += 1
            licence = "/".join(info["licences"])
            credit = f"{info['title']} by {info['author']} ({licence}) {info['url']}"
            pack_dir = OUT / s["category"] / slug(info["title"])
            wrote = []
            for url in info["files"]:
                size = size_of(url)
                if size > max_file or used + total_new + size > budget:
                    print(f"  skip {Path(url).name} ({size / 1e6:.1f} MB over a limit)")
                    continue
                if args.dry_run:
                    print(f"  would fetch [{s['category']}] {info['title']} / {urllib.parse.unquote(Path(url).name)} {size / 1e6:.1f} MB {licence}")
                    total_new += size
                    continue
                data = get(url, binary=True)
                if not data:
                    continue
                if url.lower().endswith(".zip"):
                    try:
                        z = zipfile.ZipFile(io.BytesIO(data))
                    except zipfile.BadZipFile:
                        continue
                    for member in pick_audio([n for n in z.namelist() if not n.endswith("/") and "__MACOSX" not in n]):
                        target = pack_dir / Path(member).name
                        target.parent.mkdir(parents=True, exist_ok=True)
                        target.write_bytes(z.read(member))
                        wrote.append(target)
                else:
                    target = pack_dir / urllib.parse.unquote(Path(urllib.parse.urlparse(url).path).name)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(data)
                    wrote.append(target)
                total_new += len(data)
            wrote = [w for w in wrote]
            for w in wrote:
                rel = w.relative_to(OUT).as_posix()
                entry = {"credit": credit, "page": info["url"]}
                if len(wrote) == 1:
                    entry["name"] = info["title"]
                credits[rel] = entry
            if wrote:
                print(f"[{s['category']}] {info['title']}: {len(wrote)} file(s), {licence}")
            if not args.dry_run:
                OUT.mkdir(exist_ok=True)
                credits_path.write_text(json.dumps(credits, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"{'Would download' if args.dry_run else 'Downloaded'} {total_new / 1e6:.0f} MB. Total in audio/: {(used + (0 if args.dry_run else total_new)) / 1e6:.0f} MB.")


if __name__ == "__main__":
    sys.exit(main())
