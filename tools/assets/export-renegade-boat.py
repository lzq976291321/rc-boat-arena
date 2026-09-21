"""Restore Renegade Jet print projects to a materialized, self-contained local GLB.

Blender --background --factory-startup --python tools/assets/export-renegade-boat.py --
  --source /path/to/renegade-rc-jet-boat-catamaran --out /path/to/renegade-jet.glb --render

Source ZIPs are read-only. Hull joints, lid placement and trim-tab hinges were
recovered from source geometry and the included Jet assembly manual.
"""
import argparse, hashlib, json, math, struct, sys, zipfile
from io import BytesIO
from pathlib import Path
import xml.etree.ElementTree as ET
import bpy
import numpy as np
from mathutils import Vector

parser=argparse.ArgumentParser()
parser.add_argument('--source',required=True);parser.add_argument('--out',required=True)
parser.add_argument('--render',action='store_true')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
source,out=Path(args.source).resolve(),Path(args.out).resolve();out.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
NS={'c':'http://schemas.microsoft.com/3dmanufacturing/core/2015/02'}
PROD='{http://schemas.microsoft.com/3dmanufacturing/production/2015/06}'
MAIN='Renegade_Jet_and_Flexdrive_rc_boat.zip'
WING='Requested_update_Spoiler_07-10-25.zip'
objects,provenance=[],[]
HULL_LENGTH=809.30841

def parts(archive,needle):
    with zipfile.ZipFile(source/archive) as outer:
        path=next(n for n in outer.namelist() if n.endswith(needle))
        with zipfile.ZipFile(BytesIO(outer.read(path))) as z:
            config=ET.fromstring(z.read('Metadata/model_settings.config'))
            root=ET.fromstring(z.read('3D/3dmodel.model'))
            resources={o.get('id'):o for o in root.findall('c:resources/c:object',NS)}
            for obj in config.findall('object'):
                for part in obj.findall('part'):
                    if part.get('subtype')!='normal_part':continue
                    meta={n.get('key'):n.get('value') for n in part.findall('metadata')}
                    comp=next(c for c in resources[obj.get('id')].findall('c:components/c:component',NS) if c.get('objectid')==part.get('id'))
                    doc=ET.fromstring(z.read(comp.get(PROD+'path').lstrip('/')))
                    mesh=next(x for x in doc.findall('c:resources/c:object',NS) if x.get('id')==part.get('id'))
                    v=np.array([[float(x.get(a)) for a in 'xyz'] for x in mesh.findall('c:mesh/c:vertices/c:vertex',NS)])
                    f=np.array([[int(x.get(a)) for a in ('v1','v2','v3')] for x in mesh.findall('c:mesh/c:triangles/c:triangle',NS)])
                    offset=np.array([float(meta.get('source_offset_'+a,0)) for a in 'xyz'])
                    matrix=np.array([float(x) for x in comp.get('transform').split()]).reshape(4,3)
                    yield part.get('id'),v,f,offset,matrix

def material(name,hexcolor,rough=.4,metal=0):
    rgb=[int(hexcolor[i:i+2],16)/255 for i in (0,2,4)]
    rgb=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb]
    m=bpy.data.materials.new(name);m.diffuse_color=(*rgb,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,1)
    p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    return m
mats={'paint':material('Azure blue hull paint','067AA8',.28,.3),
      'deck':material('Pearl upper deck','DDE6E8',.35,.15),
      'dark':material('Graphite hardware','18232B',.4,.2),
      'rubber':material('Black seal rubber','11171C',.8),
      'metal':material('Brushed marine alloy','B8C7D4',.26,.82),
      'cyan':material('Cyan accent','26C5DD',.3,.22),
      'carbon':material('Carbon canopy and wing','262D34',.32,.2)}
