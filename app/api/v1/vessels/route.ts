import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { latLonSchema } from '@/lib/schemas';
import { metersToDegreesLat, metersToDegreesLon, haversineKm } from '@/lib/geo';

export const dynamic = 'force-dynamic';

const AIS_BASE = 'https://meri.digitraffic.fi/api/ais/v1';
const USER_AGENT = 'Karikko/1.0 (kontakti@example.fi)';

const querySchema = latLonSchema.extend({
  radius_m: z.coerce.number().min(500).max(50_000).default(10_000),
});

interface AisFeature {
  mmsi: number;
  geometry: { coordinates: [number, number] };
  properties: {
    mmsi: number;
    sog: number;
    cog: number;
    heading: number;
    navStat: number;
    timestampExternal: number;
  };
}

interface VesselMeta {
  name?: string;
  shipType?: number;
  draught?: number;
  destination?: string;
}

const SHIP_TYPE: Record<number, string> = {
  20: 'Siipipotkurivene', 21: 'Maihinnousualus', 22: 'Hinaaja', 23: 'Ruoppaaja',
  24: 'Sukellusalus', 25: 'Pelastusalus', 26: 'Tutkimusalus', 27: 'Hinaaja',
  30: 'Kalastusalus', 31: 'Hinausvene', 32: 'Hinausvene', 33: 'Ruoppaaja',
  34: 'Sukellustukialus', 35: 'Sotilasalus', 36: 'Purjevene', 37: 'Huvivene',
  40: 'Suurnopeusalus', 41: 'Suurnopeusalus', 42: 'Suurnopeusalus',
  50: 'Luotsialus', 51: 'Etsinta/Pelastus', 52: 'Hinaaja', 53: 'Satamavene',
  54: 'Ympäristönsuojelu', 55: 'Viranomaisalus', 58: 'Sairaala-alus', 59: 'Vene',
  60: 'Matkustaja-alus', 61: 'Matkustaja-alus', 62: 'Matkustaja-alus',
  63: 'Matkustaja-alus', 64: 'Matkustaja-alus', 69: 'Matkustaja-alus',
  70: 'Rahtialus', 71: 'Rahtialus', 72: 'Rahtialus', 73: 'Rahtialus',
  74: 'Rahtialus', 79: 'Rahtialus',
  80: 'Säiliöalus', 81: 'Säiliöalus', 82: 'Säiliöalus', 83: 'Säiliöalus',
  84: 'Säiliöalus', 89: 'Säiliöalus',
  90: 'Muu', 91: 'Muu', 99: 'Muu',
};

function shipTypeLabel(t?: number): string {
  if (!t) return 'Alus';
  return SHIP_TYPE[t] ?? 'Alus';
}

async function fetchMeta(mmsi: number): Promise<VesselMeta> {
  try {
    const res = await fetch(`${AIS_BASE}/vessels/${mmsi}`, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Encoding': 'gzip' },
      next: { revalidate: 300 },
    });
    if (!res.ok) return {};
    return await res.json() as VesselMeta;
  } catch {
    return {};
  }
}

export async function GET(req: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message, code: 'INVALID_PARAMS' },
      { status: 400 },
    );
  }

  const { lat, lon, radius_m } = parsed.data;

  const locRes = await fetch(`${AIS_BASE}/locations`, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Encoding': 'gzip' },
    next: { revalidate: 30 },
  });

  if (!locRes.ok) {
    return NextResponse.json({ error: 'AIS unavailable', code: 'UPSTREAM_ERROR' }, { status: 502 });
  }

  const locData = await locRes.json() as { features: AisFeature[]; dataUpdatedTime: string };

  const dLat = metersToDegreesLat(radius_m);
  const dLon = metersToDegreesLon(radius_m, lat);

  const nearby = locData.features
    .filter(f => {
      const [vLon, vLat] = f.geometry.coordinates;
      return vLat >= lat - dLat && vLat <= lat + dLat &&
             vLon >= lon - dLon && vLon <= lon + dLon;
    })
    .map(f => ({
      feature: f,
      distKm: haversineKm(lat, lon, f.geometry.coordinates[1], f.geometry.coordinates[0]),
    }))
    .filter(({ distKm }) => distKm <= radius_m / 1000)
    .sort((a, b) => a.distKm - b.distKm)
    .slice(0, 20);

  const metas = await Promise.all(nearby.map(({ feature }) => fetchMeta(feature.mmsi)));

  const vessels = nearby.map(({ feature, distKm }, i) => {
    const meta = metas[i];
    const [vLon, vLat] = feature.geometry.coordinates;
    const p = feature.properties;
    return {
      mmsi: feature.mmsi,
      name: meta.name ?? null,
      ship_type: shipTypeLabel(meta.shipType),
      lat: vLat,
      lon: vLon,
      sog_kn: p.sog,
      cog_deg: p.cog,
      heading_deg: p.heading === 511 ? null : p.heading,
      nav_status: p.navStat,
      draught_m: meta.draught ? meta.draught / 10 : null,
      destination: meta.destination ?? null,
      dist_km: Math.round(distKm * 10) / 10,
      updated_at: new Date(p.timestampExternal).toISOString(),
    };
  });

  console.log(JSON.stringify({ event: 'vessels_get', lat, lon, radius_m, count: vessels.length }));

  return NextResponse.json(
    {
      data: { vessels, data_updated_at: locData.dataUpdatedTime },
      meta: {
        attribution: 'Digitraffic (c) Fintraffic, CC BY 4.0',
        license: 'CC BY 4.0',
        cached_at: new Date().toISOString(),
      },
    },
    { headers: { 'Cache-Control': 'public, max-age=20, s-maxage=30' } },
  );
}
