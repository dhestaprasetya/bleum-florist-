/* Adapted from ThreeUI elemental-water SHA-256 7a6871fe99fa. Original bundle in elemental-water.source.json. */
(()=>{
/* ---------------- rasterize -> SDF (chamfer) + edge point extraction ---------------- */
const SDF_SIZE = 768;
const SDF_SPREAD = 192;          // px each side of the edge
const D_RANGE = SDF_SPREAD * 2 / SDF_SIZE; // decoded sdf span in mask-uv units

function rasterizeLogo(pathStr) {
  const c = document.createElement('canvas');
  c.width = c.height = SDF_SIZE;
  const ctx = c.getContext('2d');
  const box = SDF_SIZE * 0.60;
  const s = box / 24;
  const off = (SDF_SIZE - box) / 2;
  ctx.setTransform(s, 0, 0, s, off, off);
  ctx.fillStyle = '#fff';
  ctx.fill(new Path2D(pathStr));
  return ctx.getImageData(0, 0, SDF_SIZE, SDF_SIZE);
}

function chamfer(d, w, h) {
  const D1 = 1, D2 = Math.SQRT2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + D1);
    if (y > 0) {
      v = Math.min(v, d[i - w] + D1);
      if (x > 0) v = Math.min(v, d[i - w - 1] + D2);
      if (x < w - 1) v = Math.min(v, d[i - w + 1] + D2);
    }
    d[i] = v;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x; let v = d[i];
    if (x < w - 1) v = Math.min(v, d[i + 1] + D1);
    if (y < h - 1) {
      v = Math.min(v, d[i + w] + D1);
      if (x < w - 1) v = Math.min(v, d[i + w + 1] + D2);
      if (x > 0) v = Math.min(v, d[i + w - 1] + D2);
    }
    d[i] = v;
  }
}

function buildSDF(img) {
  const n = SDF_SIZE * SDF_SIZE;
  const dOut = new Float32Array(n), dIn = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const inside = img.data[i * 4 + 3] > 127;
    dOut[i] = inside ? 0 : 1e9;
    dIn[i]  = inside ? 1e9 : 0;
  }
  chamfer(dOut, SDF_SIZE, SDF_SIZE);
  chamfer(dIn, SDF_SIZE, SDF_SIZE);
  const enc = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const d = dOut[i] - dIn[i]; // + outside, - inside
    enc[i] = Math.max(0, Math.min(255, Math.round((0.5 + 0.5 * d / SDF_SPREAD) * 255)));
  }
  return enc;
}

/* contour pixels + outward normals, in y-up mask uv */
function edgePoints(img) {
  const S = SDF_SIZE, pts = [];
  const a = (x, y) => img.data[(y * S + x) * 4 + 3] > 127;
  for (let y = 1; y < S - 1; y++) {
    for (let x = 1; x < S - 1; x++) {
      if (!a(x, y)) continue;
      const l = a(x - 1, y), r = a(x + 1, y), u = a(x, y - 1), dn = a(x, y + 1);
      if (l && r && u && dn) continue;
      const gx = (r ? 1 : 0) - (l ? 1 : 0);
      const gy = (dn ? 1 : 0) - (u ? 1 : 0);
      let nx = -gx, ny = gy;                 // outward, y flipped to y-up
      const len = Math.hypot(nx, ny);
      if (!len) { nx = 0; ny = 1; } else { nx /= len; ny /= len; }
      pts.push((x + 0.5) / S, 1 - (y + 0.5) / S, nx, ny);
    }
  }
  return pts;
}

function makeParticleData(pts, count) {
  const data = new Float32Array(count * 5);
  const nPts = pts.length / 4;
  for (let i = 0; i < count; i++) {
    const j = (Math.random() * nPts) | 0;
    data[i * 5]     = pts[j * 4];
    data[i * 5 + 1] = pts[j * 4 + 1];
    data[i * 5 + 2] = pts[j * 4 + 2];
    data[i * 5 + 3] = pts[j * 4 + 3];
    data[i * 5 + 4] = Math.random() * 100 + i * 0.618;
  }
  return data;
}

