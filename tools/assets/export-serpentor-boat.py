"""Assemble the Serpentor print package into a self-contained local game GLB.

Blender --background --factory-startup --python tools/assets/export-serpentor-boat.py --
  --source /path/to/Serpentor_JetCar_v2 --out /path/to/serpentor-jetcar.glb --render

Source files are read-only. Explicit corrections below recover alternate/duplicate
parts that do not retain their final assembly positions in the Bambu projects.
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
from mathutils import Vector

parser = argparse.ArgumentParser()
parser.add_argument('--source', required=True)
parser.add_argument('--out', required=True)
parser.add_argument('--render', action='store_true')
args = parser.parse_args(sys.argv[sys.argv.index('--')+1:])
source, out = Path(args.source).resolve(), Path(args.out).resolve()
out.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
NS = {'c': 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02'}
PROD = '{http://schemas.microsoft.com/3dmanufacturing/production/2015/06}'
objects, provenance = [], []


def material(name, color, rough=.4, metal=0, alpha=1, emission=0):
    rgb = [int(color[i:i+2],16)/255 for i in (0,2,4)]
    rgb = [v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb]
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*rgb, alpha)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    for socket, value in [('Base Color',(*rgb,1)),('Roughness',rough),('Metallic',metal),('Alpha',alpha)]:
        bsdf.inputs[socket].default_value = value
    if alpha<1:
        mat.surface_render_method = 'DITHERED'
        mat.use_transparency_overlap = False
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*rgb,1)
        bsdf.inputs['Emission Strength'].default_value = emission
    return mat


mats = {
    'body': material('BodyPaint - mulberry metallic', 'B52C92', .28, .28),
    'dark': material('Graphite trim', '202730', .42, .15),
    'rubber': material('Tire and seal rubber', '12161B', .78),
    'cyan': material('Cyan accent', '25AFC8', .35, .22),
    'seat': material('Cyan seat upholstery', '267F9C', .68),
    'metal': material('Brushed alloy', 'BBC7D1', .28, .85),
    'wood': material('Warm walnut control trim', '986547', .45),
    'glass': material('Blue grey windshield', 'A7CCD9', .12, .05, .30),
    'lamp': material('Ivory headlight lens', 'DAE5EB', .24, .05, 1, .16),
    'red': material('Red tail lens', 'AF142B', .24, .1, 1, .14),
    'mirror': material('Mirror polished alloy', 'CBD5DD', .1, 1),
}
body_vertex=mats['body'].copy()
body_vertex.name='BodyPaint - continuous two tone'
body_vertex.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.34
color_node=body_vertex.node_tree.nodes.new('ShaderNodeVertexColor')
color_node.layer_name='Body finish'
body_vertex.node_tree.links.new(color_node.outputs['Color'],body_vertex.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])


def smoothstep(low,high,value):
    t=max(0,min(1,(value-low)/(high-low)))
    return t*t*(3-2*t)


def read_package(path):
    """Use source_offset values per mesh; compound-part source matrices already
    encode the same center displacement and must not be added a second time."""
    with zipfile.ZipFile(path) as z:
        settings = ET.fromstring(z.read('Metadata/model_settings.config'))
        root = ET.fromstring(z.read('3D/3dmodel.model'))
        resources = {o.get('id'):o for o in root.findall('c:resources/c:object',NS)}
        docs, stls = {}, {}
        for s in sorted(path.parent.rglob('*.stl')):
            with s.open('rb') as f:
                head = f.read(84)
            stls.setdefault(struct.unpack_from('<I',head,80)[0], []).append(s.stem)
        for setting in settings.findall('object'):
            oid = setting.get('id')
            ometa = {n.get('key'):n.get('value') for n in setting.findall('metadata')}
            for part in setting.findall('part'):
                pid = part.get('id')
                comp = next(c for c in resources[oid].findall('c:components/c:component',NS) if c.get('objectid')==pid)
                entry = comp.get(PROD+'path').lstrip('/')
                if entry not in docs:
                    docs[entry] = ET.fromstring(z.read(entry))
                mesh = next(o for o in docs[entry].findall('c:resources/c:object',NS) if o.get('id')==pid)
                meta = {n.get('key'):n.get('value') for n in part.findall('metadata')}
                offset = [float(meta['source_offset_'+a]) for a in 'xyz']
                verts = [tuple(float(v.get(a))+offset[i] for i,a in enumerate('xyz')) for v in mesh.findall('c:mesh/c:vertices/c:vertex',NS)]
                faces = [tuple(int(t.get(a)) for a in ('v1','v2','v3')) for t in mesh.findall('c:mesh/c:triangles/c:triangle',NS)]
                names = stls.get(len(faces),[ometa.get('name', 'part')])
                yield oid,pid,names[0],verts,faces,offset


def create_part(name, verts, faces, mat, cap=14000, preserve=False):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([(x/1000,y/1000,z/1000) for x,y,z in verts],[],faces)
    mesh.update()
    obj = bpy.data.objects.new(name,mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(mat)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    before = len(mesh.polygons)
    if not preserve and before>3500:
        mod = obj.modifiers.new('Planar CAD simplification','DECIMATE')
        mod.decimate_type='DISSOLVE'; mod.angle_limit=math.radians(.35)
        bpy.ops.object.modifier_apply(modifier=mod.name)
        obj.data.calc_loop_triangles()
        count = len(obj.data.loop_triangles)
        target = min(cap,max(1400,int(before*(.34 if cap==50000 else .12))))
        if count>target:
            mod=obj.modifiers.new('Game mesh reduction','DECIMATE')
            mod.ratio=target/count;mod.use_collapse_triangulate=True
            bpy.ops.object.modifier_apply(modifier=mod.name)
    for polygon in obj.data.polygons:
        polygon.use_smooth=True
    obj.data.set_sharp_from_angle(angle=math.radians(38))
    obj.select_set(False)
    objects.append(obj)
    return obj


for path in sorted(source.rglob('*.3mf')):
    rel=path.relative_to(source).as_posix()
    if rel.startswith(('5_Drybox','9_Stand')):
        continue
    for oid,pid,name,verts,faces,offset in read_package(path):
        mat=mats['dark']; corrections=[]; instances=[(verts,faces,name)]
        if rel.startswith('1_Hull'):
            if oid in ('8','10','12','14'): # Camera variant and concealed brackets.
                continue
            mat=mats['rubber'] if oid=='4' else mats['body']
            if oid=='6':
                verts=[(x-260,y,z) for x,y,z in verts]
                corrections.append('Alternate no-camera engine lid translated -260 mm X to centerline')
        elif rel.startswith('2_LID_Cabin'):
            if pid=='3': # Eight-triangle slicer modifier below the seat.
                continue
            if oid in ('5','11'):
                name='Seat left' if oid=='5' else 'Seat right'
                mat=mats['seat']
                if oid=='11':
                    verts=[(x+88,y,z) for x,y,z in verts]
                    corrections.append('Second seat instance translated +88 mm X')
            elif oid=='10':
                name='Seat branding '+pid
                mat=mats['dark'] if pid in ('6','7') else mats['metal']
            elif oid in ('29','31'):mat=mats['seat']
            elif oid in ('2','21','23','25'):mat=mats['cyan']
            elif oid=='15':mat=mats['body']
            elif oid in ('13','19'):mat=mats['wood']
        elif rel.startswith('3_LID_front_window'):
            if oid in ('2','12','14'):mat=mats['glass']
            elif oid=='4':mat=mats['cyan']
        elif rel.startswith('4_Exterior'):
            # Hidden duplicate connector pins are excluded, visible mirror halves retained.
            if oid in ('30','33','35','36','38','40'):continue
            if oid in ('8','20'):mat=mats['metal']
            elif oid in ('22','26'):mat=mats['mirror']
            elif oid=='6':name='Air scoop left'
        elif rel.startswith('6_LED'):
            if oid not in ('4','8','6','14','12','16','18','24'):continue
            if oid in ('4','8'):mat=mats['lamp']
            elif oid in ('12','16'):mat=mats['red']
        elif rel.startswith('7_tires'):
            if oid=='6':
                # Choose rim style 4 once; four original copies are print-bed duplicates.
                local=[(x-offset[0],y-offset[1],z-offset[2]) for x,y,z in verts]
                instances=[]
                for label,cx,cy in [('front left',-96.75,650),('front right',95.75,650),('rear left',-99.45,310),('rear right',99.45,310)]:
                    flip=-1 if cx>0 else 1
                    vv=[(cx+flip*x,cy+y,60+z) for x,y,z in local]
                    ff=[tuple(reversed(f)) for f in faces] if flip<0 else faces
                    instances.append((vv,ff,'Rim style 4 '+label))
                corrections.append('Style 4 rim fitted to four authored tire centers; opposite side mirrored')
                mat=mats['metal']
            elif oid in ('24','38','42','44'):mat=mats['rubber']
            elif oid in ('2','30','34','40'):mat=mats['metal'];name='Brake disc '+oid
            else:continue
        elif rel.startswith('8_trimtab'):
            # Original X is length, Y is width. Preserve the two-piece hinge relation.
            verts=[(y,616-x,z-20) for x,y,z in verts]
            corrections.append('Joint pair rotated X longitudinal to -Y, centered below stern; display-fit translation')
        if not(rel.startswith('7_tires') and oid=='6'):
            instances=[(verts,faces,name)]
        for vv,ff,partname in instances:
            cap=50000 if rel.startswith('1_Hull') else 7000 if partname.startswith('Rim') else 14000
            obj=create_part(partname+' ['+oid+':'+pid+']',vv,ff,mat,cap)
            if rel.startswith('1_Hull') and oid not in ('4','6'):
                obj.data.materials[0]=body_vertex
                # Continuous vertex-color interpolation avoids triangle-shaped
                # material boundaries at the lower lip and wheel arches.
                colors=obj.data.color_attributes.new(name='Body finish',type='FLOAT_COLOR',domain='POINT')
                paint=mats['body'].diffuse_color
                dark=mats['dark'].diffuse_color
                for vertex in obj.data.vertices:
                    c=vertex.co
                    lower=1-smoothstep(.050,.059,c.z)
                    side=(smoothstep(.083,.094,abs(c.x))*smoothstep(.290,.320,c.y)
                          *(1-smoothstep(.590,.620,c.y))*(1-smoothstep(.097,.110,c.z)))
                    amount=max(lower,side)
                    colors.data[vertex.index].color=tuple(paint[i]*(1-amount)+dark[i]*amount for i in range(3))+(1,)
            if partname.startswith('Rim'):
                obj.data.materials.append(mats['cyan'])
                cy=.650 if 'front' in partname else .310
                for polygon in obj.data.polygons:
                    c=polygon.center
                    radius=math.hypot(c.y-cy,c.z-.06)
                    if radius>.027:polygon.material_index=1
            provenance.append({'name':obj.name,'package':rel,'object':oid,'part':pid,'source_triangles':len(ff),'corrections':corrections})

# Center the authored hull and rotate around Z so Blender -Y is the bow.
hulls=[o for o in objects if o.name.startswith(('Hull1','Hull2','Hull3','Hull4'))]
hull_y=[v.co.y for o in hulls for v in o.data.vertices]
center_y=(min(hull_y)+max(hull_y))/2
for obj in objects:
    for v in obj.data.vertices:
        v.co.x=-v.co.x
        v.co.y=center_y-v.co.y

# Pump source is not included. Use a named, simple exterior-only outlet.
stern_y=center_y-min(hull_y)
verts=[];faces=[];n=48
for y,r in ((stern_y-.012,.032),(stern_y+.048,.018),(stern_y-.012,.028),(stern_y+.048,.014)):
    verts += [(math.cos(i*math.tau/n)*r*1000,y*1000,(.037+math.sin(i*math.tau/n)*r)*1000) for i in range(n)]
for a,b in ((0,n),(3*n,2*n),(n,3*n),(2*n,0)):
    for i in range(n):
        j=(i+1)%n;faces.append((a+i,a+j,b+j,b+i))
create_part('Custom display jet outlet - not M-Jet',verts,faces,mats['dark'],preserve=True)
# A small oval adapter fills the mounting opening left by the absent pump.
bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=12,location=(0,stern_y-.003,.047))
flange=bpy.context.object;flange.name='Custom display pump mounting adapter'
flange.scale=(.042,.009,.033)
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
flange.data.materials.append(mats['dark'])
for polygon in flange.data.polygons:polygon.use_smooth=True
# Use mesh coordinates consistently for bounds and batching.
for vertex in flange.data.vertices:vertex.co+=flange.location
flange.location=(0,0,0);objects.append(flange)

# Keep a named editable assembly, export copies batched by material signatures.
root=bpy.data.objects.new('Serpentor JetCar - closed cockpit - style 4 rims',None)
bpy.context.collection.objects.link(root)
for o in objects:o.parent=root
batches={};export_objects=[]
for o in objects:
    copy=o.copy();copy.data=o.data.copy();bpy.context.collection.objects.link(copy)
    key=(tuple(m.name for m in o.data.materials),'steering wheel' in o.name)
    batches.setdefault(key,[]).append(copy)
for (names,steering),batch in batches.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in batch:o.select_set(True)
    bpy.context.view_layer.objects.active=batch[0]
    if len(batch)>1:bpy.ops.object.join()
    o=bpy.context.view_layer.objects.active
    o.name='Serpentor steering wheel' if steering else 'Serpentor - '+' / '.join(names)
    export_objects.append(o)
bpy.ops.object.select_all(action='DESELECT')
for o in export_objects+[root]:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_yup=True,
    export_apply=True,export_extras=False,export_cameras=False,export_lights=False,export_animations=False)
for o in export_objects:bpy.data.objects.remove(o,do_unlink=True)
b=out.read_bytes();g=json.loads(b[20:20+struct.unpack_from('<I',b,12)[0]])
triangles=sum(g['accessors'][p['indices']]['count']//3 for m in g['meshes'] for p in m['primitives'])
bounds=[[min(v.co[i] for o in objects for v in o.data.vertices),max(v.co[i] for o in objects for v in o.data.vertices)] for i in range(3)]
report={'asset':out.name,'source_package':source.name,'source_author':'Scarface3D / ZeroHero79',
    'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'triangles':triangles,'meshes':len(g['meshes']),
    'materials':len(g['materials']),'primitives':sum(len(m['primitives']) for m in g['meshes']),
    'bounds_blender_m':bounds,'axis':'glTF +Y up, +Z bow, meters',
    'source_triangles_selected':sum(p['source_triangles'] for p in provenance),
    'processing':'Bambu source-offset assembly with recorded duplicate/alternate part corrections, planar dissolve and bounded decimation, PBR materials, batched meshes',
    'custom_parts':['Simple display jet outlet and mounting adapter; actual M-Jet35 pump is not in source package'],
    'excluded':['3 alternative rim styles','Camera-mount engine lid','Slicer seat modifiers','Print stand','Hidden connectors and electronics','Alternative/internal light sockets'],
    'release_status':'Local conversion; public redistribution permission not established','parts':provenance}
out.with_suffix('.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print('SERPENTOR_EXPORT '+json.dumps({k:v for k,v in report.items() if k!='parts'}))

if args.render:
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
    scene.render.resolution_x=1600;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
    scene.world.color=(.3,.3,.3);scene.view_settings.view_transform='AgX'
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,bounds[2][0]-.004))
    bpy.context.object.data.materials.append(material('Studio floor','C5CFDB',.8))
    for name,position,power,size in [('Key',(.5,-.6,1),16,.7),('Fill',(-.5,-.2,.5),7,.6),('Rim',(.1,.6,.7),20,.5)]:
        data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size
        light=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(light);light.location=position
        light.rotation_euler=(Vector((0,0,.05))-light.location).to_track_quat('-Z','Y').to_euler()
    data=bpy.data.cameras.new('Inspection camera');camera=bpy.data.objects.new('Inspection camera',data)
    bpy.context.collection.objects.link(camera);scene.camera=camera;data.type='ORTHO'
    for view,position in [('front',(.65,-.85,.6)),('rear',(-.65,.85,.5)),('side',(.9,0,.26)),('top',(0,0,1))]:
        data.ortho_scale=.96 if view=='top' else .88
        camera.location=position;camera.rotation_euler=(Vector((0,0,.07))-camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(out.with_name('serpentor-'+view+'.png'));bpy.ops.render.render(write_still=True)
    for o in list(bpy.data.objects):
        if o not in objects and o!=root:bpy.data.objects.remove(o,do_unlink=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out.with_suffix('.blend')))
