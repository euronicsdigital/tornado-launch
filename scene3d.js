// Tornado 3D: loads the real product model and drives two scenes with it:
//  - the scroll film (full-bleed behind the copy, steered by the page's scroll timeline)
//  - the finish viewer (drag to turn, pick a finish)
// If WebGL or the model is unavailable the page keeps its image fallback and nothing here runs.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MODEL_URL = 'assets/tornado.glb';
const LOGO_URL = 'brand/euronics-wordmark-white.png';
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
  return Promise.all([model, logo]);
}

// One product instance with its own materials, so two scenes can show different finishes.
function makeInstance(gltf, logoTex) {
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
  return { root, pivot, mats };
}

function makeRenderer(canvas) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  r.setClearColor(0x000000, 0); r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
  return r;
}
const dprFor = w => Math.min(devicePixelRatio || 1, w < 600 ? 1.6 : 2);

// ---- the scroll film: sized to the page's square drawing box so it lines up with the sketch and the airflow ----
function createFilm(canvas, box, gltf, logoTex) {
  const renderer = makeRenderer(canvas), scene = new THREE.Scene(); scene.environment = makeEnv(renderer);
  const cam = new THREE.PerspectiveCamera(22, 1, 0.05, 10), inst = makeInstance(gltf, logoTex); scene.add(inst.root);
  function resize() {
    const w = Math.max(2, box.offsetWidth); renderer.setPixelRatio(dprFor(w)); renderer.setSize(w, w, false);
    const ppm = (w * 0.82) / HEIGHT, d = (w / 2) / (ppm * Math.tan(cam.fov * Math.PI / 360));   // art fills 82% of the box height
    cam.position.set(0, CENTER_Y - 0.0125 * w / ppm, d); cam.lookAt(0, CENTER_Y - 0.0125 * w / ppm, 0); cam.aspect = 1; cam.updateProjectionMatrix();
  }
  resize(); new ResizeObserver(resize).observe(box);
  return {
    canvas,
    update(s) { inst.pivot.rotation.set(s.rotX || 0, s.rotY || 0, 0); inst.pivot.scale.setScalar(s.scale || 1); applyFinish(inst.mats, s.finish || 0); },
    render() { renderer.render(scene, cam); }
  };
}

// ---- the finish viewer: drag to turn, auto-turns when idle ----
function createViewer(canvas, gltf, logoTex, reduce) {
  const host = canvas.parentElement, renderer = makeRenderer(canvas), scene = new THREE.Scene(); scene.environment = makeEnv(renderer);
  const cam = new THREE.PerspectiveCamera(24, 1, 0.05, 10), inst = makeInstance(gltf, logoTex); scene.add(inst.root);
  let yaw = 0.5, target = null, vel = 0, down = false, lastX = 0, idle = 0, finish = 0, finishTarget = 0, visible = false, raf = 0, last = 0;
  function resize() {
    const w = Math.max(2, host.clientWidth), h = Math.max(2, host.clientHeight); renderer.setPixelRatio(dprFor(w)); renderer.setSize(w, h, false);
    const fitH = 0.62, d = Math.max(fitH / 2 / Math.tan(cam.fov * Math.PI / 360), (0.60 / 2) / (Math.tan(cam.fov * Math.PI / 360) * (w / h)));
    cam.aspect = w / h; cam.position.set(0, CENTER_Y, d); cam.lookAt(0, CENTER_Y, 0); cam.updateProjectionMatrix();
  }
  resize(); new ResizeObserver(resize).observe(host);
  canvas.addEventListener('pointerdown', e => { down = true; lastX = e.clientX; vel = 0; target = null; idle = 0; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; });
  canvas.addEventListener('pointermove', e => { if (!down) return; const dx = e.clientX - lastX; lastX = e.clientX; yaw += dx * 0.011; vel = dx * 0.011; idle = 0; });
  const up = () => { down = false; canvas.style.cursor = 'grab'; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  function frame(t) {
    raf = 0; if (!visible) return; const dt = Math.min(0.05, (t - last) / 1000 || 0.016); last = t;
    if (!down) {
      if (target !== null) { const dlt = Math.atan2(Math.sin(target - yaw), Math.cos(target - yaw)); yaw += dlt * Math.min(1, dt * 7); if (Math.abs(dlt) < 0.002) target = null; }
      else { yaw += vel; vel *= 0.94; idle += dt; if (!reduce && idle > 2.5) yaw += dt * 0.35; }
    }
    finish += (finishTarget - finish) * Math.min(1, dt * 6);
    inst.pivot.rotation.y = yaw; applyFinish(inst.mats, finish); renderer.render(scene, cam); raf = requestAnimationFrame(frame);
  }
  new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }, { threshold: 0.05 }).observe(host);
  return {
    setFinish(i) { finishTarget = clamp(i, 0, 2); },
    setYaw(a) { target = a; idle = 0; vel = 0; },
    render() { inst.pivot.rotation.y = yaw; applyFinish(inst.mats, finish); renderer.render(scene, cam); },
    canvas
  };
}

(async () => {
  try {
    const probe = document.createElement('canvas');
    if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) throw new Error('no webgl');
    const [gltf, logoTex] = await loadAll(); logoTex.colorSpace = THREE.SRGBColorSpace; logoTex.anisotropy = 4;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const out = {};
    const fc = document.getElementById('gl'), box = document.getElementById('box');
    if (fc && box) out.film = createFilm(fc, box, gltf, logoTex);
    const vc = document.getElementById('fcanvas');
    if (vc) out.viewer = createViewer(vc, gltf, logoTex, reduce);
    window.T3D = out; window.dispatchEvent(new Event('tornado3d-ready'));
  } catch (err) {
    console.warn('Tornado 3D unavailable, using images:', err && err.message); window.dispatchEvent(new Event('tornado3d-fail'));
  }
})();
