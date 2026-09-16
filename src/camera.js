// 镜头：跟随镜头与俯视镜头（固定主体尺寸、转弯预看、俯视可缩放）
import * as THREE from 'three';

export class CameraRig {
  constructor(camera, { mode = 'chase' } = {}) {
    this.camera = camera;
    this.mode = mode;
    this.pos = new THREE.Vector3(0, 8, -18);
    this.look = new THREE.Vector3();
    this.shake = 0;
    this.fov = 52;
    this.topHeight = 60;
    this._tmp = new THREE.Vector3();
    this._lookTarget = new THREE.Vector3();
    this.dist = 9.4;
    this.height = 4.2;
  }
  toggle() { this.mode = this.mode === 'chase' ? 'top' : 'chase'; return this.mode; }
  // 俯视镜头缩放：390 = 看全赛道，28 = 贴近船
  zoom(delta) {
    this.topHeight = Math.max(28, Math.min(390, this.topHeight * (delta > 0 ? 1.18 : 1 / 1.18)));
    return this.topHeight;
  }
  addShake(v) { this.shake = Math.min(1.4, this.shake + v); }
  snapTo(boat) {
    const fwdX = Math.sin(boat.heading), fwdZ = Math.cos(boat.heading);
    this.pos.set(boat.x - fwdX * this.dist, this.height + 0.6, boat.z - fwdZ * this.dist);
    this.look.set(boat.x + fwdX * 6, 0.7, boat.z + fwdZ * 6);
  }
  // 跟随镜头保持恒定距离，只让 FOV 随速度变化：船始终是画面主体，不会被拉远成小点
  update(boat, dt, opts = {}) {
    const speed = Math.abs(boat.forwardSpeed ?? boat.speed ?? 0);
    const speedK = Math.min(1, speed / 30);
    if (this.mode === 'showcase') {
      // 首屏展示镜头：船头侧前方约 35°，船放画面右侧，左侧留给标题
      // Shoot from the shore side toward the open lake and distant ridges.
      const angle = boat.heading - 0.80;
      const dirX = Math.sin(angle), dirZ = Math.cos(angle);
      const screenRightX = dirZ, screenRightZ = -dirX;
      const portrait = this.camera.aspect < 1;
      const portraitLookHeight = this.camera.aspect > 0.52 ? 1.0 : 1.65;
      // Preserve the full approved hull in a narrower viewport without rescaling the model.
      const distance = portrait ? Math.max(12.2, 8.6 / this.camera.aspect) : 10.2 * Math.max(1, 1.78 / this.camera.aspect);
      const offset = portrait ? 0 : 2.7;
      const target = this._tmp.set(boat.x + dirX * distance, portrait ? 2.8 : 2.25, boat.z + dirZ * distance);
      this.pos.lerp(target, 1 - Math.pow(0.004, dt));
      this._lookTarget.set(boat.x - screenRightX * offset, portrait ? portraitLookHeight : 1.12, boat.z - screenRightZ * offset);
      this.look.lerp(this._lookTarget, 1 - Math.pow(0.004, dt));
      this.camera.position.copy(this.pos);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(this.look);
      this.fov = 40;
      if (this.camera.fov !== this.fov) { this.camera.fov = this.fov; this.camera.updateProjectionMatrix(); }
    } else if (this.mode === 'chase') {
      const fwdX = Math.sin(boat.heading), fwdZ = Math.cos(boat.heading);
      const rgtX = -Math.cos(boat.heading), rgtZ = Math.sin(boat.heading);   // 真正的右向量
      const yaw = boat.yawRate ?? 0;
      const lead = Math.max(-0.45, Math.min(0.45, yaw * 0.28));   // 转弯预看
      const ang = boat.heading + lead;
      const lx = Math.sin(ang), lz = Math.cos(ang);
      const camDist = this.dist + speedK * 0.3;
      const sideOffset = -lead * 2.2;
      const target = this._tmp.set(
        boat.x - fwdX * camDist + rgtX * sideOffset,
        this.height + speedK * 0.45,
        boat.z - fwdZ * camDist + rgtZ * sideOffset,
      );
      this.pos.lerp(target, 1 - Math.pow(0.00035, dt));
      const ahead = 6 + speedK * 3.5;
      this._lookTarget.set(boat.x + lx * ahead, 0.7 + (boat.bob ?? 0) * 0.15, boat.z + lz * ahead);
      this.look.lerp(this._lookTarget, 1 - Math.pow(0.0002, dt));
      this.camera.position.copy(this.pos);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(this.look);
      const targetFov = 52 + speedK * 5 + (opts.boost ? 1.5 : 0);
      this.fov += (targetFov - this.fov) * Math.min(1, dt * 2.4);
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    } else {
      const h = this.topHeight;
      this.camera.position.set(boat.x, h, boat.z + 0.02);
      this.camera.up.set(0, 0, -1);
      this.camera.lookAt(boat.x, 0, boat.z);
      if (this.camera.fov !== 55) { this.camera.fov = 55; this.camera.updateProjectionMatrix(); }
    }
    if (this.shake > 0.001) {
      const s = this.shake * 0.35;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s * 0.5;
      this.camera.position.z += (Math.random() - 0.5) * s;
      this.shake *= Math.pow(0.02, dt);
    }
    return this.camera;
  }
}
