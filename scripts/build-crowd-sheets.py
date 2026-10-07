#!/usr/bin/env python3
"""Pack PixelLab crowd-character zips into the game's crowd sprite sheets.

Input:  <cache>/<key>.zip  -- the archive from
        https://api.pixellab.ai/mcp/characters/<id>/download
        (ids live in scripts/pixellab-crowd.json; default cache /tmp/pixellab-crowd).
        The archive of ANY state contains every state of the character's group
        (metadata.json "states"), so one zip per character carries the base walk
        and all pose states.
Output: public/assets/sprites/crowd/<key>.png  -- 544x408 RGBA, 68x68 cells, 8 cols x 6 rows
        row 0..3 = walk south / east / north / west, frames 0-7
        row 4    = cols 0-3 stand S, E, N, W (base rotations)
                   col 4 selfie (south rotation of the selfie state)
                   col 5 smoke  (south rotation of the smoke state)
                   cols 6-7 empty
        row 5    = cols 0-3 sit_bench S, E, N, W (rotations of the sit_bench state)
                   cols 4-7 sit_ground S, E, N, W (rotations of the sit_ground state)
        Cells whose pose does not exist are fully transparent.
        Frame index = row * 8 + col (stand S = 32, selfie = 36, smoke = 37,
        sit_bench S/E/N/W = 40-43, sit_ground S/E/N/W = 44-47).
        Plus a contact sheet (all sheets at 2x on green) for eyeballing.

Pose states are picked by the character ids recorded under the manifest's
per-key "states" ({pose: {"id": ...}}). The manifest's "poses" list is
rewritten by hand/agent to the subset of POSES that exist.

Alignment (never rescaled, only translated):
- walk frames and the base stand rotations are copied as PixelLab drew them
  (all 68x68 on one shared canvas, so walk -> stand never hops);
- every POSE rotation (sit_bench, sit_ground, selfie, smoke) is shifted
  vertically so its lowest opaque row lands on the same row as the base
  south rotation's lowest opaque row (the character's feet line).
Detached specks of <= 3 px (8-connected) are cleared from every frame; the run
log lists any removed. A character's optional "walk_fixes" list replaces
broken walk frames with the mirrored opposite-phase frame (see build()),
"walk_overrides" ({dir: animation name}) takes one walk direction from a
re-rolled animation instead of the main walk, and "pose_fixes"
([{"pose", "dir", "mirror_of"}]) replaces a pose rotation PixelLab drew facing
the wrong way with the mirror of another direction (e.g. west := mirror(east)).

A character is packed only if its walk exists in all 4 directions with 8 frames.

usage: python3 scripts/build-crowd-sheets.py [--cache DIR] [--out DIR] [--contact PNG] [keys...]
"""
from __future__ import annotations

import argparse
import io
import json
import sys
import zipfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "scripts" / "pixellab-crowd.json"
CELL = 68
COLS, ROWS = 8, 6
DIRS = ["south", "east", "north", "west"]
WALK_NAME = "walking-8-frames"
POSES = ["sit_bench", "sit_ground", "selfie", "smoke"]
# pose -> list of (row, col, direction) cells it fills
POSE_CELLS = {
    "selfie": [(4, 4, "south")],
    "smoke": [(4, 5, "south")],
    "sit_bench": [(5, i, d) for i, d in enumerate(DIRS)],
    "sit_ground": [(5, 4 + i, d) for i, d in enumerate(DIRS)],
}


def load_manifest() -> dict:
    return json.loads(MANIFEST.read_text())["characters"] if MANIFEST.exists() else {}


SPECK_MAX = 3  # detached opaque blobs this small (8-connected) are generator noise


def despeckle(im: Image.Image) -> tuple[Image.Image, int]:
    """Clear tiny detached pixel clusters (stray specks PixelLab sometimes leaves)."""
    w, h = im.size
    px = im.load()
    seen = [[False] * w for _ in range(h)]
    removed = 0
    for y0 in range(h):
        for x0 in range(w):
            if seen[y0][x0] or px[x0, y0][3] == 0:
                continue
            comp, stack = [], [(x0, y0)]
            seen[y0][x0] = True
            while stack:
                x, y = stack.pop()
                comp.append((x, y))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and px[nx, ny][3] > 0:
                            seen[ny][nx] = True
                            stack.append((nx, ny))
            if len(comp) <= SPECK_MAX:
                for x, y in comp:
                    px[x, y] = (0, 0, 0, 0)
                removed += len(comp)
    return im, removed


def feet_y(im: Image.Image) -> int | None:
    """Bottom row (exclusive) of the opaque bounding box, or None if empty."""
    bbox = im.getchannel("A").getbbox()
    return bbox[3] if bbox else None


