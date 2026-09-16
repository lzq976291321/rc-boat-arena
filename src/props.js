// 赛道道具：浮标、门柱旗、起点拱门、下一检查点指引
import * as THREE from 'three';
import { RACE } from './config.js';

export function buildBuoys(scene, course) {
  const lane = course.buoys.filter((b) => b.kind === 'lane');
  const gates = course.buoys.filter((b) => b.kind === 'gate');

  const laneGeo = new THREE.CylinderGeometry(0.59, 0.75, 1.75, 16);
  laneGeo.translate(0, 0.58, 0);
  const laneMat = new THREE.MeshStandardMaterial({ color: '#e8e4d8', roughness: 0.46, metalness: 0.05 });
  const laneMesh = new THREE.InstancedMesh(laneGeo, laneMat, lane.length);
  const bandGeo = new THREE.CylinderGeometry(0.63, 0.67, 0.28, 16);
  bandGeo.translate(0, 0.99, 0);
  const bandMat = new THREE.MeshStandardMaterial({ color: '#d2693d', roughness: 0.5 });
  const bandMesh = new THREE.InstancedMesh(bandGeo, bandMat, lane.length);

  const m = new THREE.Matrix4();
  lane.forEach((b, i) => {
    m.makeTranslation(b.x, 0, b.z);
    laneMesh.setMatrixAt(i, m);
    bandMesh.setMatrixAt(i, m);
  });
  laneMesh.castShadow = bandMesh.castShadow = true;
  scene.add(laneMesh, bandMesh);

  // 门柱：左右两色 + 旗子
  const gateGroup = new THREE.Group();
  const gateMarkers = [];
  for (const b of gates) {
    const isFinish = b.gateId === 'finish';
    const color = isFinish ? '#d4a24b' : (b.side > 0 ? '#398c76' : '#c84f3b');
    const buoy = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 1.2, 2.6, 20),
      new THREE.MeshStandardMaterial({ color, roughness: 0.4, emissive: color, emissiveIntensity: 0.04 }),
    );
    buoy.position.set(b.x, 0.9, b.z);
    buoy.castShadow = true;
    gateGroup.add(buoy);
    // 旗杆
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 4.2, 6),
      new THREE.MeshStandardMaterial({ color: '#dfe7ea', roughness: 0.5, metalness: 0.4 }),
    );
    pole.position.set(b.x, 4.4, b.z);
    gateGroup.add(pole);
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 1.05, 1, 1),
      new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.7, emissive: color, emissiveIntensity: 0.04 }),
    );
    flag.position.set(b.x + 0.9, 6.0, b.z);
    gateGroup.add(flag);
    gateMarkers.push({ buoy, flag, gateId: b.gateId, side: b.side });
  }
  scene.add(gateGroup);
  return { laneMesh, bandMesh, gateGroup, gateMarkers };
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
