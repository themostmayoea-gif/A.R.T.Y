"""
Gera o mapa do Hub (Pescaria do Abismo) no Blender com textura de stud procedural.

Uso:
  - Blender sem interface:  blender -b -P build_hub_map.py -- <pasta_saida>
  - Python com bpy:          python build_hub_map.py -- <pasta_saida>
  - Blender com interface:   abra no Text Editor e clique em Run Script
                             (a saída vai para a pasta deste arquivo)

Saídas: hub_map.blend, hub_map.fbx (texturas embutidas), textures/*.png, preview.png

Escala: 1 unidade do Blender = 1 stud. No 3D Importer do Roblox, escolha a unidade "Stud"
e marque "Insert Using Scene Position" para os portais ficarem no lugar certo.
Eixos: Blender (x, y, z) vira Roblox (x, z, -y). O chão do hub fica em Roblox Y = 0.
"""

import math
import os
import random
import sys

import bpy  # precisa vir antes do bmesh quando usado como módulo Python
import bmesh
import numpy as np
from mathutils import Vector

# ---------------------------------------------------------------- saída

if "--" in sys.argv:
    OUT_DIR = os.path.abspath(sys.argv[sys.argv.index("--") + 1])
else:
    try:
        OUT_DIR = os.path.dirname(os.path.abspath(__file__))
    except NameError:
        OUT_DIR = bpy.path.abspath("//") or os.getcwd()
TEX_DIR = os.path.join(OUT_DIR, "textures")
os.makedirs(TEX_DIR, exist_ok=True)

random.seed(7)

# ---------------------------------------------------------------- textura de stud

TEX_SIZE = 512
TILE_STUDS = 4  # cada imagem cobre 4x4 studs
PX_PER_STUD = TEX_SIZE // TILE_STUDS

COLORS = {
    "grass": (75, 151, 75),
    "dirt": (124, 92, 70),
    "sand": (226, 200, 140),
    "stone": (163, 162, 165),
    "stone_dark": (99, 95, 98),
    "wood": (160, 105, 60),
    "wood_dark": (105, 64, 40),
    "leaves": (40, 127, 71),
    "leaves_light": (88, 170, 70),
    "white": (242, 243, 243),
    "roof": (196, 40, 28),
    "water": (40, 110, 190),
    "lamp": (255, 210, 90),
}


def _grid():
    yy, xx = np.mgrid[0:TEX_SIZE, 0:TEX_SIZE].astype(np.float32)
    return xx, yy


def _noise(strength):
    rng = np.random.default_rng(3)
    return 1.0 + (rng.random((TEX_SIZE, TEX_SIZE), dtype=np.float32) - 0.5) * strength


def stud_pattern():
    """Fator de brilho (1 = cor base) para a face de cima com studs."""
    xx, yy = _grid()
    lx = (xx % PX_PER_STUD) / PX_PER_STUD - 0.5
    ly = (yy % PX_PER_STUD) / PX_PER_STUD - 0.5
    r = np.sqrt(lx * lx + ly * ly) + 1e-6
    # direção da luz: canto superior esquerdo
    d = (-lx + ly) / (r * math.sqrt(2))

    shade = np.ones_like(r)
    radius = 0.30
    rim = 0.04

    # sombra projetada pelo stud
    shadow = (r >= radius) & (r < radius + 0.07) & (d < 0)
    shade[shadow] += 0.28 * d[shadow] * (1 - (r[shadow] - radius) / 0.07)
    # topo do stud
    top = r < radius - rim
    shade[top] = 1.05
    # borda iluminada/sombreada
    edge = (r >= radius - rim) & (r < radius)
    shade[edge] = 1.0 + 0.32 * d[edge]

    # junta entre peças
    e = 0.5 - np.maximum(np.abs(lx), np.abs(ly))
    shade[e < 0.012] *= 0.86
    return shade * _noise(0.03)


def side_pattern():
    """Faces laterais: plástico liso com linhas de placa."""
    xx, yy = _grid()
    shade = np.ones((TEX_SIZE, TEX_SIZE), dtype=np.float32)
    plate = TEX_SIZE / 3.0
    shade[(yy % plate) < 2.0] *= 0.88
    shade[(yy % plate) > plate - 2.0] *= 1.06
    return shade * _noise(0.03)