/* ---------------- shaders ---------------- */
const VERT = `#version 300 es
out vec2 vUv;
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const GLSL_COMMON = `
precision highp float;
uniform sampler2D uSDF;
uniform float uTime;
uniform float uAspect;
uniform vec2  uScale;
uniform vec2  uShift;
uniform vec3  uPointer; // uv.xy, active
in vec2 vUv;
out vec4 frag;

float hash21(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1,0));
  float c = hash21(i + vec2(0,1)), d = hash21(i + vec2(1,1));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++){ v += a * vnoise(p); p = r * p * 2.03; a *= 0.5; }
  return v;
}
/* signed distance in mask-uv units; extended analytically past the texture
   border so out-of-range samples keep growing instead of clamping (kills
   the rectangular clamp artifacts) */
float sdf(vec2 uv){
  vec2 m = 0.5 + (uv - 0.5 - uShift) * uScale;
  vec2 mc = clamp(m, 0.0, 1.0);
  float d = (texture(uSDF, vec2(mc.x, 1.0 - mc.y)).r - 0.5) * ${D_RANGE.toFixed(4)};
  return d + length(m - mc);
}
float edgeFade(vec2 uv){
  return smoothstep(0.0, 0.05, uv.x) * smoothstep(1.0, 0.95, uv.x)
       * smoothstep(0.0, 0.05, uv.y) * smoothstep(1.0, 0.95, uv.y);
}
`;

/* water simulation step (ping-pong, r = h, g = h_prev) */
const FRAG_SIM = `#version 300 es
precision highp float;
uniform sampler2D uState;
uniform vec2 uTexel;
uniform vec3 uDrop; // sim-uv.xy, strength
in vec2 vUv;
out vec4 frag;
void main(){
  vec2 s = texture(uState, vUv).rg;
  float l = texture(uState, vUv - vec2(uTexel.x, 0.0)).r;
  float r = texture(uState, vUv + vec2(uTexel.x, 0.0)).r;
  float u = texture(uState, vUv + vec2(0.0, uTexel.y)).r;
  float d = texture(uState, vUv - vec2(0.0, uTexel.y)).r;
  float next = (l + r + u + d) * 0.5 - s.g;
  next *= 0.984;
  if (uDrop.z != 0.0){
    float dd = distance(vUv, uDrop.xy);
    next += uDrop.z * exp(-dd * dd * 3800.0);
  }
  frag = vec4(next, s.r, 0.0, 1.0);
}`;

const FRAG_WATER = `#version 300 es
${GLSL_COMMON}
uniform sampler2D uState;
uniform vec2 uSimTexel;
uniform sampler2D uPhoto;
uniform float uPhotoAspect;
/* cover-map panel uv into the square sim so rings stay circular on screen */
vec2 simUV(vec2 uv){
  return 0.5 + (uv - 0.5) * vec2(uAspect, 1.0) / max(uAspect, 1.0);
}
void main(){
  vec2 suv = simUV(vUv);
  float h  = texture(uState, suv).r;
  float hx = texture(uState, suv + vec2(uSimTexel.x, 0.0)).r - texture(uState, suv - vec2(uSimTexel.x, 0.0)).r;
  float hy = texture(uState, suv + vec2(0.0, uSimTexel.y)).r - texture(uState, suv - vec2(0.0, uSimTexel.y)).r;
  vec2 grad = vec2(hx, hy);
  vec3 nrm = normalize(vec3(-grad * 30.0, 1.0));

  vec2 ruv = vUv + grad * 0.22;          // refracted lookup
  float d  = sdf(ruv);

  // Adaptation: refract the selected bouquet in place of the demo mark.
  vec2 photoUV = ruv;
  if (uAspect > uPhotoAspect) photoUV.y = (photoUV.y - 0.5) * uPhotoAspect / uAspect + 0.5;
  else photoUV.x = (photoUV.x - 0.5) * uAspect / uPhotoAspect + 0.5;
  vec3 col = texture(uPhoto, vec2(photoUV.x, 1.0-photoUV.y)).rgb;
  col = mix(col, col * vec3(0.72, 0.94, 1.04), 0.28);
  // ripple shading: crests bright, troughs barely darker
  col += vec3(0.09, 0.30, 0.40) * clamp(h * 1.8, -0.06, 1.0);
  col += vec3(0.25, 0.55, 0.65) * pow(clamp(h * 2.6, 0.0, 1.0), 2.0) * 0.5;

  // specular glint
  vec3 L = normalize(vec3(-0.35, 0.55, 0.75));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(nrm, H), 0.0), 150.0);
  col += spec * vec3(0.65, 0.9, 1.0) * 0.9;

  col *= 0.35 + 0.65 * edgeFade(vUv);
  col += (hash21(vUv * 617.0 + uTime) - 0.5) / 128.0;
  frag = vec4(col, 1.0);
}`;

/* ---------------- particles: stateless GPU point sprites off the contour ---------------- */
const PART_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;    // spawn point, y-up mask uv
layout(location=1) in vec2 aNorm;   // outward contour normal
layout(location=2) in float aSeed;
uniform float uTime;
uniform vec2  uScale;
uniform vec2  uShift;
uniform float uDpr;
uniform float uWind;
uniform vec4  uCfgA;  // travel, lifeMin, lifeMax, alongNormal
uniform vec4  uCfgB;  // wiggle, sizeMin, sizeMax, sparse
out float vFade;
out float vMixC;
float h1(float n){ return fract(sin(n) * 43758.5453); }
void main(){
  float hs   = h1(aSeed * 1.31);
  float life = mix(uCfgA.y, uCfgA.z, hs);
  float tt   = uTime / life + aSeed * 13.7;
  float ph   = fract(tt);
  float cyc  = floor(tt);
  float r1 = h1(aSeed + cyc * 0.317);
  float r2 = h1(aSeed * 2.13 + cyc * 0.771);
  float on = step(uCfgB.w, r2);

  vec2 dir = normalize(mix(vec2(0.0, 1.0), aNorm, uCfgA.w) + (vec2(r1, h1(r1 * 7.0)) - 0.5) * 0.8);
  float trav = uCfgA.x * (0.45 + 0.9 * r1);
  vec2 p = aPos + aNorm * 0.004 + dir * trav * ph;
  p.x += sin(ph * 10.0 + r1 * 40.0 + uTime * 0.5) * uCfgB.x * ph;
  p.x += uWind * 0.08 * ph;

  vec2 uv = 0.5 + uShift + (p - 0.5) / uScale;
  vFade = on * smoothstep(0.0, 0.12, ph) * smoothstep(1.0, 0.5, ph) * mix(0.35, 1.0, r2);
  vMixC = h1(aSeed * 3.7 + cyc);
  gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = mix(uCfgB.y, uCfgB.z, h1(aSeed * 5.11 + cyc)) * uDpr * (1.0 - 0.45 * ph);
}`;

