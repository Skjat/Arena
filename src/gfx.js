// Графика: материал тел (цвет/шероховатость по вершинам, контурный свет, кровь, шум),
// улучшение стандартных материалов и постобработка (MSAA, bloom, цветокоррекция).
import * as THREE from 'three';

const NOISE_GLSL = `
float h31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z); }
`;

// Общий цвет контурного света (меняется вместе с ареной).
export const RIM = { value: new THREE.Color(0.2, 0.14, 0.09) };

// Материал тела: один на персонажа. Геометрия несёт color и aPbr (roughness, metalness).
export function bodyMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1, side: THREE.DoubleSide });
  const u = {
    uTint: { value: new THREE.Vector4(0, 0, 0, 0) },
    uBlood: { value: 0 },
    uEmMask: { value: 0 },
    uRim: RIM
  };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aPbr;\nvarying vec3 vPbr;\nvarying vec3 vLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPbr = aPbr;\nvLocal = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vPbr; varying vec3 vLocal;
uniform vec4 uTint; uniform float uBlood; uniform float uEmMask; uniform vec3 uRim;
${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float nA = vnoise(vLocal * 26.0);
float nB = vnoise(vLocal * 8.0 + 3.1);
diffuseColor.rgb *= 0.88 + 0.2 * nA + 0.06 * nB;
float bloodMask = 0.0;
if (uBlood > 0.001) {
  float th = 1.0 - uBlood * 0.56;
  bloodMask = smoothstep(th, th + 0.08, nB * 0.8 + nA * 0.2);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.004, 0.004), bloodMask * 0.94);
}
diffuseColor.rgb = mix(diffuseColor.rgb, uTint.rgb, uTint.a);`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(roughness * vPbr.x * (0.92 + 0.16 * nA), 0.04, 1.0);\nroughnessFactor = mix(roughnessFactor, 0.22, bloodMask);')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = metalness * vPbr.y * (1.0 - bloodMask);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance *= mix(1.0, vPbr.z, uEmMask);
float rimF = pow(1.0 - saturate(abs(dot(normalize(vViewPosition), normal))), 3.2);
totalEmissiveRadiance += uRim * rimF * (0.35 + 0.65 * saturate(normal.y * 0.6 + 0.5)) * (1.0 - 0.6 * vPbr.y);`);
  };
  m.customProgramCacheKey = () => 'body-v4';
  return m;
}