def water_pattern():
    xx, yy = _grid()
    t = 2 * math.pi / TEX_SIZE
    waves = np.sin(xx * t * 2 + np.sin(yy * t * 3) * 1.5) * np.sin(yy * t * 2)
    return (1.0 + 0.06 * waves) * _noise(0.02)


PATTERNS = {"studs": stud_pattern(), "side": side_pattern(), "water": water_pattern()}

_images = {}


def get_image(color_name, kind):
    key = f"{color_name}_{kind}"
    if key in _images:
        return _images[key]
    base = np.array(COLORS[color_name], dtype=np.float32) / 255.0
    shade = PATTERNS[kind]
    rgb = np.clip(base[None, None, :] * shade[:, :, None], 0, 1)
    rgba = np.concatenate([rgb, np.ones((TEX_SIZE, TEX_SIZE, 1), np.float32)], axis=2)

    img = bpy.data.images.new(key, TEX_SIZE, TEX_SIZE, alpha=False)
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = os.path.join(TEX_DIR, key + ".png")
    img.file_format = "PNG"
    img.save()
    _images[key] = img
    return img


_materials = {}


def get_material(color_name, kind):
    key = f"{color_name}_{kind}"
    if key in _materials:
        return _materials[key]
    mat = bpy.data.materials.new(key)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = 0.45
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = get_image(color_name, kind)
    tex.interpolation = "Linear"
    mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    _materials[key] = mat
    return mat


# ---------------------------------------------------------------- geometria

collection = bpy.data.collections.new("HubMap")


def finish_object(name, bm, top_color, side_color, studs=True):
    """UV em coordenadas do mundo (1 imagem = 4 studs), material por direção da face,
    e origem no centro da peça (vira o pivô da MeshPart)."""
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    uv = bm.loops.layers.uv.new("UVMap")
    for face in bm.faces:
        n = face.normal
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        face.material_index = 0 if (n.z > 0.9 and studs) else 1
        for loop in face.loops:
            c = loop.vert.co
            if az >= ax and az >= ay:
                u, v = c.x, c.y
            elif ax >= ay:
                u, v = c.y, c.z
            else:
                u, v = c.x, c.z
            loop[uv].uv = (u / TILE_STUDS, v / TILE_STUDS)

    lo = [min(v.co[i] for v in bm.verts) for i in range(3)]
    hi = [max(v.co[i] for v in bm.verts) for i in range(3)]
    center = Vector([(a + b) / 2 for a, b in zip(lo, hi)])
    for v in bm.verts:
        v.co -= center

    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    top_kind = "studs" if studs else ("water" if top_color == "water" else "side")
    mesh.materials.append(get_material(top_color, top_kind))
    mesh.materials.append(get_material(side_color, "water" if side_color == "water" else "side"))

    obj = bpy.data.objects.new(name, mesh)
    obj.location = center
    collection.objects.link(obj)
    return obj


def box(name, center, size, top, side=None, rot_z=0.0, studs=True):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= size[0]
        v.co.y *= size[1]
        v.co.z *= size[2]
        if rot_z:
            x, y = v.co.x, v.co.y
            v.co.x = x * math.cos(rot_z) - y * math.sin(rot_z)
            v.co.y = x * math.sin(rot_z) + y * math.cos(rot_z)
        v.co.x += center[0]
        v.co.y += center[1]
        v.co.z += center[2]
    return finish_object(name, bm, top, side or top, studs)


def box_minmax(name, mn, mx, top, side=None, studs=True):
    center = [(a + b) / 2 for a, b in zip(mn, mx)]
    size = [b - a for a, b in zip(mn, mx)]
    return box(name, center, size, top, side, studs=studs)


def prism(name, points, z0, z1, top, side=None, studs=True):
    bm = bmesh.new()
    bottom = [bm.verts.new((x, y, z0)) for x, y in points]
    upper = [bm.verts.new((x, y, z1)) for x, y in points]
    bm.faces.new(list(reversed(bottom)))
    bm.faces.new(upper)
    n = len(points)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((bottom[i], bottom[j], upper[j], upper[i]))
    return finish_object(name, bm, top, side or top, studs)


