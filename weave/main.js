// VYVEN — The Weave
// The logo, generated live from its own parametric equations.
// Two edge-strings (two experiences) are offset from one center curve and lofted
// into a single thickened ribbon (one memory). Press Presence and the form
// dissolves into a field of living light — the stadium of presence.
//
//   x(t) = (R + A·cos(f·t))·cos(t)
//   y(t) = (R + A·cos(f·t))·sin(t)
//   z(t) = H·sin(½f·t) + 0.35·A·sin((f+1)·t)

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const TWO_PI = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeInOut = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const lerp = (a, b, t) => a + (b - a) * t;

// ---- palette ----
const COL = {
  void: 0x000032,
  ribbon: 0xb2bdef,
  emissive: 0x14215f,
  stringL: 0x9fc2ff,   // light blue — one life
  stringR: 0x57f2ff,   // cyan — another presence
  cyan: 0x1bffff,
  coral: 0xff8059,
  red: 0xed423e,
};

// ---- parameters (the DNA of the mark) ----
const P = {
  R: 2.4, A: 1.45, f: 5, H: 1.3,
  twist: 1.5, width: 0.42,
  m: 0,           // weave: 0 = two strings apart, 1 = one woven mark
};
const THICK = 0.085;          // ribbon thickness
const STRING_R = 0.052;       // glowing string tube radius
const SPREAD_MAX = 1.55;      // how far the strings fly apart when unwoven
const EXTRA_TWIST = 2.4;      // extra revolutions the strings spiral when apart
const N = 480;                // curve segments
const RINGS = N + 1;
const T_GAP = 0.10;           // open-end gap (the free end of the ribbon)
const T0 = 0, T1 = TWO_PI - T_GAP;

const qs = new URLSearchParams(location.search);
const SNAP = qs.has('snap');

// =====================================================================
//  Renderer / scene / camera
// =====================================================================
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
scene.background = new THREE.Color(COL.void);
scene.fog = new THREE.FogExp2(COL.void, 0.018);

const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0.35, 10.4);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

// lights
scene.add(new THREE.AmbientLight(0x2a3a72, 0.55));
const key = new THREE.DirectionalLight(0xeaf0ff, 1.7); key.position.set(3, 5, 6); scene.add(key);
const rim = new THREE.DirectionalLight(COL.cyan, 1.25); rim.position.set(-5, -1.5, -5); scene.add(rim);
const fill = new THREE.DirectionalLight(0x4a63c9, 0.55); fill.position.set(-4, 4, 2); scene.add(fill);

const model = new THREE.Group();
model.rotation.set(-0.34, 0.16, 0.05);
scene.add(model);

// =====================================================================
//  Geometry buffers (built once, updated in place)
// =====================================================================
// parallel-transport frame along the center curve
const C = Array.from({ length: RINGS }, () => new THREE.Vector3());
const T = Array.from({ length: RINGS }, () => new THREE.Vector3());
const Nrm = Array.from({ length: RINGS }, () => new THREE.Vector3());
const Bin = Array.from({ length: RINGS }, () => new THREE.Vector3());
const tt = new Float32Array(RINGS);

const _W = new THREE.Vector3(), _Fn = new THREE.Vector3(), _p = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _ax = new THREE.Vector3();
const _q = new THREE.Quaternion();

function centerAt(t, out) {
  const rad = P.R + P.A * Math.cos(P.f * t);
  out.set(
    rad * Math.cos(t),
    rad * Math.sin(t),
    P.H * Math.sin(0.5 * P.f * t) + 0.35 * P.A * Math.sin((P.f + 1) * t)
  );
  return out;
}

