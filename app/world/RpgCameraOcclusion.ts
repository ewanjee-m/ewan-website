const OCCLUSION_WAIT_SECONDS = 0.25;
const OCCLUSION_FADE_SECONDS = 0.1;
const OCCLUSION_RESTORE_SECONDS = 0.2;
const OCCLUDED_OPACITY = 0.15;

export interface RpgCameraOcclusionState {
  objectUuid: string;
  blockedSeconds: number;
  fading: boolean;
  opacity: number;
}

export function createRpgCameraOcclusionState(
  objectUuid = ""
): RpgCameraOcclusionState {
  return {
    objectUuid,
    blockedSeconds: 0,
    fading: false,
    opacity: 1
  };
}

function resetForObject(
  state: RpgCameraOcclusionState,
  objectUuid: string
) {
  state.objectUuid = objectUuid;
  state.blockedSeconds = 0;
  state.fading = false;
  state.opacity = 1;
}

export function advanceRpgCameraOcclusion(
  state: RpgCameraOcclusionState,
  blocked: boolean,
  deltaSeconds: number,
  objectUuid = state.objectUuid
) {
  if (objectUuid !== state.objectUuid) {
    resetForObject(state, objectUuid);
  }

  const delta =
    Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 0;
  if (!blocked) {
    state.blockedSeconds = 0;
    state.fading = false;
    state.opacity = Math.min(
      1,
      state.opacity + (delta / OCCLUSION_RESTORE_SECONDS) * (1 - OCCLUDED_OPACITY)
    );
    return state;
  }

  const previousBlockedSeconds = state.blockedSeconds;
  state.blockedSeconds += delta;
  if (state.blockedSeconds < OCCLUSION_WAIT_SECONDS) {
    return state;
  }

  state.fading = true;
  const fadeDelta =
    Math.max(0, state.blockedSeconds - OCCLUSION_WAIT_SECONDS) -
    Math.max(0, previousBlockedSeconds - OCCLUSION_WAIT_SECONDS);
  state.opacity = Math.max(
    OCCLUDED_OPACITY,
    state.opacity -
      (fadeDelta / OCCLUSION_FADE_SECONDS) * (1 - OCCLUDED_OPACITY)
  );
  return state;
}
