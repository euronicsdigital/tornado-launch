// Tornado 3D: loads the real product model and drives two scenes with it:
//  - the scroll film (full-bleed behind the copy, steered by the page's scroll timeline)
//  - the finish viewer (drag to turn, pick a finish)
// If WebGL or the model is unavailable the page keeps its image fallback and nothing here runs.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MODEL_URL = 'assets/tornado.glb';
const LOGO_URL = 'brand/euronics-wordmark-white.png';
const INTERNALS_URL = 'assets/internals.glb';
const ACCENT = new THREE.Color('#7fe3ef');
const HEIGHT = 0.496, CENTER_Y = 0.248;                 // model is 457 x 496 x 149 mm, standing on y = 0
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

// stainless steel, gold, black (index = finish value 0, 1, 2)
const FIN = [
  { body: new THREE.Color('#d9dee2'), metal: 1.0, rough: 0.30, logo: new THREE.Color('#25292c') },
  { body: new THREE.Color('#e6bd63'), metal: 1.0, rough: 0.27, logo: new THREE.Color('#3a2c10') },
  { body: new THREE.Color('#23272c'), metal: 0.9, rough: 0.30, logo: new THREE.Color('#aab1b6') }
];
function applyFinish(mats, f) {
  f = clamp(f, 0, 2); const i = Math.min(1, Math.floor(f)), t = f - i, a = FIN[i], b = FIN[i + 1];
  mats.body.color.copy(a.body).lerp(b.body, t);
  mats.body.metalness = lerp(a.metal, b.metal, t); mats.body.roughness = lerp(a.rough, b.rough, t);
  mats.logo.color.copy(a.logo).lerp(b.logo, t);
}

// A bright studio: dark dome for contrast, tall soft boxes so the brushed metal shows its highlight bands.
function makeEnv(renderer) {
  const pm = new THREE.PMREMGenerator(renderer), e = new THREE.Scene();
  e.add(new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 p;void main(){p=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec3 p;void main(){float y=p.y;vec3 f=vec3(.09,.10,.11),h=vec3(.2,.22,.24),s=vec3(.5,.53,.56);vec3 c=mix(f,h,smoothstep(-.35,.05,y));c=mix(c,s,smoothstep(.05,.9,y));gl_FragColor=vec4(c,1.);}'
  })));
  const box = (w, h, x, y, z, i) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(i, i, i * 1.02), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); e.add(m); };
  box(2.6, 12, -7, 1, 7, 7); box(1.6, 12, 8, 1, 5, 5); box(9, 2.5, 0, 9, 2, 2.6); box(5, 10, -4, 0, -9, 0.9); box(7, 1.6, 2, -2, 9, 1.4); box(1.2, 12, 0, 1, 9, 2.2);
  const tex = pm.fromScene(e, 0.02).texture; pm.dispose(); return tex;
}

function loadAll() {
  const logo = new THREE.TextureLoader().loadAsync(LOGO_URL);
  const model = new GLTFLoader().loadAsync(MODEL_URL);
  const inner = new GLTFLoader().loadAsync(INTERNALS_URL).catch(() => null);   // optional: the film still works without it
  return Promise.all([model, logo, inner]);
}

// The pleated filter is an illustration: the engineering model has no separate filter part.
function makeFilter() {
  const N = 30, ro = 0.040, ri = 0.031, sh = new THREE.Shape();
  for (let i = 0; i < N * 2; i++) { const a = i / (N * 2) * Math.PI * 2, r = i % 2 ? ri : ro, x = Math.cos(a) * r, y = Math.sin(a) * r; i ? sh.lineTo(x, y) : sh.moveTo(x, y); }
  sh.closePath(); const hole = new THREE.Path(); hole.absarc(0, 0, 0.022, 0, Math.PI * 2, true); sh.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.11, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, -0.055, 0);
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xbfd6da, roughness: 0.75, metalness: 0.05, emissive: ACCENT, emissiveIntensity: 0, side: THREE.DoubleSide }));
}
const FILTER_HOME = [0, 0.27, 0.03];

