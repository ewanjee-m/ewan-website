"""Extract the head crops and the whole-figure body sheets from each illustration.

The generator paints its atlas from these cutouts, so the in-game character is
the approved artwork rather than an approximation of it. Output is raw RGB plus
a JSON sidecar, which keeps the Node generator free of a PNG decoder.

Two kinds of cutout come out of every picture.

The head crops frame the face and, for the players, the back of the head. They
are wrapped round a sphere, which is what keeps the face sharp: a small part of
the figure gets a large part of the atlas.

The body sheet is the whole figure cut out at its own outline and squared up to
its own bounding box. The generator projects it flat onto the model from the
front and from behind, so the kimono pattern, the obi, the folds and the hands
are read from the picture instead of being approximated by vertex colour. Box to
box is the whole alignment rule: the top of the sheet is the top of the model and
its bottom is the model's feet, which holds because both come from the same
picture.

The face box is found from the picture itself: the largest patch of skin in the
upper part of the figure is the face, and the eyes anchor it horizontally. Hand
tuned framing per character drifted every time a model was rebuilt, so nothing
here is character specific.

The players also have an approved back view. Skin detection is useless there
because the back of a head is hair, so the back crop is placed by silhouette
instead: it covers the same slice of the figure as the front crop, measured from
the top of the head downwards, and is centred on the head's own outline. Sharing
the slice is what lets the atlas wrap both crops onto one head without the two
halves sliding apart at the ears. Characters without an approved back view keep
the front crop alone and their own sculpted colour behind.
"""

import argparse
import json
import os

import numpy as np
from PIL import Image
from scipy import ndimage

CHARACTERS = [
    ("player-male", "public/assets/characters/player-male.png"),
    ("player-female", "public/assets/characters/player-female.png"),
    ("npc-airport-traveler", "public/assets/npcs/npc-airport-traveler.png"),
    ("npc-gyukatsu-chef", "public/assets/npcs/npc-gyukatsu-chef.png"),
    ("npc-sakura-visitor", "public/assets/npcs/npc-sakura-visitor.png"),
    ("npc-hanabi-yukata", "public/assets/npcs/npc-hanabi-yukata.png"),
]

BACK_VIEWS = [
    ("player-male", "public/assets/characters/player-male-back.png"),
    ("player-female", "public/assets/characters/player-female-back.png"),
]

parser = argparse.ArgumentParser()
parser.add_argument("--root", default=".")
parser.add_argument("--output", default="assets/face-crops")
parser.add_argument("--size", type=int, default=640)
# frame_scale sizes the square crop as a multiple of the detected face; frame_rise
# lifts its centre so the fringe above the forehead is included.
parser.add_argument("--frame-scale", type=float, default=1.85)
parser.add_argument("--frame-rise", type=float, default=0.24)
# The body sheet is written at the height the atlas gives it, so the generator
# copies it across rather than resampling. BODY_CELL_HEIGHT in
# scripts/lib/character-atlas.mjs is the same number; the generator resamples if
# they drift apart, so a mismatch costs sharpness rather than correctness.
parser.add_argument("--body-height", type=int, default=600)
args = parser.parse_args()


def find_skin(rgb):
    """Peach skin: red leads, green sits between, and the pixel is bright."""
    red = rgb[:, :, 0].astype(np.int16)
    green = rgb[:, :, 1].astype(np.int16)
    blue = rgb[:, :, 2].astype(np.int16)
    return (
        (red > 120)
        & (red > green + 12)
        & (green >= blue - 6)
        & (red - blue > 18)
        & (red - blue < 130)
    )


def largest_region(mask):
    parts, part_count = ndimage.label(mask)
    if part_count > 1:
        part_sizes = ndimage.sum(mask, parts, range(1, part_count + 1))
        mask = parts == int(np.argmax(part_sizes)) + 1
    mask = ndimage.binary_closing(mask, np.ones((7, 7)))
    return ndimage.binary_fill_holes(mask)


def find_figure(pixels):
    """The lit figure on the black field.

    Faint noise in the black field would otherwise count as figure and streak
    across the crop when the background is flooded. Hair is very dark, so only
    near-black pixels count as the field, and isolated speckles are dropped by
    keeping the largest connected region.
    """
    alpha = pixels[:, :, 3]
    luminance = pixels[:, :, :3].max(axis=2)
    return largest_region((alpha > 16) & (luminance > 28))


def find_silhouette(pixels):
    """The figure's outline from its alpha matte alone.

    The back of a head is nearly black hair, and a brightness rule cuts the
    crown off it. The matte carries the whole outline including that hair, which
    is exactly what places the back crop.
    """
    return largest_region(pixels[:, :, 3] > 128)


