/* ============================================================
   ASTRA SCENE — 黑洞星图（ginkgo astra · 永恒篇）
   视界 = 永恒归档核心（落入的信息永不丢失）；
   三座星座 = 三个知识域，如黄道星图沿吸积盘面公转；
   符号流沿轨道按序汇入，逐颗点亮新星 = 记录；连线 = 展开。
   点击星座 → 全场螺旋坠入视界 → 切换子页。
   zero-build ES module，依赖 importmap 中的 "three"。
   ============================================================ */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

/* ---------- 知识符号库（维护入口：直接往数组加；总数 ≤ ATLAS_N²，超出把 ATLAS_N 调到 16） ---------- */
const GLYPHS = {
  math: ["softmax(xᵢ)", "QKᵀ/√d", "σ(x)", "∇θJ(θ)", "∂L/∂w", "θ←θ−η∇L", "H=−Σp·log p", "KL(p‖q)", "y=Wx+b", "ReLU(x)", "ln p(x)", "E[x]",
    "eⁱπ⁺¹=0", "∇·E=ρ/ε₀", "det(A−λI)=0", "∫f(x)dx", "P(A|B)", "lim", "Σ", "∏", "λₙ", "π", "∞", "≈", "∀", "∂"],
  tech: ["token", "embedding", "KV-cache", "FLOPs", "GPU", "LoRA", "RLHF", "MoE", "vLLM", "quant", "INT8", "FP16", "ctx", "η=3e-4", "batch", "epoch",
    "</>", "=>", "fn", "{}", "0x1F", "#!", "async", "git"],
  project: ["PR", "v1.0", "★", "✦", "◆", "⎔", "△", "◇", "✚", "HEAD", "main", "↗", "✧", "⎇"],
};
const ALL_GLYPHS = [...GLYPHS.math, ...GLYPHS.tech, ...GLYPHS.project];
const ATLAS_N = 8;   // 图集每边格子数（容量 N² = 64）
console.assert(ALL_GLYPHS.length <= ATLAS_N * ATLAS_N, "GLYPHS 超出图集容量");
const DOMAIN_OFFSET = { math: 0, tech: GLYPHS.math.length, project: GLYPHS.math.length + GLYPHS.tech.length };
/* 三座星座 → 域 */
const GROUP_DOMAIN = ["project", "math", "tech"];
const DOMAIN_GROUP = { project: 0, math: 1, tech: 2 };

/* ---------- 双主题调色（暗=夜空金 / 亮=纸墨藏青） ---------- */
const PALETTE = {
  dark: {
    bg: new THREE.Color("#040609"),
    field: ["#f7e7bd", "#eecb8d", "#d9a860", "#a97f3f"].map((c) => new THREE.Color(c)),
    group: ["#f3d489", "#cfe0ff", "#e8c37e"].map((c) => new THREE.Color(c)),
    star: new THREE.Color("#f5ead0"), stream: new THREE.Color("#c9a25e"),
    plateInk: "#e8c37e", plateFill: "rgba(10,12,16,0.55)",
    glow: new THREE.Color("#3a2f16"), horizon: new THREE.Color("#000000"),
    nebula: ["#141c33", "#241a2e"].map((c) => new THREE.Color(c)),
  },
  light: {
    bg: new THREE.Color("#f8f5ec"),
    field: ["#12325e", "#1b4a8a", "#6a4f18", "#3a352c"].map((c) => new THREE.Color(c)),
    group: ["#6a4f18", "#143a6e", "#1e3f78"].map((c) => new THREE.Color(c)),
    star: new THREE.Color("#7a8ba8"), stream: new THREE.Color("#9a8a5e"),
    plateInk: "#12325e", plateFill: "rgba(255,255,255,0.72)",
    glow: new THREE.Color("#e2d7bd"), horizon: new THREE.Color("#171208"),
    nebula: ["#d8d2c0", "#d0c8bc"].map((c) => new THREE.Color(c)),
  },
};

/* ---------- 黄道面倾角 ---------- */
const TILT = 0.34;
const ECLIP_Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(TILT, 0, 0));
const ECLIP_Q_INV = ECLIP_Q.clone().invert();

/* ---------- 工具 ---------- */
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const bell = (x, w) => Math.exp(-0.5 * (x / w) ** 2);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

/* 速度保持的临界阻尼弹簧（RhineLabUI motion.damp 同款） */
function damp(s, target, rate, dt) {
  const d = s.value - target;
  const i = s.velocity + rate * d;
  const dec = Math.exp(-rate * dt);
  s.value = target + (d + i * dt) * dec;
  s.velocity = (s.velocity - rate * i * dt) * dec;
}
const spring = (v = 0) => ({ value: v, velocity: 0 });