def rounded_rect(cx, cy, w, h, radius, segments=6):
    pts = []
    corners = [
        (cx + w / 2 - radius, cy + h / 2 - radius, 0),
        (cx - w / 2 + radius, cy + h / 2 - radius, 90),
        (cx - w / 2 + radius, cy - h / 2 + radius, 180),
        (cx + w / 2 - radius, cy - h / 2 + radius, 270),
    ]
    for ccx, ccy, start in corners:
        for s in range(segments + 1):
            a = math.radians(start + 90 * s / segments)
            pts.append((ccx + radius * math.cos(a), ccy + radius * math.sin(a)))
    return pts


def circle(cx, cy, radius, sides):
    return [
        (cx + radius * math.cos(2 * math.pi * i / sides), cy + radius * math.sin(2 * math.pi * i / sides))
        for i in range(sides)
    ]


def gable_roof(name, cx, cy, length_x, width_y, z0, height, color):
    bm = bmesh.new()
    x0, x1 = cx - length_x / 2, cx + length_x / 2
    hw = width_y / 2
    a = [bm.verts.new((x0, cy - hw, z0)), bm.verts.new((x0, cy + hw, z0)), bm.verts.new((x0, cy, z0 + height))]
    b = [bm.verts.new((x1, cy - hw, z0)), bm.verts.new((x1, cy + hw, z0)), bm.verts.new((x1, cy, z0 + height))]
    bm.faces.new((a[0], a[2], a[1]))
    bm.faces.new((b[0], b[1], b[2]))
    bm.faces.new((a[0], b[0], b[2], a[2]))
    bm.faces.new((a[1], a[2], b[2], b[1]))
    bm.faces.new((a[0], a[1], b[1], b[0]))
    return finish_object(name, bm, color, color, studs=False)


# ---------------------------------------------------------------- mapa
# Coordenadas Blender. Roblox: X = x, Y = z, Z = -y.
# Portais do HubConfig: Roblox (-30/0/30, 0.7, -40) -> Blender (x, 40, 0.2..1.2).

# Ilha e água
prism("Ilha", rounded_rect(0, 10, 160, 160, 22), -8, 0, "grass", "dirt")
box("Agua", (0, 10, -2.6), (700, 700, 0.2), "water", studs=False)

# Spawn (coloque o SpawnLocation em Roblox (0, 1, 20))
prism("PracaSpawn", circle(0, -20, 14, 16), 0, 0.6, "stone", "stone_dark")
prism("SpawnCentro", circle(0, -20, 5, 16), 0.6, 0.8, "white", "stone_dark")

# Caminho de areia até os portais
box_minmax("Caminho", (-5, -6, 0), (5, 30, 0.15), "sand")

# Praça dos portais com arcos
box_minmax("PracaPortais", (-50, 29, 0), (50, 53, 0.2), "stone", "stone_dark")
for i, px in enumerate((-30, 0, 30)):
    for side in (-8, 8):
        box_minmax(f"Arco{i}_Pilar{'E' if side < 0 else 'D'}", (px + side - 1, 39, 0.2), (px + side + 1, 41, 14), "stone_dark")
    box_minmax(f"Arco{i}_Topo", (px - 9.5, 38.5, 14), (px + 9.5, 41.5, 16.5), "stone_dark")

# Placa na frente dos portais (sem texto; coloque um SurfaceGui no Roblox)
box_minmax("Placa_PosteE", (-21.5, 23.5, 0), (-20.5, 24.5, 6), "wood_dark")
box_minmax("Placa_PosteD", (-11.5, 23.5, 0), (-10.5, 24.5, 6), "wood_dark")
box_minmax("Placa_Quadro", (-23, 23.2, 3.5), (-9, 24.8, 7.5), "wood")

# Postes de luz ao longo do caminho (deixe as cúpulas como Neon no Roblox)
for i, y in enumerate((-2, 10, 22)):
    for sx in (-8, 8):
        box_minmax(f"Poste{i}{'E' if sx < 0 else 'D'}", (sx - 0.5, y - 0.5, 0), (sx + 0.5, y + 0.5, 8), "stone_dark")
        box_minmax(f"Luz{i}{'E' if sx < 0 else 'D'}", (sx - 1.2, y - 1.2, 8), (sx + 1.2, y + 1.2, 10), "lamp")

