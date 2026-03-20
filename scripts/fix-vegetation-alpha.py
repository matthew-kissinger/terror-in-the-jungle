"""
fix-vegetation-alpha.py

Fixes alpha fringing artifacts on vegetation billboard textures.
Three passes:
  1. Purple/magenta cleanup - HSV-based detection of dark purple edge pixels
  2. White fringe cleanup - replace bright white semi-transparent pixels
  3. Alpha bleed - propagate RGB from opaque pixels into transparent neighbors

Usage: uv run scripts/fix-vegetation-alpha.py [--dry-run] [--diagnose]
"""

import colorsys
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ASSETS_DIR = Path(__file__).resolve().parent.parent / "public" / "assets"

VEGETATION_FILES = [
    "ArecaPalmCluster.webp",
    "BambooGrove.webp",
    "BananaPlant.webp",
    "CoconutPalm.webp",
    "DipterocarpGiant.webp",
    "ElephantEarPlants.webp",
    "ElephantGrass.webp",
    "FanPalmCluster.webp",
    "Fern.webp",
    "Mangrove.webp",
    "RicePaddyPlants.webp",
    "RubberTree.webp",
    "TwisterBanyan.webp",
]

# 8-connected neighbor offsets
OFFSETS = [(-1, -1), (0, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (0, 1), (1, 1)]


def rgb_to_hsv_degrees(r: int, g: int, b: int) -> tuple[float, float, float]:
    """Convert RGB (0-255) to HSV with hue in degrees (0-360)."""
    h, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
    return h * 360.0, s, v


def is_purple_hsv(r: int, g: int, b: int, sat_threshold: float = 0.25) -> bool:
    """Detect purple/magenta/pink via HSV hue range 250-340 deg."""
    if r == 0 and g == 0 and b == 0:
        return False
    hue, sat, _ = rgb_to_hsv_degrees(r, g, b)
    return 250.0 <= hue <= 340.0 and sat > sat_threshold


def get_neighbor_avg(
    pixels: np.ndarray, x: int, y: int, w: int, h: int, skip_fn
) -> tuple[int, int, int, int]:
    """Average RGB of 8-connected neighbors that pass the filter (skip_fn returns False)."""
    sum_r, sum_g, sum_b, count = 0, 0, 0, 0
    for dx, dy in OFFSETS:
        nx, ny = x + dx, y + dy
        if nx < 0 or nx >= w or ny < 0 or ny >= h:
            continue
        nr, ng, nb, na = pixels[ny, nx]
        if na < 128:
            continue
        if skip_fn(int(nr), int(ng), int(nb)):
            continue
        sum_r += int(nr)
        sum_g += int(ng)
        sum_b += int(nb)
        count += 1
    if count > 0:
        return round(sum_r / count), round(sum_g / count), round(sum_b / count), count
    return 0, 0, 0, 0


def is_edge_pixel(pixels: np.ndarray, x: int, y: int, w: int, h: int) -> bool:
    """Check if pixel is adjacent to a transparent pixel (alpha < 16)."""
    for dx, dy in OFFSETS:
        nx, ny = x + dx, y + dy
        if nx < 0 or nx >= w or ny < 0 or ny >= h:
            continue
        if pixels[ny, nx, 3] < 16:
            return True
    return False


def clean_purple(pixels: np.ndarray, w: int, h: int) -> int:
    """Pass 1: Replace purple/magenta edge pixels with neighbor colors using HSV detection.

    Semi-transparent pixels (alpha < 200): clean any purple (sat > 0.25)
    Near-opaque pixels (alpha >= 200): only clean if at edge AND strongly purple (sat > 0.40)
    """
    cleaned = 0
    # Work on a copy so neighbor reads aren't affected by writes this pass
    out = pixels.copy()

    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[y, x]
            if a == 0:
                continue
            ri, gi, bi = int(r), int(g), int(b)

            if a < 200:
                # Semi-transparent: use standard threshold
                if not is_purple_hsv(ri, gi, bi, sat_threshold=0.25):
                    continue
            else:
                # Near-opaque: require stronger purple AND edge adjacency
                if not is_purple_hsv(ri, gi, bi, sat_threshold=0.40):
                    continue
                if not is_edge_pixel(pixels, x, y, w, h):
                    continue

            avg_r, avg_g, avg_b, count = get_neighbor_avg(
                pixels, x, y, w, h, is_purple_hsv
            )
            if count > 0:
                out[y, x, 0] = avg_r
                out[y, x, 1] = avg_g
                out[y, x, 2] = avg_b
                # Keep alpha unchanged
            else:
                # No good neighbors - zero out alpha
                out[y, x, 3] = 0
            cleaned += 1

    pixels[:] = out
    return cleaned


def clean_white_fringe(pixels: np.ndarray, w: int, h: int) -> int:
    """Pass 2: Replace bright white semi-transparent fringe pixels."""
    cleaned = 0

    def is_white(r: int, g: int, b: int) -> bool:
        return r > 200 and g > 200 and b > 200

    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[y, x]
            if not (r > 180 and g > 180 and b > 180 and 0 < a < 200):
                continue

            avg_r, avg_g, avg_b, count = get_neighbor_avg(
                pixels, x, y, w, h, is_white
            )
            if count > 0:
                pixels[y, x, 0] = avg_r
                pixels[y, x, 1] = avg_g
                pixels[y, x, 2] = avg_b
                cleaned += 1

    return cleaned


def alpha_bleed(pixels: np.ndarray, w: int, h: int, iterations: int = 8) -> int:
    """Pass 3: Propagate RGB from opaque pixels into fully transparent neighbors."""
    total_bled = 0
    has_color = pixels[:, :, 3] > 0  # bool array

    for _ in range(iterations):
        # Find transparent pixels that have at least one colored neighbor
        updates = []
        for y in range(h):
            for x in range(w):
                if has_color[y, x]:
                    continue

                sum_r, sum_g, sum_b, count = 0, 0, 0, 0
                for dx, dy in OFFSETS:
                    nx, ny = x + dx, y + dy
                    if nx < 0 or nx >= w or ny < 0 or ny >= h:
                        continue
                    if has_color[ny, nx]:
                        sum_r += int(pixels[ny, nx, 0])
                        sum_g += int(pixels[ny, nx, 1])
                        sum_b += int(pixels[ny, nx, 2])
                        count += 1

                if count > 0:
                    updates.append(
                        (y, x, round(sum_r / count), round(sum_g / count), round(sum_b / count))
                    )

        if not updates:
            break

        for row, col, r, g, b in updates:
            pixels[row, col, 0] = r
            pixels[row, col, 1] = g
            pixels[row, col, 2] = b
            # Alpha stays 0
            has_color[row, col] = True

        total_bled += len(updates)

    return total_bled


def diagnose(pixels: np.ndarray, w: int, h: int) -> dict:
    """Count purple pixels that would actually be cleaned (matching clean_purple logic)."""
    counts = {"semi_trans": 0, "opaque_edge": 0, "opaque_interior_skip": 0, "total": 0}
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[y, x]
            if a == 0:
                continue
            ri, gi, bi = int(r), int(g), int(b)
            if a < 200:
                if is_purple_hsv(ri, gi, bi, sat_threshold=0.25):
                    counts["semi_trans"] += 1
                    counts["total"] += 1
            else:
                if is_purple_hsv(ri, gi, bi, sat_threshold=0.40):
                    if is_edge_pixel(pixels, x, y, w, h):
                        counts["opaque_edge"] += 1
                        counts["total"] += 1
                    else:
                        counts["opaque_interior_skip"] += 1
    return counts


def process_file(filename: str, dry_run: bool, do_diagnose: bool) -> None:
    filepath = ASSETS_DIR / filename
    if not filepath.exists():
        print(f"  SKIP {filename} (not found)")
        return

    img = Image.open(filepath).convert("RGBA")
    w, h = img.size
    pixels = np.array(img, dtype=np.uint8)

    if do_diagnose:
        counts = diagnose(pixels, w, h)
        print(
            f"  {filename}: {w}x{h} | will_clean={counts['total']} "
            f"(semi_trans={counts['semi_trans']} opaque_edge={counts['opaque_edge']} "
            f"opaque_skip={counts['opaque_interior_skip']})"
        )
        return

    # Pass 1: Purple/magenta cleanup (HSV-based)
    purple_cleaned = clean_purple(pixels, w, h)

    # Pass 2: White fringe cleanup
    white_cleaned = clean_white_fringe(pixels, w, h)

    # Pass 3: Alpha bleed
    bled = alpha_bleed(pixels, w, h, iterations=8)

    print(
        f"  {filename}: {w}x{h} | purple={purple_cleaned} white={white_cleaned} bled={bled}"
    )

    if not dry_run:
        out_img = Image.fromarray(pixels, "RGBA")
        out_img.save(filepath, "WEBP", quality=90)


def main() -> None:
    dry_run = "--dry-run" in sys.argv
    do_diagnose = "--diagnose" in sys.argv
    mode = "DIAGNOSE" if do_diagnose else ("DRY RUN" if dry_run else "PROCESSING")
    print(f"Vegetation alpha fix ({mode})")
    print(f"Assets dir: {ASSETS_DIR}")
    print()

    for f in VEGETATION_FILES:
        process_file(f, dry_run, do_diagnose)

    print()
    if do_diagnose:
        print("Diagnosis complete.")
    elif dry_run:
        print("Dry run complete. No files modified.")
    else:
        print("Done. All files updated.")


if __name__ == "__main__":
    main()
