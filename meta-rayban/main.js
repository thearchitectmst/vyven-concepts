// VYVEN × Ray-Ban Meta — interactive 3D partnership concept.
// Geometry outlines are kept in sync with _dev/silhouette.py (proportion check).
// Units: millimetres. Front face of the frame sits at world z = 0, facing +z.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// ---------------------------------------------------------------- path tools
class P {
  constructor() { this.pts = []; }
  moveTo(x, y) { this.pts.push([x, y]); }
  lineTo(x, y) { this.pts.push([x, y]); }
  quadTo(cx, cy, x, y, n = 16) {
    const [x0, y0] = this.pts[this.pts.length - 1];
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      this.pts.push([
        u * u * x0 + 2 * u * t * cx + t * t * x,
        u * u * y0 + 2 * u * t * cy + t * t * y,
      ]);
    }
  }
}

const signedArea = (pts) =>
  pts.reduce((a, [x, y], i) => {
    const [X, Y] = pts[(i + 1) % pts.length];
    return a + (x * Y - X * y);
  }, 0) / 2;

const wind = (pts, ccw) => ((signedArea(pts) > 0) === ccw ? pts : [...pts].reverse());

const toShape = (pts) => {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
};
const toPath = (pts) => {
  const p = new THREE.Path();
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  p.closePath();
  return p;
};

// ---------------------------------------------------------------- outlines
function frontRightHalf() {
  const p = new P();
  p.moveTo(0, 22.2);
  p.lineTo(52, 23.0);
  p.quadTo(72.0, 24.0, 75.3, 18.0);   // top-outer corner: upward flick, widest point
  p.quadTo(76.6, 9.0, 70.8, -14.5);   // outer edge
  p.quadTo(68.6, -22.6, 61.0, -23.4); // bottom-outer corner
  p.quadTo(36, -26.4, 18.0, -23.2);   // bottom edge
  p.quadTo(13.0, -22.4, 12.2, -17.0); // bottom-inner corner
  p.quadTo(10.6, -3.0, 9.6, 6.0);     // nose edge
  p.quadTo(8.6, 10.6, 0, 11.0);       // under-bridge centre (shallow arch)
  return p.pts;
}
function frontOutline() {
  const right = frontRightHalf();
  const left = [...right].reverse().map(([x, y]) => [-x, y]);
  return right.concat(left.slice(1, -1));
}
function lensHoleRight() {
  const p = new P();
  p.moveTo(18.0, 15.4);
  p.lineTo(59.5, 16.6);
  p.quadTo(66.6, 17.0, 65.6, 11.0);   // top-outer corner (camera zone)
  p.quadTo(65.8, -1.2, 62.8, -14.0);  // outer edge
  p.quadTo(61.8, -18.4, 55.0, -18.5); // bottom-outer corner
  p.quadTo(35, -20.6, 21.0, -18.3);   // bottom edge
  p.quadTo(16.8, -17.7, 16.2, -13.0); // bottom-inner corner
  p.lineTo(12.6, 11.0);               // nose-side edge (trapezoid lean)
  p.quadTo(12.4, 15.0, 18.0, 15.4);   // top-inner corner
  return p.pts;
}
const lensHoleLeft = () => [...lensHoleRight()].reverse().map(([x, y]) => [-x, y]);