function rebuildFrames() {
  for (let i = 0; i < RINGS; i++) {
    const t = lerp(T0, T1, i / N);
    tt[i] = t;
    centerAt(t, C[i]);
  }
  for (let i = 0; i < RINGS; i++) {
    const a = C[Math.max(0, i - 1)], b = C[Math.min(N, i + 1)];
    T[i].subVectors(b, a).normalize();
  }
  // initial normal
  const up = Math.abs(T[0].z) < 0.9 ? _a.set(0, 0, 1) : _a.set(0, 1, 0);
  Nrm[0].copy(up).addScaledVector(T[0], -T[0].dot(up)).normalize();
  Bin[0].crossVectors(T[0], Nrm[0]).normalize();
  for (let i = 1; i < RINGS; i++) {
    _ax.crossVectors(T[i - 1], T[i]);
    const s = _ax.length();
    if (s < 1e-6) {
      Nrm[i].copy(Nrm[i - 1]);
    } else {
      _ax.divideScalar(s);
      const ang = Math.acos(clamp(T[i - 1].dot(T[i]), -1, 1));
      _q.setFromAxisAngle(_ax, ang);
      Nrm[i].copy(Nrm[i - 1]).applyQuaternion(_q);
    }
    Nrm[i].addScaledVector(T[i], -T[i].dot(Nrm[i])).normalize();
    Bin[i].crossVectors(T[i], Nrm[i]).normalize();
  }
}

// width axis (W) and face normal (Fn) at ring i, given weave m (affects extra twist)
function ringAxes(i, m, W, Fn) {
  const phi = (P.twist + (1 - m) * EXTRA_TWIST) * (i / N) * TWO_PI;
  const c = Math.cos(phi), s = Math.sin(phi);
  W.copy(Nrm[i]).multiplyScalar(c).addScaledVector(Bin[i], s);
  Fn.copy(Nrm[i]).multiplyScalar(-s).addScaledVector(Bin[i], c);
}
function sepAt(i, m) {
  return P.width * 0.5 + Math.pow(1 - m, 1.25) * SPREAD_MAX * (0.6 + 0.4 * Math.sin(2.0 * tt[i]));
}

// ---- index helpers ----
function tubeIndices(rings, around) {
  const idx = [];
  for (let i = 0; i < rings - 1; i++) {
    for (let k = 0; k < around; k++) {
      const a = i * around + k, b = i * around + ((k + 1) % around);
      const c = (i + 1) * around + ((k + 1) % around), d = (i + 1) * around + k;
      idx.push(a, b, c, a, c, d);
    }
  }
  return idx;
}

// ---- ribbon (rectangular swept tube) ----
const ribbonVerts = RINGS * 4;
const ribbonPos = new Float32Array(ribbonVerts * 3);
const ribbonGeo = new THREE.BufferGeometry();
ribbonGeo.setAttribute('position', new THREE.BufferAttribute(ribbonPos, 3));
{
  const idx = tubeIndices(RINGS, 4);
  // end caps
  idx.push(0, 1, 2, 0, 2, 3);
  const base = (RINGS - 1) * 4;
  idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  ribbonGeo.setIndex(idx);
}
const ribbonMat = new THREE.MeshPhysicalMaterial({
  color: COL.ribbon, metalness: 0.5, roughness: 0.34,
  clearcoat: 0.7, clearcoatRoughness: 0.45,
  iridescence: 0.45, iridescenceIOR: 1.32,
  envMapIntensity: 1.05, emissive: COL.emissive, emissiveIntensity: 0.5,
  side: THREE.DoubleSide, transparent: true, opacity: 1,
});
const ribbon = new THREE.Mesh(ribbonGeo, ribbonMat);
ribbon.frustumCulled = false;
model.add(ribbon);

function writeVec(arr, vi, v) { arr[vi * 3] = v.x; arr[vi * 3 + 1] = v.y; arr[vi * 3 + 2] = v.z; }