// The motor is an illustration too: the engineering model has no motor in the stem (only the nozzle ducts, plates and a board).
const MOTOR_HOME = [0, 0.15, 0.02];
function makeMotor(mat) {
  const g = new THREE.Group(), spin = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.030, 0.072, 40), mat));
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, f = new THREE.Mesh(new THREE.BoxGeometry(0.0035, 0.07, 0.009), mat); f.position.set(Math.cos(a) * 0.0335, 0, Math.sin(a) * 0.0335); f.rotation.y = -a; g.add(f); }
  [-0.038, 0.038].forEach(y => { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.007, 40), mat); c.position.y = y; g.add(c); });
  spin.position.y = 0.052; spin.add(new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.02, 12), mat));
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.003, 48), mat); disc.position.y = -0.006; spin.add(disc);
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, b = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.016, 0.0018), mat); b.position.set(Math.cos(a) * 0.032, 0.003, Math.sin(a) * 0.032); b.rotation.set(0, -a + 0.5, 0.35); spin.add(b); }
  g.add(spin); g.userData.spin = spin; return g;
}

// Air streaks leaving the two blades, drawn as fading lines in the model's own space.
function makeAir() {
  const N = 520, pos = new Float32Array(N * 6), col = new Float32Array(N * 8), st = [];
  for (let i = 0; i < N; i++) st.push({ x: 0, z: 0, y: 0, v: 0, l: 0, k: 0 });
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false });
  const lines = new THREE.LineSegments(geo, mat); lines.frustumCulled = false;
  const respawn = q => { const left = Math.random() < 0.5; q.x = (left ? -1 : 1) * (0.09 + Math.random() * 0.11); q.z = 0.026 + Math.random() * 0.036; q.y = 0.018 - Math.random() * 0.02; q.v = 0.35 + Math.random() * 0.45; q.l = 0.03 + Math.random() * 0.07; q.k = 0.55 + Math.random() * 0.45; };
  st.forEach(q => { respawn(q); q.y -= Math.random() * 0.16; });
  return { lines, step(dt, power) {
    mat.opacity = power; lines.visible = power > 0.01; if (!lines.visible) return;
    for (let i = 0; i < N; i++) {
      const q = st[i]; q.y -= q.v * dt * 1.6; if (q.y < -0.15) respawn(q);
      const f = clamp((0.02 - q.y) / 0.15), a = (1 - f) * q.k, o = i * 6;
      pos[o] = q.x; pos[o + 1] = q.y; pos[o + 2] = q.z; pos[o + 3] = q.x; pos[o + 4] = q.y + q.l * (0.4 + f); pos[o + 5] = q.z;
      const c = i * 8; col[c] = col[c + 4] = 0.62; col[c + 1] = col[c + 5] = 0.93; col[c + 2] = col[c + 6] = 1; col[c + 3] = a * 0.4; col[c + 7] = a;   // tail faint, head bright
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
  } };
}

function applyGhost(mats, g) {
  const o = 1 - g * 0.9, t = g > 0.01;
  [mats.body, mats.dark].forEach(m => { m.transparent = t; m.opacity = o; m.depthWrite = g < 0.2; });
}