def fit(im: Image.Image, ref_feet: int | None, dy: int | None = None) -> tuple[Image.Image, int, bool]:
    """Place `im` on a 68x68 transparent cell without rescaling.

    With ref_feet=None a 68x68 frame is copied as-is. Otherwise the frame is
    shifted vertically so its feet row lands on ref_feet (or by the given dy).
    Narrower/wider frames are centred horizontally. Returns (cell, dy_used, clipped).
    """
    if dy is None:
        f = feet_y(im)
        if ref_feet is not None and f is not None:
            dy = ref_feet - f
        else:
            dy = (CELL - im.height) // 2
    dx = (CELL - im.width) // 2
    if (dx, dy) == (0, 0) and im.size == (CELL, CELL):
        return im.copy(), 0, False
    cell = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    src_box = (max(-dx, 0), max(-dy, 0), im.width, im.height)
    cell.alpha_composite(im, (max(dx, 0), max(dy, 0)), src_box)
    bbox = im.getchannel("A").getbbox()
    clipped = False
    if bbox:
        l, t, r, b = bbox
        clipped = l + dx < 0 or t + dy < 0 or r + dx > CELL or b + dy > CELL
    return cell, dy, clipped


def anim_lookup(anims: dict, wanted: str) -> dict | None:
    """Find an animation by exact name, then by substring (custom names may be decorated)."""
    if wanted in anims:
        return anims[wanted]
    for name, dirs in anims.items():
        if wanted.lower() in name.lower():
            return dirs
    return None


