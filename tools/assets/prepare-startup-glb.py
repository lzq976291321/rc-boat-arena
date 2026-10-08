#!/usr/bin/env python3
"""Prepare a separate GLB for startup: bounded textures and optional node subset.

No simplification: selected mesh indices, vertex attributes, node transforms and
materials remain unchanged. Texture resampling uses Pillow Lanczos. RGBA alpha
is kept in PNG; opaque images may use JPEG. Run bound-startup-glb.mjs afterwards.
"""
import argparse
import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import struct
from types import SimpleNamespace

from PIL import Image

spec = importlib.util.spec_from_file_location('optimize_glb', Path(__file__).with_name('optimize-glb.py'))
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)


def subset(document, payloads, names):
    if not names:
        return document, payloads
    if document.get('skins') or document.get('animations'):
        raise ValueError('Node subset does not support skins or animations')
    nodes = document.get('nodes', [])
    selected = {i for i, node in enumerate(nodes) if node.get('name') in names}
    missing = set(names) - {nodes[i].get('name') for i in selected}
    if missing:
        raise ValueError(f'Missing nodes: {sorted(missing)}')
    def descendants(index):
        selected.add(index)
        for child in nodes[index].get('children', []):
            descendants(child)
    for i in list(selected):
        descendants(i)
    keep = set(selected)
    while True:
        parents = {i for i, node in enumerate(nodes) if any(c in keep for c in node.get('children', []))}
        if parents <= keep:
            break
        keep |= parents
    for i, node in enumerate(nodes):
        if i not in selected:
            node.pop('mesh', None)
    mapping = {old: new for new, old in enumerate(sorted(keep))}
    document['nodes'] = [node for i, node in enumerate(nodes) if i in keep]
    for node in document['nodes']:
        if 'children' in node:
            node['children'] = [mapping[c] for c in node['children'] if c in keep]
    for scene in document.get('scenes', []):
        scene['nodes'] = [mapping[i] for i in scene.get('nodes', []) if i in keep]

    def prune(key, ids):
        mapping = {old: new for new, old in enumerate(sorted(ids))}
        document[key] = [item for i, item in enumerate(document.get(key, [])) if i in ids]
        return mapping
    mesh_map = prune('meshes', {n['mesh'] for n in document['nodes'] if 'mesh' in n})
    for node in document['nodes']:
        if 'mesh' in node:
            node['mesh'] = mesh_map[node['mesh']]
    primitives = [p for m in document['meshes'] for p in m['primitives']]
    mat_map = prune('materials', {p['material'] for p in primitives if 'material' in p})
    for p in primitives:
        if 'material' in p:
            p['material'] = mat_map[p['material']]
    texture_refs = []
    def visit(item):
        if isinstance(item, dict):
            for key, value in item.items():
                if key.endswith('Texture') and isinstance(value, dict) and 'index' in value:
                    texture_refs.append(value)
                visit(value)
        elif isinstance(item, list):
            for value in item:
                visit(value)
    visit(document.get('materials', []))
    tex_map = prune('textures', {r['index'] for r in texture_refs})
    for ref in texture_refs:
        ref['index'] = tex_map[ref['index']]
    image_map = prune('images', {t['source'] for t in document['textures'] if 'source' in t})
    for texture in document['textures']:
        if 'source' in texture:
            texture['source'] = image_map[texture['source']]
    sampler_map = prune('samplers', {t['sampler'] for t in document['textures'] if 'sampler' in t})
    for texture in document['textures']:
        if 'sampler' in texture:
            texture['sampler'] = sampler_map[texture['sampler']]
    accessor_refs = []
    for p in primitives:
        accessor_refs.extend((p['attributes'], key) for key in p['attributes'])
        if 'indices' in p:
            accessor_refs.append((p, 'indices'))
        for target in p.get('targets', []):
            accessor_refs.extend((target, key) for key in target)
    acc_map = prune('accessors', {obj[key] for obj, key in accessor_refs})
    for obj, key in accessor_refs:
        obj[key] = acc_map[obj[key]]
    view_refs = []
    for item in [*document['accessors'], *document['images']]:
        if 'bufferView' in item:
            view_refs.append(item)
        if 'sparse' in item:
            view_refs.extend([item['sparse']['indices'], item['sparse']['values']])
    views = {ref['bufferView'] for ref in view_refs}
    view_map = prune('bufferViews', views)
    for ref in view_refs:
        ref['bufferView'] = view_map[ref['bufferView']]
    return document, [p for i, p in enumerate(payloads) if i in views]