# Píer de pesca
box_minmax("Pier", (79.5, 0, -0.5), (128, 8, 0.3), "wood", "wood_dark")
for i, x in enumerate((90, 104, 118, 127)):
    for y in (0.6, 7.4):
        box_minmax(f"Pier_Estaca{i}_{int(y)}", (x - 0.6, y - 0.6, -8), (x + 0.6, y + 0.6, 0.8), "wood_dark")

# Cabana do pescador
box_minmax("Cabana", (43, -51, 0), (57, -39, 9), "white", "white")
box_minmax("Cabana_Porta", (48, -51.4, 0), (52, -51, 7), "wood_dark")
gable_roof("Cabana_Telhado", 50, -45, 16, 15, 9, 5, "roof")

# Árvores
TREES = [(-60, -50), (-65, 0), (-55, 60), (-20, 75), (25, 78), (60, 65), (65, 20), (-35, -55), (25, -62), (-68, 32)]
for i, (x, y) in enumerate(TREES):
    h = random.choice((7, 8, 9))
    box_minmax(f"Arvore{i}_Tronco", (x - 1, y - 1, 0), (x + 1, y + 1, h), "wood_dark")
    box_minmax(f"Arvore{i}_Folhas", (x - 4, y - 4, h), (x + 4, y + 4, h + 5), "leaves")
    box_minmax(f"Arvore{i}_Topo", (x - 2.5, y - 2.5, h + 5), (x + 2.5, y + 2.5, h + 7.5), "leaves_light")

# Pedras na beira da ilha
ROCKS = [(-74, -58, 6), (72, -62, 5), (-76, 82, 7), (40, 86, 4), (-80, 20, 5)]
for i, (x, y, s) in enumerate(ROCKS):
    box(f"Pedra{i}", (x, y, s * 0.25), (s, s * 0.8, s * 0.9), "stone", "stone_dark", rot_z=random.uniform(0, 1.5))

# ---------------------------------------------------------------- cena, preview e exportação

scene = bpy.context.scene
scene.collection.children.link(collection)

for obj in list(bpy.data.objects):
    if obj.name in ("Cube", "Light", "Camera"):
        bpy.data.objects.remove(obj, do_unlink=True)

world = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes.get("Background")
bg.inputs["Color"].default_value = (0.45, 0.68, 0.95, 1)
bg.inputs["Strength"].default_value = 0.9

sun_data = bpy.data.lights.new("Sol", "SUN")
sun_data.energy = 3.5
sun_data.angle = math.radians(8)
sun = bpy.data.objects.new("Sol", sun_data)
sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(-35))
scene.collection.objects.link(sun)

target = bpy.data.objects.new("AlvoCamera", None)
target.location = (5, 15, 0)
scene.collection.objects.link(target)
cam_data = bpy.data.cameras.new("Camera")
cam_data.lens = 32
cam_data.clip_end = 2000
cam = bpy.data.objects.new("Camera", cam_data)
cam.location = (-115, -150, 105)
track = cam.constraints.new("TRACK_TO")
track.target = target
track.track_axis = "TRACK_NEGATIVE_Z"
track.up_axis = "UP_Y"
scene.collection.objects.link(cam)
scene.camera = cam

scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 48
scene.cycles.use_denoising = True
scene.render.resolution_x = 1600
scene.render.resolution_y = 900
scene.render.filepath = os.path.join(OUT_DIR, "preview.png")
scene.view_settings.view_transform = "Standard"

if "--no-render" not in sys.argv:
    bpy.ops.render.render(write_still=True)

# Exporta só o mapa (sem câmera, luz ou alvo).
bpy.ops.object.select_all(action="DESELECT")
for obj in collection.objects:
    obj.select_set(True)
bpy.ops.export_scene.fbx(
    filepath=os.path.join(OUT_DIR, "hub_map.fbx"),
    use_selection=True,
    object_types={"MESH"},
    apply_scale_options="FBX_SCALE_UNITS",
    axis_forward="-Z",
    axis_up="Y",
    use_triangles=True,
    path_mode="COPY",
    embed_textures=True,
    mesh_smooth_type="FACE",
)

bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT_DIR, "hub_map.blend"))
print(f"[HubMap] {len(collection.objects)} peças exportadas para {OUT_DIR}")