const PART_FRAG = `#version 300 es
precision highp float;
uniform vec3 uColA;
uniform vec3 uColB;
in float vFade;
in float vMixC;
out vec4 frag;
void main(){
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(q, q);
  if (r2 > 1.0) discard;
  float a = exp(-r2 * 3.5) * (1.0 - r2);
  frag = vec4(mix(uColA, uColB, vMixC) * a * vFade, 1.0);
}`;

/* ---------------- GL helpers ---------------- */
function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(sh), src);
    return null;
  }
  return sh;
}
function program(gl, vertSrc, fragSrc) {
  const p = gl.createProgram();
  const vs = compile(gl, gl.VERTEX_SHADER, vertSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
  if (!vs || !fs) return null;
  gl.attachShader(p, vs); gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(p));
    return null;
  }
  return p;
}

const DPR = Math.min(window.devicePixelRatio || 1, 1.75);
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const SIM_RES = 512;

class Panel {
  constructor(el, fragSrc, logo, opts) {
    this.el = el;
    this.canvas = el.querySelector('canvas');
    this.opts = opts;
    this.pointer = { x: 0.5, y: 0.5, active: 0 };
    this.wind = 0;
    this.windTarget = 0;
    this.dropQueue = [];
    this.nextAutoDrop = 0.6;
    this.needsResize = false;
    this.ok = false;

    const gl = this.canvas.getContext('webgl2', { alpha: false, antialias: false });
    if (!gl) return this.fail();
    this.gl = gl;

    this.prog = program(gl, VERT, fragSrc);
    if (!this.prog) return this.fail();
    this.uni = {};
    for (const n of ['uSDF','uTime','uAspect','uScale','uShift','uPointer','uState','uSimTexel','uWind','uPhoto','uPhotoAspect'])
      this.uni[n] = gl.getUniformLocation(this.prog, n);

    // sdf texture
    this.sdfTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.sdfTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, SDF_SIZE, SDF_SIZE, 0, gl.RED, gl.UNSIGNED_BYTE, logo.sdf);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    if (opts.sim) {
      if (!gl.getExtension('EXT_color_buffer_float')) return this.fail();
      this.simProg = program(gl, VERT, FRAG_SIM);
      if (!this.simProg) return this.fail();
      this.simUni = {
        uState: gl.getUniformLocation(this.simProg, 'uState'),
        uTexel: gl.getUniformLocation(this.simProg, 'uTexel'),
        uDrop:  gl.getUniformLocation(this.simProg, 'uDrop'),
      };
      this.simTex = []; this.simFbo = [];
      for (let i = 0; i < 2; i++) {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, SIM_RES, SIM_RES, 0, gl.RG, gl.HALF_FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const f = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, f);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
        this.simTex.push(t); this.simFbo.push(f);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.simSrc = 0;
    }