def solid_interior(subject, margin=4):
    """The figure minus its soft edge.

    The matte fades over a few pixels at the outline, and those pixels still
    carry a trace of the green plate the artwork was drawn on. Flooding the
    background from them rakes green streaks across the crop, so the flood reads
    from inside the outline instead.
    """
    return ndimage.binary_erosion(subject, np.ones((margin * 2 + 1,) * 2))


def flood_background(pixels, subject):
    """Replace the black field with the nearest subject colour.

    Leaving the field in the crop paints a dark halo around the head.
    """
    filled = pixels[:, :, :3].copy()
    background = ~subject
    if background.any():
        indices = ndimage.distance_transform_edt(
            background, return_distances=False, return_indices=True
        )
        filled = filled[tuple(indices)]
    return filled


def crop_box(filled, box, target):
    """Cut the box out, extending the picture by its edge pixels if needed."""
    left_pad = max(0, -box[0])
    top_pad = max(0, -box[1])
    right_pad = max(0, box[2] - filled.shape[1])
    bottom_pad = max(0, box[3] - filled.shape[0])
    if left_pad or top_pad or right_pad or bottom_pad:
        filled = np.pad(
            filled,
            ((top_pad, bottom_pad), (left_pad, right_pad), (0, 0)),
            mode="edge",
        )
        box = (
            box[0] + left_pad,
            box[1] + top_pad,
            box[2] + left_pad,
            box[3] + top_pad,
        )
    crop = Image.fromarray(filled).crop(box).resize(target, Image.LANCZOS)
    return crop, box


def crop_square(filled, box, size):
    return crop_box(filled, box, (size, size))


def outline_box(mask):
    """The tight bounding box of a mask, as a PIL-style half-open box."""
    rows = np.where(mask.any(axis=1))[0]
    columns = np.where(mask.any(axis=0))[0]
    if len(rows) == 0 or len(columns) == 0:
        return None
    return (
        int(columns[0]),
        int(rows[0]),
        int(columns[-1]) + 1,
        int(rows[-1]) + 1,
    )


def write_body_sheet(name, pixels, silhouette, height):
    """The whole figure, cut at its outline and squared up to its own box.

    The generator maps the model's bounding box onto this rectangle, so what the
    sheet must carry is the figure and nothing else: any margin left round it
    would slide the picture off the model by that margin. The sheet keeps the
    figure's own proportions, which is what stops the atlas from spending three
    times more detail across the character than down it.
    """
    box = outline_box(silhouette)
    if box is None:
        raise SystemExit(f"{name}: could not find the figure outline")
    width = round(height * (box[2] - box[0]) / (box[3] - box[1]))
    filled = flood_background(pixels, solid_interior(silhouette))
    sheet, box = crop_box(filled, box, (width, height))
    write_raw(f"{name}-body", sheet)
    return {
        "file": f"{name}-body.rgb",
        "width": width,
        "height": height,
        "sourceBox": list(box),
    }


output_dir = os.path.join(args.root, args.output)
os.makedirs(output_dir, exist_ok=True)
manifest = {}


def write_raw(name, crop):
    with open(os.path.join(output_dir, f"{name}.rgb"), "wb") as handle:
        handle.write(np.asarray(crop, dtype=np.uint8).tobytes())


