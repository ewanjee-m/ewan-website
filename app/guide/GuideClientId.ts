export const GUIDE_CLIENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isGuideClientId(value: unknown): value is string {
  return typeof value === "string" && GUIDE_CLIENT_ID_PATTERN.test(value);
}