function updateRibbon() {
  const halfW = P.width * 0.5, halfT = THICK * 0.5;
  let vi = 0;
  for (let i = 0; i < RINGS; i++) {
    ringAxes(i, 1, _W, _Fn);
    const cx = C[i];
    _p.copy(cx).addScaledVector(_W, halfW).addScaledVector(_Fn, halfT); writeVec(ribbonPos, vi++, _p);
    _p.copy(cx).addScaledVector(_W, halfW).addScaledVector(_Fn, -halfT); writeVec(ribbonPos, vi++, _p);
    _p.copy(cx).addScaledVector(_W, -halfW).addScaledVector(_Fn, -halfT); writeVec(ribbonPos, vi++, _p);
    _p.copy(cx).addScaledVector(_W, -halfW).addScaledVector(_Fn, halfT); writeVec(ribbonPos, vi++, _p);
  }
  ribbonGeo.attributes.position.needsUpdate = true;
  ribbonGeo.computeVertexNormals();
}

// ---- two strings (hexagonal glowing tubes) ----
function makeString(color) {
  const pos = new Float32Array(RINGS * 6 * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(tubeIndices(RINGS, 6));
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, toneMapped: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  model.add(mesh);
  return { pos, geo, mat, mesh };
}
const strL = makeString(COL.stringL);
const strR = makeString(COL.stringR);

const _hx = new THREE.Vector3();
function updateStrings(m) {
  for (let i = 0; i < RINGS; i++) {
    ringAxes(i, m, _W, _Fn);
    const sep = sepAt(i, m);
    // left & right string centers
    _a.copy(C[i]).addScaledVector(_W, sep);   // left
    _b.copy(C[i]).addScaledVector(_W, -sep);  // right
    for (let k = 0; k < 6; k++) {
      const ang = (k / 6) * TWO_PI;
      const cx = Math.cos(ang) * STRING_R, cy = Math.sin(ang) * STRING_R;
      _hx.copy(_a).addScaledVector(_W, cx).addScaledVector(_Fn, cy);
      writeVec(strL.pos, i * 6 + k, _hx);
      _hx.copy(_b).addScaledVector(_W, cx).addScaledVector(_Fn, cy);
      writeVec(strR.pos, i * 6 + k, _hx);
    }
  }
  strL.geo.attributes.position.needsUpdate = true;
  strR.geo.attributes.position.needsUpdate = true;
  strL.geo.computeVertexNormals();
  strR.geo.computeVertexNormals();
}

// ---- coral collision-heat flares (where the strings meet) ----
const flareTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,160,110,0.9)');
  grad.addColorStop(0.6, 'rgba(255,128,89,0.35)');
  grad.addColorStop(1, 'rgba(255,128,89,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
})();
const flares = [];
const FLARE_COUNT = 6;
for (let n = 0; n < FLARE_COUNT; n++) {
  const m = new THREE.SpriteMaterial({ map: flareTex, color: COL.coral, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
  const sp = new THREE.Sprite(m); sp.scale.setScalar(0.6); model.add(sp); flares.push(sp);
}
function updateFlares(m, time) {
  const heat = smoothstep(0.04, 0.5, m) * (1 - smoothstep(0.5, 0.96, m)); // peaks mid-weave
  for (let n = 0; n < FLARE_COUNT; n++) {
    const i = Math.floor(((n + 0.5) / FLARE_COUNT) * N);
    flares[n].position.copy(C[i]);
    const pulse = 0.7 + 0.3 * Math.sin(time * 4 + n);
    const v = heat * pulse;
    flares[n].material.opacity = v * 0.9;
    flares[n].scale.setScalar(0.35 + v * 0.7);
  }
}

// =====================================================================
//  Presence — the stadium of living light
// =====================================================================
const K = 4200;
const ptsPos = new Float32Array(K * 3);
const ptsColor = new Float32Array(K * 3);
const ptsSeed = new Float32Array(K);
const originPos = new Float32Array(K * 3);
const scatterPos = new Float32Array(K * 3);
const stadiumPos = new Float32Array(K * 3);

(function initPresenceTargets() {
  const cCyan = new THREE.Color(COL.cyan), cCoral = new THREE.Color(COL.coral), cRed = new THREE.Color(COL.red);
  const tiers = 14, TX = -0.5, ca = Math.cos(TX), sa = Math.sin(TX);
  for (let k = 0; k < K; k++) {
    ptsSeed[k] = Math.random();
    // colour: mostly cyan, a few coral/red flares "going live"
    const r = Math.random();
    const col = r < 0.05 ? cCoral : r < 0.08 ? cRed : cCyan;
    ptsColor[k * 3] = col.r; ptsColor[k * 3 + 1] = col.g; ptsColor[k * 3 + 2] = col.b;
    // scatter: random shell
    const u = Math.random() * 2 - 1, th = Math.random() * TWO_PI, sr = Math.sqrt(1 - u * u);
    const rr = 3.4 + Math.random() * 3.2;
    scatterPos[k * 3] = sr * Math.cos(th) * rr;
    scatterPos[k * 3 + 1] = u * rr;
    scatterPos[k * 3 + 2] = sr * Math.sin(th) * rr;
    // stadium bowl
    const j = Math.floor(Math.pow(Math.random(), 0.8) * tiers);
    const frac = j / (tiers - 1);
    const rx = 2.7 + frac * 4.5, rz = 1.9 + frac * 3.4, yy = -1.7 + frac * 3.3;
    const ang = Math.random() * TWO_PI, jr = 0.92 + Math.random() * 0.16;
    const px = Math.cos(ang) * rx * jr;
    let py = yy + (Math.random() - 0.5) * 0.16;
    const pz = Math.sin(ang) * rz * jr;
    stadiumPos[k * 3] = px;
    stadiumPos[k * 3 + 1] = (py * ca - pz * sa) + 0.5;
    stadiumPos[k * 3 + 2] = (py * sa + pz * ca);
  }
})();

const ptsGeo = new THREE.BufferGeometry();
ptsGeo.setAttribute('position', new THREE.BufferAttribute(ptsPos, 3));
ptsGeo.setAttribute('aColor', new THREE.BufferAttribute(ptsColor, 3));
ptsGeo.setAttribute('aSeed', new THREE.BufferAttribute(ptsSeed, 1));
const ptsMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 }, uSize: { value: 7.5 }, uOpacity: { value: 0 },
    uPixel: { value: Math.min(devicePixelRatio, 2) },
  },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `
    attribute vec3 aColor; attribute float aSeed;
    uniform float uTime, uSize, uPixel;
    varying vec3 vColor; varying float vTw;
    void main(){
      vColor = aColor;
      vec4 mv = modelViewMatrix * vec4(position,1.0);
      float tw = 0.55 + 0.45*sin(uTime*2.2 + aSeed*6.2831);
      vTw = tw;
      gl_PointSize = uSize * uPixel * (0.7 + 0.3*tw) * (9.0 / max(-mv.z, 0.1));
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform float uOpacity;
    varying vec3 vColor; varying float vTw;
    void main(){
      vec2 c = gl_PointCoord - 0.5;
      float d = length(c);
      if(d > 0.5) discard;
      float a = smoothstep(0.5, 0.05, d);
      gl_FragColor = vec4(vColor * (0.55 + 0.45*vTw), a * uOpacity * 0.85);
    }`,
});
const points = new THREE.Points(ptsGeo, ptsMat);
points.frustumCulled = false;
model.add(points);

