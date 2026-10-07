#!/usr/bin/env python3
"""Pack PixelLab extras (Kishdale outfit, colony cats, Ella the dachshund) into game sprites.

Config / provenance: scripts/pixellab-extras.json (character ids, descriptions,
which cells are real vs repeated/mirrored). Input zips come from
https://api.pixellab.ai/mcp/characters/<id>/download (no auth; HTTP 423 while a
job runs on that character) cached as <cache>/<key>.zip (default /tmp/pixellab-extras).
The zip of any state holds every state of the character's group.
Pixel art is never rescaled: frames are only translated (and, where the config
says so, mirrored left-right).

1. Kishdale = Kish (same NPC) in a different outfit. Same files/layout as Kish:
     public/assets/sprites/kishdale_walk_{east,west,north,south}.png  544x68, 8 frames of 68x68
     public/assets/sprites/Kishdale_stand.png                          544x68, 8 rotations in the
         order of Kish_stand.png: S, SE, E, NE, N, NW, W, SW (matched pixel-for-pixel
         against Kish's PixelLab rotations)
     public/assets/sprites/kishdale_crouch_{east,west}.png             340x68, 5 frames
   Kish's own files are PixelLab frames copied raw (no offset). Kishdale strips get
   one vertical offset per strip so their feet row matches the same Kish strip
   (rounded difference of the mean feet rows for walk/stand; frame-0 feet row for
   crouch, whose later frames lift off the ground); the run log prints each offset
   (0 for every strip with the current art: both share PixelLab's 68px mannequin canvas).

2. Pets: public/assets/sprites/pets/<key>.png for key in catcat, mittens, ella.
   92x92 cells, 8 columns x 9 rows (736x828 RGBA), empty cells transparent:
     row 0..3  walk south / east / north / west, 8 frames (an anim with fewer
               frames is repeated cyclically to fill 8)
     row 4     run east, 8 frames
     row 5     run west, 8 frames (all three pets use the mirror of run east)
     row 6     cols 0-3 sit/idle S, E, N, W (one representative frame each);
               cols 4-7 idle loop south (frames 0, 2, 4, 6 of the 8-frame loop)
     row 7     sleep / lie down, 8 frames (a one-shot lie-down: play once, hold
               the last frame)
     row 8     cols 0-3 stand rotations S, E, N, W
     (cols 4-7 of rows 6-8 that are not listed above are transparent)
   Frame index = row * 8 + col: walk S 0-7, E 8-15, N 16-23, W 24-31, run E 32-39,
   run W 40-47, sit S/E/N/W 48-51, idle S 52-55, sleep 56-63, stand S/E/N/W 64-67.
   Feet are aligned per character: every cell entry (one source animation or
   rotation, one row) gets a single vertical offset so its lowest opaque row
   lands on the character's feet row ("feet_row", else the lowest opaque row of
   the "feet_from" rotation, default the base south rotation), so walk -> sit ->
   sleep never hops. Entries with "align": "raw" keep PixelLab's canvas position
   instead (for poses whose lowest pixels are not the feet, e.g. a tail curled in
   front of a sitting cat's paws); "dy" adds a manual offset, "mirror" flips
   left-right, "frames" picks frame indices. Each entry's source and whether the
   cell is real, repeated or mirrored is listed in scripts/pixellab-extras.json.

usage: python3 scripts/build-pixellab-extras.py [--cache DIR] [--out DIR] [kishdale|pets|<petkey>...]
Writes contact sheets to <cache>/contact_<name>.png.
"""
from __future__ import annotations

import argparse
import io
import json
import statistics
import sys
import zipfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "scripts" / "pixellab-extras.json"
SPRITES = ROOT / "public" / "assets" / "sprites"
STAND_ORDER = ["south", "south-east", "east", "north-east", "north", "north-west", "west", "south-west"]


