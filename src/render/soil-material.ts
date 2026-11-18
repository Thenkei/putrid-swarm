import { CanvasTexture, DataTexture, LinearFilter, LinearMipmapLinearFilter, MeshStandardMaterial, RepeatWrapping, type Texture, type WebGLProgramParametersWithUniforms } from 'three';
import { GRID_W } from '../core/map';
import { FIELD_MARGIN } from './terrainfield';
import { scannedGrain } from './scanned-ground';

let fineGrain:DataTexture|undefined;
function grainTexture():DataTexture {
  if(fineGrain)return fineGrain;
  const size=768;
  fineGrain=new DataTexture(scannedGrain(size),size,size);
  fineGrain.wrapS=fineGrain.wrapT=RepeatWrapping;
  fineGrain.flipY=true;
  fineGrain.anisotropy=8;
  fineGrain.magFilter=LinearFilter;fineGrain.minFilter=LinearMipmapLinearFilter;fineGrain.generateMipmaps=true;
  fineGrain.needsUpdate=true;
  return fineGrain;
}

/** One material for the whole lot, including the shallow stone lips cut into the banks.
 * The single packed lookup provides relief and roughness. Fine scan normals follow the
 * same UV offset. Distant pixels skip the second height sample and use ordinary mipmaps. */
export class SoilMaterial extends MeshStandardMaterial {
  readonly reliefDepth = {value: 0.046};

  constructor(albedo: Texture, surface: HTMLCanvasElement, normal: HTMLCanvasElement) {
    const shape = new CanvasTexture(surface), grain = new CanvasTexture(normal);
    shape.anisotropy = grain.anisotropy = 6;
    super({ map: albedo, roughnessMap: shape, normalMap: grain, roughness: 1, metalness: 0, transparent:true, depthWrite:false });
    this.normalScale.set(0.79,0.79);
  }

  override onBeforeCompile(shader: WebGLProgramParametersWithUniforms):void {
    shader.uniforms.soilDepth = this.reliefDepth;
    shader.uniforms.soilFine={value:grainTexture()};
    shader.uniforms.soilSpan={value:(GRID_W+2*FIELD_MARGIN)/2.42};
    shader.fragmentShader='uniform float soilDepth; uniform sampler2D soilFine; uniform float soilSpan;\n' + shader.fragmentShader.replace('#include <map_fragment>',`
      vec2 gradX=dFdx(vMapUv), gradY=dFdy(vMapUv);
      vec3 dx=dFdx(-vViewPosition),dy=dFdy(-vViewPosition);
      vec3 face=cross(dx,dy);
      float invArea=inversesqrt(max(dot(face,face),1e-16));
      vec3 planeNormal=face*invArea;
      vec3 dualX=cross(dy,planeNormal)*invArea,dualY=cross(planeNormal,dx)*invArea;
      float features=smoothstep(0.23,1.15,0.82*soilDepth*inversesqrt(max(max(dot(dx,dx),dot(dy,dy)),1e-12)));
      vec2 groundUv=vMapUv;
      vec4 sampleSoil=textureGrad(roughnessMap,groundUv,gradX,gradY);
      if(features>0.01){
        vec3 eye=isOrthographic?vec3(0.,0.,1.):normalize(vViewPosition);
        vec2 ray=-soilDepth*features*(gradX*dot(dualX,eye)+gradY*dot(dualY,eye))/max(dot(planeNormal,eye),0.26);
        groundUv+=ray*(0.52-sampleSoil.r);
        sampleSoil=textureGrad(roughnessMap,groundUv,gradX,gradY);
      }
      diffuseColor *= textureGrad(map,groundUv,gradX,gradY);
      float closeDetail=smoothstep(.55,2.4,.052*inversesqrt(max(max(dot(dx,dx),dot(dy,dy)),1e-12)));
      float bed=clamp(2.*sampleSoil.b-1.,-1.,1.);
      vec3 fabrics=vec3(max(0.,bed),1.-abs(bed),max(0.,-bed));
      float charGrain=0., fineHeight=0.;
      if(closeDetail>.001){
        vec4 nativeDetail=textureGrad(soilFine,groundUv*soilSpan,gradX*soilSpan,gradY*soilSpan);
        charGrain=dot((nativeDetail.rgb-.5)*vec3(1.13,.83,.81),fabrics);
        fineHeight=mix(charGrain,nativeDetail.a-.5,.72*fabrics.r);
        diffuseColor.rgb *= exp2(2.20*closeDetail*charGrain);
      }
    `).replace('#include <roughnessmap_fragment>','float roughnessFactor=clamp(0.26+0.73*roughness*sampleSoil.g,0.45,0.98);')
    .replace('#include <normal_fragment_maps>',`
      vec3 surfaceN=textureGrad(normalMap,groundUv,gradX,gradY).xyz*2.-1.;
      surfaceN.xy*=normalScale;
      vec3 shallow=0.022*features*(dFdx(sampleSoil.r)*dualX+dFdy(sampleSoil.r)*dualY);
      shallow+=.020*closeDetail*(dFdx(fineHeight)*dualX+dFdy(fineHeight)*dualY);
      normal=normalize(tbn*surfaceN-shallow/(1.+length(shallow)));
    `);
  }
}
