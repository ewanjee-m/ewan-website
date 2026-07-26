import { RPG_REGION_PRESENTATION_COLORS } from "./RpgRegionPresentation";
import type { SceneQualityLevel } from "./SceneQuality";

export interface RpgHanabiBurst {
  id: string;
  position: readonly [number, number, number];
  color: string;
  delay: number;
  cycle: number;
  /** Shell radius in world units. Rendered diameter is twice this value. */
  radius: number;
  persistent?: boolean;
}

/**
 * A single normalised lifetime value (`progress`) drives every visual phase.
 * The renderer feeds these values straight into shader uniforms, so the phase
 * math lives here as pure functions instead of being duplicated in GLSL.
 */
export interface RpgFireworkFrame {
  visible: boolean;
  progress: number;
  expansion: number;
  droop: number;
  sizeEnvelope: number;
  twinkle: number;
  opacity: number;
}

export interface RpgFireworkFrameInput {
  elapsedSeconds: number;
  burst: RpgHanabiBurst;
  intensity: number;
  reducedMotion: boolean;
}

/** Phase windows expressed in normalised burst lifetime (0 -> 1). */
export const RPG_HANABI_PHASES = {
  explodeStart: 0,
  explodeEnd: 0.1,
  fallStart: 0.1,
  fallEnd: 1,
  sizeOpenStart: 0,
  sizeOpenEnd: 0.125,
  sizeCloseStart: 0.125,
  sizeCloseEnd: 1,
  twinkleOpenStart: 0.2,
  twinkleOpenEnd: 0.35,
  twinkleCloseStart: 0.8,
  twinkleCloseEnd: 1,
  fadeStart: 0.6,
  fadeEnd: 1,
  hideAfter: 0.9
} as const;

/** Fraction of the shell radius a particle may sag while falling. */
export const RPG_HANABI_DROOP_REACH = 0.62;
/** Inner limit of the shell so particles form a thick skin, not a wire sphere. */
// How far back towards the centre a ray's embers reach. A thin skin drew a
// hollow ball of sparks; a chrysanthemum is read from the trails, so the
// stars need room behind them.
export const RPG_HANABI_SHELL_FLOOR = 0.32;
// Rays per burst is sqrt(count * this). At 220 particles that is 22 rays of
// 10 embers, which is close to the ray count in the concept art.
export const RPG_HANABI_RAY_DENSITY = 2.2;
/** Share of particles drawn oversized and dim to fake a separate glow pass. */
export const RPG_HANABI_GLOW_SHARE = 0.12;
/**
 * White share of a spark's hot centre. The art direction measures the concept
 * bursts at 60% burst hue to 40% white, replacing the flat cream core that
 * rendered every burst at 2-14% saturation.
 */
export const RPG_HANABI_CORE_WHITE_MIX = 0.4;
/** `aSize` above this value is treated as a glow spark by the shader. */
export const RPG_HANABI_GLOW_SIZE_THRESHOLD = 1.6;

export const RPG_HANABI_BURSTS: readonly RpgHanabiBurst[] = [
// The shells burst over the water south of the town. Their lower skyline
// placement keeps the full rings visible from the northern festival approach
// without forcing the chase camera below the ground plane.
  {
    id: "gold-welcome",
    position: [22, 11, -42],
    color: "#ffd06b",
    delay: 0,
    cycle: 3.5,
    radius: 11,
    persistent: true
  },
  {
    id: "coral-finale",
    position: [48, 10, -20],
    color: "#ff7488",
    delay: 0.48,
    cycle: 4.05,
    radius: 12
  },
  {
    id: "sky-blue",
    position: [14, 10, -40],
    color: "#8edbff",
    delay: 0.96,
    cycle: 3.25,
    radius: 9
  },
  {
    id: "sakura-pink",
    position: [46, 10, -28],
    color: "#f4a7dc",
    delay: 1.42,
    cycle: 4.45,
    radius: 10
  },
  {
    id: "festival-gold",
    position: [18, 12, -48],
    color: "#ffe89a",
    delay: 1.88,
    cycle: 3.75,
    radius: 12,
    persistent: true
  },
  {
    id: "mint-wheel",
    position: [13, 12, -44],
    color: "#8df0d2",
    delay: 2.34,
    cycle: 3.55,
    radius: 8
  },
  {
    id: "violet-crown",
    position: [26, 13, -49],
    color: "#c8a1ff",
    delay: 2.8,
    cycle: 4.2,
    radius: 11
  },
  {
    id: "vermillion-ring",
    position: [46, 10, -12],
    color: "#ff9a66",
    delay: 3.24,
    cycle: 3.68,
    radius: 8
  }
] as const;

