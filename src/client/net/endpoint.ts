/** Empty uses the same Cloudflare Worker for the page and room API. */
export function apiUrl(path: string): string {
  const base = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';
  return `${base}${path}`;
}