function templeProfile() {
  const c = new P();
  c.moveTo(0, 13.5);
  c.lineTo(-95, 10.5);
  c.quadTo(-118, 8.3, -128, -1.2);
  c.quadTo(-136, -9.0, -143, -16.0);
  const pts = c.pts, n = pts.length, top = [], bot = [];
  for (let i = 0; i < n; i++) {
    const [z, y] = pts[i];
    const f = i / (n - 1);
    const t = f < 0.55 ? 13.0 + (8.0 - 13.0) * (f / 0.55)
                       : 8.0 + (4.5 - 8.0) * ((f - 0.55) / 0.45);
    const [z0, y0] = pts[Math.max(0, i - 1)];
    const [z1, y1] = pts[Math.min(n - 1, i + 1)];
    const dz = z1 - z0, dy = y1 - y0;
    const L = Math.hypot(dz, dy) || 1;
    const nx = -dy / L, ny = dz / L;
    top.push([z + (nx * t) / 2, y + (ny * t) / 2]);
    bot.push([z - (nx * t) / 2, y - (ny * t) / 2]);
  }
  return top.concat(bot.reverse());
}

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 1, 3000);
camera.position.set(260, 110, 560);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, -4, -30);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.minDistance = 170;
controls.maxDistance = 560;
controls.minPolarAngle = 0.45;
controls.maxPolarAngle = 2.55;
controls.autoRotate = true;
controls.autoRotateSpeed = 1.1;
controls.enabled = false; // until intro completes

// ---------------------------------------------------------------- backdrop
function gradientTexture(stops, w = 4, h = 512) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  for (const [off, col] of stops) g.addColorStop(off, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const bgSphere = new THREE.Mesh(
  new THREE.SphereGeometry(900, 32, 24),
  new THREE.MeshBasicMaterial({
    map: gradientTexture([[0, '#0d1540'], [0.45, '#070c28'], [1, '#020310']]),
    side: THREE.BackSide,
    depthWrite: false,
  })
);
scene.add(bgSphere);

// glowing cyan particles — the VYVEN presence field
{
  const N = 260, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = 260 + Math.random() * 380;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.cos(ph) * 0.6 - 10;
    pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({
    color: 0x59d8ff, size: 2.2, sizeAttenuation: true,
    transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const points = new THREE.Points(g, m);
  points.name = 'dots';
  scene.add(points);
}

function radialTexture(inner, outer) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(cv);
}
// soft contact shadow + cyan stage glow
const shadow = new THREE.Mesh(
  new THREE.PlaneGeometry(300, 150),
  new THREE.MeshBasicMaterial({
    map: radialTexture('rgba(1,2,8,0.85)', 'rgba(1,2,8,0)'),
    transparent: true, depthWrite: false,
  })
);
shadow.rotation.x = -Math.PI / 2;
shadow.position.y = -57;
scene.add(shadow);

const glow = new THREE.Mesh(
  new THREE.PlaneGeometry(560, 320),
  new THREE.MeshBasicMaterial({
    map: radialTexture('rgba(46,108,255,0.32)', 'rgba(46,108,255,0)'),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  })
);
glow.rotation.x = -Math.PI / 2;
glow.position.y = -58;
scene.add(glow);

// ---------------------------------------------------------------- lights
const key = new THREE.DirectionalLight(0xffffff, 2.0);
key.position.set(90, 120, 160);
scene.add(key);
const rim = new THREE.DirectionalLight(0x9fc0ff, 1.5);
rim.position.set(-120, 60, -140);
scene.add(rim);
const kiss = new THREE.DirectionalLight(0x59d8ff, 0.5);
kiss.position.set(-60, -80, 100);
scene.add(kiss);

// ---------------------------------------------------------------- materials
const BEND_K = 0.00085; // subtle face-form wrap: z -= k·x²

const matMidnight = new THREE.MeshPhysicalMaterial({
  color: 0x0b1437, roughness: 0.24, metalness: 0.0,
  clearcoat: 1.0, clearcoatRoughness: 0.1,
  envMapIntensity: 0.95,
});
const matCrystal = new THREE.MeshPhysicalMaterial({
  color: 0x24398f, roughness: 0.08, metalness: 0.0,
  transmission: 0.7, thickness: 4.0, ior: 1.46,
  attenuationColor: new THREE.Color(0x1b2c77), attenuationDistance: 22,
  clearcoat: 1.0, clearcoatRoughness: 0.08,
  envMapIntensity: 1.3,
});
const matLens = new THREE.MeshPhysicalMaterial({
  color: 0x0a1538, roughness: 0.06, metalness: 0.0,
  transparent: true, opacity: 0.72, clearcoat: 0.6,
  envMapIntensity: 1.6, side: THREE.DoubleSide,
});
const matMetal = new THREE.MeshStandardMaterial({
  color: 0xa8c3f3, metalness: 1.0, roughness: 0.32, envMapIntensity: 1.4,
});
const matDark = new THREE.MeshPhysicalMaterial({
  color: 0x05070f, roughness: 0.05, metalness: 0.2, envMapIntensity: 1.6,
});

function bend(geo) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) - BEND_K * p.getX(i) ** 2);
  p.needsUpdate = true;
}

