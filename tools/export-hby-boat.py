"""Export the approved HBY .blend as a material-batched game asset.

Run Blender with --background --disable-autoexec --python this_script.py --
  --source /path/to/hby-kart-boat.blend --out public/models/hby-kart-boat.glb

The source is opened read-only and never saved. Only HBY_KART_BOAT is exported;
studio, cameras, lamps and reference curves are excluded. No custom properties
are exported because source metadata can include private workstation paths.
"""
import argparse
import json
import sys
from collections import Counter
from pathlib import Path

import bpy
from mathutils import Vector


def bounds(objects, depsgraph):
    # Control-curve bounding boxes can be much larger than the actual swept mesh.
    points = []
    for obj in objects:
        evaluated = obj.evaluated_get(depsgraph)
        data = evaluated.to_mesh()
        points.extend(evaluated.matrix_world @ vertex.co for vertex in data.vertices)
        evaluated.to_mesh_clear()
    lo = [min(point[i] for point in points) for i in range(3)]
    hi = [max(point[i] for point in points) for i in range(3)]
    return {"min": lo, "max": hi, "size": [hi[i] - lo[i] for i in range(3)]}


parser = argparse.ArgumentParser()
parser.add_argument("--source", required=True)
parser.add_argument("--out")
parser.add_argument("--inspect", action="store_true")
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
bpy.ops.wm.open_mainfile(filepath=str(Path(args.source).resolve()), load_ui=False)
collection = bpy.data.collections.get("HBY_KART_BOAT")
if collection is None:
    raise RuntimeError("Approved HBY_KART_BOAT collection not found")
scene = next(scene for scene in bpy.data.scenes if collection.name in scene.collection.children)
bpy.context.window.scene = scene
depsgraph = bpy.context.evaluated_depsgraph_get()
objects = [obj for obj in collection.all_objects
           if obj.type in {"MESH", "CURVE", "FONT", "SURFACE"} and not obj.hide_render]
landmarks = [obj for obj in objects if any(word in obj.name for word in
             ["Hull", "bow hatch", "Transom", "nozzle", "Nozzle", "Jet outlet"])]
report = {
    "source": Path(args.source).name,
    "collection": collection.name,
    "source_objects": len(objects),
    "object_types": dict(Counter(obj.type for obj in objects)),
    "bounds_blender_xyz": bounds(objects, depsgraph),
    "landmarks": {obj.name: bounds([obj], depsgraph) for obj in landmarks},
    "material_names": sorted({slot.material.name for obj in objects
                              for slot in obj.material_slots if slot.material}),
    "axis_contract": "Blender -Y is bow; glTF +Z is bow; glTF +Y is up",
    "excluded": [col.name for col in scene.collection.children if col != collection],
}
print("HBY_INSPECTION " + json.dumps(report, ensure_ascii=False))
if args.inspect:
    raise SystemExit(0)
if not args.out:
    parser.error("--out is required for export")

export_collection = bpy.data.collections.new("GAME_EXPORT_TEMP")
scene.collection.children.link(export_collection)
evaluated = []
for obj in objects:
    data = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph),
                                         preserve_all_data_layers=True, depsgraph=depsgraph)
    copy = bpy.data.objects.new(obj.name, data)
    export_collection.objects.link(copy)
    copy.matrix_world = obj.matrix_world.copy()
    evaluated.append(copy)

# Keep the original PBR materials and evaluated geometry, batching only draw calls.
batches = {}
for obj in evaluated:
    key = tuple(material.name for material in obj.data.materials)
    batches.setdefault(key, []).append(obj)
merged = []
for key, objects_in_batch in batches.items():
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects_in_batch:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects_in_batch[0]
    if len(objects_in_batch) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = "HBY_" + "_".join(key)
    merged.append(obj)

bpy.ops.object.select_all(action="DESELECT")
for obj in merged:
    obj.select_set(True)
out = Path(args.out).resolve()
out.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(out), export_format="GLB", use_selection=True,
                          use_active_scene=True, export_yup=True, export_apply=False,
                          export_extras=False, export_cameras=False, export_lights=False,
                          export_animations=False)
report.update({"exported_batches": len(merged), "bytes": out.stat().st_size})
print("HBY_EXPORT " + json.dumps(report, ensure_ascii=False))
