import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class Dice3D {
  constructor(targetId, options = {}) {
    this.target = document.getElementById(targetId);
    this.onResult = options.onResult;
    this.onImpact = options.onImpact;
    this.isRolling = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b1627);
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    this.camera.position.set(0, 3, 5);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.target.clientWidth, this.target.clientHeight);
    this.target.appendChild(this.renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x1f2d3d, 1.4);
    this.scene.add(hemi);

    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -16, 0) });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);

    const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(ground);

    const geo = new THREE.IcosahedronGeometry(0.9, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x6ab7ff, flatShading: true });
    this.mesh = new THREE.Mesh(geo, mat);
    this.scene.add(this.mesh);

    this.body = new CANNON.Body({
      mass: 1,
      shape: new CANNON.Sphere(0.9),
      position: new CANNON.Vec3(0, 3, 0),
      material: new CANNON.Material('dice')
    });

    this.body.addEventListener('collide', () => {
      this.onImpact?.();
    });

    this.world.addBody(this.body);

    this.lastStableMs = performance.now();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  throwDice() {
    if (this.isRolling) {
      return;
    }

    this.isRolling = true;
    this.body.position.set(0, 4, 0);
    this.body.velocity.set((Math.random() - 0.5) * 8, 7 + Math.random() * 3, (Math.random() - 0.5) * 8);
    this.body.angularVelocity.set(Math.random() * 12, Math.random() * 12, Math.random() * 12);
    this.body.quaternion.set(0, 0, 0, 1);
    this.lastStableMs = performance.now();
  }

  animate() {
    this.world.step(1 / 60);

    this.mesh.position.copy(this.body.position);
    this.mesh.quaternion.copy(this.body.quaternion);

    if (this.isRolling) {
      const speed = this.body.velocity.length() + this.body.angularVelocity.length();
      if (speed < 0.25) {
        if (performance.now() - this.lastStableMs > 400) {
          this.isRolling = false;
          const result = Math.floor(Math.random() * 20) + 1;
          this.onResult?.(result);
        }
      } else {
        this.lastStableMs = performance.now();
      }
    }

    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.animate);
  }
}