def accessor_values(document, payloads, accessor):
    if 'sparse' in accessor:
        raise ValueError('Only dense accessors are supported')
    formats = {5120: 'b', 5121: 'B', 5122: 'h', 5123: 'H', 5125: 'I', 5126: 'f'}
    widths = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
    fmt = '<' + formats[accessor['componentType']] * widths[accessor['type']]
    length = struct.calcsize(fmt)
    view = document['bufferViews'][accessor['bufferView']]
    stride = view.get('byteStride', length)
    data = payloads[accessor['bufferView']]
    offset = accessor.get('byteOffset', 0)
    return [struct.unpack_from(fmt, data, offset + i * stride) for i in range(accessor['count'])]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--max-texture-size', type=int, default=512)
    parser.add_argument('--node', action='append', default=[])
    options = parser.parse_args()
    if options.max_texture_size < 16:
        parser.error('max texture size must be at least 16')
    if len({options.source.resolve(), options.output.resolve(), options.report.resolve()}) != 3:
        parser.error('Source, output and report must use separate paths')
    original, doc, binary = base.read_glb(options.source)
    doc = copy.deepcopy(doc)
    if any(view.get('extensions') or view.get('buffer', 0) != 0 for view in doc['bufferViews']):
        raise ValueError('Only uncompressed input GLB is supported')
    payloads = [binary[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']] for v in doc['bufferViews']]
    original_nodes = [n.get('name') for n in doc.get('nodes', [])]
    doc, payloads = subset(doc, payloads, options.node)
    selected_doc, selected_payloads = copy.deepcopy(doc), list(payloads)
    roles = base.texture_roles(doc)
    images = []
    encoding = SimpleNamespace(opaque_png_jpeg=True, color_quality=85, data_quality=92, color_psnr=32, data_psnr=37)
    for i, image in enumerate(doc.get('images', [])):
        view = image['bufferView']
        data = payloads[view]
        texture = Image.open(io.BytesIO(data))
        texture.load()
        original_size = texture.size
        original_bytes = len(data)
        if max(texture.size) > options.max_texture_size:
            texture.thumbnail((options.max_texture_size, options.max_texture_size), Image.Resampling.LANCZOS)
            stream = io.BytesIO()
            texture.save(stream, 'PNG')
            data = stream.getvalue()
        payloads[view], image['mimeType'], report = base.optimize_image(data, image['mimeType'], roles[i], encoding)
        images.append({'index': i, 'original_dimensions': original_size,
            'output_dimensions': texture.size, 'source_bytes': original_bytes,
            'resampling': 'Lanczos' if texture.size != original_size else None,
            'encoding_comparison': 'error and alpha preservation measured against downsampled texture', **report})
    narrowed = base.compact_indices(doc, payloads)
    packed = bytearray()
    for view, payload in zip(doc['bufferViews'], payloads):
        packed.extend(b'\0' * (-len(packed) % 4))
        view.update(byteOffset=len(packed), byteLength=len(payload))
        packed.extend(payload)
    doc['buffers'][0]['byteLength'] = len(packed)
    packed.extend(b'\0' * (-len(packed) % 4))
    document = json.dumps(doc, separators=(',', ':'), ensure_ascii=False).encode()
    document += b' ' * (-len(document) % 4)
    output = (struct.pack('<III', 0x46546C67, 2, 28 + len(document) + len(packed))
        + struct.pack('<II', len(document), 0x4E4F534A) + document
        + struct.pack('<II', len(packed), 0x004E4942) + packed)
    options.output.parent.mkdir(parents=True, exist_ok=True)
    options.output.write_bytes(output)
    _, checked_doc, checked_binary = base.read_glb(options.output)
    checked_payloads = [checked_binary[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
                        for v in checked_doc['bufferViews']]
    for index, accessor in enumerate(selected_doc.get('accessors', [])):
        assert accessor_values(selected_doc, selected_payloads, accessor) == accessor_values(
            checked_doc, checked_payloads, checked_doc['accessors'][index]), f'Accessor {index} changed'
    for key in ('scene', 'scenes', 'nodes', 'meshes', 'materials', 'textures', 'samplers', 'skins', 'animations'):
        assert selected_doc.get(key) == checked_doc.get(key), f'{key} changed after selection'
    report = {'source': str(options.source), 'output': str(options.output),
        'parameters': {'max_texture_size': options.max_texture_size, 'resampling': 'Lanczos',
            'opaque_png_jpeg': True, 'color_quality': 85, 'data_quality': 92,
            'color_psnr': 32, 'data_psnr': 37, 'compact_indices': True},
        'source_sha256': hashlib.sha256(original).hexdigest(), 'output_sha256': hashlib.sha256(output).hexdigest(),
        'original_bytes': len(original), 'output_bytes': len(output), 'selected_node_names': options.node,
        'original_nodes': original_nodes, 'output_nodes': [n.get('name') for n in doc.get('nodes', [])],
        'primitives': [{'mesh': m.get('name'), 'triangles': (doc['accessors'][p['indices']]['count'] if 'indices' in p else doc['accessors'][p['attributes']['POSITION']]['count']) // 3,
            'mode': p.get('mode', 4)} for m in doc.get('meshes', []) for p in m['primitives']],
        'indices_narrowed': narrowed, 'images': images}
    report['verification'] = {'all_selected_accessor_values_exact': True,
        'selected_nodes_transforms_materials_exact': True, 'output_glb_readback_checked': True}
    options.report.parent.mkdir(parents=True, exist_ok=True)
    options.report.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'source': str(options.source), 'output_bytes': len(output), 'images': len(images)}))


if __name__ == '__main__':
    main()
