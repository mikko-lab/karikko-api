const ALLOWED = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export function isOriginAllowed(req: Request): boolean {
  if (ALLOWED.length === 0) return true; // ei rajoitusta jos env puuttuu
  const origin = req.headers.get('origin') ?? req.headers.get('referer') ?? '';
  return ALLOWED.some((allowed) => origin.startsWith(allowed));
}