// ---------------------------------------------------------------- glasses
const glasses = new THREE.Group();
scene.add(glasses);
const acetateMeshes = [];

// front frame
{
  const shape = toShape(wind(frontOutline(), true));
  shape.holes = [toPath(wind(lensHoleRight(), false)), toPath(wind(lensHoleLeft(), false))];
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 5.5, bevelEnabled: true,
    bevelThickness: 0.9, bevelSize: 0.7, bevelSegments: 3,
  });
  bend(geo);
  const front = new THREE.Mesh(geo, matMidnight);
  front.position.z = -6.4; // front cap → world z = 0
  glasses.add(front);
  acetateMeshes.push(front);
}

// lenses (bent like the frame so they stay bezel-set)
for (const pts of [lensHoleRight(), lensHoleLeft()]) {
  const geo = new THREE.ShapeGeometry(toShape(wind(pts, true)));
  bend(geo);
  geo.computeVertexNormals();
  const lens = new THREE.Mesh(geo, matLens);
  lens.position.z = -2.5;
  lens.renderOrder = 2;
  glasses.add(lens);
}

// temples
const templeGeo = (() => {
  const geo = new THREE.ExtrudeGeometry(toShape(wind(templeProfile(), true)), {
    depth: 4.6, bevelEnabled: true,
    bevelThickness: 0.5, bevelSize: 0.6, bevelSegments: 3,
  });
  geo.computeBoundingBox();
  return geo;
})();
const HINGE_Z = -9.0;

function makeTemple(side) {
  // side: +1 right (knot), -1 left (wordmark)
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(templeGeo, matMidnight);
  mesh.rotation.y = -Math.PI / 2; // geomZ(thickness) → -x, profile z → world z
  const px = side > 0 ? 74.9 : -70.3;
  mesh.position.x = px;
  group.add(mesh);
  acetateMeshes.push(mesh);
  // flat outer cap: geomZ=-bevelThickness → x = px+0.5 (right) | geomZ=depth+bevel → px-5.1 (left)
  const outerX = side > 0 ? px + 0.5 : px - 5.1;
  group.position.z = HINGE_Z;
  group.rotation.y = side > 0 ? -0.05 : 0.05; // slight outward splay
  glasses.add(group);
  return { group, outerX };
}
const templeR = makeTemple(1);
const templeL = makeTemple(-1);

// hinge caps
for (const side of [1, -1]) {
  const hinge = new THREE.Mesh(new THREE.BoxGeometry(5.4, 9, 5), matMetal);
  hinge.position.set(side * 71.6, 13.5, HINGE_Z + 0.5);
  hinge.rotation.y = side * -0.05;
  glasses.add(hinge);
}

// camera + capture-LED modules at the front corners
const hotspotAnchors = {};
for (const side of [1, -1]) {
  const mod = new THREE.Group();
  const faceZ = -BEND_K * 70.6 ** 2; // world z of the bent front face at the corner
  mod.position.set(side * 70.6, 10.0, faceZ);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.9, 0.75, 16, 48), matMetal);
  ring.position.z = 0.55;
  mod.add(ring);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(3.3, 40), matDark);
  glass.position.z = 0.8;
  mod.add(glass);
  const pupil = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.3, 12, 32), matMetal);
  pupil.position.z = 0.92;
  mod.add(pupil);
  glasses.add(mod);
  if (side > 0) hotspotAnchors.camera = { obj: glass, normal: new THREE.Vector3(0, 0, 1) };
}

