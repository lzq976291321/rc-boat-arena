"""Recover Rico's assembly from Bambu 3MF source offsets and export a local GLB.

Blender --background --factory-startup --python tools/assets/export-rico-boat.py --
  --source /path/to/Rico_AquaKart_v1 --out /path/to/rico-aquakart.glb

Source packages are never modified. Print-bed transforms are deliberately not
assembly transforms. Source-offset reconstruction is specific to this package.
The separately sold M-Jet and separately downloaded Dummy 13 are not included.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import struct
import sys
import xml.etree.ElementTree as ET
import zipfile

import bpy
import numpy as np
from mathutils import Vector

parser = argparse.ArgumentParser()
parser.add_argument('--source', required=True)
parser.add_argument('--out', required=True)
parser.add_argument('--render', action='store_true')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
source, out = Path(args.source).resolve(), Path(args.out).resolve()
out.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
NS = {'c': 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02'}
PROD = '{http://schemas.microsoft.com/3dmanufacturing/production/2015/06}'
objects, provenance = [], []


def material(name, hex_color, roughness, metallic=0):
    color = tuple(int(hex_color[i:i+2], 16) / 255 for i in (0, 2, 4))
    linear = tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in color)
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*linear, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*linear, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    return mat


mats = {
    'blue': material('BodyPaint', '315FA8', .31, .18),
    'dark': material('Graphite fairing', '222B34', .34, .12),
    'rubber': material('Rubber grips and hatch seals', '14191E', .72),
    'seat': material('Blue upholstered seat', '284879', .66),
    'metal': material('Satin aluminum', 'A9B4BF', .3, .85),
    'wood': material('Warm teak deck', 'A56B41', .55),
    'black': material('Spoiler graphite', '181F27', .3, .38),
}

# Embedded color texture; no Blender-only procedural nodes in the GLB.
texture_size = 512
yy, xx = np.mgrid[0:texture_size, 0:texture_size] / texture_size
rng = np.random.default_rng(35)
grain = (.91 + .055*np.sin(xx*420 + 3*np.sin(yy*8))
         + .035*np.sin(xx*1100 + 2*np.sin(yy*15))
         + rng.normal(0, .013, (texture_size, texture_size)))
pixels = np.ones((texture_size, texture_size, 4), dtype=np.float32)
pixels[:, :, :3] = np.array([.61, .36, .19])[None, None, :] * grain[:, :, None]
wood_image = bpy.data.images.new('Rico teak grain', width=texture_size, height=texture_size)
wood_image.pixels.foreach_set(pixels.ravel())
wood_image.pack()
wood_node = mats['wood'].node_tree.nodes.new('ShaderNodeTexImage')
wood_node.image = wood_image
mats['wood'].node_tree.links.new(wood_node.outputs['Color'], mats['wood'].node_tree.nodes.get('Principled BSDF').inputs['Base Color'])


def finish(obj, mat, simplify=True):
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    before = len(obj.data.polygons)
    if simplify and before > 4000:
        mod = obj.modifiers.new('Remove redundant planar CAD tessellation', 'DECIMATE')
        mod.decimate_type = 'DISSOLVE'
        mod.angle_limit = math.radians(.3)
        mod.use_dissolve_boundaries = False
        bpy.ops.object.modifier_apply(modifier=mod.name)
        obj.data.calc_loop_triangles()
        count = len(obj.data.loop_triangles)
        target = min(18000, max(2400, int(before * .14)))
        if count > target:
            mod = obj.modifiers.new('Game mesh reduction', 'DECIMATE')
            mod.ratio = target / count
            mod.use_collapse_triangulate = True
            bpy.ops.object.modifier_apply(modifier=mod.name)
    # Preserve sharp manufactured edges while smoothing curved surfaces.
    for face in obj.data.polygons:
        face.use_smooth = True
    obj.data.set_sharp_from_angle(angle=math.radians(35))
    obj.select_set(False)
    objects.append(obj)


def read_package(path):
    """Return source meshes in authored CAD coordinates, in millimeters."""
    with zipfile.ZipFile(path) as z:
        settings = ET.fromstring(z.read('Metadata/model_settings.config'))
        root = ET.fromstring(z.read('3D/3dmodel.model'))
        resources = {o.get('id'): o for o in root.findall('c:resources/c:object', NS)}
        docs = {}
        stls = {}
        for stl in path.parent.glob('*.stl'):
            with stl.open('rb') as stream:
                head = stream.read(84)
            stls.setdefault(struct.unpack_from('<I', head, 80)[0], []).append(stl.stem)
        for setting in settings.findall('object'):
            oid = setting.get('id')
            comp = resources[oid].find('c:components/c:component', NS)
            if comp is None:
                raise ValueError(f'Unsupported source object {oid}')
            entry = comp.get(PROD + 'path').lstrip('/')
            if entry not in docs:
                docs[entry] = ET.fromstring(z.read(entry))
            meshobj = next(o for o in docs[entry].findall('c:resources/c:object', NS)
                           if o.get('id') == comp.get('objectid'))
            part = setting.find('part')
            meta = {n.get('key'): n.get('value') for n in part.findall('metadata')}
            matrix = [float(v) for v in meta['matrix'].split()]
            if matrix != [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]:
                raise ValueError('Nonidentity source matrix needs explicit support')
            offset = [float(meta['source_offset_' + a]) for a in 'xyz']
            verts = [tuple(float(v.get(a)) + offset[i] for i, a in enumerate('xyz'))
                     for v in meshobj.findall('c:mesh/c:vertices/c:vertex', NS)]
            faces = [tuple(int(t.get(a)) for a in ('v1', 'v2', 'v3'))
                     for t in meshobj.findall('c:mesh/c:triangles/c:triangle', NS)]
            names = stls.get(len(faces), [meta.get('name', oid)])
            yield oid, names[0], verts, faces


for path in sorted(source.rglob('*.3mf')):
    relative = path.relative_to(source).as_posix()
    if any(s in relative for s in ('7_Stand', 'Connector/', 'Mjet30', '5_Drybox')):
        continue
    for oid, name, verts, faces in read_package(path):
        # Alternative angle wedges are print choices, not assembled duplicates.
        if 'Trimtabs' in path.name and oid not in ('2', '4', '6', '8'):
            continue
        # Harness buckle is authored around a driver which is not in this package.
        if 'Seat_and_belt' in path.name and oid in ('14', '18'):
            continue
        if 'Seat_and_belt' in path.name and oid == '27':
            verts = [(-x, y, z) for x, y, z in verts]
            faces = [tuple(reversed(f)) for f in faces]
            name = 'Rico_seat_belt_mount_mirrored'
        mat = mats['dark']
        if relative.startswith('1_Hull/'):
            mat = mats['blue']
        elif relative.startswith('2_TPU'):
            mat = mats['rubber']
        elif 'steering wheel' in relative:
            mat = mats['rubber'] if 'wheel' in name and 'mount' not in name and 'plate' not in name else mats['metal']
        elif 'Decoration' in relative:
            mat = mats['wood']
        elif 'Spoiler' in relative:
            mat = mats['black']
        elif 'Trim tabs' in relative:
            mat = mats['metal']
        elif 'Seat_and_belt' in relative:
            mat = mats['seat'] if oid in ('2', '10') else mats['metal']
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata([(x/1000, y/1000, z/1000) for x, y, z in verts], [], faces)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        finish(obj, mat)
        if mat == mats['wood']:
            uv = obj.data.uv_layers.new(name='Deck grain UV')
            for loop in obj.data.loops:
                co = obj.data.vertices[loop.vertex_index].co
                uv.data[loop.index].uv = (co.x / .12, co.y / .3)
        provenance.append({'name': name, 'package': relative, 'object': oid, 'source_triangles': len(faces)})

# Original boat is -Y forward, Z up. Center on the hull, preserve authored deck Z.
hulls = [o for o in objects if o.name.startswith('Rico_Hull')]
hull_y = [v.co.y for o in hulls for v in o.data.vertices]
center_y = (min(hull_y) + max(hull_y)) / 2
for obj in objects:
    for vertex in obj.data.vertices:
        vertex.co.y -= center_y


def tube(name, center, length, outer, inner, mat):
    """Open display nozzle, along +Y stern; deliberately not an M-Jet replica."""
    verts, faces, count = [], [], 48
    for y, radius in ((-length/2, outer), (length/2, outer*.84),
                      (-length/2, inner), (length/2, inner*.84)):
        verts += [(center[0]+math.cos(i*math.tau/count)*radius,
                   center[1]+y, center[2]+math.sin(i*math.tau/count)*radius) for i in range(count)]
    for a, b in ((0, count), (count*3, count*2), (count, count*3), (count*2, 0)):
        for i in range(count):
            j = (i+1) % count
            faces.append((a+i, a+j, b+j, b+i))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    finish(obj, mat, False)
    return obj


stern_y = max(hull_y) - center_y
tube('Display jet outlet - custom exterior only', (0, stern_y+.018, -.033), .055, .022, .017, mats['black'])

# Deliver a clean, named hierarchy. Export maps Blender -Y bow to glTF +Z.
root = bpy.data.objects.new('Rico AquaKart - Mjet35 hull - empty seat', None)
bpy.context.collection.objects.link(root)
for obj in objects:
    obj.parent = root
# Keep the editable assembly named by part, but batch static GLB meshes by
# material. The steering wheel stays independent for future animation.
export_objects = []
batches = {}
for obj in objects:
    copy = obj.copy()
    copy.data = obj.data.copy()
    bpy.context.collection.objects.link(copy)
    key = (obj.data.materials[0].name, obj.name == 'Rico_steering_wheel')
    batches.setdefault(key, []).append(copy)
for (material_name, steering), batch in batches.items():
    bpy.ops.object.select_all(action='DESELECT')
    for obj in batch:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = batch[0]
    if len(batch) > 1:
        bpy.ops.object.join()
    merged = bpy.context.view_layer.objects.active
    merged.name = 'Rico steering wheel' if steering else 'Rico - ' + material_name
    export_objects.append(merged)
bpy.ops.object.select_all(action='DESELECT')
for obj in export_objects + [root]:
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(out), export_format='GLB', use_selection=True,
                          export_yup=True, export_apply=True, export_extras=False,
                          export_cameras=False, export_lights=False, export_animations=False)
for obj in export_objects:
    bpy.data.objects.remove(obj, do_unlink=True)
binary = out.read_bytes()
gltf = json.loads(binary[20:20+struct.unpack_from('<I', binary, 12)[0]])
triangles = sum(gltf['accessors'][p['indices']]['count']//3
                for mesh in gltf['meshes'] for p in mesh['primitives'])
bounds = [[min(v.co[i] for o in objects for v in o.data.vertices),
           max(v.co[i] for o in objects for v in o.data.vertices)] for i in range(3)]
report = {
    'asset': out.name, 'source_author': 'Scarface3D / ZeroHero79',
    'source_package': source.name, 'bytes': len(binary), 'sha256': hashlib.sha256(binary).hexdigest(),
    'triangles': triangles, 'meshes': len(gltf['meshes']), 'materials': len(gltf['materials']),
    'embedded_images': len(gltf.get('images', [])),
    'bounds_blender_m': bounds, 'axis': 'glTF +Y up, +Z bow; meters',
    'source_triangles_selected': sum(p['source_triangles'] for p in provenance),
    'assembly': 'Source mesh coordinates plus Bambu source_offset_xyz; print-bed transforms discarded',
    'processing': 'Planar dissolve 0.3 degrees, bounded mesh decimation, static material batches; steering wheel independent',
    'custom_parts': ['Display-only open jet outlet, not the M-Jet pump'],
    'excluded': ['Dummy 13 driver (base figure absent)', 'M-Jet pump internals (absent)',
                 'Drybox and ESC mounts hidden under deck', 'Print stands/connectors',
                 'Alternative hull and trim angles', 'Floating driver harness buckle'],
    'release_status': 'Local conversion; public redistribution permission not established',
    'parts': provenance,
}
out.with_suffix('.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
print('RICO_EXPORT '+json.dumps({k:v for k,v in report.items() if k!='parts'}))

if args.render:
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 1200
    scene.render.resolution_percentage = 100
    scene.world.color = (.3, .3, .3)
    scene.view_settings.view_transform = 'AgX'
    floor = material('Studio floor', 'C5CFDB', .8)
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, bounds[2][0]-.004))
    bpy.context.object.data.materials.append(floor)
    for name, location, power, size in [('Key', (.5,-.6,1), 14, .7), ('Fill', (-.5,-.2,.5), 6, .6), ('Rim', (.1,.6,.7), 18, .5)]:
        data = bpy.data.lights.new(name, 'AREA')
        data.energy, data.shape, data.size = power, 'DISK', size
        light = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(light)
        light.location = location
        light.rotation_euler = (Vector((0,0,.02))-light.location).to_track_quat('-Z','Y').to_euler()
    camera_data = bpy.data.cameras.new('Inspection camera')
    camera = bpy.data.objects.new('Inspection camera', camera_data)
    bpy.context.collection.objects.link(camera)
    scene.camera = camera
    camera_data.type, camera_data.ortho_scale = 'ORTHO', .83
    for view, location in [('front', (.65,-.85,.56)), ('rear', (-.65,.85,.5)), ('side', (.9,-.06,.24)), ('top', (0,0,1))]:
        camera_data.ortho_scale = .94 if view == 'top' else .83
        camera.location = location
        camera.rotation_euler = (Vector((0,0,.035))-camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath = str(out.with_name('rico-'+view+'.png'))
        bpy.ops.render.render(write_still=True)
    # Preserve editable converted source, excluding the temporary studio.
    for obj in list(bpy.data.objects):
        if obj not in objects and obj != root:
            bpy.data.objects.remove(obj, do_unlink=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out.with_suffix('.blend')))
