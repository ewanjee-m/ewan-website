export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self' blob: https://api.open-meteo.com",
  "worker-src 'self' blob:"
].join("; ");

const SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ["content-security-policy", CONTENT_SECURITY_POLICY],
  ["permissions-policy", "camera=(), microphone=(), geolocation=()"],
  ["referrer-policy", "strict-origin-when-cross-origin"],
  ["x-content-type-options", "nosniff"],
  ["x-frame-options", "DENY"]
];

export function withSecurityHeaders(response: Response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of SECURITY_HEADERS) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
