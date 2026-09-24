'use client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, MeshTransmissionMaterial, RoundedBox } from '@react-three/drei';
import { Bloom, EffectComposer, ToneMapping } from '@react-three/postprocessing';
import { a, to, useSpring } from '@react-spring/three';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

export type DomeMode = 'idle' | 'urgent' | 'critical' | 'disabled' | 'pending';
export type DomeSceneProps = { pressed: boolean; hovered: boolean; mode: DomeMode; bounceKey?: string; compact: boolean; reduced: boolean; paused?: boolean; onReady: () => void };

// ---- dimensions (floor at y = 0) ----
const W = 2, FEET_H = 0.05, BODY_H = 0.55, CORNER = 0.1;
const BODY_TOP = FEET_H + BODY_H;
const PLATE_W = W - 0.16, PLATE_H = 0.05, PLATE_TOP = BODY_TOP + PLATE_H;
const R = 0.66; // glass shell radius
const CORE_R = R * 0.82;
const SEAT = PLATE_TOP - 0.035; // dome equator sits below the plate, inside the chrome collar
const COLLAR = R + 0.055;
const BOUNCE = 0.09, HOVER_LIFT = 0.025 * R;
const YAW = THREE.MathUtils.degToRad(35), SWAY = THREE.MathUtils.degToRad(3), PARALLAX = THREE.MathUtils.degToRad(5);
const PRESS = { tension: 600, friction: 22 }, RELEASE = { tension: 400, friction: 14 }, HOVER = { tension: 900, friction: 60 };
const INNER = 3.2;
const PITCH = THREE.MathUtils.degToRad(32), FOV = 28, MARGIN = 1.15;
// postprocessing's ToneMappingMode.ACES_FILMIC (the package is a transitive dependency, not importable under pnpm)
const ACES_FILMIC = 6;

// ---- constant props (fresh arrays would make r3f re-apply props and request frames on every parent render) ----
const ORIGIN: [number, number, number] = [0, 0, 0];
const IRIDESCENCE_RANGE: [number, number] = [200, 800];
const GL = { antialias: true, alpha: true, powerPreference: 'high-performance' as const };
const CAMERA = { position: [0, 4, 6] as [number, number, number], fov: FOV };
const CANVAS_STYLE = { pointerEvents: 'none' as const };
const SHELL_BACKGROUND = new THREE.Color('#FAFAF7');

// Sampled from public/brand/crown.png (median of each hue cluster, plus its bright highlights).
// THREE.Color converts these sRGB hex values into the linear working space the shader works in.
const CROWN = { lilac: '#B28BE7', lilacHi: '#E399F5', cyan: '#58EAFA', cyanHi: '#9DE0FD', pink: '#FD9CCB', pinkHi: '#FCB5F9', sky: '#5195FC', white: '#FDF6FD', rose: '#FDAA98' };
const URGENT = { red: '#FF3B5C', hot: '#FF2D95', deep: '#8C0A2A' };
const color = (hex: string) => new THREE.Color(hex);

// ---- shaders ----
const SIMPLEX = /* glsl */`
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
i=mod289(i);vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}
float fbm(vec3 p){ return 0.58 * snoise(p) + 0.29 * snoise(p * 2.03 + 11.7) + 0.13 * snoise(p * 4.01 - 5.3); }`;

