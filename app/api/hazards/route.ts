import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';

function getDb() {
  return neon(process.env.DATABASE_URL!);
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const lat = parseFloat(searchParams.get('lat') ?? '');
  const lon = parseFloat(searchParams.get('lon') ?? '');
  const radius = parseFloat(searchParams.get('radius') ?? '0.1');

  if (isNaN(lat) || isNaN(lon)) {
    return NextResponse.json({ error: 'lat ja lon vaaditaan' }, { status: 400 });
  }

  const sql = getDb();
  const rows = await sql`
    SELECT id, latitude, longitude, depth_cm, note, created_at
    FROM hazards
    WHERE latitude BETWEEN ${lat - radius} AND ${lat + radius}
      AND longitude BETWEEN ${lon - radius} AND ${lon + radius}
    ORDER BY created_at DESC
    LIMIT 200
  `;

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { latitude, longitude, depth_cm, note } = body;

  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return NextResponse.json({ error: 'latitude ja longitude vaaditaan' }, { status: 400 });
  }

  const sql = getDb();
  const [row] = await sql`
    INSERT INTO hazards (latitude, longitude, depth_cm, note, created_at)
    VALUES (${latitude}, ${longitude}, ${depth_cm ?? null}, ${note ?? null}, ${Date.now()})
    RETURNING id
  `;

  return NextResponse.json({ id: row.id }, { status: 201 });
}