    // particle system
    const P = opts.particles;
    if (P) {
      this.partProg = program(gl, PART_VERT, PART_FRAG);
      if (!this.partProg) return this.fail();
      this.partUni = {};
      for (const n of ['uTime','uScale','uShift','uDpr','uWind','uCfgA','uCfgB','uColA','uColB'])
        this.partUni[n] = gl.getUniformLocation(this.partProg, n);
      const data = makeParticleData(logo.edges, P.count);
      this.partVao = gl.createVertexArray();
      gl.bindVertexArray(this.partVao);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 20, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 8);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 20, 16);
      gl.bindVertexArray(null);
    }

    this.resize();
    // resize inside the rAF (before drawing), never in the RO callback —
    // RO fires after rAF, so resizing there clears the canvas post-draw
    // and every hover transition frame paints black
    new ResizeObserver(() => {
      if (REDUCED) this.resize(); else this.needsResize = true;
    }).observe(el);
    this.bindPointer();
    this.ok = true;
  }

  fail() {
    this.el.classList.remove('water-ready');
    this.canvas.style.display = 'none';
  }

  resize() {
    const r = this.el.getBoundingClientRect();
    const w = Math.max(2, Math.round(r.width * DPR));
    const h = Math.max(2, Math.round(r.height * DPR));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
    this.aspect = w / h;
    if (REDUCED && this.ok && this.photoTex) this.draw(0.001);
  }

  bindPointer() {
    const uv = e => {
      const r = this.el.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width, y: 1 - (e.clientY - r.top) / r.height };
    };
    let last = null, lastT = 0;
    this.el.addEventListener('pointermove', e => {
      const p = uv(e), now = performance.now();
      this.pointer.x = p.x; this.pointer.y = p.y; this.pointer.active = 1;
      if (last) {
        const dt = Math.max(8, now - lastT);
        const dx = p.x - last.x, dy = p.y - last.y;
        const speed = Math.hypot(dx, dy) / (dt / 1000);
        if (this.opts.sim && speed > 0.05 && this.dropQueue.length < 6)
          this.dropQueue.push({ x: p.x, y: p.y, s: Math.min(speed * 0.14, 0.55) });
        this.windTarget = Math.max(-1, Math.min(1, dx / (dt / 1000) * 0.55));
      }
      last = p; lastT = now;
    });
    this.el.addEventListener('pointerdown', e => {
      const p = uv(e);
      if (this.opts.sim) this.dropQueue.push({ x: p.x, y: p.y, s: 0.9 });
      this.pointer.x = p.x; this.pointer.y = p.y; this.pointer.active = 1.6;
    });
    this.el.addEventListener('pointerup', () => { this.pointer.active = 1; });
    this.el.addEventListener('pointerleave', () => { this.pointer.active = 0; last = null; this.windTarget = 0; });
  }

  /* panel uv -> square sim uv (must match simUV() in the water shader) */
  toSimUV(x, y) {
    const a = this.aspect, m = Math.max(a, 1);
    return { x: 0.5 + (x - 0.5) * a / m, y: 0.5 + (y - 0.5) / m };
  }

  stepSim(t) {
    const gl = this.gl;
    if (t > this.nextAutoDrop) {
      this.dropQueue.push({ x: 0.12 + Math.random() * 0.76, y: 0.12 + Math.random() * 0.76, s: 0.12 + Math.random() * 0.3 });
      this.nextAutoDrop = t + 0.5 + Math.random() * 1.4;
    }
    gl.useProgram(this.simProg);
    gl.viewport(0, 0, SIM_RES, SIM_RES);
    gl.uniform2f(this.simUni.uTexel, 1 / SIM_RES, 1 / SIM_RES);
    for (let i = 0; i < 2; i++) {
      const drop = this.dropQueue.shift();
      if (drop) {
        const s = this.toSimUV(drop.x, drop.y);
        gl.uniform3f(this.simUni.uDrop, s.x, s.y, drop.s);
      } else {
        gl.uniform3f(this.simUni.uDrop, 0, 0, 0);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.simFbo[1 - this.simSrc]);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.simTex[this.simSrc]);
      gl.uniform1i(this.simUni.uState, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.simSrc = 1 - this.simSrc;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  scaleVec() {
    const zoom = this.opts.zoom, a = this.aspect;
    const fit = Math.min(a, 1);
    return [(a / fit) * zoom, (1 / fit) * zoom];
  }

  draw(t) {
    const gl = this.gl;
    if (this.needsResize) { this.needsResize = false; this.resize(); }
    if (this.opts.sim) this.stepSim(t);

    this.wind += (this.windTarget - this.wind) * 0.04;
    this.windTarget *= 0.97;

    gl.useProgram(this.prog);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    const sc = this.scaleVec();
    gl.uniform1f(this.uni.uTime, t);
    gl.uniform1f(this.uni.uAspect, this.aspect);
    gl.uniform2f(this.uni.uScale, sc[0], sc[1]);
    gl.uniform2f(this.uni.uShift, this.opts.shift[0], this.opts.shift[1]);
    gl.uniform3f(this.uni.uPointer, this.pointer.x, this.pointer.y, this.pointer.active);
    if (this.uni.uWind) gl.uniform1f(this.uni.uWind, this.wind);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sdfTex);
    gl.uniform1i(this.uni.uSDF, 0);
    if (this.opts.sim) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.simTex[this.simSrc]);
      gl.uniform1i(this.uni.uState, 1);
      gl.uniform2f(this.uni.uSimTexel, 1 / SIM_RES, 1 / SIM_RES);
    }
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.photoTex);
    gl.uniform1i(this.uni.uPhoto, 2);
    gl.uniform1f(this.uni.uPhotoAspect, this.photoAspect || 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const P = this.opts.particles;
    if (P) {
      gl.useProgram(this.partProg);
      gl.uniform1f(this.partUni.uTime, t);
      gl.uniform2f(this.partUni.uScale, sc[0], sc[1]);
      gl.uniform2f(this.partUni.uShift, this.opts.shift[0], this.opts.shift[1]);
      gl.uniform1f(this.partUni.uDpr, DPR);
      gl.uniform1f(this.partUni.uWind, this.wind);
      gl.uniform4f(this.partUni.uCfgA, P.travel, P.lifeMin, P.lifeMax, P.alongNormal);
      gl.uniform4f(this.partUni.uCfgB, P.wiggle, P.sizeMin, P.sizeMax, P.sparse);
      gl.uniform3f(this.partUni.uColA, P.colA[0], P.colA[1], P.colA[2]);
      gl.uniform3f(this.partUni.uColB, P.colB[0], P.colB[1], P.colB[2]);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.bindVertexArray(this.partVao);
      gl.drawArrays(gl.POINTS, 0, P.count);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
    }
  }
}