export interface RpgHanabiRenderBudget {
  bursts: readonly RpgHanabiBurst[];
  /** Points in a single burst shell. Points never reach the triangle budget. */
  particlesPerBurst: number;
  /** Draw calls per burst: 1 shell, or 2 when a lagging trail shell is drawn. */
  shellLayers: number;
}

function keepBurstVisible(burst: RpgHanabiBurst): RpgHanabiBurst {
  return burst.persistent ? burst : { ...burst, persistent: true };
}

const RPG_HANABI_RENDER_BUDGETS: Readonly<
  Record<SceneQualityLevel, RpgHanabiRenderBudget>
> = {
  high: {
    bursts: RPG_HANABI_BURSTS,
    particlesPerBurst: 220,
    shellLayers: 2
  },
  medium: {
    bursts: [
      RPG_HANABI_BURSTS[0],
      RPG_HANABI_BURSTS[1],
      RPG_HANABI_BURSTS[2],
      RPG_HANABI_BURSTS[4],
      RPG_HANABI_BURSTS[6],
      RPG_HANABI_BURSTS[7]
    ],
    particlesPerBurst: 140,
    shellLayers: 1
  },
  low: {
    bursts: [
      keepBurstVisible(RPG_HANABI_BURSTS[0]),
      keepBurstVisible(RPG_HANABI_BURSTS[2]),
      keepBurstVisible(RPG_HANABI_BURSTS[4]),
      keepBurstVisible(RPG_HANABI_BURSTS[7])
    ],
    particlesPerBurst: 80,
    shellLayers: 1
  }
};

export function getRpgHanabiRenderBudget(
  qualityLevel: SceneQualityLevel
): RpgHanabiRenderBudget {
  return RPG_HANABI_RENDER_BUDGETS[qualityLevel];
}

/**
 * Opacity the shells hold when the walk is outside Hanabi. The bursts are the
 * landmark that tells the visitor where the route ends, so they never fade
 * out; they only step back. Sitting below 1 is what makes them read as far
 * away rather than as something going off next to the visitor.
 */
export const RPG_HANABI_DISTANT_INTENSITY = 0.62;

/**
 * How much of the shell opacity follows the particle count. A sparser shell
 * carries less light, but scaling opacity by the raw particle ratio dimmed the
 * low tier to 36 per cent and left nothing on screen. Most of the brightness
 * is held flat so every tier reads, and the high tier is unchanged at 1.
 */
const RPG_HANABI_DENSITY_FLOOR = 0.65;

/**
 * How much of a shell is drawn additively.
 *
 * Additive light cannot darken what is behind it, so over a bright sky every
 * channel clips and a gold shell renders as white speckle: from the airport
 * and Tokyo the bursts were there but carried no hue, which is the same thing
 * as not being there. Normal blending over a bright sky restores the hue, but
 * flipping the mode is a visible pop, and it would land inside the sakura to
 * hanabi transition.
 *
 * So each shell is drawn twice and cross-faded, which is exactly the same
 * thing as interpolating the two blend equations: a normal layer at
 * `opacity * (1 - k)` over an additive layer at `opacity * k` composites to
 * `dst * (1 - opacity + opacity * k) + colour * opacity`, the lerp from normal
 * at k = 0 to additive at k = 1. Nothing pops because nothing switches. It
 * costs one extra draw call per shell.
 *
 * `k` follows the sky the visitor is standing under, so the night over the
 * festival gets the glow and a daylit sky gets the hue.
 */