function sampleSurfaceOrigins() {
  const halfW = P.width * 0.5, halfT = THICK * 0.5;
  for (let k = 0; k < K; k++) {
    const i = Math.floor(Math.random() * RINGS);
    ringAxes(i, 1, _W, _Fn);
    const u = Math.random() * 2 - 1, v = Math.random() * 2 - 1;
    _p.copy(C[i]).addScaledVector(_W, u * halfW).addScaledVector(_Fn, v * halfT);
    writeVec(originPos, k, _p);
  }
}

let presence = null; // { start, dur }
const PRES_DUR = 8.2;
function startPresence() {
  if (presence) return;
  sampleSurfaceOrigins();
  ptsPos.set(originPos);
  ptsGeo.attributes.position.needsUpdate = true;
  presence = { start: performance.now() / 1000 };
  btnPresence.classList.remove('ready');
  btnPresence.disabled = true;
}
function updatePresence(now) {
  const p = clamp((now - presence.start) / PRES_DUR, 0, 1);
  // position blend
  let from, to, e;
  if (p < 0.16) { from = originPos; to = scatterPos; e = easeOut(p / 0.16); }
  else if (p < 0.46) { from = scatterPos; to = stadiumPos; e = easeInOut((p - 0.16) / 0.30); }
  else if (p < 0.66) { from = stadiumPos; to = stadiumPos; e = 0; }
  else { from = stadiumPos; to = originPos; e = easeInOut((p - 0.66) / 0.34); }
  for (let k = 0; k < K * 3; k++) ptsPos[k] = from[k] + (to[k] - from[k]) * e;
  ptsGeo.attributes.position.needsUpdate = true;

  // form fades out as it bursts, fades back in as it reforms
  let formOp;
  if (p < 0.5) formOp = 1 - smoothstep(0.0, 0.15, p);
  else if (p < 0.72) formOp = 0;
  else formOp = smoothstep(0.72, 0.98, p);
  setFormOpacity(formOp);
  ptsMat.uniforms.uOpacity.value = smoothstep(0, 0.06, p) * (1 - smoothstep(0.92, 1.0, p));

  // narrative beat
  if (p > 0.18 && p < 0.62) setNarrative('presenceA');
  else if (p >= 0.62 && p < 0.9) setNarrative('presenceB');

  if (p >= 1) {
    presence = null;
    setFormOpacity(1);
    ptsMat.uniforms.uOpacity.value = 0;
    btnPresence.disabled = false;
    btnPresence.classList.add('ready');
    refreshNarrative();
  }
}
function setFormOpacity(o) {
  ribbonMat.opacity = o * smoothstep(0.45, 1.0, P.m);
  ribbon.visible = ribbonMat.opacity > 0.01;
  // the two strings burn bright while apart, then melt into the silken ribbon as they weave
  const sb = 1 - 0.6 * smoothstep(0.55, 1.0, P.m);
  strL.mat.opacity = o * sb; strR.mat.opacity = o * sb;
  for (const fl of flares) fl.visible = o > 0.5;
}