const host = document.querySelector('.bouquet-reveal');
const photo = document.querySelector('#bouquet');
const canvas = document.createElement('canvas');
canvas.className = 'bouquet-water';canvas.setAttribute('aria-hidden','true');host.append(canvas);
const mask = rasterizeLogo('M12 2 A10 10 0 1 0 12 22 A10 10 0 1 0 12 2');
const panel = new Panel(host, FRAG_WATER, {sdf:buildSDF(mask),edges:edgePoints(mask)}, {
 sim:true,zoom:1.56,shift:[0,0],particles:{count:160,travel:0.10,lifeMin:4,lifeMax:8,alongNormal:0.15,wiggle:0.02,sizeMin:1.5,sizeMax:3.5,sparse:0.5,colA:[0.10,0.24,0.30],colB:[0.22,0.40,0.48]}
});
if (!panel.ok) return;
const gl=panel.gl,reduced=matchMedia('(prefers-reduced-motion: reduce)'),toggle=document.querySelector('.motion-toggle');
let visible=false,frame=0,elapsed=0,last=0,lost=false;
const paused=()=>reduced.matches||document.hidden||!visible||lost||toggle.getAttribute('aria-pressed')==='true';
function updatePhoto(){
 if(!photo.complete||!photo.naturalWidth||lost)return;
 if(!panel.photoTex)panel.photoTex=gl.createTexture();
 gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,panel.photoTex);
 gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,photo);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
 panel.photoAspect=photo.naturalWidth/photo.naturalHeight;panel.draw(elapsed);host.classList.add('water-ready');sync();
}
function tick(now){frame=0;if(paused()||!panel.photoTex)return;elapsed+=Math.min((now-last)/1000,0.05);last=now;panel.draw(elapsed);frame=requestAnimationFrame(tick);}
function sync(){cancelAnimationFrame(frame);frame=0;host.classList.toggle('water-paused',reduced.matches||lost);panel.dropQueue.length=0;if(!paused()&&panel.photoTex){last=performance.now();frame=requestAnimationFrame(tick);}}
photo.addEventListener('load',updatePhoto);
new MutationObserver(()=>{host.classList.remove('water-ready');updatePhoto();}).observe(photo,{attributes:true,attributeFilter:['src']});
new MutationObserver(sync).observe(toggle,{attributes:true,attributeFilter:['aria-pressed']});
new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;sync();}).observe(host);
new ResizeObserver(()=>{if(panel.photoTex&&!lost){panel.resize();panel.draw(elapsed);}}).observe(host);
reduced.addEventListener('change',sync);document.addEventListener('visibilitychange',sync);
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;host.classList.remove('water-ready');sync();});
updatePhoto();
})();
