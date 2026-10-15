/** Empty means same-origin (Render); Pages can point at the free room server. */
export function apiUrl(path: string): string {
  const base = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';
  return `${base}${path}`;
}