// ---------------------------------------------------------------- decals
const manager = new THREE.LoadingManager();
const texLoader = new THREE.TextureLoader(manager);
const maxAniso = renderer.capabilities.getMaxAnisotropy();

function loadTex(url) {
  const t = texLoader.load(url);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return t;
}
const knotTex = loadTex('assets/vyven-knot.png');
const wordTex = loadTex('assets/vyven-wordmark.png');

function decal(tex, w, h, opts = {}) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({
      map: tex, transparent: true, alphaTest: 0.04,
      roughness: 0.42, metalness: 0.12,
      emissive: 0xb9c8f5, emissiveMap: tex, emissiveIntensity: opts.glow ?? 0.18,
      envMapIntensity: 1.0,
      polygonOffset: true, polygonOffsetFactor: -2,
    })
  );
  m.renderOrder = 4;
  return m;
}

// knot on the right temple, where the Meta logo sits
{
  const d = decal(knotTex, 9, 9, { glow: 0.22 });
  d.rotation.y = Math.PI / 2;
  d.position.set(templeR.outerX + 0.14, 12.2, -17);
  templeR.group.add(d);
  hotspotAnchors.knot = { obj: d, normal: new THREE.Vector3(0, 0, 1) };
}
// wordmark along the left temple (2149×399 → 5.39:1)
{
  const d = decal(wordTex, 26, 26 / 5.386);
  d.rotation.y = -Math.PI / 2;
  d.position.set(templeL.outerX - 0.14, 11.4, -27.5);
  templeL.group.add(d);
  hotspotAnchors.wordmark = { obj: d, normal: new THREE.Vector3(0, 0, 1) };
}
// lens signature, like the Ray-Ban script — top-outer of the right lens
// (right side pairs with the knot; left side carries the temple wordmark)
{
  const d = decal(wordTex, 13, 13 / 5.386, { glow: 0.3 });
  d.position.set(52, 9.8, -2.5 - BEND_K * 52 ** 2 + 0.18);
  d.material.opacity = 0.92;
  glasses.add(d);
}

glasses.rotation.x = 0.04; // a touch of presentation tilt

// ---------------------------------------------------------------- hotspots UI
const hotspotDefs = [
  {
    id: 'knot', anchor: () => hotspotAnchors.knot,
    title: 'The VYVEN knot',
    body: 'Sculpted into the right temple — exactly where the Meta logo normally sits. Your presence, worn.',
  },
  {
    id: 'wordmark', anchor: () => hotspotAnchors.wordmark,
    title: 'VYVEN wordmark',
    body: 'Co-branded edition: the VYVEN wordmark rides the left temple, Ray-Ban Meta hardware underneath. Frame in VYVEN Midnight Navy.',
  },
  {
    id: 'camera', anchor: () => hotspotAnchors.camera,
    title: 'Ultra-wide camera',
    body: 'One tap on the temple and your section’s view goes live as a VYVEN room — the roar of your block, shared with everyone who couldn’t be there.',
  },
];
const card = document.getElementById('card');
const cardTitle = document.getElementById('card-title');
const cardBody = document.getElementById('card-body');
let openId = null;

const dots = hotspotDefs.map((def) => {
  const el = document.createElement('button');
  el.className = 'hotspot hidden';
  el.setAttribute('aria-label', def.title);
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (openId === def.id) { closeCard(); return; }
    openId = def.id;
    cardTitle.textContent = def.title;
    cardBody.textContent = def.body;
    card.classList.add('open');
  });
  document.body.appendChild(el);
  return { def, el };
});
function closeCard() { openId = null; card.classList.remove('open'); }
document.getElementById('card-close').addEventListener('click', closeCard);
canvas.addEventListener('pointerdown', closeCard);

