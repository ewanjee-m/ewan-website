import {
  createWorldRuntime,
  type WorldRuntime
} from "./WorldRuntime";

export interface WorldBootstrapDependencies {
  readonly createRuntime?: () => WorldRuntime;
}

export function createWorldBootstrap({
  createRuntime: createRuntimeDependency = createWorldRuntime
}: WorldBootstrapDependencies = {}) {
  return Object.freeze({
    runtime: createRuntimeDependency()
  });
}
