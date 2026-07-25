"use client";

import { useFrame } from "@react-three/fiber";
import { type RefObject, useMemo, useRef } from "react";
import {
  BackSide,
  Color,
  type AmbientLight,
  type DirectionalLight,
  type Fog,
  type HemisphereLight,
  MathUtils,
  type Mesh
} from "three";
import {
  resolveRpgKeyLightPlacement,
  resolveRpgRimLightPosition,
  RPG_AMBIENT_LIGHT_INTENSITY,
  RPG_KEY_SHADOW_BIAS,
  RPG_KEY_SHADOW_EXTENT,
  RPG_KEY_SHADOW_FAR,
  RPG_KEY_SHADOW_NEAR,
  RPG_KEY_SHADOW_NORMAL_BIAS,
  RPG_RIM_LIGHT_INTENSITY,
  RPG_SKY_DOME_RADIUS,
  RPG_SKY_GRADIENT_EXPONENT
} from "./RpgLightingDesign";
import type { RpgRegionPresentationState } from "./RpgRegionPresentation";
import {
  RPG_REGION_PRESENTATION_PROFILES,
  resolveRpgRegionPresentation
} from "./RpgRegionPresentation";
import type { SceneQualitySettings } from "./SceneQuality";
import type { WorldNavigationSnapshot } from "./WorldNavigationState";

export interface RpgTownAmbienceProps {
  readonly qualitySettings: SceneQualitySettings;
  readonly navigation: RefObject<WorldNavigationSnapshot>;
  readonly presentation: RefObject<RpgRegionPresentationState>;
}

const SPAWN = RPG_REGION_PRESENTATION_PROFILES.airport;

