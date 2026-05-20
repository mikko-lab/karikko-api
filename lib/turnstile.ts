const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export function isTurnstileEnabled(): boolean {
  return !!process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
}

export function isMobileRequest(req: Request): boolean {
  return req.headers.get('X-App-Platform') === 'karikko-mobile';
}

export async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
  if (!secret) return true;

  const res = await fetch(VERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret, response: token, remoteip: ip }),
  });

  if (!res.ok) return false;
  const data = await res.json() as { success: boolean };
  return data.success === true;
}