// Лёгкое улучшение обычного материала: контурный свет и/или шум по мировым координатам.
export function enhance(mat, o = {}) {
  const rim = o.rim ?? 0, world = o.world ?? 0, scale = o.scale ?? 0.4;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = RIM;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos; uniform vec3 uRim;\n${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
${world > 0 ? `float wn = vnoise(vWPos * ${scale.toFixed(3)}) * 0.65 + vnoise(vWPos * ${(scale * 4.3).toFixed(3)}) * 0.35;
diffuseColor.rgb *= ${(1 - world * 0.5).toFixed(3)} + ${world.toFixed(3)} * wn;` : ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
${rim > 0 ? `float rimF = pow(1.0 - saturate(abs(dot(normalize(vViewPosition), normal))), 3.0);
totalEmissiveRadiance += uRim * rimF * ${rim.toFixed(3)};` : ''}`);
  };
  mat.customProgramCacheKey = () => `enh-${rim}-${world}-${scale}`;
  return mat;
}

// ===================== Постобработка =====================
const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

export class PostFX {
  constructor(renderer) {
    this.r = renderer;
    const ext = renderer.extensions;
    this.hdr = ext.has('EXT_color_buffer_half_float') || ext.has('EXT_color_buffer_float');
    this.type = this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.enabled = true;
    this.samples = 4;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.tri = new THREE.Mesh(g, null);
    this.tri.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.tri);
    const mk = (fs, uniforms, extra = {}) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false, ...extra });
    this.mPre = mk(`uniform sampler2D tMap; uniform vec2 texel; uniform float threshold; uniform float knee; varying vec2 vUv;
      void main(){
        vec3 c = (texture2D(tMap, vUv + texel * vec2(-1.0, -1.0)).rgb + texture2D(tMap, vUv + texel * vec2(1.0, -1.0)).rgb
                + texture2D(tMap, vUv + texel * vec2(-1.0, 1.0)).rgb + texture2D(tMap, vUv + texel * vec2(1.0, 1.0)).rgb) * 0.25;
        c = min(c, vec3(24.0));
        float br = max(c.r, max(c.g, c.b));
        float soft = clamp(br - threshold + knee, 0.0, 2.0 * knee);
        soft = soft * soft / (4.0 * knee + 0.0001);
        float k = max(soft, br - threshold) / max(br, 0.0001);
        gl_FragColor = vec4(c * k, 1.0);
      }`, { tMap: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 1.0 }, knee: { value: 0.5 } }, { toneMapped: false });
    this.mDown = mk(`uniform sampler2D tMap; uniform vec2 texel; varying vec2 vUv;
      void main(){
        vec3 c = texture2D(tMap, vUv).rgb * 4.0;
        c += texture2D(tMap, vUv + texel * vec2(-1.0, -1.0)).rgb + texture2D(tMap, vUv + texel * vec2(1.0, -1.0)).rgb
           + texture2D(tMap, vUv + texel * vec2(-1.0, 1.0)).rgb + texture2D(tMap, vUv + texel * vec2(1.0, 1.0)).rgb;
        gl_FragColor = vec4(c * 0.125, 1.0);
      }`, { tMap: { value: null }, texel: { value: new THREE.Vector2() } }, { toneMapped: false });
    this.mUp = mk(`uniform sampler2D tMap; uniform vec2 texel; uniform float gain; varying vec2 vUv;
      void main(){
        vec3 c = texture2D(tMap, vUv + texel * vec2(-1.0, -1.0)).rgb + texture2D(tMap, vUv + texel * vec2(1.0, -1.0)).rgb
               + texture2D(tMap, vUv + texel * vec2(-1.0, 1.0)).rgb + texture2D(tMap, vUv + texel * vec2(1.0, 1.0)).rgb;
        c += (texture2D(tMap, vUv + texel * vec2(2.0, 0.0)).rgb + texture2D(tMap, vUv + texel * vec2(-2.0, 0.0)).rgb
            + texture2D(tMap, vUv + texel * vec2(0.0, 2.0)).rgb + texture2D(tMap, vUv + texel * vec2(0.0, -2.0)).rgb) * 0.5;
        gl_FragColor = vec4(c / 6.0 * gain, 1.0);
      }`, { tMap: { value: null }, texel: { value: new THREE.Vector2() }, gain: { value: 1 } }, { toneMapped: false, blending: THREE.AdditiveBlending, transparent: true });
    this.params = {
      bloom: 0.75, vignette: 0.42, saturation: 1.1, contrast: 1.07, grain: 0.035, aberration: 0, desat: 0,
      tint: new THREE.Color(1, 1, 1), lift: new THREE.Color(0, 0, 0)
    };
    this.mFinal = mk(`uniform sampler2D tScene; uniform sampler2D tBloom; varying vec2 vUv;
      uniform float bloom; uniform float vignette; uniform float saturation; uniform float contrast; uniform float grain;
      uniform float time; uniform float aberration; uniform float desat; uniform vec3 tint; uniform float aspect;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec2 uv = vUv;
        vec3 col;
        if (aberration > 0.0005) {
          vec2 d = (uv - 0.5) * aberration;
          col = vec3(texture2D(tScene, uv + d).r, texture2D(tScene, uv).g, texture2D(tScene, uv - d).b);
        } else col = texture2D(tScene, uv).rgb;
        col += texture2D(tBloom, uv).rgb * bloom;
        col *= tint;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        vec3 c = gl_FragColor.rgb;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, saturation * (1.0 - desat));
        c = (c - 0.5) * contrast + 0.5;
        vec2 q = (uv - 0.5) * vec2(aspect, 1.0);
        float v = smoothstep(0.35, 1.05, length(q) / max(0.5, aspect * 0.5));
        c *= 1.0 - v * vignette;
        c += (hash(uv * vec2(1920.0, 1080.0) + fract(time) * 100.0) - 0.5) * grain;
        gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
      }`, {
      tScene: { value: null }, tBloom: { value: null }, bloom: { value: 0.75 }, vignette: { value: 0.4 }, saturation: { value: 1.1 }, contrast: { value: 1.07 },
      grain: { value: 0.03 }, time: { value: 0 }, aberration: { value: 0 }, desat: { value: 0 }, tint: { value: new THREE.Color(1, 1, 1) }, aspect: { value: 1 }
    });
    this.mips = [];
    this.rt = null;
    this.w = 0; this.h = 0;
  }

  setSize(w, h) {
    w = Math.max(2, Math.floor(w)); h = Math.max(2, Math.floor(h));
    if (w === this.w && h === this.h && this.rt && this.rt.samples === this.samples) return;
    this.w = w; this.h = h;
    this.dispose();
    this.rt = new THREE.WebGLRenderTarget(w, h, { samples: this.samples, type: this.type, depthBuffer: true, stencilBuffer: false });
    let mw = w, mh = h;
    for (let i = 0; i < 5; i++) {
      mw = Math.max(2, mw >> 1); mh = Math.max(2, mh >> 1);
      const t = new THREE.WebGLRenderTarget(mw, mh, { type: this.type, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
      this.mips.push(t);
    }
  }

  dispose() {
    if (this.rt) this.rt.dispose();
    for (const m of this.mips) m.dispose();
    this.mips = [];
    this.rt = null;
  }

  pass(mat, target) {
    this.tri.material = mat;
    this.r.setRenderTarget(target);
    this.r.render(this.scene, this.cam);
  }

  render(scene, camera, time = 0) {
    const r = this.r;
    if (!this.enabled || !this.rt) {
      r.setRenderTarget(null);
      r.render(scene, camera);
      return;
    }
    r.setRenderTarget(this.rt);
    r.render(scene, camera);
    const auto = r.autoClear;
    // яркие области → цепочка уменьшений
    const P = this.params, M = this.mips;
    this.mPre.uniforms.tMap.value = this.rt.texture;
    this.mPre.uniforms.texel.value.set(0.5 / this.w, 0.5 / this.h);
    this.mPre.uniforms.threshold.value = this.hdr ? 1.0 : 0.78;
    this.mPre.uniforms.knee.value = this.hdr ? 0.6 : 0.2;
    this.pass(this.mPre, M[0]);
    for (let i = 1; i < M.length; i++) {
      this.mDown.uniforms.tMap.value = M[i - 1].texture;
      this.mDown.uniforms.texel.value.set(1 / M[i - 1].width, 1 / M[i - 1].height);
      this.pass(this.mDown, M[i]);
    }
    // обратно вверх, складывая уровни
    r.autoClear = false;
    for (let i = M.length - 1; i > 0; i--) {
      this.mUp.uniforms.tMap.value = M[i].texture;
      this.mUp.uniforms.texel.value.set(0.5 / M[i].width, 0.5 / M[i].height);
      this.mUp.uniforms.gain.value = 1.0;
      this.pass(this.mUp, M[i - 1]);
    }
    r.autoClear = auto;
    const U = this.mFinal.uniforms;
    U.tScene.value = this.rt.texture;
    U.tBloom.value = M[0].texture;
    U.bloom.value = P.bloom * (this.hdr ? 1 : 0.7);
    U.vignette.value = P.vignette; U.saturation.value = P.saturation; U.contrast.value = P.contrast;
    U.grain.value = P.grain; U.time.value = time; U.aberration.value = P.aberration; U.desat.value = P.desat;
    U.tint.value.copy(P.tint);
    U.aspect.value = this.w / this.h;
    this.pass(this.mFinal, null);
  }
}