const CORE_VERTEX = /* glsl */`varying vec3 vPos; varying vec3 vNormal;
void main(){ vPos = position; vNormal = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// Crown-matched pastel glass: lilac, sky cyan and candy pink flowing through three octaves of noise, milky white
// toward the top (fake subsurface glow), a little deeper at the rim. Urgency swaps in the red palette.
const CORE_FRAGMENT = /* glsl */`uniform float uTime, uUrgency, uPulse, uPress, uSat, uFlash, uPending, uSweep, uLift, uChroma;
uniform vec3 uLilac, uLilacHi, uCyan, uCyanHi, uPink, uPinkHi, uSky, uWhite, uRose, uRed, uHot, uDeep;
varying vec3 vPos; varying vec3 vNormal; ${SIMPLEX}
void main(){
  float t = uTime * 6.2831853 / 12.0;
  vec3 p = vPos * 1.35;
  float ang = t + vPos.y * 1.6;
  p.xz = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * p.xz;
  float a = fbm(p + vec3(0.0, t * 0.35, 0.0)) * 0.5 + 0.5;
  float b = fbm(p * 1.3 + vec3(3.7, -t * 0.25, 1.9)) * 0.5 + 0.5;
  float w = fbm(p * 0.9 + vec3(-2.3, t * 0.2, 4.4)) * 0.5 + 0.5;
  vec3 cool = mix(uCyan, uCyanHi, smoothstep(0.3, 0.9, b));
  cool = mix(uSky, cool, smoothstep(0.15, 0.55, b));
  vec3 warm = mix(uLilac, uPink, smoothstep(0.28, 0.7, b));
  warm = mix(warm, uPinkHi, smoothstep(0.75, 0.98, a) * 0.6);
  warm = mix(warm, uRose, smoothstep(0.78, 0.98, b) * 0.5);
  vec3 c = mix(cool, warm, smoothstep(0.32, 0.68, a));
  c = mix(c, uLilacHi, smoothstep(0.55, 0.9, w) * 0.35);
  float top = clamp(normalize(vNormal).y, 0.0, 1.0);
  c = mix(c, uWhite, smoothstep(0.4, 0.95, top) * smoothstep(0.4, 0.8, w) * 0.85);
  vec3 u = mix(uDeep, uRed, smoothstep(0.2, 0.7, a));
  u = mix(u, uHot, smoothstep(0.55, 0.9, b));
  c = mix(c, u, uUrgency);
  c *= mix(0.72, 1.12, pow(top, 1.2)) * uLift;
  c *= 1.0 + uPulse * 0.7 + uPress * 0.6 + uFlash * 1.3;
  float sweep = exp(-pow(dot(normalize(vPos.xz + 1e-4), vec2(0.8, 0.6)) * length(vPos.xz) / ${R.toFixed(3)} - uSweep, 2.0) * 10.0);
  c *= mix(1.0, 0.4 + sweep * 0.9, uPending);
  // uChroma pre-compensates for the glass shell and ACES, which both pull saturation out of the core.
  float g = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = max(mix(vec3(g), c, uChroma * uSat), 0.0);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

// ---- procedural textures, generated once ----
let knurlCache: THREE.DataTexture | null = null;
function knurlNormalMap() {
  if (knurlCache) return knurlCache;
  const width = 1024, height = 4, ridges = 220, strength = 0.9, data = new Uint8Array(width * height * 4);
  for (let x = 0; x < width; x++) {
    const slope = Math.cos(2 * Math.PI * ridges * x / width) * strength;
    const n = new THREE.Vector3(-slope, 0, 1).normalize();
    for (let y = 0; y < height; y++) { const i = (y * width + x) * 4; data[i] = (n.x * .5 + .5) * 255; data[i + 1] = (n.y * .5 + .5) * 255; data[i + 2] = (n.z * .5 + .5) * 255; data[i + 3] = 255; }
  }
  knurlCache = new THREE.DataTexture(data, width, height, THREE.RGBAFormat); // normal data: stays linear (NoColorSpace)
  knurlCache.wrapS = knurlCache.wrapT = THREE.RepeatWrapping; knurlCache.anisotropy = 8; knurlCache.needsUpdate = true;
  return knurlCache;
}
let engraveCache: THREE.CanvasTexture | null = null;
function engravingTexture() {
  if (engraveCache) return engraveCache;
  const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.font = `800 420px ${getComputedStyle(document.body).fontFamily}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // Debossed: a dark lip along the top inner edge, a light lip along the bottom, the letter floor a touch darker than the wall.
  ctx.fillStyle = 'rgba(16,16,20,.34)'; ctx.fillText('usurp', 1024, 248);
  ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.fillText('usurp', 1024, 268);
  ctx.fillStyle = '#E6E5E1'; ctx.fillText('usurp', 1024, 258);
  engraveCache = new THREE.CanvasTexture(canvas); engraveCache.colorSpace = THREE.SRGBColorSpace; engraveCache.anisotropy = 8;
  return engraveCache;
}

let shadowCache: THREE.CanvasTexture | null = null;
const SHADOW_SIZE = 3.4;
function shadowTexture() {
  if (shadowCache) return shadowCache;
  const size = 512, canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const px = size / SHADOW_SIZE; // canvas pixels per world unit
  // shadowBlur works everywhere (unlike ctx.filter): draw each footprint off-canvas and keep only its blurred shadow
  const pass = (half: number, blur: number, alpha: number) => {
    ctx.save(); ctx.shadowColor = `rgba(16,16,20,${alpha})`; ctx.shadowBlur = blur; ctx.shadowOffsetX = size * 2;
    ctx.beginPath(); ctx.roundRect(size / 2 - half * px - size * 2, size / 2 - half * px, half * 2 * px, half * 2 * px, CORNER * px); ctx.fill(); ctx.restore();
  };
  pass(W / 2 + 0.04, 70, 0.32); // wide ambient falloff
  pass(W / 2 - 0.04, 18, 0.28); // tight contact core under the feet
  shadowCache = new THREE.CanvasTexture(canvas); shadowCache.colorSpace = THREE.SRGBColorSpace;
  return shadowCache;
}

// ---- framing: fit the most extreme pose (sway + parallax + bounce + hover) plus the contact shadow, with margin ----
function silhouettePoints() {
  const pts: THREE.Vector3[] = [];
  const h = W / 2 + 0.2; // shadow spills a little past the footprint
  for (const x of [-1, 1]) for (const z of [-1, 1]) { pts.push(new THREE.Vector3(x * W / 2, PLATE_TOP + 0.02, z * W / 2), new THREE.Vector3(x * h, 0, z * h)); }
  for (let i = 0; i < 24; i++) { const t = i / 24 * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(t) * (COLLAR + 0.05), PLATE_TOP + 0.03, Math.sin(t) * (COLLAR + 0.05))); }
  for (let i = 0; i < 12; i++) { const t = i / 12 * Math.PI * 2; for (const e of [0.3, 0.7]) pts.push(new THREE.Vector3(Math.cos(t) * R * Math.cos(e), SEAT + BOUNCE + HOVER_LIFT + R * Math.sin(e), Math.sin(t) * R * Math.cos(e))); }
  pts.push(new THREE.Vector3(0, SEAT + R + BOUNCE + HOVER_LIFT, 0));
  return pts;
}
const SILHOUETTE = silhouettePoints();
function frameCamera(camera: THREE.PerspectiveCamera, aspect: number) {
  camera.fov = FOV; camera.aspect = aspect; camera.updateProjectionMatrix();
  const dir = new THREE.Vector3(0, Math.sin(PITCH), Math.cos(PITCH));
  const target = new THREE.Vector3(0, 0.55, 0);
  const poses: THREE.Euler[] = [];
  for (const dy of [-1, -0.5, 0, 0.5, 1]) for (const dx of [-1, 0, 1]) poses.push(new THREE.Euler(dx * PARALLAX * 0.5, YAW + dy * (SWAY + PARALLAX), 0, 'YXZ'));
  const world = poses.flatMap(e => SILHOUETTE.map(p => p.clone().applyEuler(e)));
  const extents = (d: number) => {
    camera.position.copy(target).addScaledVector(dir, d); camera.lookAt(target); camera.updateMatrixWorld();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of world) { const v = p.clone().project(camera); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
    return { x0, x1, y0, y1 };
  };
  let d = 6;
  for (let pass = 0; pass < 4; pass++) {
    let lo = 2, hi = 40;
    for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; const e = extents(mid); const fits = (e.x1 - e.x0) * MARGIN <= 2 && (e.y1 - e.y0) * MARGIN <= 2; if (fits) hi = mid; else lo = mid; }
    d = hi;
    // recentre: shift the target so the silhouette sits in the middle of the frame
    const e = extents(d);
    const halfH = Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * d;
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion), right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    target.addScaledVector(up, (e.y0 + e.y1) / 2 * halfH).addScaledVector(right, (e.x0 + e.x1) / 2 * halfH * aspect);
  }
  camera.position.copy(target).addScaledVector(dir, d); camera.lookAt(target); camera.updateProjectionMatrix();
}
function Framing() {
  const camera = useThree(s => s.camera) as THREE.PerspectiveCamera;
  const size = useThree(s => s.size);
  const invalidate = useThree(s => s.invalidate);
  useLayoutEffect(() => { if (size.width && size.height) { frameCamera(camera, size.width / size.height); invalidate(); } }, [camera, size.width, size.height, invalidate]);
  return null;
}

// ---- the animated state every frame reads from ----
type Live = { swirl: number; speed: number; urgency: number; sat: number; flash: number; sweep: number; sway: number; px: number; py: number; vx: number; vy: number; tx: number; ty: number };

function Screw({ x, z, turn }: { x: number; z: number; turn: number }) {
  return <group position={[x, PLATE_TOP - 0.004, z]} rotation-y={turn}>
    <mesh position-y={0.001}><cylinderGeometry args={[0.062, 0.062, 0.004, 32]}/><meshStandardMaterial color="#9a9aa2" metalness={1} roughness={0.35}/></mesh>
    <mesh position-y={0.006}><cylinderGeometry args={[0.048, 0.054, 0.012, 32]}/><meshStandardMaterial color="#ffffff" metalness={1} roughness={0.14}/></mesh>
    <mesh position-y={0.012}><boxGeometry args={[0.078, 0.012, 0.012]}/><meshStandardMaterial color="#26262c" metalness={0.6} roughness={0.5}/></mesh>
  </group>;
}

function Housing() {
  const ceramic = { color: '#FFFFFF', roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.9 };
  const knurl = useMemo(() => knurlNormalMap(), []);
  const [engraving, setEngraving] = useState<THREE.CanvasTexture | null>(null);
  const invalidate = useThree(s => s.invalidate);
  useEffect(() => { let live = true; void document.fonts.ready.then(() => { if (live) { setEngraving(engravingTexture()); invalidate(); } }); return () => { live = false; }; }, [invalidate]);
  const turns = [0.4, 1.9, 2.7, 0.9];
  const corner = PLATE_W / 2 - 0.13;
  return <group>
    {/* body, lifted off the floor by four rubber feet */}
    <RoundedBox args={[W, BODY_H, W]} radius={CORNER} smoothness={6} position-y={FEET_H + BODY_H / 2}><meshPhysicalMaterial {...ceramic}/></RoundedBox>
    {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => <mesh key={`${sx}${sz}`} position={[sx * 0.78, FEET_H / 2, sz * 0.78]}><cylinderGeometry args={[0.075, 0.085, FEET_H, 24]}/><meshStandardMaterial color="#1c1c21" roughness={0.85}/></mesh>)}
    {/* seam, then the warmer top plate */}
    <RoundedBox args={[PLATE_W + 0.016, 0.014, PLATE_W + 0.016]} radius={0.006} smoothness={2} position-y={BODY_TOP + 0.004}><meshStandardMaterial color="#B9B8B2" roughness={0.6}/></RoundedBox>
    <RoundedBox args={[PLATE_W, PLATE_H, PLATE_W]} radius={0.02} smoothness={4} position-y={BODY_TOP + PLATE_H / 2 + 0.002}><meshPhysicalMaterial {...ceramic} color="#F6F5F2" roughness={0.28}/></RoundedBox>
    {/* recessed seat and machined chrome collar */}
    <mesh position-y={PLATE_TOP + 0.001} rotation-x={-Math.PI / 2}><circleGeometry args={[COLLAR, 96]}/><meshStandardMaterial color="#3a3346" roughness={0.4}/></mesh>
    <mesh position-y={PLATE_TOP + 0.012} rotation-x={-Math.PI / 2} scale-z={0.7}><torusGeometry args={[COLLAR, 0.05, 32, 256]}/><meshStandardMaterial color="#ffffff" metalness={1} roughness={0.12} normalMap={knurl} normalScale={[0.6, 0.6] as unknown as THREE.Vector2}/></mesh>
    {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => <Screw key={i} x={sx * corner} z={sz * corner} turn={turns[i]}/>)}
    {/* debossed wordmark on the front wall */}
    {engraving && <mesh position={[0, FEET_H + BODY_H * 0.48, W / 2 + 0.0015]}><planeGeometry args={[1.2, 0.3]}/><meshStandardMaterial map={engraving} transparent roughness={0.3} polygonOffset polygonOffsetFactor={-2}/></mesh>}
  </group>;
}

function Ready({ onReady }: { onReady: () => void }) {
  const done = useRef(false);
  useFrame(() => { if (done.current) return; done.current = true; requestAnimationFrame(onReady); });
  return null;
}

// These children must keep their identity across hover/press updates. Drei recaptures the
// environment and the composer rebuilds its passes when their children change.
const StudioEnvironment = memo(function StudioEnvironment() {
  return <Environment resolution={256} frames={1}>
    <Lightformer form="rect" intensity={2.4} position={[-3, 5, 2]} scale={[6, 4, 1]} target={ORIGIN}/>
    <Lightformer form="rect" intensity={4} position={[-3.4, 1.2, 0.4]} rotation-y={Math.PI / 2} scale={[0.22, 6, 1]}/>
    <Lightformer form="rect" intensity={4} position={[3.4, 1.2, 0.4]} rotation-y={-Math.PI / 2} scale={[0.22, 6, 1]}/>
    <Lightformer form="rect" color="#B28BE7" intensity={1.2} position={[-2.6, 0.6, -3]} scale={[4, 2.5, 1]} target={ORIGIN}/>
    <Lightformer form="rect" color="#58EAFA" intensity={1.2} position={[2.8, 0.6, -2.6]} scale={[4, 2.5, 1]} target={ORIGIN}/>
  </Environment>;
});

const SceneEffects = memo(function SceneEffects() {
  // The composer bypasses the renderer's MSAA and tone mapping, so both are set here.
  return <EffectComposer multisampling={8} enableNormalPass={false}>
    <Bloom mipmapBlur intensity={0.6} luminanceThreshold={1} luminanceSmoothing={0.15} radius={0.6}/>
    <ToneMapping mode={ACES_FILMIC}/>
  </EffectComposer>;
});

// Soft light bouncing up from the video's blue, pink and lilac streaks. In the
// assembly's coordinates, -X/+Z is the corner nearest the viewer.
const Underlighting = memo(function Underlighting() {
  return <>
    <pointLight color={CROWN.sky} position={[-1.45, -0.22, 1.45]} intensity={1.6} distance={2.8} decay={2}/>
    <pointLight color={CROWN.pink} position={[1.55, -0.15, 1.25]} intensity={1.2} distance={3} decay={2}/>
    <pointLight color={CROWN.lilac} position={[-1.55, -0.1, -0.65]} intensity={0.9} distance={2.6} decay={2}/>
  </>;
});

function Scene({ pressed, hovered, mode, bounceKey, reduced, paused, onReady }: DomeSceneProps) {
  const invalidate = useThree(s => s.invalidate);
  const canvas = useThree(s => s.gl.domElement);
  const assembly = useRef<THREE.Group>(null);
  const inner = useRef<THREE.PointLight>(null);
  const live = useRef<Live>({ swirl: 0, speed: 1, urgency: 0, sat: 1, flash: 0, sweep: -1.4, sway: 1, px: 0, py: 0, vx: 0, vy: 0, tx: 0, ty: 0 });
  const uniforms = useMemo(() => ({
    uTime: { value: 0 }, uUrgency: { value: 0 }, uPulse: { value: 0 }, uPress: { value: 0 }, uSat: { value: 1 }, uFlash: { value: 0 }, uPending: { value: 0 }, uSweep: { value: -1.4 }, uLift: { value: 1.22 }, uChroma: { value: 3.0 },
    uLilac: { value: color(CROWN.lilac) }, uLilacHi: { value: color(CROWN.lilacHi) }, uCyan: { value: color(CROWN.cyan) }, uCyanHi: { value: color(CROWN.cyanHi) },
    uPink: { value: color(CROWN.pink) }, uPinkHi: { value: color(CROWN.pinkHi) }, uSky: { value: color(CROWN.sky) }, uWhite: { value: color(CROWN.white) }, uRose: { value: color(CROWN.rose) },
    uRed: { value: color(URGENT.red) }, uHot: { value: color(URGENT.hot) }, uDeep: { value: color(URGENT.deep) }
  }), []);
  const core = useMemo(() => new THREE.ShaderMaterial({ uniforms, vertexShader: CORE_VERTEX, fragmentShader: CORE_FRAGMENT }), [uniforms]);

  // Press mechanics: react-spring only. Reduced motion keeps a plain depth change.
  const wasPressed = useRef(false);
  const config = pressed ? PRESS : wasPressed.current ? RELEASE : HOVER;
  const { y, sy, key, glow } = useSpring({ y: pressed ? -0.14 * R : hovered ? HOVER_LIFT : 0, sy: pressed ? 0.95 : 1, key: hovered && !pressed ? 1.1 : 1, glow: pressed ? 1 : 0, config, immediate: reduced });
  useEffect(() => {
    if (wasPressed.current && !pressed && !reduced) live.current.flash = 1; // release: the core flashes bright for 150ms
    wasPressed.current = pressed; invalidate();
  }, [pressed, reduced, invalidate]);
  const [{ b }, bounce] = useSpring(() => ({ b: 0 }));
  const firstBounce = useRef(bounceKey);
  useEffect(() => {
    if (!bounceKey || bounceKey === firstBounce.current || reduced) return;
    void bounce.start({ to: [{ b: BOUNCE, config: { tension: 900, friction: 16 } }, { b: 0, config: RELEASE }] });
    invalidate();
  }, [bounceKey, bounce, invalidate, reduced]);
  useEffect(() => { invalidate(); }, [hovered, mode, reduced, paused, invalidate]);

  // Desktop pointer parallax: up to 5 degrees toward the cursor.
  useEffect(() => {
    if (reduced) { live.current.tx = live.current.ty = 0; return; }
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const r = canvas.getBoundingClientRect();
      live.current.tx = THREE.MathUtils.clamp((e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2), -1, 1);
      live.current.ty = THREE.MathUtils.clamp((e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2), -1, 1);
      if (!document.hidden) invalidate();
    };
    window.addEventListener('pointermove', move); return () => window.removeEventListener('pointermove', move);
  }, [canvas, invalidate, reduced]);
  useEffect(() => {
    const wake = () => { if (!document.hidden) invalidate(); };
    document.addEventListener('visibilitychange', wake); return () => document.removeEventListener('visibilitychange', wake);
  }, [invalidate]);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05), s = live.current, now = Date.now();
    const off = mode === 'disabled', pending = mode === 'pending', red = mode === 'urgent' || mode === 'critical';
    const moving = !reduced;
    // urgency and saturation crossfade over 600ms (instant with reduced motion)
    const step = (from: number, target: number) => reduced ? target : from < target ? Math.min(target, from + dt / 0.6) : Math.max(target, from - dt / 0.6);
    s.urgency = step(s.urgency, red ? 1 : 0);
    s.sat = step(s.sat, off ? 0.08 : 1);
    s.speed += ((hovered ? 1.45 : 1) - s.speed) * Math.min(1, dt * 6);
    const swirling = moving && !off;
    if (swirling) s.swirl += dt * s.speed;
    // beat: 1/s in the final minute, phase-locked to the page-edge vignette through the wall clock; tighter in the last 10s
    let pulse = 0;
    if (moving && mode === 'urgent') pulse = 0.5 - 0.5 * Math.cos(2 * Math.PI * (now % 1000) / 1000);
    if (moving && mode === 'critical') pulse = (0.5 - 0.5 * Math.cos(2 * Math.PI * (now % 500) / 500)) ** 3;
    const breathe = moving ? 0.8 + 0.2 * Math.sin(2 * Math.PI * now / 4000) : 1;
    s.flash = moving ? Math.max(0, s.flash - dt / 0.15) : 0;
    s.sweep = pending && moving ? (s.sweep + dt / 1.6 * 2.8 > 1.4 ? -1.4 : s.sweep + dt / 1.6 * 2.8) : -1.4;
    // sway ±3° over 8s, fading out when disabled; parallax on a damped spring
    s.sway += ((swirling ? 1 : 0) - s.sway) * Math.min(1, dt * 5);
    if (!swirling && s.sway < 0.01) s.sway = 0;
    const k = 90, c = 16;
    s.vx += ((s.tx * PARALLAX) - s.px) * k * dt - s.vx * c * dt; s.px += s.vx * dt;
    s.vy += ((s.ty * PARALLAX * 0.5) - s.py) * k * dt - s.vy * c * dt; s.py += s.vy * dt;
    const g = assembly.current;
    if (g) { g.rotation.y = YAW + (moving ? SWAY * Math.sin(2 * Math.PI * now / 8000) * s.sway : 0) + s.px; g.rotation.x = s.py; }

    uniforms.uTime.value = s.swirl; uniforms.uUrgency.value = s.urgency; uniforms.uSat.value = s.sat;
    uniforms.uPulse.value = red ? pulse : 0; uniforms.uPress.value = glow.get(); uniforms.uFlash.value = s.flash;
    uniforms.uPending.value = pending ? 1 : 0; uniforms.uSweep.value = s.sweep;
    if (inner.current) {
      inner.current.color.copy(uniforms.uLilac.value).lerp(uniforms.uRed.value, s.urgency);
      inner.current.intensity = off ? 0 : INNER * (pending ? 0.4 : red ? 0.4 + 1.1 * pulse : breathe) * (1 + glow.get() * 0.8);
    }

    const settling = Math.abs(s.px - s.tx * PARALLAX) > 1e-4 || Math.abs(s.vx) > 1e-4 || Math.abs(s.py - s.ty * PARALLAX * 0.5) > 1e-4 || (!swirling && s.sway > 0) || s.flash > 0
      || Math.abs(s.urgency - (red ? 1 : 0)) > 0 || Math.abs(s.sat - (off ? 0.08 : 1)) > 0 || Math.abs(s.speed - (hovered ? 1.45 : 1)) > 1e-3;
    const springs = y.isAnimating || sy.isAnimating || key.isAnimating || glow.isAnimating || b.isAnimating;
    if (!document.hidden && (swirling || pending || springs || (moving && settling))) invalidate();
  });

  const seat = useMemo(() => to([y, b], (py: number, pb: number) => SEAT + py + pb), [y, b]);
  return <>
    <Framing/>
    <StudioEnvironment/>
    <a.directionalLight position={[-3, 5, 3]} intensity={key.to(v => 2.1 * v)}/>
    <ambientLight intensity={0.25}/>
    <group ref={assembly} rotation-y={YAW}>
      <Underlighting/>
      {/* Soft neutral contact shadow, pre-baked and parented to the swaying assembly so it always sits in register
          under the housing. A live ContactShadows pass left a hard ghost edge around the base. */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.001} renderOrder={-1}><planeGeometry args={[SHADOW_SIZE, SHADOW_SIZE]}/><meshBasicMaterial map={shadowTexture()} transparent depthWrite={false} toneMapped={false}/></mesh>
      <Housing/>
      <a.group position-y={seat} scale-y={sy}>
        <mesh material={core}><sphereGeometry args={[CORE_R, 128, 64, 0, Math.PI * 2, 0, Math.PI / 2]}/></mesh>
        <mesh>
          <sphereGeometry args={[R, 128, 64, 0, Math.PI * 2, 0, Math.PI / 2]}/>
          <MeshTransmissionMaterial background={SHELL_BACKGROUND} resolution={1024} samples={10} transmission={0.95} thickness={0.35} roughness={0.02} ior={1.5}
            clearcoat={1} clearcoatRoughness={0} iridescence={1} iridescenceIOR={1.3} iridescenceThicknessRange={IRIDESCENCE_RANGE}
            attenuationColor="#EFE6FF" attenuationDistance={0.8} chromaticAberration={0.03} anisotropicBlur={0} distortion={0} color="#ffffff" envMapIntensity={0.55}/>
        </mesh>
        <pointLight ref={inner} position={[0, 0.2, 0]} distance={2.4} decay={2} color={CROWN.lilac} intensity={INNER}/>
      </a.group>
    </group>
    <SceneEffects/>
    <Ready onReady={onReady}/>
  </>;
}

// Memoized: the throne re-renders every tick, and the scene must not redraw unless its own props change.
function DomeScene(props: DomeSceneProps) {
  const dpr = useMemo<[number, number]>(() => [1, Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio, 2)], []);
  return <Canvas frameloop={props.paused ? 'never' : 'demand'} dpr={dpr} gl={GL} camera={CAMERA} style={CANVAS_STYLE} aria-hidden="true"
    onCreated={({ gl }) => { gl.outputColorSpace = THREE.SRGBColorSpace; gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1; }}>
    <Scene {...props}/>
  </Canvas>;
}
export default memo(DomeScene);
