"""Convert a generated mesh into the engine's axes, clean it and fit the budget.

TripoSR emits the figure with +Z up and the photographed front facing -Y, while
the engine expects Y up with the character facing +Z.

Two clean-up passes run before the budget is enforced.

*Stray pieces.* Isosurface extraction leaves small shells floating beside the
figure, so only the largest connected piece is kept.

*Thin protrusions.* The male figure came out with a long blade growing from the
hip, and the same class of artefact can appear anywhere the density field leaks.
It is found by rule rather than by coordinate. Local thickness is measured for
every vertex, the surface is cut wherever it is thinner than a fraction of the
figure's height, and whatever comes away from the body is measured: a piece that
is far longer than it is thick is the artefact and is dropped, while a piece as
long as it is thick is a hand, a sandal rim or a lock of hair and is put back.
Length against thickness is what separates them, so nothing is keyed to a
coordinate and the rule survives a rebuild.

*Budget.* The marching-cubes resolution in rebuild-characters.sh is deliberately
high, so the surface starts with far more triangles than may ship. Quadric
decimation brings it down to the target, which keeps more shape than extracting
the isosurface coarsely in the first place. Vertex colours are carried across by
nearest-point lookup on the dense mesh.
"""

import argparse

import numpy as np
import trimesh
from scipy import ndimage
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from scipy.spatial import cKDTree

PLAYER_TRIANGLE_LIMIT = 25_000
NPC_TRIANGLE_LIMIT = 10_000
# The shipped counts stay under the hard limits, because decimation lands near
# the target rather than exactly on it.
PLAYER_TRIANGLE_TARGET = 24_500
NPC_TRIANGLE_TARGET = 9_800

# Local thickness is measured against the figure's height, so the rule holds at
# any marching-cubes resolution. Limbs on these figures measure 0.05 and up; the
# hip blade measured 0.033 at its thickest.
THIN_FRACTION = 0.040
# Voxel grid used to measure thickness. Finer than the mesh, so a thin blade is
# still several voxels across.
THICKNESS_GRID = 320
# A piece that comes away from the body is an artefact when it reaches this much
# further than it is thick. Arms, hands and sandals are thin enough to come away
# too, and across the six figures they measure between 3.5 and 6.4; the blade on
# the male figure measures 13.9. Anything in between is worth a look at the
# rendered model before the number is moved.
ELONGATION = 8.0
# and when it is long enough to be worth cutting, as a fraction of the height.
MIN_PROTRUSION = 0.10


def keep_largest_piece(mesh):
    pieces = mesh.split(only_watertight=False)
    if len(pieces) <= 1:
        return mesh, 0
    sizes = [len(piece.faces) for piece in pieces]
    largest = int(np.argmax(sizes))
    return pieces[largest], sum(sizes) - sizes[largest]


