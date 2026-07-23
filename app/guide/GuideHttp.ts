const MAX_PATH_DECODE_PASSES = 8;

function decodePathSegment(segment: string): string | null {
  let decoded = segment;
  for (let pass = 0; pass < MAX_PATH_DECODE_PASSES; pass += 1) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return null;
    }
    if (next.includes("/") || next.includes("\\")) {
      return null;
    }
    if (next === decoded) {
      return next;
    }
    decoded = next;
  }
  return null;
}

export function isGuideApiPath(pathname: string) {
  const segments: string[] = [];
  for (const rawSegment of pathname.split("/")) {
    if (!rawSegment) {
      continue;
    }
    const segment = decodePathSegment(rawSegment);
    if (segment === null) {
      return false;
    }
    if (segment === ".") {
      continue;
    }
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.length === 2 && segments[0] === "api" && segments[1] === "guide";
}

export function isJsonMediaType(value: string | null) {
  if (!value) {
    return false;
  }
  return value.split(";", 1)[0].trim().toLowerCase() === "application/json";
}
