"""Key the green field out of the approved chroma illustrations.

Feeding the green plate straight into the image-to-3D step tints hair and
silhouettes green, so the background is removed and the remaining green spill on
edge pixels is neutralised before the mesh is generated.
"""

import argparse
import os

import numpy as np
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument("--input", required=True)
parser.add_argument("--output", required=True)
parser.add_argument("--fill", type=float, default=0.88)
args = parser.parse_args()

image = Image.open(args.input).convert("RGB")
pixels = np.asarray(image).astype(np.int16)
red, green, blue = pixels[:, :, 0], pixels[:, :, 1], pixels[:, :, 2]

# The plate is a saturated pure green, so anything where green dominates both
# other channels by a wide margin is background.
background = (green > 90) & (green - red > 55) & (green - blue > 55)

subject = ~background
rows = np.where(subject.any(axis=1))[0]
columns = np.where(subject.any(axis=0))[0]
if len(rows) == 0:
    raise SystemExit(f"{args.input}: no subject found")

# Green spill survives on the outline; clamping green to the other channels
# removes the fringe without touching genuinely green artwork.
spill = np.minimum(green, np.maximum(red, blue) + 12)
cleaned = np.stack([red, spill, blue], axis=2).clip(0, 255).astype(np.uint8)

# The mesh step composites cut-outs onto neutral grey, so the plate is replaced
# with that same grey rather than left transparent.
neutral = np.full_like(cleaned, 127)
flat = np.where(background[:, :, None], neutral, cleaned).astype(np.uint8)

top, bottom = int(rows[0]), int(rows[-1])
left, right = int(columns[0]), int(columns[-1])
height = bottom - top
width = right - left

# The mesh step assumes a square frame with the subject filling most of it, so
# an off-square crop would stretch the model horizontally.
span = int(round(max(height, width) / args.fill))
center_x = (left + right) // 2
center_y = (top + bottom) // 2
canvas = np.full((span, span, 3), 127, dtype=np.uint8)

source_left = max(0, center_x - span // 2)
source_top = max(0, center_y - span // 2)
source_right = min(flat.shape[1], source_left + span)
source_bottom = min(flat.shape[0], source_top + span)
patch = flat[source_top:source_bottom, source_left:source_right]

offset_x = (span - patch.shape[1]) // 2
offset_y = (span - patch.shape[0]) // 2
canvas[
    offset_y : offset_y + patch.shape[0], offset_x : offset_x + patch.shape[1]
] = patch

out = Image.fromarray(canvas)
os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
out.save(args.output)
print(
    f"{os.path.basename(args.input)} -> {out.size[0]}x{out.size[1]} "
    f"subject {width}x{height}"
)