for identity, relative in CHARACTERS:
    path = os.path.join(args.root, relative)
    image = Image.open(path).convert("RGBA")
    pixels = np.asarray(image)

    subject = find_figure(pixels)
    rows = np.where(subject.any(axis=1))[0]
    if len(rows) == 0:
        raise SystemExit(f"{identity}: could not find the figure in {relative}")

    top, bottom = int(rows[0]), int(rows[-1])
    figure_height = bottom - top

    # Hands and neck are skin too, so only the head end of the figure is searched.
    search = np.zeros(subject.shape, dtype=bool)
    search[top : top + int(figure_height * 0.30)] = True
    skin = find_skin(pixels[:, :, :3]) & subject & search

    labels, count = ndimage.label(skin)
    if count == 0:
        raise SystemExit(f"{identity}: no skin region found in {relative}")
    sizes = ndimage.sum(skin, labels, range(1, count + 1))
    face_label = int(np.argmax(sizes)) + 1
    face_mask = labels == face_label

    face_rows = np.where(face_mask.any(axis=1))[0]
    face_top = int(face_rows[0])
    face_bottom = int(face_rows[-1])

    # The face joins the neck and chest through one connected run of skin, so the
    # blob is cut where it narrows sharply below its widest row: the jawline.
    widths = face_mask[face_top : face_bottom + 1].sum(axis=1)
    widest = int(np.argmax(widths))
    cut = face_bottom
    for offset in range(widest + 1, len(widths)):
        if widths[offset] < widths[widest] * 0.5:
            cut = face_top + offset
            break
    face_bottom = cut

    head = face_mask[face_top : face_bottom + 1]
    face_columns = np.where(head.any(axis=0))[0]
    face_left = int(face_columns[0])
    face_right = int(face_columns[-1])
    face_height = face_bottom - face_top
    center_x = (face_left + face_right) / 2

    # A square box keyed to the larger face dimension keeps every character at the
    # same zoom; keying it to height alone framed wide faces much closer than
    # narrow ones. The centre sits above the face so the fringe comes along.
    face_width = face_right - face_left
    half = max(face_width, face_height) * args.frame_scale / 2
    center_y = (face_top + face_bottom) / 2 - face_height * args.frame_rise
    # Keep the square inside the figure so no background sits above the head,
    # where flooding it would leave a dark ring around the crop.
    center_y = max(center_y, top + half)

    box = (
        int(round(center_x - half)),
        int(round(center_y - half)),
        int(round(center_x + half)),
        int(round(center_y + half)),
    )

    filled = flood_background(pixels, solid_interior(subject))
    crop, box = crop_square(filled, box, args.size)
    write_raw(identity, crop)

    manifest[identity] = {
        "file": f"{identity}.rgb",
        "size": args.size,
        "sourceBox": list(box),
        "figureTop": top,
        "figureHeight": figure_height,
        "skinBox": [face_left, face_top, face_right, face_bottom],
        # The sculpt was built from the alpha matte, so the body sheet is cut at
        # the same outline. The brightness rule that finds the face would lose
        # the dark hair at the crown and shift the whole projection down.
        "body": write_body_sheet(
            identity, pixels, find_silhouette(pixels), args.body_height
        ),
    }
    print(
        f"{identity}: skin {face_right - face_left}x{face_height} at "
        f"({face_left},{face_top}) -> crop {box}"
    )


for identity, relative in BACK_VIEWS:
    path = os.path.join(args.root, relative)
    front = manifest.get(identity)
    if front is None:
        raise SystemExit(f"{identity}: back view has no matching front crop")

    image = Image.open(path).convert("RGBA")
    pixels = np.asarray(image)
    subject = find_silhouette(pixels)
    rows = np.where(subject.any(axis=1))[0]
    if len(rows) == 0:
        raise SystemExit(f"{identity}: could not find the figure in {relative}")
    top, bottom = int(rows[0]), int(rows[-1])
    figure_height = bottom - top

    # The same slice of the figure as the front crop, so both crops land on the
    # same latitudes of the head and meet at the ears.
    front_top = (front["sourceBox"][1] - front["figureTop"]) / front["figureHeight"]
    front_bottom = (front["sourceBox"][3] - front["figureTop"]) / front["figureHeight"]
    box_top = top + front_top * figure_height
    box_bottom = top + front_bottom * figure_height
    half = (box_bottom - box_top) / 2

    # Centred on the head's own outline rather than the figure's, because hands
    # and a sash pull the full outline sideways. The upper part of the slice is
    # all head, so its widest run gives the centre.
    crown = subject[int(round(box_top)) : int(round(box_top + half)), :]
    crown_columns = np.where(crown.any(axis=0))[0]
    if len(crown_columns) == 0:
        raise SystemExit(f"{identity}: could not find the head in {relative}")
    center_x = (int(crown_columns[0]) + int(crown_columns[-1])) / 2

    box = (
        int(round(center_x - half)),
        int(round(box_top)),
        int(round(center_x + half)),
        int(round(box_bottom)),
    )

    filled = flood_background(pixels, solid_interior(subject))
    crop, box = crop_square(filled, box, args.size)
    name = f"{identity}-back"
    write_raw(name, crop)

    manifest[identity]["back"] = {
        "file": f"{name}.rgb",
        "size": args.size,
        "sourceBox": list(box),
        "figureTop": top,
        "figureHeight": figure_height,
    }
    manifest[identity]["bodyBack"] = write_body_sheet(
        name, pixels, subject, args.body_height
    )
    print(f"{identity}: back head at figure top {top} -> crop {box}")

with open(os.path.join(output_dir, "manifest.json"), "w") as handle:
    json.dump(manifest, handle, indent=2)
print("wrote", os.path.join(output_dir, "manifest.json"))