def build(key: str, zpath: Path, out_dir: Path, info: dict) -> tuple[Image.Image | None, list[str]]:
    notes: list[str] = []
    fixes: list[dict] = info.get("walk_fixes", [])
    overrides: dict = info.get("walk_overrides", {})
    z = zipfile.ZipFile(zpath)
    meta = json.loads(z.read("metadata.json"))
    by_id = {s["character"]["id"]: s for s in meta["states"]}
    base = by_id.get(info.get("id")) or meta["states"][0]
    frames = base["frames"]
    specks: list[str] = []

    def open_png(p: str) -> Image.Image:
        im, n = despeckle(Image.open(io.BytesIO(z.read(p))).convert("RGBA"))
        if n:
            specks.append(f"{p.split('/', 1)[1]}:{n}px")
        return im

    rotations = {d: open_png(frames["rotations"][d]) for d in DIRS if d in frames["rotations"]}
    if len(rotations) != 4:
        return None, [f"missing rotations: {sorted(set(DIRS) - set(rotations))}"]
    anims = frames.get("animations", {})
    walk = dict(anim_lookup(anims, WALK_NAME) or {})
    for d, name in overrides.items():
        alt = anims.get(name, {})
        if len(alt.get(d, [])) >= 8:
            walk[d] = alt[d]
            notes.append(f"walk {d} from '{name}'")
        else:
            notes.append(f"walk override {d} '{name}' MISSING, kept main walk")
    if any(len(walk.get(d, [])) < 8 for d in DIRS):
        return None, [f"incomplete walk { {d: len(walk.get(d, [])) for d in DIRS} }"]

    sheet = Image.new("RGBA", (COLS * CELL, ROWS * CELL), (0, 0, 0, 0))
    for row, d in enumerate(DIRS):
        cells = []
        imgs = [open_png(p) for p in walk[d][:8]]
        dy = None
        if any(im.size != (CELL, CELL) for im in imgs):
            # Re-rolled strips (e.g. skeleton-v3) can come on a bigger canvas: one shared
            # vertical offset puts the strip's median feet row on that direction's rotation feet.
            feet = sorted(feet_y(im) or 0 for im in imgs)
            dy = feet_y(rotations[d]) - feet[len(feet) // 2]
            notes.append(f"walk {d} canvas {imgs[0].width}x{imgs[0].height} -> centred, feet dy={dy}")
        for col, im in enumerate(imgs):
            cell, _, clipped = fit(im, None, dy)
            if clipped:
                notes.append(f"walk {d} frame {col} clipped")
            cells.append(cell)
        # Manifest-declared repairs for frames PixelLab got wrong (e.g. a south frame
        # drawn from behind): replace frame N with the mirror of the opposite-phase
        # frame (in an 8-frame cycle, frame k+4 ~= mirror of frame k), shifted dx px.
        for fx in fixes:
            if fx.get("dir") == d:
                src = ImageOps.mirror(cells[fx["mirror_of"]])
                dx = fx.get("dx", 0)
                fixed = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
                fixed.alpha_composite(src, (max(dx, 0), 0), (max(-dx, 0), 0))
                cells[fx["frame"]] = fixed
                notes.append(f"walk {d} frame {fx['frame']} := mirror(frame {fx['mirror_of']}) dx={dx}")
        for col, cell in enumerate(cells):
            sheet.alpha_composite(cell, (col * CELL, row * CELL))
        if len(walk[d]) > 8:
            notes.append(f"walk {d} has {len(walk[d])} frames, used first 8")

    for col, d in enumerate(DIRS):
        sheet.alpha_composite(fit(rotations[d], None)[0], (col * CELL, 4 * CELL))

    south_feet = feet_y(rotations["south"])
    present = []
    for pose in POSES:
        sid = (info.get("states", {}).get(pose) or {}).get("id")
        st = by_id.get(sid) if sid else None
        if st is None:
            if sid:
                notes.append(f"{pose}: state {sid} not in zip")
            continue
        rots = st["frames"]["rotations"]
        mirrored = {
            fx["dir"]: fx["mirror_of"] for fx in info.get("pose_fixes", []) if fx.get("pose") == pose
        }
        shifts = []
        for row, col, d in POSE_CELLS[pose]:
            src_dir = mirrored.get(d, d)
            if src_dir not in rots:
                notes.append(f"{pose} {d} missing")
                continue
            im = open_png(rots[src_dir])
            if src_dir != d:
                # PixelLab sometimes draws a pose's west rotation facing east;
                # the manifest's "pose_fixes" swaps in the mirrored east view.
                im = ImageOps.mirror(im)
                notes.append(f"{pose} {d} := mirror({src_dir})")
            cell, dy, clipped = fit(im, south_feet)
            shifts.append(dy)
            if clipped:
                notes.append(f"{pose} {d} clipped")
            sheet.alpha_composite(cell, (col * CELL, row * CELL))
        present.append(f"{pose}(dy {','.join(map(str, shifts))})")
    notes.insert(0, "poses: " + (" ".join(present) if present else "none"))
    if specks:
        notes.append("despeckled " + ", ".join(specks))

    out_dir.mkdir(parents=True, exist_ok=True)
    sheet.save(out_dir / f"{key}.png", optimize=True)
    return sheet, notes


def contact(sheets: list[tuple[str, Image.Image]], path: Path, per_row: int = 3) -> None:
    if not sheets:
        return
    s = 2
    w, h = COLS * CELL * s, ROWS * CELL * s
    label = 18
    n_rows = (len(sheets) + per_row - 1) // per_row
    img = Image.new("RGBA", (per_row * (w + 8) + 8, n_rows * (h + label + 8) + 8), (64, 128, 64, 255))
    draw = ImageDraw.Draw(img)
    for i, (key, sheet) in enumerate(sheets):
        x = 8 + (i % per_row) * (w + 8)
        y = 8 + (i // per_row) * (h + label + 8)
        draw.text((x, y + 2), key, fill=(255, 255, 255, 255))
        big = sheet.resize((w, h), Image.NEAREST)
        # faint cell grid so empty pose cells are visible
        for c in range(COLS + 1):
            draw.line([(x + c * CELL * s, y + label), (x + c * CELL * s, y + label + h)], fill=(80, 150, 80, 255))
        for r in range(ROWS + 1):
            draw.line([(x, y + label + r * CELL * s), (x + w, y + label + r * CELL * s)], fill=(80, 150, 80, 255))
        img.alpha_composite(big, (x, y + label))
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cache", default="/tmp/pixellab-crowd", type=Path)
    ap.add_argument("--out", default=ROOT / "public" / "assets" / "sprites" / "crowd", type=Path)
    ap.add_argument("--contact", default=None, type=Path, help="contact sheet path (default <cache>/contact.png)")
    ap.add_argument("keys", nargs="*", help="character keys (default: all in scripts/pixellab-crowd.json)")
    args = ap.parse_args()

    manifest = load_manifest()
    keys = args.keys or list(manifest)
    if not keys:
        print("no keys given and no manifest found", file=sys.stderr)
        return 1
    built: list[tuple[str, Image.Image]] = []
    for key in keys:
        zpath = args.cache / f"{key}.zip"
        if not zpath.exists():
            print(f"{key}: SKIP (no {zpath})")
            continue
        sheet, notes = build(key, zpath, args.out, manifest.get(key, {}))
        print(f"{key}: {'OK' if sheet else 'SKIP'} ({'; '.join(notes)})")
        if sheet:
            built.append((key, sheet))
    contact(built, args.contact or args.cache / "contact.png")
    print(f"packed {len(built)}/{len(keys)} -> {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