const SKY_VERTEX_SHADER = /* glsl */ `
varying vec3 vDirection;
void main() {
  vDirection = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// The horizon band has to land on exactly the fog colour, otherwise distant
// geometry fades into a value the sky behind it does not share.
const SKY_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 horizonColor;
uniform vec3 zenithColor;
uniform float gradientExponent;
varying vec3 vDirection;
void main() {
  float height = clamp(vDirection.y, -1.0, 1.0);
  float upward = pow(max(height, 0.0), gradientExponent);
  float downward = smoothstep(0.0, -0.35, height);
  vec3 color = mix(horizonColor, zenithColor, upward);
  color = mix(color, horizonColor * 0.82, downward);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function RpgTownAmbience({
  qualitySettings,
  navigation,
  presentation
}: RpgTownAmbienceProps) {
  const background = useRef<Color>(null);
  const fog = useRef<Fog>(null);
  const hemisphere = useRef<HemisphereLight>(null);
  const ambient = useRef<AmbientLight>(null);
  const directional = useRef<DirectionalLight>(null);
  const rim = useRef<DirectionalLight>(null);
  const skyDome = useRef<Mesh>(null);
  const shadowFrame = useRef(0);
  const skyUniforms = useMemo(
    () => ({
      horizonColor: { value: new Color(SPAWN.sky) },
      zenithColor: { value: new Color(SPAWN.skyTop) },
      gradientExponent: { value: RPG_SKY_GRADIENT_EXPONENT }
    }),
    []
  );

  useFrame((state, delta) => {
    const target = resolveRpgRegionPresentation(
      navigation.current.navigationRegion,
      presentation.current
    );
    const colorAmount = 1 - Math.exp(-delta * 5);
    background.current?.lerp(target.sky, colorAmount);
    // Distance dissolves into the sky, so fog and horizon are one colour.
    fog.current?.color.lerp(target.sky, colorAmount);
    if (fog.current) {
      fog.current.near = MathUtils.damp(
        fog.current.near,
        target.fogNear,
        5,
        delta
      );
      fog.current.far = MathUtils.damp(
        fog.current.far,
        target.fogFar,
        5,
        delta
      );
    }
    if (skyDome.current) {
      skyDome.current.position.copy(state.camera.position);
      skyUniforms.horizonColor.value.lerp(target.sky, colorAmount);
      skyUniforms.zenithColor.value.lerp(target.skyTop, colorAmount);
    }
    if (hemisphere.current) {
      hemisphere.current.color.lerp(target.fill, colorAmount);
      hemisphere.current.groundColor.lerp(target.bounce, colorAmount);
      hemisphere.current.intensity = MathUtils.damp(
        hemisphere.current.intensity,
        target.fillIntensity,
        5,
        delta
      );
    }
    if (ambient.current) {
      ambient.current.color.lerp(target.ambient, colorAmount);
    }
    if (rim.current) {
      rim.current.color.lerp(target.rim, colorAmount);
      rim.current.position.set(
        ...resolveRpgRimLightPosition(target.sunAzimuthDegrees)
      );
    }
    if (directional.current) {
      directional.current.color.lerp(target.key, colorAmount);
      // A facade's normal is horizontal, so N.L is cos(elevation). The
      // placement clamps the sun into the design band, which keeps every wall
      // lit whatever the zone asks for.
      directional.current.position.set(
        ...resolveRpgKeyLightPlacement(
          target.sunElevationDegrees,
          target.sunAzimuthDegrees
        ).position
      );
      directional.current.intensity = MathUtils.damp(
        directional.current.intensity,
        qualitySettings.level === "low"
          ? target.keyIntensity * 0.9
          : target.keyIntensity,
        5,
        delta
      );
      shadowFrame.current += 1;
      directional.current.shadow.autoUpdate =
        qualitySettings.shadowUpdateEveryFrames === 1;
      if (
        qualitySettings.shadowUpdateEveryFrames > 1 &&
        shadowFrame.current % qualitySettings.shadowUpdateEveryFrames === 0
      ) {
        directional.current.shadow.needsUpdate = true;
      }
    }
  }, -3);

  return (
    <>
      <color ref={background} attach="background" args={[SPAWN.sky]} />
      <fog
        ref={fog}
        attach="fog"
        args={[SPAWN.sky, SPAWN.fogNear, SPAWN.fogFar]}
      />
      <mesh
        ref={skyDome}
        name="rpg-sky-dome"
        renderOrder={-1000}
        frustumCulled={false}
      >
        <sphereGeometry args={[RPG_SKY_DOME_RADIUS, 32, 16]} />
        <shaderMaterial
          side={BackSide}
          depthWrite={false}
          depthTest={false}
          uniforms={skyUniforms}
          vertexShader={SKY_VERTEX_SHADER}
          fragmentShader={SKY_FRAGMENT_SHADER}
        />
      </mesh>
      <ambientLight
        ref={ambient}
        color={SPAWN.ambient}
        intensity={RPG_AMBIENT_LIGHT_INTENSITY}
      />
      <hemisphereLight
        ref={hemisphere}
        color={SPAWN.fill}
        groundColor={SPAWN.bounce}
        intensity={SPAWN.fillIntensity}
      />
      <directionalLight
        ref={rim}
        color={SPAWN.rim}
        intensity={RPG_RIM_LIGHT_INTENSITY}
        position={resolveRpgRimLightPosition(SPAWN.sunAzimuthDegrees)}
      />
      <directionalLight
        ref={directional}
        color={SPAWN.key}
        intensity={SPAWN.keyIntensity}
        position={
          resolveRpgKeyLightPlacement(
            SPAWN.sunElevationDegrees,
            SPAWN.sunAzimuthDegrees
          ).position
        }
        castShadow={qualitySettings.shadowMapSize > 0}
        shadow-mapSize-width={qualitySettings.shadowMapSize}
        shadow-mapSize-height={qualitySettings.shadowMapSize}
        shadow-camera-left={-RPG_KEY_SHADOW_EXTENT}
        shadow-camera-right={RPG_KEY_SHADOW_EXTENT}
        shadow-camera-top={RPG_KEY_SHADOW_EXTENT}
        shadow-camera-bottom={-RPG_KEY_SHADOW_EXTENT}
        shadow-camera-near={RPG_KEY_SHADOW_NEAR}
        shadow-camera-far={RPG_KEY_SHADOW_FAR}
        shadow-bias={RPG_KEY_SHADOW_BIAS}
        shadow-normalBias={RPG_KEY_SHADOW_NORMAL_BIAS}
      />
    </>
  );
}
