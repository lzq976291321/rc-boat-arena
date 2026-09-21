import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadGLTF } from '../shared/assets/gltf.js';
import { disposeObjects } from '../shared/rendering/resources.js';
import { pixelRatio } from '../shared/rendering/pixel-budget.js';

export function createViewer(container, message, onStats) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.domElement.setAttribute('aria-label', '素材三维预览，拖动旋转、滚轮缩放');
  container.append(renderer.domElement);
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, .04);
  scene.environment = environment.texture;
  room.dispose(); pmrem.dispose();
  const camera = new THREE.PerspectiveCamera(36, 1, .01, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxDistance = 15; controls.minDistance = 1; controls.maxPolarAngle = Math.PI * .9;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6b735c, 2.2));
  const key = new THREE.DirectionalLight(0xfff3d8, 3); key.position.set(3, 5, 2); scene.add(key);
  const grid = new THREE.GridHelper(14, 28, 0xc0c9b6, 0xd3dac9); grid.position.y = -.012;
  grid.material.transparent = true; grid.material.opacity = .35; scene.add(grid);
  let active = null, activeScenes = [], request, generation = 0, wireframe = false;
  let frame = 0, visible = false, destroyed = false, renderCount = 0, targetHeight = .75;
  function stop() { cancelAnimationFrame(frame); frame = 0; }
  function invalidate() {
    if (frame || destroyed || !active || !visible || document.hidden) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (destroyed || !active || !visible || document.hidden) return;
      // OrbitControls emits change while damping is settling, then stops.
      controls.update(); renderer.render(scene, camera);
      container.dataset.renderCount = String(++renderCount);
    });
  }
  function visibility() { if (document.hidden) stop(); else invalidate(); }
  const intersection = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) invalidate(); else stop();
  });
  intersection.observe(container);
  document.addEventListener('visibilitychange', visibility);
  controls.addEventListener('change', invalidate);
  function reset() {
    const vertical = THREE.MathUtils.degToRad(camera.fov / 2);
    const horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
    const distance = 2 / Math.sin(Math.min(vertical, horizontal));
    controls.target.set(0, targetHeight, 0);
    camera.position.copy(new THREE.Vector3(.56, .34, .76).normalize().multiplyScalar(distance).add(controls.target));
    controls.update(); invalidate();
  }
  reset();
  const resize = new ResizeObserver(() => {
    const width = container.clientWidth, height = container.clientHeight;
    if (!width || !height) return;
    renderer.setPixelRatio(pixelRatio(width, height, { maxPixels: 1200000 }));
    renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix(); reset();
  });
  resize.observe(container);
  function releaseModel() {
    if (active) scene.remove(active);
    disposeObjects(activeScenes); active = null; activeScenes = [];
    renderer.renderLists.dispose(); stop();
  }
  async function show(asset) {
    if (destroyed) return false;
    const current = ++generation;
    request?.abort(); request = new AbortController();
    releaseModel();
    const canPreview = !!asset?.path || asset?.kind === 'procedural';
    grid.visible = canPreview;
    container.style.visibility = canPreview ? 'visible' : 'hidden';
    message.hidden = false;
    if (!canPreview) { container.dataset.state = 'empty'; return false; }
    container.dataset.state = 'loading'; message.textContent = '正在准备 3D 模型…';
    reset();
    try {
      const gltf = asset.path
        ? await loadGLTF(new URL('../' + asset.path.replace(/^\//, ''), document.baseURI), { signal: request.signal })
        : await createProceduralPreview(asset);
      if (destroyed || current !== generation) { disposeObjects(gltf.scenes); return false; }
      const model = gltf.scene;
      const bounds = new THREE.Box3().setFromObject(model, true), size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
      const extent = Math.max(size.x, size.y, size.z);
      if (!Number.isFinite(extent) || extent <= 0) { disposeObjects(gltf.scenes); throw new Error('无有效几何体'); }
      const scale = 3.7 / extent;
      model.scale.multiplyScalar(scale);
      model.position.multiplyScalar(scale).add(new THREE.Vector3(-center.x * scale, -bounds.min.y * scale, -center.z * scale));
      let triangles = 0, meshes = 0;
      const materials = new Set();
      model.traverse(object => {
        if (!object.isMesh) return;
        meshes++;
        triangles += (object.geometry.index?.count ?? object.geometry.attributes.position?.count ?? 0) / 3 * (object.isInstancedMesh ? object.count : 1);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) { materials.add(material); material.wireframe = wireframe; }
      });
      active = model; activeScenes = gltf.scenes; scene.add(model);
      targetHeight = size.y * scale * .46; reset();
      onStats(asset.id, { triangles: Math.round(triangles), meshes, materials: materials.size, dimensions: size.toArray(), animations: gltf.animations.length });
      message.hidden = true; container.dataset.state = 'ready'; invalidate(); return true;
    } catch (error) {
      if (!destroyed && current === generation && error.name !== 'AbortError') {
        container.dataset.state = 'error'; message.textContent = '模型暂时无法预览，请点击重试。'; container.style.visibility = 'hidden';
      }
      return false;
    }
  }
  return {
    show, reset,
    wireframe(value) {
      wireframe = value;
      active?.traverse(object => { for (const material of Array.isArray(object.material) ? object.material : [object.material]) if (material) material.wireframe = value; });
      invalidate();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true; generation++; request?.abort(); stop();
      resize.disconnect(); intersection.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      controls.removeEventListener('change', invalidate); controls.dispose();
      releaseModel(); disposeObjects(scene); environment.dispose();
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
      container.dataset.state = 'closed';
    },
  };
}

// Reuse the actual race builders; the library owns only framing and lifecycle.
async function createProceduralPreview(asset) {
  const [{ buildFinishArch }, { buildCourse }] = await Promise.all([
    import('../arena/rendering/props.js'), import('../arena/gameplay/course.js'),
  ]);
  const group = new THREE.Group(), course = buildCourse();
  if (asset.id === 'builtin-finish-arch') buildFinishArch(group, course);
  else throw new Error('Unknown procedural asset');
  return { scene: group, scenes: [group], animations: [] };
}