// =====================================================================
//  Post-processing — bloom + grain/vignette
// =====================================================================
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.62, 0.55, 0.22);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const grain = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uAmount: { value: 0.045 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uAmount; varying vec2 vUv;
    float rand(vec2 co){ return fract(sin(dot(co, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec4 col = texture2D(tDiffuse, vUv);
      vec2 q = vUv - 0.5;
      float vig = smoothstep(0.95, 0.32, length(q));
      col.rgb *= mix(0.74, 1.0, vig);
      float g = rand(vUv + fract(uTime)) - 0.5;
      col.rgb += g * uAmount;
      gl_FragColor = col;
    }`,
});
composer.addPass(grain);

// =====================================================================
//  Controls / interaction
// =====================================================================
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.minDistance = 6;
controls.maxDistance = 16;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.42;
controls.rotateSpeed = 0.65;

let lastInteract = performance.now();
controls.addEventListener('start', () => { controls.autoRotate = false; lastInteract = performance.now(); canvas.classList.add('dragging'); cancelAutoplay(); });
controls.addEventListener('end', () => { lastInteract = performance.now(); canvas.classList.remove('dragging'); });

// ---- UI wiring ----
const $ = (id) => document.getElementById(id);
function setFill(el) {
  const min = +el.min, max = +el.max, pct = ((+el.value - min) / (max - min)) * 100;
  el.style.setProperty('--fill', pct + '%');
}
function bindSlider(id, key, fmt, onChange) {
  const el = $(id), out = $('v-' + id.split('-')[1]);
  setFill(el);
  el.addEventListener('input', () => {
    P[key] = key === 'f' ? Math.round(+el.value) : +el.value;
    if (out) out.textContent = fmt(P[key]);
    setFill(el);
    onChange && onChange();
    dirty = true;
    lastInteract = performance.now();
  });
}
const f2 = (v) => v.toFixed(2);
bindSlider('sl-R', 'R', f2, syncEq);
bindSlider('sl-A', 'A', f2, syncEq);
bindSlider('sl-f', 'f', (v) => '' + v, syncEq);
bindSlider('sl-H', 'H', f2, syncEq);
bindSlider('sl-twist', 'twist', f2);
bindSlider('sl-width', 'width', f2);

const slWeave = $('sl-weave');
setFill(slWeave);
slWeave.addEventListener('input', () => {
  cancelAutoplay();
  P.m = +slWeave.value;
  setFill(slWeave);
  dirty = true;
  refreshNarrative();
  lastInteract = performance.now();
});

function syncEq() {
  $('eq-R').textContent = P.R.toFixed(2);
  $('eq-A').textContent = P.A.toFixed(2);
  $('eq-f').textContent = P.f;
  $('eq-H').textContent = P.H.toFixed(2);
}
syncEq();

// weave value UI
function setWeaveUI() {
  $('v-weave').textContent = Math.round(P.m * 100) + '%';
  slWeave.value = P.m; setFill(slWeave);
}

// ---- weave tween ----
let mTween = null;
function animateMTo(target, dur, done) {
  mTween = { from: P.m, to: target, start: performance.now(), dur, done };
}
function updateMTween(now) {
  if (!mTween) return;
  const t = clamp((now - mTween.start) / mTween.dur, 0, 1);
  P.m = lerp(mTween.from, mTween.to, easeInOut(t));
  dirty = true; setWeaveUI(); refreshNarrative();
  if (t >= 1) { const d = mTween.done; mTween = null; d && d(); }
}

// ---- autoplay (single gentle weave on first load) ----
let autoplay = !SNAP;
function cancelAutoplay() { autoplay = false; }

// ---- buttons ----
const btnWeave = $('btn-weave');
const btnPresence = $('btn-presence');
btnWeave.addEventListener('click', () => {
  cancelAutoplay();
  animateMTo(P.m < 0.5 ? 1 : 0, 1500);
  lastInteract = performance.now();
});
$('btn-reset').addEventListener('click', () => {
  cancelAutoplay();
  animateMTo(0, 1200);
  lastInteract = performance.now();
});
btnPresence.addEventListener('click', () => {
  cancelAutoplay();
  lastInteract = performance.now();
  if (P.m < 0.95) animateMTo(1, 900, startPresence);
  else startPresence();
});

// equation reveal
$('btn-eq').addEventListener('click', () => {
  const eq = $('eq'), collapsed = eq.classList.toggle('collapsed');
  $('btn-eq').innerHTML = collapsed ? 'Show the math &nbsp;›' : 'Hide the math &nbsp;‹';
});

// about
$('btn-info').addEventListener('click', () => $('about').classList.add('open'));
$('about-close').addEventListener('click', () => $('about').classList.remove('open'));
$('about').addEventListener('click', (e) => { if (e.target.id === 'about') $('about').classList.remove('open'); });

// ---- narrative ----
const NARR = {
  apart:    ['Two&nbsp;experiences.<br /><em>Drawn&nbsp;apart.</em>', 'Two strings. Two lives, two presences. Slide them together and watch them weave into one.'],
  drawing:  ['Drawing&nbsp;<em>together.</em>', 'Two paths, finding the same moment. Where they meet, heat — the live moment.'],
  weaving:  ['Weaving&nbsp;<em>into&nbsp;one.</em>', 'Two edge curves, lofted into a single surface. The fabric of a shared experience.'],
  one:      ['One&nbsp;<em>memory.</em>', 'The VYVEN mark — generated, not drawn. A sense of presence, made visible.'],
  presenceA:['Every dot is a <em>fan.</em>', 'The memory dissolves into living light. Every point a person. Every person, there.'],
  presenceB:['One&nbsp;<em>shared&nbsp;moment.</em>', 'Thousands of perspectives, present at once. This is what VYVEN unlocks.'],
};
let curNarr = '';
function setNarrative(kind) {
  if (curNarr === kind) return; curNarr = kind;
  const [h, s] = NARR[kind];
  const ht = $('narr-title'), st = $('narr-sub');
  ht.style.opacity = 0;
  setTimeout(() => { ht.innerHTML = h; st.textContent = s; ht.style.opacity = 1; }, 180);
}
function refreshNarrative() {
  if (presence) return;
  const m = P.m;
  setNarrative(m < 0.12 ? 'apart' : m < 0.5 ? 'drawing' : m < 0.9 ? 'weaving' : 'one');
}

// =====================================================================
//  Snap mode (headless screenshot)
// =====================================================================
let snapStatic = false;
if (SNAP) {
  P.m = qs.has('m') ? +qs.get('m') : 1;
  for (const k of ['R', 'A', 'f', 'H', 'twist', 'width']) if (qs.has(k)) P[k] = +qs.get(k);
  controls.autoRotate = false;
  if (qs.has('pres')) {
    snapStatic = true;
    setTimeout(() => {
      sampleSurfaceOrigins();
      ptsPos.set(stadiumPos);
      ptsGeo.attributes.position.needsUpdate = true;
      ptsMat.uniforms.uOpacity.value = 1;
      ribbonMat.opacity = 0; ribbon.visible = false;
      strL.mat.opacity = 0.15; strR.mat.opacity = 0.15;
    }, 60);
  }
  if (qs.has('yaw')) {
    const yaw = +qs.get('yaw') * Math.PI / 180, pit = (qs.has('pitch') ? +qs.get('pitch') : 8) * Math.PI / 180;
    const d = qs.has('dist') ? +qs.get('dist') : 10.4;
    camera.position.set(Math.sin(yaw) * Math.cos(pit) * d, Math.sin(pit) * d, Math.cos(yaw) * Math.cos(pit) * d);
  }
  setWeaveUI();
}

// =====================================================================
//  Resize
// =====================================================================
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  bloom.setSize(innerWidth, innerHeight);
  ptsMat.uniforms.uPixel.value = Math.min(devicePixelRatio, 2);
});

// =====================================================================
//  Loop
// =====================================================================
let dirty = true;
const clock = new THREE.Clock();

// build once before first frame
rebuildFrames(); updateRibbon(); updateStrings(P.m);
setFormOpacity(1); setWeaveUI(); refreshNarrative();

// fade the intro + kick off the opening weave
function begin() {
  const intro = $('intro');
  intro.classList.add('gone');
  setTimeout(() => intro.remove(), 1100);
  if (autoplay) setTimeout(() => { if (autoplay) animateMTo(1, 3400); }, 650);
}
if (SNAP) { $('intro').remove(); } else { setTimeout(begin, 350); }

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now() / 1000;
  const time = clock.getElapsedTime();

  updateMTween(performance.now());

  if (dirty) {
    rebuildFrames();
    updateRibbon();
    updateStrings(P.m);
    if (!presence && !snapStatic) setFormOpacity(1);
    dirty = !!mTween; // keep dirty while tweening
  }
  updateFlares(P.m, time);

  if (presence) updatePresence(now);

  // idle: resume auto-rotate
  if (!controls.autoRotate && performance.now() - lastInteract > 4000 && !presence) controls.autoRotate = true;

  // breathing
  const breathe = 1 + 0.012 * Math.sin(time * 0.8);
  model.scale.setScalar(breathe);
  ribbonMat.emissiveIntensity = 0.42 + 0.16 * Math.sin(time * 0.9);

  ptsMat.uniforms.uTime.value = time;
  grain.uniforms.uTime.value = time;

  controls.update();
  composer.render();
}
animate();
