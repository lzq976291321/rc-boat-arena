import * as THREE from 'three';
import { loadGLTF } from '../../shared/assets/gltf.js';
import { disposeObjects } from '../../shared/rendering/resources.js';

/** Scene-owned static model, centered in XZ with its base at Y=0. */
export async function loadSceneryModel(path, { nodeNames } = {}) {
  // Relative to the racing page, including the prefixed DSH mount.
  const gltf = await loadGLTF(path.replace(/^\//, ''), { delivery: 'scene' });
  const group = new THREE.Group();
  group.name = path;
  try {
    gltf.scene.updateMatrixWorld(true);
    const roots = nodeNames ? nodeNames.map(name => {
      const node = gltf.scene.getObjectByName(name);
      if (!node) throw new Error(`Missing scenery node ${name}: ${path}`);
      return node;
    }) : [gltf.scene];
    const selected = new Set(), bounds = new THREE.Box3(), vertex = new THREE.Vector3();
    roots.forEach(root => root.traverse(mesh => {
      if (!mesh.isMesh || mesh.isSkinnedMesh) return;
      selected.add(mesh);
      const positions = mesh.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        vertex.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
        bounds.expandByPoint(vertex);
      }
    }));
    const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
    if (!selected.size || ![size.x, size.y, size.z].every(v => Number.isFinite(v) && v > 0)) {
      throw new Error(`Invalid scenery bounds: ${path}`);
    }
    const normalize = new THREE.Matrix4().makeTranslation(-center.x, -bounds.min.y, -center.z);
    const materials = new Map(), usedTextures = new Set(), allTextures = new Set();
    gltf.scene.traverse(mesh => {
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        for (const value of Object.values(material || {})) if (value?.isTexture) allTextures.add(value);
      }
    });
    const materialFor = original => {
      if (!materials.has(original)) {
        const material = original.clone();
        for (const value of Object.values(material)) if (value?.isTexture) {
          value.anisotropy = Math.max(value.anisotropy, 4);
          usedTextures.add(value);
        }
        // Keep the source's PBR maps and cutout leaves, without transparent sorting.
        if (material.alphaTest > 0) {
          material.transparent = false;
          material.side = THREE.DoubleSide;
        }
        materials.set(original, material);
      }
      return materials.get(original);
    };
    for (const source of selected) {
      const geometry = source.geometry.clone().applyMatrix4(normalize.clone().multiply(source.matrixWorld));
      const material = Array.isArray(source.material) ? source.material.map(materialFor) : materialFor(source.material);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = source.name;
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    }
    group.userData.size = { x: size.x, y: size.y, z: size.z };
    group.userData.source = path;
    // Geometry/material copies are ours; texture images stay shared by this model's parts.
    disposeObjects(gltf.scenes, { textures: false });
    const retainedImages = new Set([...usedTextures].map(texture => texture.source?.data));
    disposeObjects([], { extraTextures: [...allTextures].filter(texture => !usedTextures.has(texture) && !retainedImages.has(texture.source?.data)) });
    return group;
  } catch (error) {
    disposeObjects([group, ...gltf.scenes]);
    throw error;
  }
}

/** One draw per source primitive, with shared resources owned by the resulting group. */
export function instanceSceneryModel(model, placements, name) {
  const group = new THREE.Group();
  group.name = name;
  const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion();
  const position = new THREE.Vector3(), scale = new THREE.Vector3();
  for (const source of model.children) {
    const mesh = new THREE.InstancedMesh(source.geometry, source.material, placements.length);
    mesh.name = `${name} / ${source.name}`;
    placements.forEach((p, i) => {
      const s = p.scale ?? 1;
      scale.set(s * (p.width ?? 1), s, s * (p.width ?? 1));
      position.set(p.x, p.y, p.z);
      rotation.setFromEuler(new THREE.Euler(p.leanX ?? 0, p.yaw ?? 0, p.leanZ ?? 0));
      mesh.setMatrixAt(i, matrix.compose(position, rotation, scale));
    });
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  group.userData = { source: model.userData.source, count: placements.length };
  return group;
}
