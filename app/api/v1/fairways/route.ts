import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { latLonSchema } from '@/lib/schemas';
import { metersToDegreesLat, metersToDegreesLon } from '@/lib/geo';

export const dynamic = 'force-dynamic';

const USER_AGENT = 'Karikko/1.0 (kontakti@example.fi)';
const VAYLA_BASE = 'https://avoinapi.vaylapilvi.fi/vaylatiedot/ogc/features/v1/collections';

const querySchema = latLonSchema.extend({
  radius_m: z.coerce.number().min(1).max(50_000).default(5_000),
});

export async function GET(req: NextRequest) {
  const parsed = querySchema.safeParse(
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
  const bbox = `${lon - dLon},${lat - dLat},${lon + dLon},${lat + dLat}`;

  const headers = { 'User-Agent': USER_AGENT };

  const [areasRes, linesRes, marksRes] = await Promise.all([
    fetch(`${VAYLA_BASE}/vesivaylatiedot:vaylaalueet_uusi/items?bbox=${bbox}&limit=100&f=json`, { next: { revalidate: 86400 }, headers }),
    fetch(`${VAYLA_BASE}/vesivaylatiedot:navigointilinjat_uusi/items?bbox=${bbox}&limit=100&f=json`, { next: { revalidate: 86400 }, headers }),
    fetch(`${VAYLA_BASE}/vesivaylatiedot:turvalaitteet_uusi/items?bbox=${bbox}&limit=100&f=json`, { next: { revalidate: 86400 }, headers }),
  ]);

  const [areasData, linesData, marksData] = await Promise.all([
    areasRes.ok ? areasRes.json() : { features: [] },
    linesRes.ok ? linesRes.json() : { features: [] },
    marksRes.ok ? marksRes.json() : { features: [] },
  ]);

  const fairways = (areasData.features ?? []).map((f: { id: string; properties: Record<string, unknown>; geometry: unknown }) => ({
    id: f.id,
    name: f.properties?.vaylat ?? null,
    type: f.properties?.tyyppi ?? null,
    designDepthM: f.properties?.mitoitussyvays ?? null,
    dredgedDepthM: f.properties?.haraussyvyys ?? null,
    datum: f.properties?.vertaustaso ?? null,
    owner: typeof f.properties?.omistaja === 'string' ? f.properties.omistaja.trim() : null,
    geometry: f.geometry,
  }));

  const lines = (linesData.features ?? []).map((f: { id: string; properties: Record<string, unknown>; geometry: unknown }) => ({
    id: f.id,
    name: f.properties?.vaylan_nimi ?? null,
    designDepthM: f.properties?.mitoitussyvays ?? null,
    dredgedDepthM: f.properties?.haraussyvyys ?? null,
    geometry: f.geometry,
  }));

  const marks = (marksData.features ?? []).map((f: { id: string; properties: Record<string, unknown>; geometry: unknown }) => ({
    id: f.id,
    name: f.properties?.nimifi ?? f.properties?.nimisv ?? null,
    type: f.properties?.turvalaitetyyppifi ?? null,
    fairway: f.properties?.vaylan_nimi ?? null,
    illuminated: f.properties?.valaistu ?? null,
    geometry: f.geometry,
  }));

  return NextResponse.json({
    data: { fairways, lines, marks },
    meta: { attribution: 'Väylävirasto, CC BY 4.0', cached_at: new Date().toISOString() },
  });
}