# Self-contained procedural carbon weave; no external texture dependency.
n=256;yy,xx=np.mgrid[:n,:n];tiles=((xx//16+yy//16)%2)==0
wave=np.where(tiles,(xx%16)/16,(yy%16)/16)
shade=.12+.045*np.sin(wave*np.pi)+.015*np.cos((xx+yy)*np.pi/2)
pixels=np.stack([shade*.85,shade*.94,shade,np.ones_like(shade)],axis=-1).astype(np.float32)
image=bpy.data.images.new('Carbon weave',width=n,height=n,alpha=True)
image.pixels.foreach_set(pixels.ravel());image.pack()
tex=mats['carbon'].node_tree.nodes.new('ShaderNodeTexImage');tex.image=image;tex.extension='REPEAT'
mats['carbon'].node_tree.links.new(tex.outputs['Color'],mats['carbon'].node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
for key in ('paint','deck','carbon'):
    bs=mats[key].node_tree.nodes.get('Principled BSDF');bs.inputs['Coat Weight'].default_value=.3;bs.inputs['Coat Roughness'].default_value=.22

stern_material=mats['paint'].copy();stern_material.name='Continuous blue pearl stern paint'
color_node=stern_material.node_tree.nodes.new('ShaderNodeVertexColor');color_node.layer_name='Stern paint'
stern_material.node_tree.links.new(color_node.outputs['Color'],stern_material.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])

def smoothstep(a,b,value):
    t=max(0,min(1,(value-a)/(b-a)));return t*t*(3-2*t)

def mesh_part(name,verts,faces,mat,cap=18000,keep=False,record=None):
    # Assembly X-long/Y-wide/Z-up -> Blender X-wide/-Y-bow/Z-up, meters.
    v=np.asarray(verts);v=np.column_stack((-v[:,1],v[:,0]-HULL_LENGTH/2,v[:,2]))/1000
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(v.tolist(),[],[list(face) for face in faces]);mesh.update()
    o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);mesh.materials.append(mat)
    bpy.context.view_layer.objects.active=o;o.select_set(True);before=len(mesh.polygons)
    print('PROCESS',name,'source faces',before,flush=True)
    if not keep and before>3500:
        # Limited dissolve becomes quadratic on heavily triangulated CAD planes.
        # Collapse directly keeps processing bounded and avoids giant n-gons.
        target=min(cap,max(2000,int(before*.3)))
        if before>target:
            m=o.modifiers.new('Bounded game reduction','DECIMATE');m.ratio=target/before;m.use_collapse_triangulate=True
            bpy.ops.object.modifier_apply(modifier=m.name)
    print('SIMPLIFIED',name,len(o.data.polygons),flush=True)
    for p in o.data.polygons:p.use_smooth=True
    o.data.set_sharp_from_angle(angle=math.radians(38))
    if name.startswith(('Hull','Low canopy')):
        m=o.modifiers.new('Stable hard-surface normals','WEIGHTED_NORMAL')
        m.keep_sharp=True;m.weight=50;m.thresh=.01
        bpy.ops.object.modifier_apply(modifier=m.name)
    o.select_set(False);objects.append(o)
    if record:provenance.append(dict(name=name,source_triangles=before,**record))
    return o

def carbon_uv(obj):
    uv=obj.data.uv_layers.new(name='Weave UV')
    for loop in obj.data.loops:
        p=obj.data.vertices[loop.vertex_index].co;uv.data[loop.index].uv=(p.x*22,p.y*22)

# Exact source geometry is preserved at the three joints. Build transforms are
# printer plate placements; source offsets are NOT used for these oriented hulls.
hull_transforms={1:((-1,1,1),(118.137505,0,0)),2:((1,1,-1),(329.77601,0,2.5434)),
                 3:((-1,-1,-1),(521.27501,0,-2.5475)),4:((1,1,-1),(722.79171,0,-1.8706))}
for i in range(1,5):
    archive=MAIN if i<4 else 'UPDATE_19-10-24_Hull4_correction.zip'
    file=f'Renegade_Jet_hull{i}.3mf' if i<4 else 'Renegade_Jet_hull4-v2.3mf'
    for pid,v,f,offset,matrix in parts(archive,file):
        p=v@matrix[:3]+matrix[3]
        q=np.column_stack((p[:,2],(-p[:,0]+p[:,1])/math.sqrt(2),(p[:,0]+p[:,1])/math.sqrt(2)))
        signs,t=hull_transforms[i];q=q*np.array(signs)+t
        o=mesh_part(f'Hull {i} part {pid}',q,f,mats['paint'],60000,record={'archive':archive,'file':file,'part':pid,'transform':{'signs':signs,'translation_mm':t}})
        if i==4:
            o.data.materials[0]=stern_material
            colors=o.data.color_attributes.new(name='Stern paint',type='FLOAT_COLOR',domain='POINT')
            for v in o.data.vertices:
                amount=smoothstep(.35,.8,v.normal.z)*smoothstep(.003,.012,v.co.z)
                colors.data[v.index].color=tuple(mats['paint'].diffuse_color[j]*(1-amount)+mats['deck'].diffuse_color[j]*amount for j in range(3))+(1,)
        else:
            o.data.materials.append(mats['deck'])
            for face in o.data.polygons:
                if face.normal.z>.55 and face.center.z>.008:face.material_index=1

# Two low lids form a single coherent source assembly. Do not duplicate the
# high lids or the alternative rear lids in the same closed-cockpit version.
for pid,v,f,offset,m in parts(WING,'Renegade_Lid_spoiler.3mf'):
    p=v+offset
    q=np.column_stack((p[:,1]+290.56,-(p[:,0]+214.7107811),p[:,2]+41.1))
    o=mesh_part('Low canopy '+pid,q,f,mats['carbon'],25000,record={'archive':WING,'file':'Renegade_Lid_spoiler.3mf','part':pid,'placement':'Matched rear lock holes and front recess'})
    carbon_uv(o)

# The two spoiler components retain their original CAD relation. Mount the
# slatted base on the sloping rear lid, with the aerodynamic wing above it.
for pid,v,f,offset,m in parts(WING,'Spoiler.3mf'):
    q=v+offset+np.array((152,-105.7604389,-136.9))
    o=mesh_part('Spoiler base' if pid=='1' else 'Spoiler wing',q,f,mats['dark'] if pid=='1' else mats['carbon'],11000,
        record={'archive':WING,'file':'Spoiler.3mf','part':pid,'placement':'Original two-part relation, translated onto rear canopy'})
    if pid=='3':carbon_uv(o)

# Hinge-aligned accessory transforms, measured from source cylinders and planes.
TAB_TRANSFORMS = {'right': {'bracket': '4',
           'plate': '11',
           'parts': {'4': {'R': [[0.9995861943141451, 0.0022398459552653823, 0.02867792228633134],
                                 [-0.012383888192851843, 0.933351592600847, 0.35874983470754335],
                                 [-0.025963040072208857, -0.35895652616933904, 0.9329931044068062]],
                           'source_offset': [576.4921417236328, 201.6534881591797, 112.02021789550781],
                           'translation_after_rotation': [-550.8799686897571,
                                                          -216.0178943901045,
                                                          -0.50295630213068],
                           'bounds': [[0.0, -23.109315707107896, 0.0],
                                      [58.324657011932004, 23.109315707107896, 39.822521390031724]]},
                     '11': {'R': [[0.9995861943141451, 0.0022398459552653823, 0.02867792228633134],
                                  [-0.012383888192851843, 0.933351592600847, 0.35874983470754335],
                                  [-0.025963040072208857, -0.35895652616933904, 0.9329931044068062]],
                            'source_offset': [662.1348571777344, 201.19522857666016, 88.4377555847168],
                            'translation_after_rotation': [-602.5109664385308,
                                                           -211.13729122104525,
                                                           12.286895260431834],
                            'bounds': [[8.796952136462778, -25.67092825813134, 0.0015769612779787945],
                                       [115.95969117496293, 22.937932689261572, 14.001588635786424]]}},
           'plate_fit_translation': [-51.63099774877369, 4.8806031690592455, 12.789851562562514],
           'hinge_axis': [0.766044443118978, -0.6427876096865393, 0.0],
           'hinge_gap_mm': 0.25,
           'hinge_radii_mm': {'4': 1.399939128126674, '11': 1.4999983144410107}},
 'left': {'bracket': '1',
          'plate': '7',
          'parts': {'1': {'R': [[0.9997709406675843, 0.004827712290453797, 0.020850884650156585],
                                [0.0031057105852359814, 0.9311911726513566, -0.3645179756033331],
                                [-0.021175947639109027, 0.3644992361723574, 0.9309628811458348]],
                          'source_offset': [575.8203582763672, 11.517652034759521, 112.63209915161133],
                          'translation_after_rotation': [-548.922921518855, 23.316994744269124, -80.4777878766618],
                          'bounds': [[0.0, -23.09794012308692, 0.0],
                                     [58.488388083345285, 23.09794012308692, 39.82225479470824]]},
                    '7': {'R': [[0.9997709406675843, 0.004827712290453797, 0.020850884650156585],
                                [0.0031057105852359814, 0.9311911726513566, -0.3645179756033331],
                                [-0.021175947639109027, 0.3644992361723574, 0.9309628811458348]],
                          'source_offset': [662.2270202636719, 10.14333200454712, 88.5524673461914],
                          'translation_after_rotation': [-601.3925821995318,
                                                         20.518225501081837,
                                                         -66.8676128861278],
                          'bounds': [[8.960206906652388, -22.928060273454058, 0.0014087152861606],
                                     [116.1229811007878, 25.680801355353474, 14.001424840208259]]}},
          'plate_fit_translation': [-52.469660680676824, -2.7987692431872873, 13.610174990533991],
          'hinge_axis': [0.766044443118978, 0.6427876096865393, 0.0],
          'hinge_gap_mm': 0.25,
          'hinge_radii_mm': {'1': 1.3999317936440725, '7': 1.4999963122685123}}}
for pid,v,f,offset,m in parts(MAIN,'Renegade_Jet_FD_trimtaps.3mf'):
    side='right' if pid in ('4','11') else 'left';fit=TAB_TRANSFORMS[side]['parts'][pid]
    q=(v+fit['source_offset'])@np.array(fit['R']).T+fit['translation_after_rotation']
    # Reintroduce the authored V-bottom cant, then register the three mounting
    # holes to the hull. The hinge pair stays together under this rigid transform.
    mount=np.array(TAB_TRANSFORMS[side]['parts']['4' if side=='right' else '1']['R'])
    mount_origin=(741.05277,98.96229,-38.08832) if side=='right' else (742.471152,-98.174926,-37.912018)
    q=q@mount+np.array(mount_origin)
    mesh_part('Trim '+side+(' bracket' if pid in ('4','1') else ' plate'),q,f,mats['dark'],10000,
        record={'archive':MAIN,'file':'Renegade_Jet_FD_trimtaps.3mf','part':pid,'fit':fit,'hull_mount_rotation':mount.tolist(),'hull_mount_origin_mm':mount_origin})

for pid,v,f,offset,m in parts(MAIN,'Renegade_Jet_FD_finns_set.3mf'):
    if pid not in ('5','7'):continue
    q=v+offset;side=1 if pid=='7' else -1
    q+=np.array((736.647-q[:,0].max(),side*123-q[:,1].mean(),-15.416-q[:,2].max()))
    mesh_part('Medium turn fin '+pid,q,f,mats['metal'],keep=True,
        record={'archive':MAIN,'file':'Renegade_Jet_FD_finns_set.3mf','part':pid,'placement':'Medium fin matches last three hull screw holes, X shift -36.353 mm and Z +5.584 mm from initial display fit'})
for pid,v,f,offset,m in parts(MAIN,'MJet35_rideplate_alternativ1.3mf'):
    # Source X is plate length, Y is its transverse width.
    p=v+offset;p-=((p.min(0)+p.max(0))/2)
    q=np.column_stack((p[:,0]+843,p[:,1],p[:,2]-45))
    mesh_part('Central rideplate',q,f,mats['dark'],6000,
        record={'archive':MAIN,'file':'MJet35_rideplate_alternativ1.3mf','part':pid})

# Exterior-only custom pump housing and nozzle; original M-Jet35 is not included.
def tube(name,rings,mat,n=48):
    vertices=[];faces=[]
    for x,r,z in rings:vertices.extend([(x,math.cos(a*math.tau/n)*r,z+math.sin(a*math.tau/n)*r) for a in range(n)])
    for a in range(len(rings)):
        b=(a+1)%len(rings)
        for i in range(n):j=(i+1)%n;faces.append((a*n+i,a*n+j,b*n+j,b*n+i))
    return mesh_part(name,vertices,faces,mat,keep=True)
tube('Custom display pump housing',[(802,29,-13),(842,27,-13),(842,22,-13),(802,24,-13)],mats['dark'])
tube('Custom display nozzle',[(839,23,-13),(888,17,-13),(888,13,-13),(839,19,-13)],mats['metal'])
tube('Custom display pump collar',[(805,31,-13),(813,31,-13),(813,28,-13),(805,28,-13)],mats['cyan'])
# Seal the gap around the omitted pump interface with an interior black plate.
mesh_part('Custom hidden pump aperture backing',[(808,-36,-44),(808,36,-44),(808,36,20),(808,-36,20)],[(0,1,2,3)],mats['rubber'],keep=True)
# Two low-profile lock knobs, modeled for presentation.
for side in (-1,1):
    pos=(779,side*35,20)
    vertices=[];faces=[]
    for z,r in ((0,5.2),(2.5,5.2),(3.2,3.8)):
        vertices.extend([(pos[0]+r*math.cos(i*math.tau/12),pos[1]+r*math.sin(i*math.tau/12),pos[2]+z) for i in range(12)])
    for k in (0,1):
        for i in range(12):j=(i+1)%12;faces.append((k*12+i,k*12+j,(k+1)*12+j,(k+1)*12+i))
    faces.append(tuple(range(24,36)))
    mesh_part('Custom deck lock knob '+str(side),vertices,faces,mats['metal'],keep=True)

root=bpy.data.objects.new('Renegade Jet - low canopy with spoiler',None);bpy.context.collection.objects.link(root)
for o in objects:o.parent=root
batches={};export_objects=[]
for o in objects:
    copy=o.copy();copy.data=o.data.copy();bpy.context.collection.objects.link(copy)
    key=tuple(m.name for m in o.data.materials);batches.setdefault(key,[]).append(copy)
for names,batch in batches.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in batch:o.select_set(True)
    bpy.context.view_layer.objects.active=batch[0]
    if len(batch)>1:bpy.ops.object.join()
    o=bpy.context.view_layer.objects.active;o.name='Renegade - '+' / '.join(names);export_objects.append(o)
bpy.ops.object.select_all(action='DESELECT')
for o in export_objects+[root]:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_yup=True,
    export_apply=True,export_extras=False,export_cameras=False,export_lights=False,export_animations=False)
