import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { z } from 'zod';
import { latLonSchema, hazardPostSchema } from '@/lib/schemas';
import { metersToDegreesLat, metersToDegreesLon } from '@/lib/geo';
import { getRatelimit, getClientIp } from '@/lib/ratelimit';
import { isOriginAllowed } from '@/lib/origin';

export const dynamic = 'force-dynamic';


const getQuerySchema = latLonSchema.extend({
  radius_m: z.coerce.number().min(1).max(50_000).default(5_000),
});

function getDb() {
  return neon(process.env.DATABASE_URL!);
}

export async function GET(req: NextRequest) {
  const parsed = getQuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message, code: 'INVALID_PARAMS' },
      { status: 400 },
    );
  }

  const { lat, lon, radius_m } = parsed.data;
  const dLat = metersToDegreesLat(radius_m);
  const dLon = metersToDegreesLon(radius_m, lat);

  const sql = getDb();
  const rows = await sql`
    SELECT id, latitude, longitude, depth_cm, note, reported_at, confirmed_count, status
    FROM hazards
    WHERE latitude  BETWEEN ${lat - dLat} AND ${lat + dLat}
      AND longitude BETWEEN ${lon - dLon} AND ${lon + dLon}
    ORDER BY reported_at DESC
    LIMIT 200
  `;

  console.log(JSON.stringify({ event: 'hazards_get', lat, lon, radius_m, count: rows.length }));
  return NextResponse.json(rows, {
    headers: { 'X-Attribution': 'Karikko - kayttajien merkitsemat matalikot' },
  });
}

export async function POST(req: NextRequest) {
  if (!isOriginAllowed(req)) {
    return NextResponse.json(
      { error: 'Forbidden origin', code: 'ORIGIN_NOT_ALLOWED' },
      { status: 403 },
    );
  }

  const ip = getClientIp(req);
  const rl = getRatelimit();
  if (rl) {
    const { success, remaining } = await rl.limit(ip);
    if (!success) {
      console.log(JSON.stringify({ event: 'rate_limited', ip }));
      return NextResponse.json(
        { error: 'Liian monta merkintää — yritä tunnin päästä', code: 'RATE_LIMITED' },
        { status: 429, headers: { 'Retry-After': '3600', 'X-RateLimit-Remaining': String(remaining) } },
      );
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON', code: 'INVALID_BODY' }, { status: 400 });
  }

  const parsed = hazardPostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message, code: 'INVALID_PARAMS' },
      { status: 400 },
    );
  }

  const { latitude, longitude, depth_cm, note } = parsed.data;
  const sql = getDb();
  const [row] = await sql`
    INSERT INTO hazards (latitude, longitude, depth_cm, note, created_at)
    VALUES (${latitude}, ${longitude}, ${depth_cm ?? null}, ${note ?? null}, ${Date.now()})
    RETURNING id
  `;

  console.log(JSON.stringify({ event: 'hazard_created', id: row.id, lat: latitude, lon: longitude }));
  return NextResponse.json({ id: row.id }, { status: 201 });
}
