export interface RpgRuntimeDiagnostics {
  canvasMounts: number;
  runtimeCreates: number;
  sceneMounts: number;
}

declare global {
  interface Window {
    __RPG_RUNTIME_DIAGNOSTICS__?: Readonly<RpgRuntimeDiagnostics>;
  }
}

const diagnostics: RpgRuntimeDiagnostics = {
  canvasMounts: 0,
  runtimeCreates: 0,
  sceneMounts: 0
};

export function markRpgRuntimeDiagnostic(
  key: keyof RpgRuntimeDiagnostics
) {
  diagnostics[key] += 1;
  if (typeof window !== "undefined") {
    window.__RPG_RUNTIME_DIAGNOSTICS__ = Object.freeze({ ...diagnostics });
  }
}

export function readRpgRuntimeDiagnostics() {
  return Object.freeze({ ...diagnostics });
}