/* ---------- 字形图集（2048²，8×8，白字透明底） ---------- */
function buildAtlas() {
  const N = ATLAS_N, SIZE = 2048, CELL = SIZE / N;
  const cv = document.createElement("canvas");
  cv.width = cv.height = SIZE;
  const ctx = cv.getContext("2d");
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ALL_GLYPHS.forEach((g, i) => {
    const col = i % N, row = (i / N) | 0;
    const isTech = i >= DOMAIN_OFFSET.tech;
    let px = isTech ? 108 : 118;
    const family = isTech
      ? `500 ${px}px "JetBrains Mono", Consolas, monospace`
      : `italic 600 ${px}px "KaTeX_Math", "Times New Roman", "STSong", serif`;
    ctx.font = family;
    const w = ctx.measureText(g).width;
    if (w > CELL * 0.86) ctx.font = family.replace(/\d+px/, Math.floor(px * (CELL * 0.86) / w) + "px");
    ctx.fillText(g, col * CELL + CELL / 2, row * CELL + CELL / 2 + CELL * 0.04);
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* ---------- 恒星贴图（星核 + 十字衍射星芒 + 微光晕） ---------- */
function buildStarTexture() {
  const S = 256;
  const cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const ctx = cv.getContext("2d");
  ctx.clearRect(0, 0, S, S);
  const flare = (horiz, len, w, alpha) => {
    ctx.save();
    ctx.translate(128, 128);
    if (!horiz) ctx.rotate(Math.PI / 2);
    const g = ctx.createLinearGradient(-len / 2, 0, len / 2, 0);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, `rgba(255,255,255,${alpha})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(-len / 2, -w / 2, len, w);
    ctx.restore();
  };
  flare(true, 236, 3.5, 0.9); flare(false, 236, 3.5, 0.9);
  for (const ang of [Math.PI / 4, -Math.PI / 4]) {
    ctx.save(); ctx.translate(128, 128); ctx.rotate(ang);
    const g = ctx.createLinearGradient(-70, 0, 70, 0);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, "rgba(255,255,255,0.4)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.fillRect(-70, -1.5, 140, 3);
    ctx.restore();
  }
  const core = ctx.createRadialGradient(128, 128, 1, 128, 128, 44);
  core.addColorStop(0, "rgba(255,255,255,1)");
  core.addColorStop(0.35, "rgba(255,255,255,0.85)");
  core.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = core; ctx.beginPath(); ctx.arc(128, 128, 44, 0, 7); ctx.fill();
  const halo = ctx.createRadialGradient(128, 128, 18, 128, 128, 108);
  halo.addColorStop(0, "rgba(255,255,255,0.26)");
  halo.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(128, 128, 108, 0, 7); ctx.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* ---------- 档案板贴图（玻璃板 + 发丝线 + 角标 + 字形） ---------- */
function buildPlateTexture(theme, glyph, idx) {
  const cv = document.createElement("canvas");
  cv.width = 512; cv.height = 320;
  const ctx = cv.getContext("2d");
  const ink = PALETTE[theme].plateInk;
  ctx.clearRect(0, 0, 512, 320);
  const rr = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  };
  rr(10, 10, 492, 300, 6);
  ctx.fillStyle = PALETTE[theme].plateFill;
  ctx.fill();
  ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.globalAlpha = 0.9; ctx.stroke();
  ctx.globalAlpha = 1; ctx.lineWidth = 3;
  const tick = (x, y, dx, dy) => { ctx.beginPath(); ctx.moveTo(x, y + dy); ctx.lineTo(x, y); ctx.lineTo(x + dx, y); ctx.stroke(); };
  tick(26, 26, 30, 30); tick(486, 26, -30, 30); tick(26, 294, 30, -30); tick(486, 294, -30, -30);
  ctx.font = '500 26px "JetBrains Mono", monospace';
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  ctx.fillStyle = ink; ctx.fillText(idx, 34, 34);
  ctx.textAlign = "right"; ctx.fillText("ASTRA", 478, 34);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const mono = glyph.length > 2;
  ctx.font = mono ? '500 120px "JetBrains Mono", monospace' : 'italic 600 150px "KaTeX_Math", "Times New Roman", serif';
  ctx.fillText(glyph, 256, 178);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* ---------- 三座黄道星座（真实星图 RA/Dec 投影归一化，星等 → 星尺寸） ----------
   project=射手座 Sagittarius（发射/远航） math=天秤座 Libra（等式平衡） tech=白羊座 Aries（开创/先锋） */
function normFig(raw, edges) {
  let m = 0;
  raw.forEach(([x, y]) => { m = Math.max(m, Math.abs(x), Math.abs(y)); });
  const k = 0.95 / m;
  return {
    stars: raw.map(([x, y, mag]) => [x * k, y * k, mag]),
    edges,
  };
}
/* [x, y, 视星等] */
const FIG_SAGITTARIUS = normFig([
  [-1.31, -4.92, 1.85], [-2.11, -0.37, 2.70], [-0.38, 4.04, 2.81],
  [-5.91, -0.96, 2.99], [8.29, -0.42, 2.60], [6.47, 3.16, 2.02],
], [[3, 1], [1, 2], [1, 0], [0, 4], [4, 5]]);
const FIG_LIBRA = normFig([
  [-5.27, 0.34, 2.75], [1.28, 6.99, 2.61], [-1.94, -8.91, 3.29], [5.91, 1.59, 3.91],
], [[1, 0], [0, 2], [1, 3], [0, 3]]);
const FIG_ARIES = normFig([
  [-5.54, 1.48, 2.00], [-8.69, -1.17, 2.64], [-8.96, -2.68, 3.86],
  [5.14, 5.28, 3.63], [10.56, -2.25, 4.35], [7.46, -0.64, 4.65],
], [[2, 1], [1, 0], [0, 3], [3, 5], [5, 4]]);

/* 相位锁定：同角速度 + 永久 120° 互隔 + 有界摆动（±0.12rad）→ 永不叠合 */
const OMEGA = 0.045;
const GROUPS = [
  { domain: "project", r: 3.15, y: -0.10, phase: 0.55,                 wobF: 0.050, wobP: 0.0, yaw: 0.40,  fig: FIG_SAGITTARIUS },
  { domain: "math",    r: 4.05, y: 0.30,  phase: 0.55 + Math.PI * 2 / 3, wobF: 0.037, wobP: 2.1, yaw: -0.80, fig: FIG_LIBRA },
  { domain: "tech",    r: 4.95, y: -0.25, phase: 0.55 + Math.PI * 4 / 3, wobF: 0.043, wobP: 4.2, yaw: 1.70,  fig: FIG_ARIES },
];
GROUPS.forEach((g) => (g.a0 = g.phase));
const GROWTH_PER = 8;    // 每座星座的可点亮新星位

/* ============================================================
   场景实例
   ============================================================ */
class AstraScene {
  constructor(container, opts) {
    this.container = container;
    this.opts = opts;                        // { nodes:[{el,domain,glyph,idx}], onAbsorb }
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.light = document.documentElement.dataset.theme === "light";
    this.lightMix = spring(this.light ? 1 : 0);
    this.intro = this.reduced ? 1 : 0;       // 入场展开进度
    this.suck = 0;                           // 吸入进度 0→1
    this.mouse = { x: 0, y: 0 };
    this.hoverDomain = null;
    this.extract = null;
    this.ripples = [];
    this.wave = null;
    this.stars = 0;                          // 已点燃计数
    this.fps = 60;
    this.lastInteraction = 0;

    this.initRenderer();
    this.initScene();
    this.initConstellations();
    this.initStreams();
    this.initPlates();
    this.bind();
    this.resize();

    this.clock = new THREE.Clock();
    if (this.reduced) { this.step(0.016); this.render(); this.syncLabels(); }
    else this.renderer.setAnimationLoop(() => this.frame());
  }

  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.container.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute("aria-hidden", "true");
  }

  initScene() {
    const P = this.light ? PALETTE.light : PALETTE.dark;
    this.scene = new THREE.Scene();
    this.scene.background = P.bg.clone();
    this.scene.fog = new THREE.Fog(P.bg.clone(), 12, 28);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
    this.camPos = { x: spring(0), y: spring(1.35 + 0.8), z: spring((this.baseCamZ || 11) + 1.8) };
    this.camLook = { x: spring(0), y: spring(-0.25), z: spring(0) };

    /* ----- 背景星野 ----- */
    {
      const N = 560;
      const pos = new Float32Array(N * 3), phase = new Float32Array(N), size = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const r = rand(15, 26), th = rand(0, Math.PI * 2), ph = Math.acos(rand(-1, 1));
        pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
        pos[i * 3 + 1] = r * Math.cos(ph) * 0.7;
        pos[i * 3 + 2] = -Math.abs(r * Math.sin(ph) * Math.sin(th)) - 4;
        phase[i] = rand(0, Math.PI * 2);
        size[i] = rand(0.5, 1.7);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
      g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
      this.starUniforms = {
        uTime: { value: 0 }, uLight: { value: this.lightMix.value },
        uColD: { value: PALETTE.dark.star }, uColL: { value: PALETTE.light.star },
      };
      this.starMat = new THREE.ShaderMaterial({
        uniforms: this.starUniforms,
        transparent: true, depthWrite: false,
        blending: this.light ? THREE.NormalBlending : THREE.AdditiveBlending,
        vertexShader: `
          attribute float aPhase; attribute float aSize;
          uniform float uTime;
          varying float vTw;
          void main(){
            vTw = 0.5 + 0.5 * sin(uTime * 1.2 + aPhase);
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = aSize * (160.0 / -mv.z);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          uniform vec3 uColD, uColL; uniform float uLight;
          varying float vTw;
          void main(){
            vec2 c = gl_PointCoord - 0.5;
            float m = smoothstep(0.5, 0.08, length(c));
            float a = m * (0.35 + 0.65 * vTw) * mix(0.9, 0.22, uLight);
            vec3 col = mix(uColD, uColL, uLight);
            gl_FragColor = vec4(col * mix(a, 1.0, uLight), a);
          }`,
      });
      this.bgStars = new THREE.Points(g, this.starMat);
      this.bgStars.renderOrder = 0;
      this.scene.add(this.bgStars);
    }

    /* ----- 辉光贴图（星云 / 核心辉光共用） ----- */
    const glowCv = document.createElement("canvas");
    glowCv.width = glowCv.height = 256;
    const gctx = glowCv.getContext("2d");
    const grad = gctx.createRadialGradient(128, 128, 8, 128, 128, 128);
    grad.addColorStop(0, "rgba(255,255,255,0.8)");
    grad.addColorStop(0.45, "rgba(255,255,255,0.2)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    gctx.fillStyle = grad; gctx.fillRect(0, 0, 256, 256);
    this.glowTex = new THREE.CanvasTexture(glowCv);

    /* ----- 远景星云（深度感） ----- */
    this.nebulae = [];
    [[-6.5, 2.2, -9, 14, 0], [5.5, -1.4, -10, 16, 1]].forEach(([x, y, z, s, ci]) => {
      const m = new THREE.SpriteMaterial({
        map: this.glowTex, color: P.nebula[ci].clone(), transparent: true,
        opacity: this.light ? 0.05 : 0.16, blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const sp = new THREE.Sprite(m);
      sp.position.set(x, y, z); sp.scale.setScalar(s); sp.renderOrder = 0;
      this.scene.add(sp);
      this.nebulae.push(m);
    });

    /* ----- 视界后方辉光 ----- */
    this.glowMat = new THREE.SpriteMaterial({
      map: this.glowTex, color: P.glow.clone(), transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.glow = new THREE.Sprite(this.glowMat);
    this.glow.scale.setScalar(7);
    this.glow.position.set(0, 0, -0.5);
    this.glow.renderOrder = 1;
    this.scene.add(this.glow);

    /* ----- 黑洞组（面向相机的部件：视界 / 光子环 / 透镜弧） ----- */
    this.holeGroup = new THREE.Group();
    this.scene.add(this.holeGroup);

    this.horizon = new THREE.Mesh(
      new THREE.CircleGeometry(0.66, 64),
      new THREE.MeshBasicMaterial({ color: P.horizon.clone() })
    );
    this.horizon.renderOrder = 2;
    this.holeGroup.add(this.horizon);

    this.ringUniforms = {
      uTime: { value: 0 }, uLight: { value: this.lightMix.value },
      uSuck: { value: 0 }, uAlpha: { value: 1 },
    };
    const ringFrag = `
      uniform float uTime, uLight, uSuck, uAlpha;
      varying vec2 vP;
      void main(){
        float r = length(vP);
        float d = (r - 0.60) / 0.32;
        float ring = exp(-pow((d - 0.28) * 3.4, 2.0));
        float asym = 1.0 + 0.35 * (vP.x / max(r, 0.001));
        vec3 cd = vec3(1.0, 0.95, 0.82) * ring * asym * (1.0 + uSuck * 1.5);
        vec3 cl = vec3(0.09, 0.13, 0.30) * ring;
        vec3 col = mix(cd, cl, uLight);
        float a = ring * (0.95 - 0.25 * uLight) * uAlpha;
        if (a < 0.004) discard;
        gl_FragColor = vec4(col * mix(a, 1.0, uLight), a);
      }`;
    const bbVert = `
      varying vec2 vP;
      void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
    this.ringMat = new THREE.ShaderMaterial({
      uniforms: this.ringUniforms, vertexShader: bbVert, fragmentShader: ringFrag,
      transparent: true, depthWrite: false, depthTest: false,
      blending: this.light ? THREE.NormalBlending : THREE.AdditiveBlending,
    });
    this.photonRing = new THREE.Mesh(new THREE.RingGeometry(0.58, 0.94, 96, 1), this.ringMat);
    this.photonRing.renderOrder = 7;
    this.holeGroup.add(this.photonRing);

    /* 透镜弧：远端吸积盘被引力弯到视界上方的像 */
    this.arcUniforms = {
      uTime: { value: 0 }, uLight: { value: this.lightMix.value },
      uSuck: { value: 0 }, uAlpha: { value: 1 },
    };
    this.arcMat = new THREE.ShaderMaterial({
      uniforms: this.arcUniforms, vertexShader: bbVert,
      fragmentShader: `
        uniform float uTime, uLight, uSuck, uAlpha;
        varying vec2 vP;
        void main(){
          float r = length(vP);
          float ang = atan(vP.y, vP.x);
          float ends = smoothstep(0.34, 0.66, ang) * (1.0 - smoothstep(2.48, 2.80, ang));
          float rad = smoothstep(0.68, 0.86, r) * (1.0 - smoothstep(0.96, 1.16, r));
          float n = 0.6 + 0.4 * sin(ang * 9.0 + uTime * 1.2);
          float k = clamp((r - 0.68) / 0.5, 0.0, 1.0);
          vec3 cd = mix(vec3(0.98, 0.80, 0.45), vec3(0.85, 0.50, 0.18), k);
          vec3 cl = mix(vec3(0.10, 0.16, 0.34), vec3(0.35, 0.42, 0.60), k);
          vec3 col = mix(cd, cl, uLight) * n * (1.0 + uSuck * 1.5);
          float a = ends * rad * 0.55 * uAlpha;
          if (a < 0.004) discard;
          gl_FragColor = vec4(col * mix(a, 1.0, uLight), a);
        }`,
      transparent: true, depthWrite: false, depthTest: false,
      blending: this.light ? THREE.NormalBlending : THREE.AdditiveBlending,
    });
    this.lensArc = new THREE.Mesh(
      new THREE.RingGeometry(0.66, 1.18, 64, 1, Math.PI * 0.10, Math.PI * 0.80),
      this.arcMat
    );
    this.lensArc.renderOrder = 7;
    this.holeGroup.add(this.lensArc);

    /* ----- 黄道组（吸积盘 / 轨道 / 星座 / 流珠，整体倾斜 TILT） ----- */
    this.ecliptic = new THREE.Group();
    this.ecliptic.rotation.x = TILT;
    this.scene.add(this.ecliptic);

    /* 吸积盘 */
    this.diskUniforms = {
      uTime: { value: 0 }, uLight: { value: this.lightMix.value },
      uSuck: { value: 0 }, uAlpha: { value: 1 },
    };
    this.diskMat = new THREE.ShaderMaterial({
      uniforms: this.diskUniforms,
      vertexShader: bbVert,
      fragmentShader: `
        uniform float uTime, uLight, uSuck, uAlpha;
        varying vec2 vP;
        void main(){
          float r = length(vP);
          float ang = atan(vP.y, vP.x);
          float spin = uTime * (0.55 + 2.4 * pow(0.95 / r, 1.5)) * (1.0 + uSuck * 2.5);
          float a = ang + spin;
          float n = 0.55 * sin(a * 3.0 + r * 3.0)
                  + 0.30 * sin(a * 6.0 - r * 5.5 + 1.7)
                  + 0.15 * sin(a * 11.0 + r * 9.0 + 4.2);
          n = n * 0.5 + 0.5;
          float band = smoothstep(0.80, 1.12, r) * (1.0 - smoothstep(1.55, 2.65, r));
          vec3 cd = vec3(1.0, 0.96, 0.86);
          cd = mix(cd, vec3(0.98, 0.74, 0.34), smoothstep(0.85, 1.5, r));
          cd = mix(cd, vec3(0.70, 0.36, 0.12), smoothstep(1.5, 2.15, r));
          cd = mix(cd, vec3(0.22, 0.09, 0.03), smoothstep(2.15, 2.65, r));
          vec3 cl = vec3(0.07, 0.11, 0.26);
          cl = mix(cl, vec3(0.16, 0.28, 0.52), smoothstep(0.85, 1.6, r));
          cl = mix(cl, vec3(0.45, 0.50, 0.66), smoothstep(1.6, 2.4, r));
          vec3 col = mix(cd, cl, uLight);
          float dop = 1.0 + (0.55 - 0.25 * uLight) * (vP.x / r);
          col *= (0.45 + 0.85 * n) * dop;
          col *= 1.0 + uSuck * 1.4;
          float alpha = band * (0.55 + 0.45 * n) * uAlpha;
          if (alpha < 0.004) discard;
          gl_FragColor = vec4(col * mix(alpha, 1.0, uLight), alpha);
        }`,
      transparent: true, depthWrite: false,
      blending: this.light ? THREE.NormalBlending : THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.disk = new THREE.Mesh(new THREE.RingGeometry(0.78, 2.7, 160, 1), this.diskMat);
    this.disk.rotation.x = -Math.PI / 2;
    this.disk.renderOrder = 1;
    this.ecliptic.add(this.disk);

    /* ----- 后期 ----- */
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), this.light ? 0.05 : 0.5, 0.5, this.light ? 0.97 : 0.55);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.dummy = new THREE.Object3D();
  }

  /* ----- 三座星座：星位实例 + 星图连线 + 轨道环 ----- */
  initConstellations() {
    const P = this.light ? PALETTE.light : PALETTE.dark;

    /* 轨道引导环 */
    this.orbitMats = [];
    GROUPS.forEach((g) => {
      const pts = [];
      for (let k = 0; k <= 128; k++) {
        const a = (k / 128) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * g.r, g.y, Math.sin(a) * g.r));
      }
      const m = new THREE.LineBasicMaterial({
        color: P.stream.clone(), transparent: true, opacity: this.light ? 0.16 : 0.10,
        blending: this.light ? THREE.NormalBlending : THREE.AdditiveBlending, depthWrite: false,
      });
      const loop = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), m);
      loop.renderOrder = 1;
      this.ecliptic.add(loop);
      this.orbitMats.push(m);
    });

    /* 组装星位：fig 主星（常亮）+ growth 新星位（按序点亮） */
    this.starState = [];
    this.growthByGroup = [[], [], []];
    this.ignitePtr = [0, 0, 0];
    GROUPS.forEach((g, gi) => {
      const cy = Math.cos(g.yaw), sy = Math.sin(g.yaw);
      const rotY = (o) => new THREE.Vector3(
        o[0] * cy + o[2] * sy, o[1], -o[0] * sy + o[2] * cy);
      g.figStars = g.fig.stars.map((o) => {
        const st = {
          group: gi, off: rotY([o[0], o[1], rand(-0.04, 0.04)]), fig: true, lit: 1,
          base: Math.max(0.55, Math.min(1, 1.0 - (o[2] - 1.5) * 0.09)),   // 星等 → 亮度
          pop: 0, seed: Math.random(), tm: this.light ? 1 : 0,
          lp: new THREE.Vector3(),
        };
        this.starState.push(st);
        return st;
      });
      /* 新星位：围绕主星图散布，按离核距离排序 = 生长由内向外 */
      const cands = [];
      let guard = 0;
      while (cands.length < GROWTH_PER && guard++ < 400) {
        const a = rand(0, Math.PI * 2), rr = 0.5 + Math.pow(Math.random(), 0.7) * 0.75;
        const o = new THREE.Vector3(Math.cos(a) * rr, rand(-0.5, 0.5) * 0.9 * rr * 0.7, rand(-0.12, 0.12));
        let ok = true;
        for (const fs of g.fig.stars) if (o.distanceTo(new THREE.Vector3(fs[0], fs[1], 0)) < 0.2) { ok = false; break; }
        for (const c of cands) if (o.distanceTo(c) < 0.22) { ok = false; break; }
        if (ok) cands.push(o);
      }
      cands.sort((p, q) => p.length() - q.length());
      cands.forEach((o, order) => {
        const st = {
          group: gi, off: rotY([o.x, o.y, o.z]), fig: false, lit: 0, order,
          base: rand(0.42, 0.66) * (Math.random() < 0.08 ? 1.6 : 1),
          pop: 0, seed: Math.random(), tm: this.light ? 1 : 0,
          lp: new THREE.Vector3(),
        };
        this.starState.push(st);
        this.growthByGroup[gi].push(st);
      });
      /* 预亮约 1/3 = 已归档的记录 */
      this.growthByGroup[gi].forEach((st, k) => { if (k % 3 === 0) st.lit = 1; });
      g.center = new THREE.Vector3();
      g.angle = g.a0;
    });
    this.NS = this.starState.length;

    /* 星位实例网格 */
    this.starTex = buildStarTexture();
    const geo = new THREE.PlaneGeometry(0.5, 0.5);
    const inst = new THREE.InstancedBufferGeometry();
    inst.index = geo.index;
    inst.attributes.position = geo.attributes.position;
    inst.attributes.uv = geo.attributes.uv;
    this.sColor = new THREE.InstancedBufferAttribute(new Float32Array(this.NS * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.sAlpha = new THREE.InstancedBufferAttribute(new Float32Array(this.NS), 1).setUsage(THREE.DynamicDrawUsage);
    this.sPhase = new THREE.InstancedBufferAttribute(new Float32Array(this.NS), 1);
    this.starState.forEach((st, i) => this.sPhase.setX(i, rand(0, Math.PI * 2)));
    inst.setAttribute("iColor", this.sColor);
    inst.setAttribute("iAlpha", this.sAlpha);
    inst.setAttribute("iPhase", this.sPhase);
    this.starIUniforms = {
      uMap: { value: this.starTex }, uTime: { value: 0 }, uLight: { value: this.lightMix.value },
    };
    this.starIMat = new THREE.ShaderMaterial({
      uniforms: this.starIUniforms,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: this.light ? THREE.NormalBlending : THREE.AdditiveBlending,
      vertexShader: `
        attribute vec3 iColor; attribute float iAlpha; attribute float iPhase;
        uniform float uTime;
        varying vec2 vUv; varying vec3 vColor; varying float vDepth; varying float vTw; varying float vA;
        void main(){
          vUv = uv; vColor = iColor; vA = iAlpha;
          vTw = 0.82 + 0.18 * sin(uTime * 1.1 + iPhase);
          vec4 center = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float sx = length(instanceMatrix[0].xyz);
          center.xy += position.xy * sx;
          vDepth = -center.z;
          gl_Position = projectionMatrix * center;
        }`,
      fragmentShader: `
        uniform sampler2D uMap; uniform float uLight;
        varying vec2 vUv; varying vec3 vColor; varying float vDepth; varying float vTw; varying float vA;
        void main(){
          vec4 t = texture2D(uMap, vUv);
          float fog = smoothstep(26.0, 13.0, vDepth);
          float a = t.a * fog * vTw * vA;
          a = mix(a, min(1.0, a * 1.5), uLight);
          if (a < 0.006) discard;
          gl_FragColor = vec4(vColor * mix(a, 1.0, uLight), a);
        }`,
    });
    this.starMesh = new THREE.InstancedMesh(inst, this.starIMat, this.NS);
    this.starMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.starMesh.frustumCulled = false;
    this.starMesh.renderOrder = 3;
    this.ecliptic.add(this.starMesh);

    /* 星图连线（发丝线，hover 展开高亮） */
    const edgeList = [];
    GROUPS.forEach((g, gi) => g.fig.edges.forEach(([a, b]) =>
      edgeList.push({ g: gi, sa: g.figStars[a], sb: g.figStars[b] })));
    const nl = edgeList.length;
    this.lineEdges = edgeList;
    const lpos = new Float32Array(nl * 6);
    const lgrp = new Float32Array(nl * 2);
    edgeList.forEach((e, i) => { lgrp[i * 2] = e.g; lgrp[i * 2 + 1] = e.g; });
    const lg = new THREE.BufferGeometry();
    this.linePosAttr = new THREE.BufferAttribute(lpos, 3).setUsage(THREE.DynamicDrawUsage);
    lg.setAttribute("position", this.linePosAttr);
    lg.setAttribute("aGroup", new THREE.BufferAttribute(lgrp, 1));
    this.lineUniforms = {
      uLight: { value: this.lightMix.value },
      uColD: { value: PALETTE.dark.group }, uColL: { value: PALETTE.light.group },
      uHi: { value: [0, 0, 0] }, uFade: { value: 1 },
    };
    this.lineMat = new THREE.ShaderMaterial({
      uniforms: this.lineUniforms,
      transparent: true, depthWrite: false,
      blending: this.light ? THREE.NormalBlending : THREE.AdditiveBlending,
      vertexShader: `
        attribute float aGroup;
        varying float vG;
        void main(){ vG = aGroup; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform vec3 uColD[3], uColL[3]; uniform float uLight, uFade; uniform float uHi[3];
        varying float vG;
        void main(){
          int g = int(vG + 0.5);
          float hi = uHi[g];
          vec3 col = mix(uColD[g], uColL[g], uLight) * (1.0 + hi * 1.1);
          float a = (0.38 + 0.58 * hi) * uFade;
          a = mix(a, min(1.0, a * 1.5), uLight);
          gl_FragColor = vec4(col * mix(a, 1.0, uLight), a);
        }`,
    });
    this.lineSegs = new THREE.LineSegments(lg, this.lineMat);
    this.lineSegs.renderOrder = 2;
    this.lineSegs.frustumCulled = false;
    this.ecliptic.add(this.lineSegs);

    /* ----- 钉星闪光 ----- */
    this.flashes = [];
    for (let i = 0; i < 10; i++) {
      const m = new THREE.SpriteMaterial({ map: this.starTex, color: PALETTE.dark.star.clone(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const sp = new THREE.Sprite(m);
      sp.visible = false; sp.renderOrder = 6;
      this.ecliptic.add(sp);
      this.flashes.push({ sp, age: 99 });
    }
  }

  /* ----- 三条轨道流：符号按序沿轨道汇入对应星座 ----- */
  initStreams() {
    this.atlas = buildAtlas();
    this.PER = 12;
    this.MAXP = GROUPS.length * this.PER;
    const geo = new THREE.PlaneGeometry(1, 0.5);
    const inst = new THREE.InstancedBufferGeometry();
    inst.index = geo.index;
    inst.attributes.position = geo.attributes.position;
    inst.attributes.uv = geo.attributes.uv;
    this.iCell = new THREE.InstancedBufferAttribute(new Float32Array(this.MAXP), 1).setUsage(THREE.DynamicDrawUsage);
    this.iColor = new THREE.InstancedBufferAttribute(new Float32Array(this.MAXP * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.iAlpha = new THREE.InstancedBufferAttribute(new Float32Array(this.MAXP), 1).setUsage(THREE.DynamicDrawUsage);
    inst.setAttribute("iCell", this.iCell);
    inst.setAttribute("iColor", this.iColor);
    inst.setAttribute("iAlpha", this.iAlpha);
    this.pUniforms = { uAtlas: { value: this.atlas }, uLight: { value: this.lightMix.value } };
    this.particleMat = new THREE.ShaderMaterial({
      uniforms: this.pUniforms,
      transparent: true, depthWrite: false,
      blending: this.light ? THREE.NormalBlending : THREE.AdditiveBlending,
      vertexShader: `
        attribute float iCell; attribute vec3 iColor; attribute float iAlpha;
        varying vec2 vUv; varying vec3 vColor; varying float vAlpha; varying float vDepth;
        void main(){
          float N = ${ATLAS_N.toFixed(1)};
          float col = mod(iCell, N), row = floor(iCell / N);
          vUv = vec2((col + uv.x) / N, ((N - 1.0) - row + uv.y) / N);
          vColor = iColor; vAlpha = iAlpha;
          vec4 center = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float sx = length(instanceMatrix[0].xyz);
          center.xy += position.xy * sx;
          vDepth = -center.z;
          gl_Position = projectionMatrix * center;
        }`,
      fragmentShader: `
        uniform sampler2D uAtlas; uniform float uLight;
        varying vec2 vUv; varying vec3 vColor; varying float vAlpha; varying float vDepth;
        void main(){
          vec4 t = texture2D(uAtlas, vUv);
          float fog = smoothstep(24.0, 11.0, vDepth) * smoothstep(0.8, 2.2, vDepth);
          float a = t.a * vAlpha * fog;
          if (a < 0.004) discard;
          gl_FragColor = vec4(vColor * mix(a, 1.0, uLight), a);
        }`,
    });
    this.pMesh = new THREE.InstancedMesh(inst, this.particleMat, this.MAXP);
    this.pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pMesh.frustumCulled = false;
    this.pMesh.renderOrder = 4;
    this.ecliptic.add(this.pMesh);

    this.speedS = GROUPS.map(() => spring(1));
    this.parts = [];
    GROUPS.forEach((g, gi) => {
      for (let k = 0; k < this.PER; k++) {
        const ci = (Math.random() * 4) | 0;
        const p = {
          g: gi, t: rand(0, 0.95), flight: rand(3.0, 4.4),
          a0: 0, r0: 0, yb: 0, wob: rand(-1, 1),
          size: rand(0.2, 0.36),
          cell: DOMAIN_OFFSET[g.domain] + ((Math.random() * GLYPHS[g.domain].length) | 0),
          cd: PALETTE.dark.field[ci].clone(), cl: PALETTE.light.field[ci].clone(),
          tm: this.light ? 1 : 0, boost: 0,
          pos: new THREE.Vector3(),
        };
        this.respawnBead(p, true);
        p.t = rand(0, 0.95);
        this.parts.push(p);
      }
    });
  }

  respawnBead(p, init = false) {
    const g = GROUPS[p.g];
    p.a0 = g.angle + rand(1.7, 2.9);
    p.r0 = g.r + rand(0.8, 1.3);
    p.yb = g.y + rand(-0.5, 0.7);
    if (!init) p.t = 0;
    const list = GLYPHS[g.domain];
    p.cell = DOMAIN_OFFSET[g.domain] + ((Math.random() * list.length) | 0);
  }

  /* ----- 档案板：锚定在星座上方，随公转漂移 ----- */
  initPlates() {
    this.plates = [];
    this.opts.nodes.forEach((n) => {
      const domain = n.domain;
      const gi = DOMAIN_GROUP[domain];
      const texDark = buildPlateTexture("dark", n.glyph, n.idx);
      const texLight = buildPlateTexture("light", n.glyph, n.idx);
      const group = new THREE.Group();
      const geo = new THREE.PlaneGeometry(1.5, 0.94);
      const mDark = new THREE.MeshBasicMaterial({ map: texDark, transparent: true, depthWrite: false, opacity: 1 - this.lightMix.value });
      const mLight = new THREE.MeshBasicMaterial({ map: texLight, transparent: true, depthWrite: false, opacity: this.lightMix.value });
      const meshD = new THREE.Mesh(geo, mDark), meshL = new THREE.Mesh(geo, mLight);
      group.add(meshD, meshL);
      meshD.renderOrder = 5; meshL.renderOrder = 5;
      this.ecliptic.add(group);
      this.plates.push({
        domain, g: gi, el: n.el, group, meshD, meshL,
        anchor: new THREE.Vector3(), phase: gi * 2.2,
        scale: spring(1), bright: spring(1), stag: spring(0),
        pos: new THREE.Vector3(), wp: new THREE.Vector3(),
      });
    });
  }

  bind() {
    this.onPointer = (e) => {
      const r = this.container.getBoundingClientRect();
      this.mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      this.mouse.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
      this.lastInteraction = this.timeNow();
    };
    this.container.addEventListener("pointermove", this.onPointer);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.container);
  }

  timeNow() { return this.clock ? this.clock.elapsedTime : 0; }

  resize() {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    const a = w / h;
    this.camera.aspect = a;
    if (a < 0.75) {
      this.camera.fov = 52;
      this.baseCamZ = 16.5;
      this.sceneScale = 0.8;
      this.frameSq = 0.62;
      this.uiScale = 0.72;
    } else {
      this.camera.fov = 42;
      this.baseCamZ = Math.min(19, Math.max(11, 11 * (1.3 / Math.min(a, 1.3))));
      this.sceneScale = 1;
      this.frameSq = a < 1.05 ? 0.85 : 1;
      this.uiScale = 1;
    }
    if (this.ecliptic) this.ecliptic.scale.setScalar(this.sceneScale);
    if (this.holeGroup) this.holeGroup.scale.setScalar(this.sceneScale);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    if (this.reduced) { this.render(); this.syncLabels(); }
  }

  /* ----- 对外动作 ----- */
  setHover(domain) {
    if (domain === this.hoverDomain) return;
    this.hoverDomain = domain;
    this.lastInteraction = this.timeNow();
    if (domain) {
      const gi = DOMAIN_GROUP[domain];
      this.ripples.push({ t0: this.timeNow(), origin: GROUPS[gi].center.clone(), group: gi });
      this.speedS[gi].velocity += 2.2;
    }
  }

  burst(domain) {
    const gi = DOMAIN_GROUP[domain];
    if (gi != null) this.speedS[gi].velocity += 3;
  }

  select(domain, onCovered) {
    if (this.extract) return;
    const pl = this.plates.find((p) => p.domain === domain);
    if (!pl) { onCovered && onCovered(); return; }
    this.extract = { domain, t0: this.timeNow(), pl, onCovered, covered: false };
    this.speedS[pl.g].velocity += 4;
    this.lastInteraction = this.timeNow();
  }

  themeWave(light, sx, sy) {
    let ox = 0, oy = 0;
    if (typeof sx === "number") {
      const r = this.container.getBoundingClientRect();
      const v = new THREE.Vector3(((sx - r.left) / r.width) * 2 - 1, -(((sy - r.top) / r.height) * 2 - 1), 0.5).unproject(this.camera);
      const dir = v.sub(this.camera.position).normalize();
      const t = -this.camera.position.z / dir.z;
      ox = this.camera.position.x + dir.x * t;
      oy = this.camera.position.y + dir.y * t;
    }
    /* 世界 → 黄道面局部（近似：仅绕 X 倾角） */
    const ly = oy * Math.cos(TILT);
    this.wave = { t0: this.timeNow(), ox, oy: ly, target: light ? 1 : 0 };
    this.light = light;
    const blend = light ? THREE.NormalBlending : THREE.AdditiveBlending;
    [this.particleMat, this.starIMat, this.lineMat, this.starMat, this.diskMat, this.ringMat, this.arcMat]
      .forEach((m) => { m.blending = blend; m.needsUpdate = true; });
    this.orbitMats.forEach((m) => { m.blending = blend; m.needsUpdate = true; });
  }

  flashAt(pos) {
    const f = this.flashes.find((x) => x.age > 0.6) || this.flashes[0];
    f.age = 0; f.sp.visible = true;
    f.sp.position.copy(pos);
  }

  /* 吸入变换：局部坐标 → 螺旋坠入视界；返回 {x,y,z,scale,alpha} */
  suckTF(p, seed, out) {
    const S = this.suck;
    if (S <= 0) { out.x = p.x; out.y = p.y; out.z = p.z; out.scale = 1; out.alpha = 1; return out; }
    const si = clamp01(S * 1.28 - seed * 0.28);
    const e = Math.pow(si, 1.5);
    const r0 = Math.hypot(p.x, p.z);
    if (r0 < 1e-3) { out.x = p.x; out.y = p.y; out.z = p.z; out.scale = 1 - 0.8 * e; out.alpha = 1 - e; return out; }
    const ang = Math.atan2(p.z, p.x) + (e * 4.5) / (r0 * 0.35 + 0.55);
    const nr = r0 * Math.pow(1 - e, 1.4);
    out.x = Math.cos(ang) * nr; out.z = Math.sin(ang) * nr; out.y = p.y * (1 - e);
    out.scale = 1 - 0.8 * e;
    out.alpha = Math.pow(1 - e, 0.9) * clamp01((nr - 0.3) / 0.25);
    return out;
  }

  /* ----- 主循环 ----- */
  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    this.fps = this.fps * 0.95 + (dt > 0 ? 1 / dt : 60) * 0.05;
    this.step(dt, t);
    this.render();
    this.syncLabels();
  }

  step(dt, t = this.clock.elapsedTime) {
    damp(this.lightMix, this.wave ? this.wave.target : (this.light ? 1 : 0), 3.2, dt);
    const LM = this.lightMix.value;
    const P = PALETTE;

    /* 入场 */
    if (this.intro < 1) this.intro = Math.min(1, this.intro + dt / 1.5);
    const introA = smooth(this.intro / 0.9);

    /* 吸入时间线 */
    if (this.extract) this.suck = smooth((t - this.extract.t0) / 1.6);

    /* 场景级主题插值 */
    this.scene.background.copy(P.dark.bg).lerp(P.light.bg, LM);
    this.scene.fog.color.copy(this.scene.background);
    this.starUniforms.uLight.value = LM;
    this.starUniforms.uTime.value = t;
    this.starIUniforms.uLight.value = LM;
    this.starIUniforms.uTime.value = t;
    this.pUniforms.uLight.value = LM;
    this.lineUniforms.uLight.value = LM;
    this.diskUniforms.uTime.value = t; this.diskUniforms.uLight.value = LM;
    this.diskUniforms.uSuck.value = this.suck; this.diskUniforms.uAlpha.value = introA;
    this.ringUniforms.uTime.value = t; this.ringUniforms.uLight.value = LM;
    this.ringUniforms.uSuck.value = this.suck; this.ringUniforms.uAlpha.value = introA;
    this.arcUniforms.uTime.value = t; this.arcUniforms.uLight.value = LM;
    this.arcUniforms.uSuck.value = this.suck; this.arcUniforms.uAlpha.value = introA;
    this.horizon.material.color.copy(P.dark.horizon).lerp(P.light.horizon, LM);
    this.glowMat.color.copy(P.dark.glow).lerp(P.light.glow, LM);
    this.glowMat.opacity = (0.38 - 0.26 * LM) * introA * (1 + this.suck * 2) * (1 - smooth((this.suck - 0.72) / 0.28));
    this.glow.scale.setScalar(5.5 * (1 + this.suck * 1.2));
    this.nebulae.forEach((m, i) => { m.opacity = (this.light ? 0.05 : 0.16 - i * 0.04) * introA; });
    if (!this._dbgBloom) {
      this.bloom.strength = (0.5 + this.suck * 0.25) * (1 - LM);
      this.bloom.threshold = 0.55 + (0.97 - 0.55) * LM;
    }
    this.renderer.toneMappingExposure = 1.05 + 0.27 * LM;

    /* 呼吸 */
    const idle = clamp01((t - this.lastInteraction - 2.5) / 1.5);

    /* 星座公转（相位锁定）+ 高亮 */
    GROUPS.forEach((g, gi) => {
      g.angle = g.a0 + t * OMEGA + 0.12 * Math.sin(t * g.wobF + g.wobP);
      g.center.set(
        Math.cos(g.angle) * g.r,
        g.y + Math.sin(t * 0.35 + g.a0 * 3) * 0.10,
        Math.sin(g.angle) * g.r
      );
      const dom = GROUP_DOMAIN[gi];
      const hi = (this.hoverDomain === dom ? 0.8 : 0) + (this.extract && this.extract.domain === dom ? 1.2 : 0);
      const u = this.lineUniforms.uHi.value;
      u[gi] += (hi - u[gi]) * Math.min(1, dt * 6);
    });

    /* 主题波（局部坐标距离延迟） */
    if (this.wave) {
      const wv = this.wave;
      const age = t - wv.t0;
      const upd = (tm, x, y) => {
        const d = Math.hypot(x - wv.ox, y - wv.oy);
        const delay = Math.min(0.7, d * 0.08);
        if (age > delay) return tm + (wv.target - tm) * Math.min(1, (age - delay) * 3) * Math.min(1, dt * 12);
        return tm;
      };
      for (const p of this.parts) p.tm = upd(p.tm, p.pos.x, p.pos.y);
      for (const st of this.starState) st.tm = upd(st.tm, st.lp.x, st.lp.y);
      if (age > 2.4) this.wave = null;
    }

    /* 流珠：沿轨道按序汇入 */
    GROUPS.forEach((g, gi) => damp(this.speedS[gi], 1, 3, dt));
    for (const p of this.parts) {
      const g = GROUPS[p.g];
      p.t += (dt / p.flight) * this.speedS[p.g].value;
      if (p.t >= 1) {
        /* 钉星：按序点亮该星座下一颗新星；全亮后随机重亮 */
        const pool = this.growthByGroup[p.g];
        if (pool && pool.length) {
          let target = null;
          while (this.ignitePtr[p.g] < pool.length) {
            const cand = pool[this.ignitePtr[p.g]++];
            if (!cand.lit) { target = cand; break; }
          }
          if (!target) target = pick(pool);
          target.lit = 1;
          target.pop = 1;
          this.flashAt(target.lp);
          this.stars++;
          this.opts.onAbsorb && this.opts.onAbsorb(this.stars);
        }
        this.respawnBead(p);
      }
      const e = smooth(p.t);
      const ang = p.a0 + (g.angle + 0.12 - p.a0) * e;
      const r = p.r0 + (g.r - p.r0) * e;
      p.pos.set(
        Math.cos(ang) * r,
        p.yb + (g.y - p.yb) * e + Math.sin(p.t * Math.PI) * 0.25 * p.wob,
        Math.sin(ang) * r
      );
      p.boost = 0;
      for (const rp of this.ripples) {
        const age = t - rp.t0;
        if (age > 2.6) continue;
        const d = p.pos.distanceTo(rp.origin);
        p.boost += 0.9 * Math.exp(-age * 1.15) * Math.max(0, Math.cos((d - age * 5) * 0.8)) * bell(d - age * 5, 2.0);
      }
    }
    this.ripples = this.ripples.filter((rp) => t - rp.t0 < 2.6);

    /* 星位：局部坐标 = 星座中心 + 偏移；pop/涟漪衰减 */
    for (const st of this.starState) {
      const g = GROUPS[st.group];
      st.lp.copy(g.center).add(st.off);
      st.pop *= Math.exp(-dt * 3.2);
      st.ripple = 0;
      for (const rp of this.ripples) {
        if (rp.group !== st.group) continue;
        const age = t - rp.t0;
        const d = st.lp.distanceTo(rp.origin);
        st.ripple += 0.8 * Math.exp(-age * 1.2) * Math.max(0, Math.cos((d - age * 4) * 0.9)) * bell(d - age * 4, 1.8);
      }
    }

    /* 档案板：随星座公转；选中时坠向视界 */
    this.plates.forEach((pl) => {
      const g = GROUPS[pl.g];
      const extracting = this.extract && this.extract.domain === pl.domain;
      const other = this.extract && !extracting;
      const rad = Math.hypot(g.center.x, g.center.z) || 1;
      const fs = this.frameSq || 1;
      pl.anchor.set(
        g.center.x + (g.center.x / rad) * 0.45 * fs,
        g.center.y + 0.85,
        g.center.z + (g.center.z / rad) * 0.45 * fs
      );
      damp(pl.scale, (extracting ? 0.55 : other ? 0.86 : this.hoverDomain === pl.domain ? 1.13 : 1) * (this.uiScale || 1), 6, dt);
      damp(pl.stag, extracting ? 1 : 0, extracting ? 2.6 : 5, dt);
      damp(pl.bright, extracting ? 1.4 : other ? 0.32 : this.hoverDomain === pl.domain ? 1.2 : 1, 6, dt);
      const ox = pl.anchor.x + Math.sin(t * 0.31 + pl.phase) * 0.10;
      const oy = pl.anchor.y + Math.sin(t * 0.42 + pl.phase * 1.7) * 0.09;
      const oz = pl.anchor.z + Math.cos(t * 0.26 + pl.phase) * 0.08;
      const k = smooth(pl.stag.value);
      pl.pos.set(ox * (1 - k), oy * (1 - k), oz * (1 - k));
      pl.group.position.copy(pl.pos);
      pl.group.scale.setScalar(pl.scale.value * (1 - k * 0.6));
      pl.group.quaternion.copy(ECLIP_Q_INV).multiply(this.camera.quaternion);
      const o = Math.min(1, pl.bright.value) * (1 - k);
      pl.meshD.material.opacity = o * (1 - LM);
      pl.meshL.material.opacity = o * LM;
      pl.meshD.material.color.setScalar(Math.min(1.3, pl.bright.value));
      pl.meshL.material.color.setScalar(Math.min(1.3, pl.bright.value));
    });

    /* 相机：基准 + 视差 + 呼吸漂移；吸入时推进 */
    const ex = this.extract;
    const parX = this.mouse.x * 0.45, parY = this.mouse.y * 0.25;
    const driftX = idle * 0.1 * Math.sin((t * Math.PI * 2) / 11);
    const driftY = idle * 0.07 * Math.cos((t * Math.PI * 2) / 14);
    let tx = parX + driftX, ty = 1.35 + parY + driftY, tz = this.baseCamZ || 11;
    let lx = 0, ly = -0.25, lz = 0;
    if (ex) {
      tx = 0; ty = 0.9; tz = (this.baseCamZ || 11) * 0.68;
      lx = 0; ly = 0; lz = 0;
      if (this.suck >= 0.8 && !ex.covered) {
        ex.covered = true;
        const done = () => ex.onCovered && ex.onCovered();
        if (window.AstraTransition) window.AstraTransition.cover(done);
        else done();
      }
    }
    damp(this.camPos.x, tx, 4.2, dt); damp(this.camPos.y, ty, 4.2, dt); damp(this.camPos.z, tz, 4.2, dt);
    damp(this.camLook.x, lx, 4.2, dt); damp(this.camLook.y, ly, 4.2, dt); damp(this.camLook.z, lz, 4.2, dt);
    this.camera.position.set(this.camPos.x.value, this.camPos.y.value, this.camPos.z.value);
    this.camera.lookAt(this.camLook.x.value, this.camLook.y.value, this.camLook.z.value);

    /* 黑洞组面向相机 */
    this.holeGroup.children.forEach((c) => c.quaternion.copy(this.camera.quaternion));

    /* 闪光衰减 */
    for (const f of this.flashes) {
      if (!f.sp.visible) continue;
      f.age += dt;
      const k = f.age / 0.5;
      if (k >= 1 || this.suck > 0.3) { f.sp.visible = false; continue; }
      f.sp.scale.setScalar(0.3 + k * 0.9);
      f.sp.material.opacity = 0.85 * (1 - k) * (1 - LM * 0.6);
    }
  }

  render() {
    const introA = smooth(this.intro / 0.9);
    const tmp = { x: 0, y: 0, z: 0, scale: 1, alpha: 1 };

    /* 流珠实例 */
    for (let i = 0; i < this.MAXP; i++) {
      const p = this.parts[i];
      const tf = this.suckTF(p.pos, p.wob * 0.5 + 0.5, tmp);
      const fadeEnds = smooth(p.t / 0.08) * smooth((1 - p.t) / 0.06);
      const bright = 1 + p.boost * 1.3;
      this.dummy.position.set(tf.x, tf.y, tf.z);
      this.dummy.scale.setScalar(Math.max(0.0001, p.size * (1 + p.boost * 0.4) * tf.scale));
      this.dummy.updateMatrix();
      this.pMesh.setMatrixAt(i, this.dummy.matrix);
      this.iColor.setXYZ(i,
        (p.cd.r + (p.cl.r - p.cd.r) * p.tm) * bright,
        (p.cd.g + (p.cl.g - p.cd.g) * p.tm) * bright,
        (p.cd.b + (p.cl.b - p.cd.b) * p.tm) * bright);
      this.iAlpha.setX(i, 0.95 * fadeEnds * tf.alpha * introA);
      this.iCell.setX(i, p.cell);
    }
    this.pMesh.instanceMatrix.needsUpdate = true;
    this.iColor.needsUpdate = true;
    this.iAlpha.needsUpdate = true;
    this.iCell.needsUpdate = true;

    /* 星位实例 */
    for (let i = 0; i < this.NS; i++) {
      const st = this.starState[i];
      const tf = this.suckTF(st.lp, st.seed, tmp);
      const hiBoost = this.lineUniforms.uHi.value[st.group];
      const s = st.base * st.lit * (1 + st.pop * 0.8 + (st.ripple || 0) * 0.3 + hiBoost * 0.25);
      this.dummy.position.set(tf.x, tf.y, tf.z);
      this.dummy.scale.setScalar(Math.max(0.0001, s * tf.scale));
      this.dummy.updateMatrix();
      this.starMesh.setMatrixAt(i, this.dummy.matrix);
      const cd = PALETTE.dark.group[st.group], cl = PALETTE.light.group[st.group];
      const bright = (0.85 + st.pop * 1.6 + (st.ripple || 0) * 1.1 + hiBoost * 0.5) * (st.fig ? 1 : 0.9);
      this.sColor.setXYZ(i,
        (cd.r + (cl.r - cd.r) * st.tm) * bright,
        (cd.g + (cl.g - cd.g) * st.tm) * bright,
        (cd.b + (cl.b - cd.b) * st.tm) * bright);
      this.sAlpha.setX(i, tf.alpha * introA);
    }
    this.starMesh.instanceMatrix.needsUpdate = true;
    this.sColor.needsUpdate = true;
    this.sAlpha.needsUpdate = true;

    /* 星图连线 */
    {
      const arr = this.linePosAttr.array;
      this.lineEdges.forEach((e, i) => {
        const a = this.suckTF(e.sa.lp, e.sa.seed, tmp);
        arr[i * 6] = a.x; arr[i * 6 + 1] = a.y; arr[i * 6 + 2] = a.z;
        const b = this.suckTF(e.sb.lp, e.sb.seed, tmp);
        arr[i * 6 + 3] = b.x; arr[i * 6 + 4] = b.y; arr[i * 6 + 5] = b.z;
      });
      this.linePosAttr.needsUpdate = true;
      this.lineUniforms.uFade.value = introA * Math.pow(1 - this.suck, 0.9);
    }

    this.composer.render();
    this.ecliptic.updateMatrixWorld(true);
    this.plates.forEach((pl) => pl.group.getWorldPosition(pl.wp));
  }

  syncLabels() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    const v = new THREE.Vector3();
    for (const pl of this.plates) {
      if (!pl.el) continue;
      v.copy(pl.wp); v.y -= 0.68 * pl.scale.value * (this.sceneScale || 1);
      v.project(this.camera);
      const sx = Math.min(w - 78, Math.max(78, (v.x * 0.5 + 0.5) * w));
      const sy = Math.min(h - 90, Math.max(24, (-v.y * 0.5 + 0.5) * h));
      const behind = v.z > 1;
      const k = smooth(pl.stag.value);
      let op = behind ? 0 : 1;
      if (this.extract) op = this.extract.domain === pl.domain ? 1 - k : 0.2;
      pl.el.style.transform = `translate3d(${sx.toFixed(1)}px,${sy.toFixed(1)}px,0) translate(-50%,0)`;
      pl.el.style.opacity = op.toFixed(2);
      pl.el.classList.toggle("hot", this.hoverDomain === pl.domain || (this.extract && this.extract.domain === pl.domain));
    }
  }

  unmount() {
    this.renderer.setAnimationLoop(null);
    this.ro.disconnect();
    this.container.removeEventListener("pointermove", this.onPointer);
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
    this.renderer.dispose();
    this.atlas.dispose();
    this.starTex.dispose();
    this.glowTex.dispose();
    this.renderer.domElement.remove();
  }
}

/* ============================================================
   全局 API
   ============================================================ */
let instance = null;

window.AstraScene = {
  get ready() { return true; },

  mount(container, opts) {
    this.unmount();
    try {
      instance = new AstraScene(container, opts);
      window.__astra = {
        get fps() { return instance ? instance.fps : 0; },
        get absorbed() { return instance ? instance.stars : 0; },
        plates: () => instance ? instance.plates.map((p) => ({ domain: p.domain, x: p.wp.x, y: p.wp.y, z: p.wp.z })) : [],
      };
      window.__astraSetBloom = (s, th) => { if (instance) { instance.bloom.strength = s; instance.bloom.threshold = th; instance._dbgBloom = true; } };
      window.__astraSetExposure = (e) => { if (instance) instance.renderer.toneMappingExposure = e; };
      window.__astraNoComposer = () => { if (instance) instance.composer.render = () => instance.renderer.render(instance.scene, instance.camera); };
      window.__astraNoTone = () => { if (instance) instance.renderer.toneMapping = THREE.NoToneMapping; };
      window.__astraProbe = () => {
        if (!instance) return null;
        const v = new THREE.Vector3(0, 0, 0).project(instance.camera);
        const w = instance.container.clientWidth, h = instance.container.clientHeight;
        return {
          cam: instance.camera.position.toArray(), growth: instance.intro, suck: instance.suck,
          holeScreen: [(v.x * 0.5 + 0.5) * w, (-v.y * 0.5 + 0.5) * h, v.z],
          groups: GROUPS.map((g) => ({ domain: g.domain, angle: g.angle, center: g.center.toArray() })),
        };
      };
      return true;
    } catch (err) {
      console.error("[AstraScene] WebGL 初始化失败：", err);
      instance = null;
      return false;
    }
  },

  unmount() { if (instance) { instance.unmount(); instance = null; } },
  hover(domain) { if (instance && !instance.reduced) instance.setHover(domain); },
  burst(domain) { if (instance && !instance.reduced) instance.burst(domain); },
  select(domain, onCovered) { if (instance && !instance.reduced) instance.select(domain, onCovered); else onCovered && onCovered(); },
  themeWave(light, x, y) { if (instance) instance.themeWave(light, x, y); },
};
window.dispatchEvent(new Event("astra-scene-ready"));