# ---------------------------------------------------------------- helpers
class Zip:
    """A downloaded character zip: states by id, frame loading."""

    def __init__(self, path: Path):
        self.z = zipfile.ZipFile(path)
        self.meta = json.loads(self.z.read("metadata.json"))
        self.states = {s["character"]["id"]: s for s in self.meta["states"]}

    def state(self, sid: str | None) -> dict:
        if sid is None:
            return self.meta["states"][0]
        if sid not in self.states:
            raise KeyError(f"state {sid} not in zip (have {list(self.states)})")
        return self.states[sid]

    def img(self, p: str) -> Image.Image:
        return Image.open(io.BytesIO(self.z.read(p))).convert("RGBA")

    def anim(self, sid: str | None, name: str, d: str) -> list[Image.Image]:
        anims = self.state(sid)["frames"].get("animations", {})
        if name not in anims or d not in anims[name]:
            raise KeyError(f"animation '{name}' {d} missing (have { {k: list(v) for k, v in anims.items()} })")
        return [self.img(p) for p in anims[name][d]]

    def rotation(self, sid: str | None, d: str) -> Image.Image:
        return self.img(self.state(sid)["frames"]["rotations"][d])


def feet_y(im: Image.Image) -> int | None:
    bbox = im.getchannel("A").getbbox()
    return bbox[3] if bbox else None


def place(im: Image.Image, cell: int, dy: int) -> tuple[Image.Image, bool]:
    """Put `im` on a cell x cell canvas: canvas centred horizontally, image row r lands
    on cell row r + dy (so dy = target feet row - image feet row, whatever the canvas size)."""
    dx = (cell - im.width) // 2
    oy = dy
    out = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
    out.alpha_composite(im, (max(dx, 0), max(oy, 0)), (max(-dx, 0), max(-oy, 0), im.width, im.height))
    clipped = False
    bbox = im.getchannel("A").getbbox()
    if bbox:
        l, t, r, b = bbox
        clipped = l + dx < 0 or t + oy < 0 or r + dx > cell or b + oy > cell
    return out, clipped


def strip(frames: list[Image.Image], cell: int, dy: int) -> tuple[Image.Image, bool]:
    s = Image.new("RGBA", (cell * len(frames), cell), (0, 0, 0, 0))
    clipped = False
    for i, f in enumerate(frames):
        c, cl = place(f, cell, dy)
        clipped |= cl
        s.alpha_composite(c, (i * cell, 0))
    return s, clipped


def contact(img: Image.Image, cell: int, path: Path, scale: int = 2) -> None:
    big = img.resize((img.width * scale, img.height * scale), Image.NEAREST)
    bg = Image.new("RGBA", big.size, (64, 128, 64, 255))
    d = ImageDraw.Draw(bg)
    for x in range(0, big.width + 1, cell * scale):
        d.line([(x, 0), (x, big.height)], fill=(80, 150, 80, 255))
    for y in range(0, big.height + 1, cell * scale):
        d.line([(0, y), (big.width, y)], fill=(80, 150, 80, 255))
    bg.alpha_composite(big)
    path.parent.mkdir(parents=True, exist_ok=True)
    bg.save(path)


# ---------------------------------------------------------------- Kishdale
def build_kishdale(cfg: dict, cache: Path, out: Path) -> None:
    kish = Zip(cache / "kish.zip")
    kd = Zip(cache / "kishdale.zip")
    walk_k, walk_d = cfg["kish_walk_anim"], cfg["walk_anim"]
    crouch_k, crouch_d = cfg["kish_crouch_anim"], cfg["crouch_anim"]
    sheets: list[tuple[str, Image.Image]] = []

    def emit(name: str, ref: list[Image.Image], frames: list[Image.Image], how: str) -> None:
        if how == "mean":
            dy = round(statistics.mean([feet_y(f) for f in ref]) - statistics.mean([feet_y(f) for f in frames]))
        else:  # first frame (crouch lifts off the ground in later frames)
            dy = feet_y(ref[0]) - feet_y(frames[0])
        s, clipped = strip(frames, 68, dy)
        s.save(out / f"{name}.png", optimize=True)
        sheets.append((name, s))
        print(f"  {name}.png {s.size[0]}x{s.size[1]} dy={dy}{' CLIPPED' if clipped else ''}")

    for d in ["east", "west", "north", "south"]:
        emit(f"kishdale_walk_{d}", kish.anim(None, walk_k, d), kd.anim(None, walk_d, d), "mean")
    emit(
        "Kishdale_stand",
        [kish.rotation(None, d) for d in STAND_ORDER],
        [kd.rotation(None, d) for d in STAND_ORDER],
        "mean",
    )
    for d in ["east", "west"]:
        emit(f"kishdale_crouch_{d}", kish.anim(None, crouch_k, d), kd.anim(None, crouch_d, d), "first")
    sheet = Image.new("RGBA", (544, 68 * len(sheets)), (0, 0, 0, 0))
    for i, (_, s) in enumerate(sheets):
        sheet.alpha_composite(s, (0, i * 68))
    contact(sheet, 68, cache / "contact_kishdale.png", 3)