// One product instance with its own materials, so two scenes can show different finishes.
function makeInstance(gltf, logoTex, intGltf) {
  const root = new THREE.Group(), pivot = new THREE.Group(), inner = gltf.scene.clone(true);
  const body = new THREE.MeshPhysicalMaterial({ color: 0xd9dee2, metalness: 1, roughness: 0.3, side: THREE.DoubleSide });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0d0e10, metalness: 0.5, roughness: 0.5, side: THREE.DoubleSide });
  inner.traverse(o => { if (o.isMesh) o.material = o.name === 'steel' ? body : dark; });
  inner.position.y = -CENTER_Y;
  // the printed wordmark near the top of the column, curved to follow it
  const w = 0.040, r = 0.0712, th = w / r, h = w / (880 / 137);
  const logo = new THREE.MeshBasicMaterial({ map: logoTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false });
  const decal = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 28, 1, true, -th / 2, th), logo); decal.position.y = 0.455; decal.renderOrder = 2;
  inner.add(decal); pivot.add(inner); pivot.position.y = CENTER_Y; root.add(pivot);   // pivot sits at the model's centre: turn and scale happen around it
  const mats = { body, dark, logo }; applyFinish(mats, 0);
  const inst = { root, pivot, mats, ghost: 0 };
  if (intGltf) {   // the parts inside: two motor and blower units, the control board, an illustrative filter, and the airflow
    const parts = intGltf.scene.clone(true), motor = new THREE.MeshStandardMaterial({ color: 0x5a666d, metalness: 0.85, roughness: 0.3, emissive: ACCENT, emissiveIntensity: 0, side: THREE.DoubleSide });
    const board = new THREE.MeshStandardMaterial({ color: 0x15383d, metalness: 0.4, roughness: 0.5, emissive: ACCENT, emissiveIntensity: 0, side: THREE.DoubleSide });
    inst.mR = null; inst.mL = null;
    parts.traverse(o => { if (!o.isMesh) return; o.material = o.name === 'board' ? board : motor; if (o.name === 'motorR') inst.mR = o; if (o.name === 'motorL') inst.mL = o; });
    parts.visible = false; parts.position.y = 0; inner.add(parts);
    const filter = makeFilter(); filter.position.set(...FILTER_HOME); filter.visible = false; inner.add(filter);
    const motorIll = makeMotor(motor); motorIll.position.set(...MOTOR_HOME); motorIll.visible = false; inner.add(motorIll);
    const air = makeAir(); inner.add(air.lines);
    Object.assign(inst, { parts, motor, board, filter, air, motorIll });
  }
  inst.set = s => {
    pivot.rotation.set(s.rotX || 0, s.rotY || 0, 0); pivot.scale.setScalar(s.scale || 1); applyFinish(mats, s.finish || 0);
    const g = s.ghost || 0; applyGhost(mats, g);
    if (inst.parts) {
      inst.parts.visible = g > 0.02; const ex = s.explode || 0;
      if (inst.mR) inst.mR.position.x = ex * 0.075; if (inst.mL) inst.mL.position.x = -ex * 0.075;
      const pop = s.pop || 0; inst.filter.visible = pop > 0.01 && g > 0.02;
      inst.filter.position.set(FILTER_HOME[0], FILTER_HOME[1] + pop * 0.02, FILTER_HOME[2] + pop * 0.17); inst.filter.rotation.set(pop * 0.25, pop * 0.9, 0);
      const mo = s.motor || 0; inst.motorIll.visible = mo > 0.01 && g > 0.02; inst.motorIll.position.y = MOTOR_HOME[1] + (1 - mo) * -0.02; inst.motorIll.userData.spin.rotation.y = (s.spin || 0);
      inst.motor.emissiveIntensity = (s.glowMotor || 0) * 0.28; inst.board.emissiveIntensity = (s.glowBoard || 0) * 0.3; inst.filter.material.emissiveIntensity = (s.glowFilter || 0) * 0.14;
    }
  };
  return inst;
}

function makeRenderer(canvas) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  r.setClearColor(0x000000, 0); r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
  return r;
}
const dprFor = w => Math.min(devicePixelRatio || 1, w < 600 ? 1.6 : 2);

// ---- the scroll film: a camera rig. The canvas is larger than the drawing box so shots can push in and
// still fill the frame; at its widest the product sits exactly where the sketch and the image fallback put it.
const CANVAS_SCALE = 1.7;
function createFilm(canvas, box, gltf, logoTex, intGltf) {
  const renderer = makeRenderer(canvas), scene = new THREE.Scene(); scene.environment = makeEnv(renderer);
  const cam = new THREE.PerspectiveCamera(22, 1, 0.05, 10), inst = makeInstance(gltf, logoTex, intGltf); scene.add(inst.root);
  let d0 = 1, baseY = CENTER_Y, st = {}, last = performance.now();
  const tanH = Math.tan(cam.fov * Math.PI / 360), aim = new THREE.Vector3(), v = new THREE.Vector3();
  function resize() {
    const w = Math.max(2, box.offsetWidth), S = Math.round(w * CANVAS_SCALE);
    renderer.setPixelRatio(Math.min(dprFor(w), 1600 / S)); renderer.setSize(S, S, false);
    const ppm = (w * 0.82) / HEIGHT; d0 = (S / 2) / (ppm * tanH); baseY = CENTER_Y - 0.0125 * w / ppm;
    cam.aspect = 1; cam.updateProjectionMatrix(); place();
  }
  const toWorld = p => { v.set(p[0], p[1] - CENTER_Y, p[2]); inst.pivot.updateMatrixWorld(true); return inst.pivot.localToWorld(v); };
  function place() {
    const fa = st.focusAmt || 0; aim.set(0, baseY, 0);
    if (fa > 0 && st.focus) aim.lerp(toWorld(st.focus), fa);
    const dist = d0 / (1 + ((st.zoom || 1) - 1) * fa), half = dist * tanH * 2;   // half = visible width at the aim point
    const sx = (st.shiftX || 0) * half, sy = (st.shiftY || 0) * half;
    cam.position.set(aim.x - sx, aim.y - sy, aim.z + dist); cam.lookAt(aim.x - sx, aim.y - sy, aim.z); cam.updateMatrixWorld(true);
  }
  resize(); new ResizeObserver(resize).observe(box);
  return {
    canvas,
    update(s) { st = s; inst.set(s); place(); },
    // where a point on the model (metres, model space) lands on screen
    project(p) { const r = canvas.getBoundingClientRect(), w = toWorld(p).clone().project(cam); return { x: r.left + (w.x * 0.5 + 0.5) * r.width, y: r.top + (-w.y * 0.5 + 0.5) * r.height }; },
    render() { const n = performance.now(), dt = Math.min(0.05, (n - last) / 1000); last = n; if (inst.air) inst.air.step(dt, st.air || 0); renderer.render(scene, cam); }
  };
}

