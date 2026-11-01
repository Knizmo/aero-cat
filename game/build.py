#!/usr/bin/env python3
"""Bundle the game into one self-contained HTML file (code, CSS, sprites and font inlined).

    python3 game/build.py              -> docs/index.html
    python3 game/build.py out.html     -> out.html

Only the Python standard library is needed.
"""
import base64
import json
import sys
from pathlib import Path

GAME = Path(__file__).resolve().parent
ROOT = GAME.parent


def data_uri(path: Path, mime: str) -> str:
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def build(out: Path) -> Path:
    src = GAME / "src"
    sprites = {p.stem: data_uri(p, "image/webp") for p in sorted((GAME / "assets").glob("*.webp"))}
    css = (src / "style.css").read_text(encoding="utf-8").replace(
        "__FONT__", data_uri(GAME / "font" / "PatrickHand-Regular.woff2", "font/woff2"))
    html = (src / "index.html").read_text(encoding="utf-8")
    html = (html.replace("__CSS__", css)
                .replace("__ASSETS__", json.dumps(sprites))
                .replace("__JS__", (src / "game.js").read_text(encoding="utf-8")))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    try:
        shown = out.relative_to(ROOT)
    except ValueError:
        shown = out
    print(f"wrote {shown}  ({out.stat().st_size / 1024:.0f} KB, {len(sprites)} sprites)")
    return out


if __name__ == "__main__":
    build(Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / "docs" / "index.html")
