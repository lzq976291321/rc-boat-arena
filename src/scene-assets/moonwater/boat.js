import * as THREE from "three";
import { loadGLTF } from "../../shared/assets/gltf.js";
import { disposeObjects } from "../../shared/rendering/resources.js";

export async function createSwampBoat(scene, url, { signal } = {}) {
  const gltf = await loadGLTF(url, { signal, delivery: 'scene' });
  const group = new THREE.Group(), visual = new THREE.Group();
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal?.removeEventListener("abort", dispose);
    group.removeFromParent();
    // GLTFs can contain additional scenes; all belong to this parsed instance.
    disposeObjects([group, ...gltf.scenes]);
    group.clear();
  };
  try {
    signal?.throwIfAborted();
    group.name = "Futuristic Speedboat by dylanheyes";
    group.add(visual);
    const model = gltf.scene;
    const bounds = new THREE.Box3().setFromObject(model, true),
      size = bounds.getSize(new THREE.Vector3()),
      center = bounds.getCenter(new THREE.Vector3());
    if (!Number.isFinite(size.x) || size.x <= 0) throw new Error("Boat asset has invalid bounds");
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
        // Keep the author's chrome/PBR maps; the environment supplies reflections.
        material.envMapIntensity = 1;
      }
    });
    visual.add(mount);
    scene.add(group);
    signal?.addEventListener("abort", dispose, { once: true });
    return {
      group, visual, model, mount, dispose,
      update(dt, time, boat) {
        if (disposed || !boat) return;
        group.position.set(
          boat.x,
          0.025 + Math.sin(time * 0.8) * 0.018 + Math.cos(time * 0.53) * 0.012,
          boat.z,
        );
        group.rotation.y = boat.heading;
        visual.rotation.z =
          Math.sin(time * 0.65) * 0.012 +
          (boat.turnRate ?? 0) * Math.min(Math.abs(boat.speed), 3) * 0.045;
        visual.rotation.x = Math.sin(time * 0.72) * 0.008 - boat.speed * 0.003;
      },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