// ---- the finish viewer: drag to turn, auto-turns when idle ----
function createViewer(canvas, gltf, logoTex, reduce) {
  const host = canvas.parentElement, renderer = makeRenderer(canvas), scene = new THREE.Scene(); scene.environment = makeEnv(renderer);
  const cam = new THREE.PerspectiveCamera(24, 1, 0.05, 10), inst = makeInstance(gltf, logoTex, null); scene.add(inst.root);
  let yaw = 0.5, pitch = 0.12, vpitch = 0, target = null, vel = 0, down = false, lastX = 0, lastY = 0, idle = 0, finish = 0, finishTarget = 0, visible = false, raf = 0, last = 0;
  function resize() {
    const w = Math.max(2, host.clientWidth), h = Math.max(2, host.clientHeight); renderer.setPixelRatio(dprFor(w)); renderer.setSize(w, h, false);
    const fitH = 0.62, d = Math.max(fitH / 2 / Math.tan(cam.fov * Math.PI / 360), (0.60 / 2) / (Math.tan(cam.fov * Math.PI / 360) * (w / h)));
    cam.aspect = w / h; cam.position.set(0, CENTER_Y, d); cam.lookAt(0, CENTER_Y, 0); cam.updateProjectionMatrix();
  }
  resize(); new ResizeObserver(resize).observe(host);
  canvas.addEventListener('pointerdown', e => { down = true; lastX = e.clientX; vel = 0; vpitch = 0; target = null; idle = 0; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; });
  canvas.addEventListener('pointermove', e => { if (!down) return; const dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY; yaw += dx * 0.011; vel = dx * 0.011; pitch = clamp(pitch + dy * 0.009, -1.25, 1.25); idle = 0; });
  const up = () => { down = false; canvas.style.cursor = 'grab'; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  function frame(t) {
    raf = 0; if (!visible) return; const dt = Math.min(0.05, (t - last) / 1000 || 0.016); last = t;
    if (!down) {
      if (target !== null) { const dlt = Math.atan2(Math.sin(target - yaw), Math.cos(target - yaw)); yaw += dlt * Math.min(1, dt * 7); if (Math.abs(dlt) < 0.002) target = null; }
      else { yaw += vel; vel *= 0.94; idle += dt; if (!reduce && idle > 2.5) yaw += dt * 0.35; }
    }
    finish += (finishTarget - finish) * Math.min(1, dt * 6);
    inst.set({ rotY: yaw, rotX: pitch, finish, scale: 1 }); renderer.render(scene, cam); raf = requestAnimationFrame(frame);
  }
  new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }, { threshold: 0.05 }).observe(host);
  return {
    setFinish(i) { finishTarget = clamp(i, 0, 2); },
    setYaw(a) { target = a; idle = 0; vel = 0; },
    render() { inst.set({ rotY: yaw, rotX: pitch, finish, scale: 1 }); renderer.render(scene, cam); },
    canvas
  };
}

(async () => {
  try {
    const probe = document.createElement('canvas');
    if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) throw new Error('no webgl');
    const [gltf, logoTex, intGltf] = await loadAll(); logoTex.colorSpace = THREE.SRGBColorSpace; logoTex.anisotropy = 4;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const out = {};
    const fc = document.getElementById('gl'), box = document.getElementById('box');
    if (fc && box) out.film = createFilm(fc, box, gltf, logoTex, intGltf);
    const vc = document.getElementById('fcanvas');
    if (vc) out.viewer = createViewer(vc, gltf, logoTex, reduce);
    out.hasInternals = !!intGltf;
    window.T3D = out; window.dispatchEvent(new Event('tornado3d-ready'));
  } catch (err) {
    console.warn('Tornado 3D unavailable, using images:', err && err.message); window.dispatchEvent(new Event('tornado3d-fail'));
  }
})();
