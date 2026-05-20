import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { idSchema } from '@/lib/schemas';
import { isOriginAllowed } from '@/lib/origin';

export const dynamic = 'force-dynamic';

function getDb() {
  return neon(process.env.DATABASE_URL!);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isOriginAllowed(req)) {
    return NextResponse.json(
      { error: 'Forbidden origin', code: 'ORIGIN_NOT_ALLOWED' },
      { status: 403 },
    );
  }

  const parsed = idSchema.safeParse({ id: (await params).id });
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid id', code: 'INVALID_PARAMS' },
      { status: 400 },
    );
  }

  const sql = getDb();
  const rows = await sql`
    UPDATE hazards
    SET confirmed_count = confirmed_count + 1,
        last_seen = NOW(),
        status = CASE WHEN confirmed_count + 1 >= 2 THEN 'verified' ELSE status END
    WHERE id = ${parsed.data.id}
    RETURNING id, confirmed_count, status
  `;

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  console.log(JSON.stringify({ event: 'hazard_confirmed', ...rows[0] }));
  return NextResponse.json(rows[0]);
}