# ---------------------------------------------------------------- pets
def source_frames(z: Zip, base_id: str, src: dict) -> list[Image.Image]:
    """Frames for one source entry of a pet row (see pixellab-extras.json)."""
    sid = src.get("state", base_id)
    if "anim" in src:
        frames = z.anim(sid, src["anim"], src["dir"])
    else:
        frames = [z.rotation(sid, src["rotation"])]
    if "frames" in src:
        frames = [frames[i] for i in src["frames"]]
    if src.get("mirror"):
        frames = [ImageOps.mirror(f) for f in frames]
    n = src.get("count", len(frames))
    return [frames[i % len(frames)] for i in range(n)]  # repeat cyclically to fill


def build_pet(key: str, cfg: dict, cache: Path, out_dir: Path) -> Image.Image:
    cell, cols, rows = cfg["cell"], cfg["cols"], cfg["rows"]
    z = Zip(cache / f"{key}.zip")
    base = cfg["id"]
    ff = cfg.get("feet_from", {})
    feet = cfg.get("feet_row") or feet_y(z.rotation(ff.get("state", base), ff.get("rotation", "south")))
    sheet = Image.new("RGBA", (cell * cols, cell * rows), (0, 0, 0, 0))
    for entry in cfg["cells"]:
        frames = source_frames(z, base, entry)
        if entry.get("align") == "raw":
            # keep PixelLab's own canvas position (same ground line as the state the feet
            # row comes from) -- for poses whose lowest pixels are not the feet, e.g. a
            # sitting cat's tail curled on the ground in front of its paws
            dy = entry.get("dy", 0)
        else:
            lowest = max(feet_y(f) or 0 for f in frames)
            dy = feet - lowest + entry.get("dy", 0)
        s, clipped = strip(frames, cell, dy)
        r, c = entry["row"], entry["col"]
        if c + len(frames) > cols:
            raise ValueError(f"{key}: row {r} col {c} + {len(frames)} frames overflows {cols} columns")
        sheet.alpha_composite(s, (c * cell, r * cell))
        what = entry.get("anim") or f"rotation {entry.get('rotation')}"
        print(f"  r{r} c{c}-{c + len(frames) - 1}: {what} {entry.get('dir', '')} dy={dy}"
              f"{' mirrored' if entry.get('mirror') else ''}{' CLIPPED' if clipped else ''}")
    out_dir.mkdir(parents=True, exist_ok=True)
    sheet.save(out_dir / f"{key}.png", optimize=True)
    print(f"  -> pets/{key}.png {sheet.size[0]}x{sheet.size[1]} feet_row={feet}")
    return sheet


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cache", default="/tmp/pixellab-extras", type=Path)
    ap.add_argument("--out", default=SPRITES, type=Path)
    ap.add_argument("what", nargs="*", help="kishdale, pets, or pet keys (default: everything)")
    args = ap.parse_args()
    cfg = json.loads(CONFIG.read_text())
    what = args.what or ["kishdale", "pets"]
    if "kishdale" in what:
        print("kishdale:")
        build_kishdale(cfg["kishdale"], args.cache, args.out)
    pet_keys = list(cfg["pets"]) if "pets" in what else [w for w in what if w in cfg["pets"]]
    for key in pet_keys:
        print(f"{key}:")
        sheet = build_pet(key, cfg["pets"][key], args.cache, args.out / "pets")
        contact(sheet, cfg["pets"][key]["cell"], args.cache / f"contact_{key}.png", 2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