def measure_thickness(mesh):
    """Local thickness per vertex, as a fraction of the figure's height.

    The solid is voxelised and a distance transform gives every interior voxel
    its distance to the surface. Walking inwards from a vertex along its normal
    and taking the largest distance found gives the half-thickness of the
    material behind that vertex.
    """
    height = float((mesh.bounds[1] - mesh.bounds[0]).max())
    pitch = height / THICKNESS_GRID
    grid = mesh.voxelized(pitch=pitch).fill()
    distance = ndimage.distance_transform_edt(grid.matrix)
    shape = np.array(grid.matrix.shape)

    normals = mesh.vertex_normals
    deepest = np.zeros(len(mesh.vertices))
    # Half of the thickest limb is well inside this many steps.
    for step in range(THICKNESS_GRID // 10 + 1):
        probe = mesh.vertices - normals * (step * pitch)
        index = np.clip(grid.points_to_indices(probe), 0, shape - 1)
        deepest = np.maximum(deepest, distance[index[:, 0], index[:, 1], index[:, 2]])

    return deepest * 2 * pitch / height


def cluster(mesh, selected):
    """Group the selected vertices into runs joined by the mesh's own edges."""
    edges = mesh.edges_unique
    joined = edges[selected[edges].all(axis=1)]
    count = len(mesh.vertices)
    graph = coo_matrix(
        (np.ones(len(joined)), (joined[:, 0], joined[:, 1])),
        shape=(count, count),
    )
    _, labels = connected_components(graph, directed=False)
    return labels


def prune_thin_protrusions(mesh):
    height = float((mesh.bounds[1] - mesh.bounds[0]).max())
    thickness = measure_thickness(mesh)
    thin_vertex = thickness < THIN_FRACTION
    if not thin_vertex.any():
        return mesh, 0

    faces = mesh.faces
    thin_face = thin_vertex[faces].all(axis=1)
    if not thin_face.any():
        return mesh, 0

    # Cutting the thin material apart leaves the body as the largest piece.
    cut = mesh.copy()
    cut.update_faces(~thin_face)
    cut.remove_unreferenced_vertices()
    body, _ = keep_largest_piece(cut)

    # Vertices are matched back by position, because the cut renumbered them.
    distance, _ = cKDTree(body.vertices).query(mesh.vertices)
    loose = distance > height * 1e-6
    if not loose.any():
        return mesh, 0

    labels = cluster(mesh, loose)
    drop = np.zeros(len(mesh.vertices), dtype=bool)
    for label in np.unique(labels[loose]):
        piece = (labels == label) & loose
        points = mesh.vertices[piece]
        reach = float(np.linalg.norm(points.max(axis=0) - points.min(axis=0))) / height
        girth = float(np.median(thickness[piece]))
        if reach > MIN_PROTRUSION and reach > girth * ELONGATION:
            drop |= piece
            print(f"  protrusion: reach {reach:.3f} girth {girth:.3f} of height")

    if not drop.any():
        return mesh, 0

    pruned = mesh.copy()
    pruned.update_faces(~drop[faces].any(axis=1))
    pruned.remove_unreferenced_vertices()
    pruned, _ = keep_largest_piece(pruned)
    return close_boundaries(pruned), int(drop.sum())


def close_boundaries(mesh):
    """Cap the openings left behind by the cut.

    An open rim shows the inside of the figure, which renders as a pale hole.
    Each rim is walked round and filled with a fan from its own centre. Winding
    follows the rim backwards, which is the direction the missing faces would
    have run.
    """
    single = trimesh.grouping.group_rows(mesh.edges_sorted, require_count=1)
    if len(single) == 0:
        return mesh

    following = {int(a): int(b) for a, b in mesh.edges[single]}
    vertices = mesh.vertices.tolist()
    faces = mesh.faces.tolist()
    while following:
        start = next(iter(following))
        rim = [start]
        node = following.pop(start)
        while node != start and node in following:
            rim.append(node)
            node = following.pop(node)
        if len(rim) < 3:
            continue
        centre = len(vertices)
        vertices.append(np.mean([vertices[point] for point in rim], axis=0).tolist())
        for position in range(len(rim)):
            faces.append([rim[(position + 1) % len(rim)], rim[position], centre])

    return trimesh.Trimesh(vertices=vertices, faces=faces, process=False)


def decimate(mesh, target):
    if len(mesh.faces) <= target:
        return mesh, False
    import fast_simplification

    reduction = 1.0 - target / len(mesh.faces)
    points, faces = fast_simplification.simplify(
        np.asarray(mesh.vertices, dtype=np.float32),
        np.asarray(mesh.faces, dtype=np.int32),
        reduction,
    )
    return trimesh.Trimesh(vertices=points, faces=faces, process=False), True


def paint_from(mesh, source):
    """Give every vertex the colour of the nearest vertex on the dense mesh.

    Cutting, patching and decimating all move vertices around, and a patched
    hole has no colour of its own at all, which the renderer would show as a
    white blotch. One lookup at the end covers all three.
    """
    colors = getattr(source.visual, "vertex_colors", None)
    if colors is None or len(colors) != len(source.vertices):
        return mesh
    _, nearest = cKDTree(source.vertices).query(mesh.vertices)
    mesh.visual.vertex_colors = np.asarray(colors)[nearest]
    return mesh


parser = argparse.ArgumentParser()
parser.add_argument("--input", required=True)
parser.add_argument("--output", required=True)
parser.add_argument("--target", type=int, default=0)
args = parser.parse_args()

mesh = trimesh.load(args.input, force="mesh")
mesh.apply_transform(trimesh.transformations.rotation_matrix(-np.pi / 2, [1, 0, 0]))
started = len(mesh.faces)

npc = "npc-" in args.output
limit = NPC_TRIANGLE_LIMIT if npc else PLAYER_TRIANGLE_LIMIT
target = args.target or (NPC_TRIANGLE_TARGET if npc else PLAYER_TRIANGLE_TARGET)

mesh, stray = keep_largest_piece(mesh)
dense = mesh.copy()
mesh, protrusion = prune_thin_protrusions(mesh)
mesh, decimated = decimate(mesh, target)
mesh = paint_from(mesh, dense)

if len(mesh.faces) > limit:
    raise SystemExit(
        f"{args.output}: {len(mesh.faces)} triangles exceeds the {limit} budget. "
        "Lower the target for this character."
    )

mesh.export(args.output)
bounds = mesh.bounds
print(
    f"{args.output}: {len(mesh.vertices)} vertices, {len(mesh.faces)} faces "
    f"(from {started}; stray faces {stray}, protrusion vertices {protrusion}, "
    f"decimated {'yes' if decimated else 'no'}), "
    f"height {bounds[1][1] - bounds[0][1]:.4f}"
)
