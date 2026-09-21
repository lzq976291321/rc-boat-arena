import * as THREE from "three";
import { loadGLTF } from '../shared/assets/gltf.js';

export async function createSwampBoat(scene, url) {
  const gltf = await loadGLTF(url);
  const group = new THREE.Group(),
    visual = new THREE.Group();
  group.name = "Futuristic Speedboat by dylanheyes";
  group.add(visual);
  scene.add(group);
  const model = gltf.scene;
  const bounds = new THREE.Box3().setFromObject(model, true),
    size = bounds.getSize(new THREE.Vector3()),
    center = bounds.getCenter(new THREE.Vector3());
  const scale = 5.2 / size.x;
  // Preserve the GLB root's authored transform. Its world-space bow points +X;
  // a separate mount turns it to navigation's -Z and places the keel 28 cm below water.
  const mount = new THREE.Group(), centered = new THREE.Group();
  centered.position.set(-center.x, -bounds.min.y, -center.z);
  centered.add(model);
  mount.add(centered);
  mount.scale.setScalar(scale);
  mount.rotation.y = Math.PI / 2;
  mount.position.y = -0.28;
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    for (const material of Array.isArray(o.material) ? o.material : [o.material]) {
      // Keep the author's chrome/PBR maps; the swamp environment supplies reflections.
      material.envMapIntensity = 1;
    }
  });
  visual.add(mount);
  return {
    group,
    visual,
    model,
    mount,
    update(dt, time, boat) {
      group.position.set(
        boat.x,
        0.025 + Math.sin(time * 0.8) * 0.018 + Math.cos(time * 0.53) * 0.012,
        boat.z,
      );
      group.rotation.y = boat.heading;
      visual.rotation.z =
        Math.sin(time * 0.65) * 0.012 +
        boat.turnRate * Math.min(Math.abs(boat.speed), 3) * 0.045;
      visual.rotation.x = Math.sin(time * 0.72) * 0.008 - boat.speed * 0.003;
    },
  };
}
