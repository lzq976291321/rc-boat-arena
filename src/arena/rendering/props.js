// 赛道道具：航标模型、起点拱门、下一检查点指引
import * as THREE from 'three';
import { loadGLTF } from '../../shared/assets/gltf.js';
import { disposeObjects } from '../../shared/rendering/resources.js';

export function buildBuoys(scene, course) {
  const group = new THREE.Group();
  group.name = 'Ocean Buoy course markers';
  scene.add(group);
  const controller = new AbortController();
  const loadState = { status: 'loading', error: null };
  const batches = [];
  const gates = course.buoys.flatMap((buoy, index) => buoy.kind === 'gate' ? [{ ...buoy, index }] : []);
  let sourceScenes = [], disposed = false, previousGateId = null;
  const tint = new THREE.Color();

  // One parse and one geometry/material set for the entire course. Each source
  // mesh becomes one instanced draw, rather than a GLTF parse per marker.
  const ready = loadGLTF('assets/library/ocean-buoy/model.glb', { signal: controller.signal }).then(gltf => {
    sourceScenes = gltf.scenes;
    if (disposed) { disposeObjects(sourceScenes); return; }
    const source = gltf.scene;
    source.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(source);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const diameter = Math.max(size.x, size.z);
    if (!Number.isFinite(diameter) || diameter <= 0) throw new Error('Ocean Buoy 模型尺寸无效');
    const placement = new THREE.Matrix4();
    const matrix = new THREE.Matrix4();
    const offset = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    source.traverse(mesh => {
      if (!mesh.isMesh) return;
      const batch = new THREE.InstancedMesh(mesh.geometry, mesh.material, course.buoys.length);
      batch.name = 'Ocean Buoy instances';
      batch.castShadow = true;
      batch.receiveShadow = true;
      course.buoys.forEach((buoy, index) => {
        const factor = (buoy.kind === 'gate' ? 2.2 : 1.6) / diameter;
        scale.setScalar(factor);
        // The authored y=0 is the waterline; center the horizontal silhouette
        // while preserving the underwater base and above-water beacon.
        offset.set(buoy.x - center.x * factor, 0, buoy.z - center.z * factor);
        placement.compose(offset, rotation, scale);
        matrix.multiplyMatrices(placement, mesh.matrixWorld);
        batch.setMatrixAt(index, matrix);
        batch.setColorAt(index, tint.setRGB(1, 1, 1));
      });
      batch.instanceMatrix.needsUpdate = true;
      batch.instanceColor.setUsage(THREE.DynamicDrawUsage);
      batch.instanceColor.needsUpdate = true;
      batch.computeBoundingSphere();
      batches.push(batch);
      group.add(batch);
    });
    if (!batches.length) throw new Error('Ocean Buoy 模型不含可渲染网格');
    loadState.status = 'ready';
  }).catch(error => {
    if (!disposed) {
      loadState.status = 'error';
      loadState.error = error;
      disposeObjects([group, ...sourceScenes]);
      group.clear();
      batches.length = 0;
      sourceScenes = [];
    }
    throw error;
  });

  function update(time, nextGateId) {
    if (loadState.status !== 'ready' || disposed) return;
    const target = nextGateId ?? null;
    if (!target && !previousGateId) return;
    const pulse = 1.4 + Math.sin(time * 3) * 0.18;
    for (const batch of batches) {
      for (const gate of gates) {
        const strength = gate.gateId === target ? pulse : 1;
        batch.setColorAt(gate.index, tint.setRGB(strength, strength, strength));
      }
      batch.instanceColor.needsUpdate = true;
    }
    previousGateId = target;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    controller.abort();
    group.removeFromParent();
    // Instances and their prototype share GPU resources: release together once.
    disposeObjects([group, ...sourceScenes]);
    group.clear();
    batches.length = 0;
    sourceScenes = [];
  }
  return { group, ready, loadState, update, dispose };
}

