export function supportsWebGl(
  getContext: (name: "webgl2" | "webgl") => unknown = (name) =>
    document.createElement("canvas").getContext(name)
) {
  try {
    return Boolean(getContext("webgl2") || getContext("webgl"));
  } catch {
    return false;
  }
}