const _wp = new THREE.Vector3();
const _wq = new THREE.Quaternion();
const _n = new THREE.Vector3();
const _toCam = new THREE.Vector3();

function updateHotspots() {
  for (const { def, el } of dots) {
    const a = def.anchor();
    if (!a) continue;
    a.obj.getWorldPosition(_wp);
    a.obj.getWorldQuaternion(_wq);
    _n.copy(a.normal).applyQuaternion(_wq);
    _toCam.copy(camera.position).sub(_wp).normalize();
    const facing = _n.dot(_toCam) > 0.18;
    const p = _wp.clone().project(camera);
    const onScreen = p.z < 1 && Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05;
    if (facing && onScreen) {
      el.classList.remove('hidden');
      el.style.left = `${(p.x * 0.5 + 0.5) * innerWidth}px`;
      el.style.top = `${(-p.y * 0.5 + 0.5) * innerHeight}px`;
    } else {
      el.classList.add('hidden');
      if (openId === def.id) closeCard();
    }
  }
}

// ---------------------------------------------------------------- finishes
const btnMid = document.getElementById('finish-midnight');
const btnCry = document.getElementById('finish-crystal');
function setFinish(mat, btn) {
  for (const m of acetateMeshes) m.material = mat;
  btnMid.classList.toggle('active', btn === btnMid);
  btnCry.classList.toggle('active', btn === btnCry);
}
btnMid.addEventListener('click', () => setFinish(matMidnight, btnMid));
btnCry.addEventListener('click', () => setFinish(matCrystal, btnCry));
if (new URLSearchParams(location.search).get('finish') === 'crystal') setFinish(matCrystal, btnCry);

// ---------------------------------------------------------------- intro + loop
const intro = document.getElementById('intro');
const CAM_END = new THREE.Vector3(140, 28, 235);
const CAM_START = camera.position.clone();
let introT = -1; // -1 idle, 0..1 animating, 2 done

// debug helpers for screenshot verification: ?yaw=<deg>&snap=1
const qp = new URLSearchParams(location.search);
const yawDeg = parseFloat(qp.get('yaw') ?? '');
if (!Number.isNaN(yawDeg)) {
  const th = (yawDeg * Math.PI) / 180;
  const { x, z } = CAM_END;
  CAM_END.x = x * Math.cos(th) + z * Math.sin(th);
  CAM_END.z = -x * Math.sin(th) + z * Math.cos(th);
}
const distScale = parseFloat(qp.get('dist') ?? '');
if (!Number.isNaN(distScale)) CAM_END.multiplyScalar(distScale);
if (qp.has('snap')) {
  camera.position.copy(CAM_END);
  introT = 2;
  controls.enabled = true;
  controls.autoRotate = false;
  intro.classList.add('gone');
  intro.style.display = 'none';
}

function startIntro() {
  if (introT >= 0) return;
  introT = 0;
  intro.classList.add('gone');
}
manager.onLoad = () => startIntro();
setTimeout(startIntro, 3500); // safety net

// pause auto-rotate while the user is in control
let idleTimer = null;
controls.addEventListener('start', () => {
  controls.autoRotate = false;
  canvas.classList.add('dragging');
  clearTimeout(idleTimer);
});
controls.addEventListener('end', () => {
  canvas.classList.remove('dragging');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => (controls.autoRotate = true), 6000);
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const clock = new THREE.Clock();
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  const t = clock.elapsedTime;

  if (introT >= 0 && introT < 1) {
    introT = Math.min(1, introT + dt / 1.7);
    camera.position.lerpVectors(CAM_START, CAM_END, easeOutCubic(introT));
    if (introT >= 1) controls.enabled = true;
  }

  glasses.position.y = Math.sin(t * 0.7) * 2.2; // gentle float
  const dotsMesh = scene.getObjectByName('dots');
  if (dotsMesh) dotsMesh.rotation.y = t * 0.012;

  controls.update();
  updateHotspots();
  renderer.render(scene, camera);
});