for o in export_objects:bpy.data.objects.remove(o,do_unlink=True)
b=out.read_bytes();g=json.loads(b[20:20+struct.unpack_from('<I',b,12)[0]])
triangles=sum(g['accessors'][p['indices']]['count']//3 for m in g['meshes'] for p in m['primitives'])
bounds=[[min(v.co[i] for o in objects for v in o.data.vertices),max(v.co[i] for o in objects for v in o.data.vertices)] for i in range(3)]
report={'asset':out.name,'source_package':source.name,'source_author':'ZeroHero79',
    'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'triangles':triangles,'meshes':len(g['meshes']),
    'materials':len(g['materials']),'embedded_images':len(g.get('images',[])),
    'primitives':sum(len(m['primitives']) for m in g['meshes']),
    'bounds_blender_m':bounds,'axis':'glTF +Y up, +Z bow, meters',
    'hull_dimensions_mm':[809.30841,243.22004,98.79295],
    'source_triangles_selected':sum(p['source_triangles'] for p in provenance),
    'processing':'Four print-oriented hull segments restored at geometric joints; low lids and spoiler; hinge-fitted medium trim tabs; PBR and embedded carbon texture; bounded decimation',
    'custom_parts':['Exterior-only pump housing, nozzle, collar, hidden backing and two deck lock knobs; not original M-Jet35'],
    'excluded':['FlexDrive and blank hulls','High lids and alternate rear lids','Print stands','Slicer modifiers','Hidden electronics, TPU sealing lids and internal connectors','Unused alternate fins, trim tabs and rideplates'],
    'release_status':'Local conversion; public redistribution permission not established','parts':provenance}
out.with_suffix('.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print('RENEGADE_EXPORT '+json.dumps({k:v for k,v in report.items() if k!='parts'}))

if args.render:
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
    scene.render.resolution_x=1600;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
    scene.world.color=(.3,.3,.3);scene.view_settings.view_transform='AgX'
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,bounds[2][0]-.004))
    bpy.context.object.data.materials.append(material('Studio floor','C5CFDB',.8))
    for name,position,power,size in [('Key',(.6,-.8,1.2),24,.8),('Fill',(-.6,-.2,.7),12,.7),('Rim',(.1,.7,.9),28,.6)]:
        data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size
        light=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(light);light.location=position
        light.rotation_euler=(Vector((0,0,.03))-light.location).to_track_quat('-Z','Y').to_euler()
    data=bpy.data.cameras.new('Inspection camera');camera=bpy.data.objects.new('Inspection camera',data)
    bpy.context.collection.objects.link(camera);scene.camera=camera;data.type='ORTHO'
    for view,position in [('front',(.7,-1,.7)),('rear',(-.7,1,.55)),('side',(1,0,.20)),('top',(0,0,1.2))]:
        data.ortho_scale=1.3 if view=='top' else 1.12
        camera.location=position;camera.rotation_euler=(Vector((0,.03,.025))-camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(out.with_name('renegade-'+view+'.png'));bpy.ops.render.render(write_still=True)
    for o in list(bpy.data.objects):
        if o not in objects and o!=root:bpy.data.objects.remove(o,do_unlink=True)
bpy.ops.wm.save_as_mainfile(filepath=str(out.with_suffix('.blend')))
