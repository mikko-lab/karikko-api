import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const WFS_BASE = 'https://julkinen.traficom.fi/inspirepalvelu/avoin/wfs';
const USER_AGENT = 'Karikko/1.0 (kontakti@example.fi)';
const LAYERS = ['navigational_warnings_p', 'navigational_warnings_l', 'navigational_warnings_a'] as const;

interface WfsFeature {
  id: string;
  geometry: {
    type: string;
    coordinates: unknown;
  } | null;
  properties: Record<string, unknown>;
}

interface WfsCollection {
  features: WfsFeature[];
}

function representativePoint(geometry: WfsFeature['geometry']): [number, number] | null {
  if (!geometry) return null;
  const coords = geometry.coordinates as number[] | number[][] | number[][][] | number[][][][];
  // drill down to first leaf [lon, lat]
  let c: unknown = coords;
  while (Array.isArray(c) && Array.isArray(c[0])) c = (c as unknown[][])[0];
  const pair = c as number[];
  if (typeof pair[0] === 'number' && typeof pair[1] === 'number') {
    return [pair[1], pair[0]]; // [lat, lon]
  }
  return null;
}

function mapFeature(f: WfsFeature, layer: string) {
  const p = f.properties;
  const point = representativePoint(f.geometry);
  return {
    id: String(p['ID'] ?? f.id),
    warning_number: p['MESSAGESERIESIDENTIFIERWARNINGNUMBER'] ?? null,
    year: p['MESSAGESERIESIDENTIFIERYEAR'] ?? null,
    warning_type: p['MESSAGESERIESIDENTIFIERWARNINGTYPE'] ?? null,
    category_fi: p['NAVWARNTYPEGENERAL_FI'] ?? null,
    category_en: p['NAVWARNTYPEGENERAL_EN'] ?? null,
    detail_fi: p['WARNINGINFORMATIONNAVWARNTYPEDETAILS_FI'] ?? null,
    detail_en: p['WARNINGINFORMATIONNAVWARNTYPEDETAILS_EN'] ?? null,
    text_fi: p['WARNINGINFORMATION_FI'] ?? null,
    text_en: p['WARNINGINFORMATION_EN'] ?? null,
    area_fi: p['GENERALAREALOCATIONNAME_FI'] ?? null,
    area_en: p['GENERALAREALOCATIONNAME_EN'] ?? null,
    locality_fi: p['LOCALITYLOCATIONNAME_FI'] ?? null,
    locality_en: p['LOCALITYLOCATIONNAME_EN'] ?? null,
    published_at: p['PUBLICATIONTIME'] ?? null,
    geometry_type: layer.replace('navigational_warnings_', ''),
    lat: point ? point[0] : null,
    lon: point ? point[1] : null,
  };
}

export async function GET() {
  const results = await Promise.all(
    LAYERS.map(layer =>
      fetch(
        `${WFS_BASE}?service=WFS&version=2.0.0&request=GetFeature&typeName=avoin:${layer}&outputFormat=application/json`,
        {
          headers: { 'User-Agent': USER_AGENT },
          next: { revalidate: 3600 },
        },
      )
        .then(r => (r.ok ? (r.json() as Promise<WfsCollection>) : null))
        .catch(() => null),
    ),
  );

  const notices = results
    .flatMap((col, i) =>
      col ? col.features.map(f => mapFeature(f, LAYERS[i])) : [],
    )
    .sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)));

  console.log(JSON.stringify({ event: 'notices_get', count: notices.length }));

  return NextResponse.json(
    {
      data: { notices },
      meta: {
        attribution: '(c) Traficom, CC BY 4.0',
        license: 'CC BY 4.0',
        cached_at: new Date().toISOString(),
      },
    },
    { headers: { 'Cache-Control': 'public, max-age=3500, s-maxage=3600' } },
  );
}
