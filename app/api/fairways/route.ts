import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const VAYLA_BASE = 'https://avoinapi.vaylapilvi.fi/vaylatiedot/ogc/features/v1/collections';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const lat = parseFloat(searchParams.get('lat') ?? '');
  const lon = parseFloat(searchParams.get('lon') ?? '');
  const radiusDeg = parseFloat(searchParams.get('radius') ?? '0.05');

  if (isNaN(lat) || isNaN(lon)) {
    return NextResponse.json({ error: 'lat ja lon vaaditaan' }, { status: 400 });
  }

  const bbox = `${lon - radiusDeg},${lat - radiusDeg},${lon + radiusDeg},${lat + radiusDeg}`;

  const [areasRes, marksRes] = await Promise.all([
    fetch(
      `${VAYLA_BASE}/vesivaylatiedot:vaylaalueet_uusi/items?bbox=${bbox}&limit=50&f=json`,
      { next: { revalidate: 86400 } }
    ),
    fetch(
      `${VAYLA_BASE}/vesivaylatiedot:turvalaitteet_uusi/items?bbox=${bbox}&limit=50&f=json`,
      { next: { revalidate: 86400 } }
    ),
  ]);

  const [areasData, marksData] = await Promise.all([
    areasRes.ok ? areasRes.json() : { features: [] },
    marksRes.ok ? marksRes.json() : { features: [] },
  ]);

  const fairways = (areasData.features ?? []).map((f: any) => ({
    id: f.id,
    name: f.properties?.vaylat ?? null,
    type: f.properties?.tyyppi ?? null,
    designDepthM: f.properties?.mitoitussyvays ?? null,
    dredgedDepthM: f.properties?.haraussyvyys ?? null,
    datum: f.properties?.vertaustaso ?? null,
    owner: f.properties?.omistaja?.trim() ?? null,
    geometry: f.geometry,
  }));

  const marks = (marksData.features ?? []).map((f: any) => ({
    id: f.id,
    name: f.properties?.nimifi ?? f.properties?.nimisv ?? null,
    type: f.properties?.turvalaitetyyppifi ?? null,
    fairway: f.properties?.vaylan_nimi ?? null,
    illuminated: f.properties?.valaistu ?? null,
    geometry: f.geometry,
  }));

  return NextResponse.json({ fairways, marks });
}
