// The depth is measured in yard cells. Screen derivatives convert that distance to the UV
// basis of each face, including mirrored and skewed regions of the painted sprite sheets.
import { MeshLambertMaterial, type Texture, type WebGLProgramParametersWithUniforms } from 'three';

export class ReliefMaterial extends MeshLambertMaterial {
  grain?: { texture: Texture; repeats: number };
  override customProgramCacheKey(): string {
    return this.grain ? 'yard-relief-ground' : this.userData.atlas ? 'yard-relief-atlas' : 'yard-relief';
  }

  override onBeforeCompile(shader: WebGLProgramParametersWithUniforms): void {
    const atlas = this.userData.atlas === true;
    if (this.grain) {
      shader.uniforms.soilGrain = { value: this.grain.texture };
      shader.uniforms.soilRepeats = { value: this.grain.repeats };
      shader.fragmentShader = 'uniform sampler2D soilGrain; uniform float soilRepeats;\n' + shader.fragmentShader;
    }
    if (atlas) {
      shader.vertexShader =
        'attribute vec4 panelEdges; varying vec4 vPanelEdges;\n' +
        shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvPanelEdges = panelEdges;');
      shader.fragmentShader = 'varying vec4 vPanelEdges;\n' + shader.fragmentShader;
    }
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <map_fragment>',
        `
      vec2 uvX = dFdx(vMapUv), uvY = dFdy(vMapUv);
      vec3 dx = dFdx(-vViewPosition), dy = dFdy(-vViewPosition);
      vec3 area = cross(dx, dy);
      float invArea = inversesqrt(max(dot(area, area), 1e-18));
      vec3 faceN = area * invArea;
      vec3 dualX = cross(dy, faceN) * invArea, dualY = cross(faceN, dx) * invArea;
      vec3 eye = isOrthographic ? vec3(0., 0., 1.) : normalize(vViewPosition);
      float pixelDepth = bumpScale * inversesqrt(max(max(dot(dx,dx), dot(dy,dy)), 1e-10));
      float relief = bumpScale * smoothstep(0.26, 1.2, pixelDepth);
      vec2 rayPixels = -relief * vec2(dot(eye, dualX), dot(eye, dualY)) / max(dot(faceN,eye), 0.24);
      ${
        atlas
          ? `
        // Intersect the ray with the edges of this particular atlas polygon.
        vec4 span = dFdx(vPanelEdges) * rayPixels.x + dFdy(vPanelEdges) * rayPixels.y;
        vec4 limit = max(vPanelEdges, 0.) / max(-span, 1e-7);
        rayPixels *= min(1., min(min(limit.x,limit.y), min(limit.z,limit.w)));
      `
          : ''
      }
      vec2 travel = uvX * rayPixels.x + uvY * rayPixels.y;
      vec2 detailUv = vMapUv;
      float cavity = 0.;
      if (relief > 0.0001) {
        // March from the reference plane into the height field. Interpolate the last
        // interval to avoid terraces. Explicit gradients keep mip levels stable at edges.
        float previous = 1. - textureGrad(bumpMap, detailUv, uvX, uvY).r;
        for (int stepIndex = 1; stepIndex <= 6; ++stepIndex) {
          float layer = float(stepIndex) / 6.;
          float gap = 1. - textureGrad(bumpMap, vMapUv + travel * layer, uvX, uvY).r - layer;
          if (gap <= 0.) {
            cavity = layer - (1. - previous / max(previous-gap, 1e-5)) / 6.;
            break;
          }
          previous = gap;
        }
        detailUv += travel * cavity;
      }
      diffuseColor *= textureGrad(map, detailUv, uvX, uvY);
      ${
        this.grain
          ? `
        vec2 cover = textureGrad(bumpMap, detailUv, uvX, uvY).gb;
        vec3 weights = vec3(cover, max(0., 1. - cover.x - cover.y));
        vec3 grain = textureGrad(soilGrain, detailUv * soilRepeats, uvX * soilRepeats, uvY * soilRepeats).rgb;
        float microHeight = dot(grain - vec3(0.51), weights);
        diffuseColor.rgb *= 1. + microHeight * 0.82;
        vec3 microSlope = 0.024 * (dFdx(microHeight) * dualX + dFdy(microHeight) * dualY);
      `
          : ''
      }
    `,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `
      if (relief > 0.0001) {
        float h = textureGrad(bumpMap, detailUv, uvX, uvY).r;
        float hx = textureGrad(bumpMap, detailUv + uvX, uvX, uvY).r - h;
        float hy = textureGrad(bumpMap, detailUv + uvY, uvX, uvY).r - h;
        vec3 slope = relief * (hx * dualX + hy * dualY);
        normal = normalize(normal - slope / (1. + length(slope)));
      }
      ${this.grain ? 'normal = normalize(normal - microSlope / (1. + length(microSlope)));' : ''}
    `,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `
      #ifdef USE_EMISSIVEMAP
        totalEmissiveRadiance *= textureGrad(emissiveMap, detailUv, uvX, uvY).rgb;
      #endif
    `,
      );
  }
}