function makeBannerTexture(text = 'RC  /  RACE CLUB') {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#244746'); grad.addColorStop(1, '#173636');
  g.fillStyle = grad; g.fillRect(0, 0, 1024, 128);
  // 赛车方格边条
  for (let i = 0; i < 32; i++) {
    g.fillStyle = i % 2 ? '#234746' : '#e8e3d2';
    g.fillRect(i * 32, 0, 32, 14);
    g.fillRect(i * 32, 114, 32, 14);
  }
  g.fillStyle = '#f0ead8';
  g.font = 'bold 62px "PingFang SC", system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 512, 66);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 起点/终点拱门（轻结构 + 亮色横幅，避免挡住视野） */
export function buildFinishArch(scene, course) {
  const g = course.finish;
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#b9c8bf', roughness: 0.35, metalness: 0.65 });
  const postGeo = new THREE.CylinderGeometry(0.30, 0.36, 13, 10);
  const half = g.halfWidth + 2;
  for (const s of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, mat);
    post.position.set(g.x + g.perpX * half * s, 6.5, g.z + g.perpZ * half * s);
    post.castShadow = true;
    group.add(post);
  }
  const yaw = Math.atan2(g.perpX, g.perpZ) - Math.PI / 2;
  const beam = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 0.8, 0.5, 0.5), mat);
  beam.position.set(g.x, 13.2, g.z);
  beam.rotation.y = yaw;
  beam.castShadow = true;
  group.add(beam);

  // 招牌：两块单面牌背靠背，两面文字都正着读（DoubleSide 会让背面文字镜像）
  const bannerTex = makeBannerTexture();
  const bannerMat = new THREE.MeshStandardMaterial({ map: bannerTex, side: THREE.FrontSide, emissive: '#264847',
    emissiveIntensity: 0.1, emissiveMap: bannerTex, roughness: 0.6 });
  const bannerGeo = new THREE.PlaneGeometry(half * 1.75, 2.2, 1, 1);
  const facing = Math.atan2(-g.dirX, -g.dirZ);      // 面朝起点（玩家来的方向）
  for (const turn of [facing, facing + Math.PI]) {
    const panel = new THREE.Mesh(bannerGeo, bannerMat);
    panel.position.set(g.x, 11.9, g.z);
    panel.rotation.y = turn;
    group.add(panel);
  }
  // 起跑线浮标柱（让终点线在水面上也看得见）
  const lineMat = new THREE.MeshBasicMaterial({ color: '#d3b976', transparent: true, opacity: 0.25 });
  const line = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, 0.9), lineMat);
  line.rotation.x = -Math.PI / 2;
  line.rotation.z = -yaw;
  line.position.set(g.x, 0.22, g.z);
  group.add(line);
  scene.add(group);
  return group;
}

function makeGateSignTexture(label, color = '#7dfcff') {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(16,40,41,0.90)';
  g.strokeStyle = color; g.lineWidth = 4;
  const r = 26;
  g.beginPath();
  g.moveTo(r, 5); g.lineTo(251, 5); g.lineTo(251, 155); g.lineTo(r, 155);
  g.lineTo(5, 80); g.closePath();
  g.fill(); g.stroke();
  g.fillStyle = color;
  g.font = 'bold 92px "PingFang SC", system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(label, 138, 84);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 每道门上方的编号牌（U2：检查点编号一眼可见） */
export function buildGateSigns(scene, course) {
  const group = new THREE.Group();
  const signs = [];
  course.sequence.forEach((gate, i) => {
    const isFinish = gate.kind === 'finish';
    const label = isFinish ? '终点' : String(i + 1);
    const color = isFinish ? '#e3be75' : '#a5d8c8';
    const mat = new THREE.MeshBasicMaterial({ map: makeGateSignTexture(label, color), transparent: true, depthWrite: false });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 2.5), mat);
    sign.position.set(gate.x, 7.2, gate.z);
    // 面向来车方向（-dir），让玩家在接近时正着读
    sign.rotation.y = Math.atan2(-gate.dirX, -gate.dirZ);
    group.add(sign);
    // 背面复制一块，反向通过时也能读
    const back = sign.clone();
    back.rotation.y += Math.PI;
    group.add(back);
    signs.push({ gate, sign, back, mat });
  });
  scene.add(group);
  return { group, signs };
}

/** 当前目标门的高亮指引（竖直光柱 + 浮动箭头） */
export function buildGateHints(scene) {
  const group = new THREE.Group();
  const beamMat = new THREE.MeshBasicMaterial({ color: '#7dfcff', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.15, 26, 12, 1, true), beamMat);
  beam.position.y = 13;
  group.add(beam);

  const ringMat = new THREE.MeshBasicMaterial({ color: '#7dfcff', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(3.4, 3.65, 48), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.5;
  group.add(ring);

  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.62, 1.3, 4),
    new THREE.MeshBasicMaterial({ color: '#7dfcff', transparent: true, opacity: 0.62 }),
  );
  arrow.rotation.x = Math.PI;
  arrow.position.y = 8;
  group.add(arrow);
  beam.visible = false; // Navigation belongs to compact gate marks, not a sky-high light column.
  scene.add(group);
  return { group, beam, ring, arrow };
}
