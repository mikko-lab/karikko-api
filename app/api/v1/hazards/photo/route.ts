import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { isOriginAllowed } from '@/lib/origin';
import { getRatelimit, getClientIp } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — frontend compresses before upload
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function POST(req: NextRequest) {
  if (!isOriginAllowed(req)) {
    return NextResponse.json({ error: 'Forbidden origin', code: 'ORIGIN_NOT_ALLOWED' }, { status: 403 });
  }

  const ip = getClientIp(req);
  const rl = getRatelimit();
  if (rl) {
    const { success } = await rl.limit(`photo:${ip}`);
    if (!success) {
      return NextResponse.json({ error: 'Liian monta kuvalähetystä', code: 'RATE_LIMITED' }, { status: 429 });
    }
  }

  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Odotettiin multipart/form-data', code: 'INVALID_CONTENT_TYPE' }, { status: 400 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Virheellinen form-data', code: 'INVALID_BODY' }, { status: 400 });
  }

  const file = formData.get('photo');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Kenttä "photo" puuttuu', code: 'MISSING_PHOTO' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'Sallitut tyypit: JPEG, PNG, WebP', code: 'INVALID_TYPE' }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Kuva liian suuri (max 5 MB)', code: 'FILE_TOO_LARGE' }, { status: 400 });
  }

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const filename = `hazards/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const blob = await put(filename, file, {
    access: 'public',
    contentType: file.type,
  });

  console.log(JSON.stringify({ event: 'hazard_photo_uploaded', url: blob.url, size: file.size }));
  return NextResponse.json({ url: blob.url }, { status: 201 });
}
