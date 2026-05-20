import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'edge';

const TRAFICOM_BASE = 'https://julkinen.traficom.fi/rasteripalvelu/wmts/rest';
const USER_AGENT = 'Karikko/1.0 (kontakti@example.fi)';

const ALLOWED_LAYERS: Record<string, string> = {
  'A': 'Traficom:Merikarttasarja A public',
  'C': 'Traficom:Merikarttasarja C public',
  'F': 'Traficom:Merikarttasarja F public',
  'G': 'Traficom:Merikarttasarja G public',
};

const querySchema = z.object({
  z: z.coerce.number().int().min(0).max(18),
  x: z.coerce.number().int().min(0),
  y: z.coerce.number().int().min(0),
  layer: z.enum(['A', 'C', 'F', 'G']).default('A'),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message, code: 'INVALID_PARAMS' },
      { status: 400 },
    );
  }

  const { z: zoom, x, y, layer } = parsed.data;
  const layerName = encodeURIComponent(ALLOWED_LAYERS[layer]);
  const tileMatrix = `WGS84_Pseudo-Mercator:${zoom}`;
  const url = `${TRAFICOM_BASE}/${layerName}/default/WGS84_Pseudo-Mercator/${tileMatrix}/${y}/${x}?format=image/png`;

  const upstream = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  });

  if (!upstream.ok) {
    return new NextResponse(null, { status: upstream.status });
  }

  const body = await upstream.arrayBuffer();

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000',
      'X-Attribution': '(c) Traficom, CC BY 4.0',
    },
  });
}