function skyLuminanceOf(color: { r: number; g: number; b: number }) {
  return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

export function resolveRpgSkyLuminance(color: {
  r: number;
  g: number;
  b: number;
}) {
  return Number.isFinite(color.r + color.g + color.b)
    ? skyLuminanceOf(color)
    : 0;
}

const ZONE_SKY_LUMINANCES = Object.values(RPG_REGION_PRESENTATION_COLORS).map(
  ({ sky }) => skyLuminanceOf(sky)
);

/**
 * Read off the palette rather than written down, so the thresholds cannot
 * drift from the zone skies they describe and so they hold whichever colour
 * space the renderer hands us.
 */
export const RPG_HANABI_DARKEST_SKY_LUMINANCE = Math.min(
  ...ZONE_SKY_LUMINANCES
);
export const RPG_HANABI_BRIGHTEST_SKY_LUMINANCE = Math.max(
  ...ZONE_SKY_LUMINANCES
);

/**
 * How far from the darkest sky toward the brightest the glow is fully spent.
 * Every zone but the festival sits above this, so the walk is lit by hue and
 * only the festival by glow.
 */
const RPG_HANABI_GLOW_SPAN = 0.35;

export function resolveRpgHanabiAdditiveMix(skyLuminance: number) {
  if (!Number.isFinite(skyLuminance)) return 1;
  const span =
    (RPG_HANABI_BRIGHTEST_SKY_LUMINANCE - RPG_HANABI_DARKEST_SKY_LUMINANCE) *
    RPG_HANABI_GLOW_SPAN;
  if (span <= 0) return 1;
  const t = clamp(
    (skyLuminance - RPG_HANABI_DARKEST_SKY_LUMINANCE) / span,
    0,
    1
  );
  return 1 - t * t * (3 - 2 * t);
}

export interface RpgHanabiIntensityInput {
  /** 1 inside Hanabi, 0 anywhere else, lerped through the transition. */
  hanabiZoneWeight: number;
  particlesPerBurst: number;
  referenceParticlesPerBurst: number;
}

/**
 * Shell opacity for the current walk position and quality tier.
 *
 * This used to be `zoneWeights.hanabi * effectIntensity`, which multiplied two
 * gates that both bottom out away from Hanabi: the bursts were invisible from
 * every zone except the one you could already see them from. Distance now only
 * steps them back to `RPG_HANABI_DISTANT_INTENSITY`.
 */
export function resolveRpgHanabiIntensity({
  hanabiZoneWeight,
  particlesPerBurst,
  referenceParticlesPerBurst
}: RpgHanabiIntensityInput): number {
  const arrival = Number.isFinite(hanabiZoneWeight)
    ? clamp(hanabiZoneWeight, 0, 1)
    : 0;
  const reference =
    Number.isFinite(referenceParticlesPerBurst) && referenceParticlesPerBurst > 0
      ? referenceParticlesPerBurst
      : 1;
  const particles = Number.isFinite(particlesPerBurst)
    ? Math.max(0, particlesPerBurst)
    : 0;
  const density =
    RPG_HANABI_DENSITY_FLOOR +
    (1 - RPG_HANABI_DENSITY_FLOOR) * clamp(particles / reference, 0, 1);
  const reach =
    RPG_HANABI_DISTANT_INTENSITY +
    (1 - RPG_HANABI_DISTANT_INTENSITY) * arrival;
  return clamp(reach * density, 0, 1);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Normalises `value` inside `[start, end]` and clamps the result to 0..1. */
export function remapProgress(value: number, start: number, end: number) {
  if (!Number.isFinite(value) || end <= start) {
    return 0;
  }
  return clamp((value - start) / (end - start), 0, 1);
}

export function easeOutCubic(value: number) {
  const clamped = clamp(Number.isFinite(value) ? value : 0, 0, 1);
  return 1 - Math.pow(1 - clamped, 3);
}

/** Shell reach as a fraction of `burst.radius`: a fast ease-out pop. */
export function calculateRpgHanabiExpansion(progress: number) {
  return easeOutCubic(
    remapProgress(
      progress,
      RPG_HANABI_PHASES.explodeStart,
      RPG_HANABI_PHASES.explodeEnd
    )
  );
}

/** Gravity term. Squared in the shader so early fall stays gentle. */
export function calculateRpgHanabiDroop(progress: number) {
  return remapProgress(
    progress,
    RPG_HANABI_PHASES.fallStart,
    RPG_HANABI_PHASES.fallEnd
  );
}

/** Particle size opens quickly, then closes across the whole remaining life. */
export function calculateRpgHanabiSizeEnvelope(progress: number) {
  const open = remapProgress(
    progress,
    RPG_HANABI_PHASES.sizeOpenStart,
    RPG_HANABI_PHASES.sizeOpenEnd
  );
  const close =
    1 -
    remapProgress(
      progress,
      RPG_HANABI_PHASES.sizeCloseStart,
      RPG_HANABI_PHASES.sizeCloseEnd
    );
  return open * close;
}

/** How strongly per-particle flicker is applied at this point in the life. */
export function calculateRpgHanabiTwinkle(progress: number) {
  const open = remapProgress(
    progress,
    RPG_HANABI_PHASES.twinkleOpenStart,
    RPG_HANABI_PHASES.twinkleOpenEnd
  );
  const close =
    1 -
    remapProgress(
      progress,
      RPG_HANABI_PHASES.twinkleCloseStart,
      RPG_HANABI_PHASES.twinkleCloseEnd
    );
  return open * close;
}

export interface RpgHanabiShell {
  /** Unit shell directions, already thickened by the shell floor. */
  positions: Float32Array;
  /** Per-particle size multiplier. */
  sizes: Float32Array;
  /** Per-particle gravity scalar; low values stay high, high values streak. */
  falls: Float32Array;
  /** Per-particle flicker phase seed. */
  seeds: Float32Array;
}

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

/**
 * Samples a thick spherical shell so a burst reads as a volume of sparks
 * rather than a flat ring.
 */
export function createRpgHanabiShell(
  particleCount: number,
  seed: number
): RpgHanabiShell {
  const count = Math.max(1, Math.floor(particleCount));
  const random = seededRandom(seed);
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const falls = new Float32Array(count);
  const seeds = new Float32Array(count);

  // A chrysanthemum is read from its rays: each star trails a line of embers
  // back towards the centre. Scattering every particle at random through the
  // shell gave a cloud of dots instead, so the directions are laid out evenly
  // and each one carries a graded trail.
  const rayCount = Math.max(
    6,
    Math.round(Math.sqrt(count * RPG_HANABI_RAY_DENSITY))
  );
  const stepsPerRay = Math.max(1, Math.ceil(count / rayCount));
  // The golden angle spreads directions without the crowding that random
  // polar sampling leaves at the poles.
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let index = 0; index < count; index += 1) {
    const ray = index % rayCount;
    const step = Math.floor(index / rayCount);
    const height = rayCount > 1 ? 1 - (2 * ray) / (rayCount - 1) : 0;
    const ring = Math.sqrt(Math.max(0, 1 - height * height));
    const azimuth = goldenAngle * ray;
    // 0 at the star out on the shell, 1 at the innermost ember.
    const alongRay = stepsPerRay > 1 ? step / (stepsPerRay - 1) : 0;

    // Jittering the direction before it is scaled keeps the radius exact, so
    // the trail stays inside the shell however much the ray wanders.
    const wanderScale = 0.04 + alongRay * 0.05;
    let directionX = Math.cos(azimuth) * ring + (random() - 0.5) * wanderScale;
    let directionY = height + (random() - 0.5) * wanderScale;
    let directionZ = Math.sin(azimuth) * ring + (random() - 0.5) * wanderScale;
    const length =
      Math.hypot(directionX, directionY, directionZ) || 1;
    directionX /= length;
    directionY /= length;
    directionZ /= length;

    const radius =
      RPG_HANABI_SHELL_FLOOR +
      (1 - RPG_HANABI_SHELL_FLOOR) *
        (1 - alongRay) *
        (0.92 + random() * 0.08);
    positions[index * 3] = directionX * radius;
    positions[index * 3 + 1] = directionY * radius;
    positions[index * 3 + 2] = directionZ * radius;

    // A minority of oversized, dimmer sparks stands in for a separate glow
    // pass, so a burst still blooms inside a single draw call. They sit on the
    // stars at the ray tips rather than anywhere in the cloud.
    const tipBias = 1 - alongRay;
    sizes[index] =
      alongRay < 0.3 && random() < RPG_HANABI_GLOW_SHARE
        ? 1.9 + random() * 1.1
        : 0.34 + tipBias * 0.9 + random() * 0.24;

    // Embers left further behind are older and sag more.
    const fall = alongRay * 0.55 + random() * 0.45;
    falls[index] = fall * fall;
    seeds[index] = random();
  }

  return { positions, sizes, falls, seeds };
}

export function calculateRpgFireworkFrameInto(
  { elapsedSeconds, burst, intensity, reducedMotion }: RpgFireworkFrameInput,
  target: RpgFireworkFrame
): RpgFireworkFrame {
  const safeIntensity = Number.isFinite(intensity)
    ? clamp(intensity, 0, 1)
    : 0;
  if (safeIntensity <= 0) {
    target.visible = false;
    target.progress = 0;
    target.expansion = 0;
    target.droop = 0;
    target.sizeEnvelope = 0;
    target.twinkle = 0;
    target.opacity = 0;
    return target;
  }
  if (reducedMotion) {
    target.visible = true;
    target.progress = RPG_HANABI_PHASES.sizeOpenEnd;
    target.expansion = 1;
    target.droop = 0;
    target.sizeEnvelope = 0.85;
    target.twinkle = 0;
    target.opacity = safeIntensity * (burst.persistent ? 0.92 : 0.78);
    return target;
  }

  const safeElapsed = Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0;
  const safeCycle = Number.isFinite(burst.cycle)
    ? Math.max(0.1, burst.cycle)
    : 4;
  const local =
    (((safeElapsed - burst.delay) % safeCycle) + safeCycle) % safeCycle;
  const progress = local / safeCycle;
  const visible =
    Boolean(burst.persistent) || progress < RPG_HANABI_PHASES.hideAfter;
  if (!visible) {
    target.visible = false;
    target.progress = progress;
    target.expansion = 0;
    target.droop = 0;
    target.sizeEnvelope = 0;
    target.twinkle = 0;
    target.opacity = 0;
    return target;
  }

  const fade =
    1 -
    0.9 *
      remapProgress(
        progress,
        RPG_HANABI_PHASES.fadeStart,
        RPG_HANABI_PHASES.fadeEnd
      );
  target.visible = true;
  target.progress = progress;
  target.expansion = calculateRpgHanabiExpansion(progress);
  target.droop = calculateRpgHanabiDroop(progress);
  target.sizeEnvelope = calculateRpgHanabiSizeEnvelope(progress);
  target.twinkle = calculateRpgHanabiTwinkle(progress);
  target.opacity = clamp(safeIntensity * fade, 0, 1);
  return target;
}

export function calculateRpgFireworkFrame(
  input: RpgFireworkFrameInput
): RpgFireworkFrame {
  return calculateRpgFireworkFrameInto(input, {
    visible: false,
    progress: 0,
    expansion: 0,
    droop: 0,
    sizeEnvelope: 0,
    twinkle: 0,
    opacity: 0
  });
}
