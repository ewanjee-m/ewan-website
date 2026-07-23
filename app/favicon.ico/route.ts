const FESTIVAL_FAVICON = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Hanabi festival torii">
  <rect width="64" height="64" rx="14" fill="#17102f"/>
  <g fill="none" stroke="#ffd36a" stroke-linecap="round" stroke-width="3">
    <path d="M44 8v6M44 30v6M30 22h6M52 22h6M34 12l4 4M50 28l4 4M54 12l-4 4M38 28l-4 4"/>
  </g>
  <circle cx="44" cy="22" r="4" fill="#ff8eb5"/>
  <g fill="#ff5d72">
    <path d="M9 35h34l-3 6H12z"/>
    <path d="M14 29h24l3 5H11z"/>
    <path d="M17 40h6v18h-6zM32 40h6v18h-6z"/>
  </g>
  <path d="M13 58h30" fill="none" stroke="#fff1dc" stroke-linecap="round" stroke-width="3"/>
</svg>
`.trim();

export function GET() {
  return new Response(FESTIVAL_FAVICON, {
    headers: {
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "Content-Type": "image/svg+xml; charset=utf-8"
    }
  });
}
