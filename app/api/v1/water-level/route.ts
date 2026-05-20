import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { latLonSchema } from '@/lib/schemas';
import { haversineKm } from '@/lib/geo';

export const dynamic = 'force-dynamic';

const USER_AGENT = 'Karikko/1.0 (kontakti@example.fi)';
const SYKE_BASE = 'https://rajapinnat.ymparisto.fi/api/Hydrologiarajapinta/1.2/odata';

interface SykeStation {
  Paikka_Id: number;
  Nimi: string;
  KoordLat: string;
  KoordLong: string;
}

function ddmmssToDecimal(ddmmss: string): number {
  const s = ddmmss.padStart(6, '0');
  return (
    parseInt(s.slice(0, 2), 10) +
    parseInt(s.slice(2, 4), 10) / 60 +
    parseInt(s.slice(4, 6), 10) / 3600
  );
}

const querySchema = latLonSchema;

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

  const { lat, lon } = parsed.data;

  const stationsRes = await fetch(
    `${SYKE_BASE}/Paikka?$filter=Suure_Id%20eq%201&$select=Paikka_Id,Nimi,KoordLat,KoordLong&$top=1000`,
    { next: { revalidate: 3600 }, headers: { 'User-Agent': USER_AGENT } },
  );

  if (!stationsRes.ok) {
    console.log(JSON.stringify({ event: 'syke_error', status: stationsRes.status }));
    return NextResponse.json(
      { error: 'SYKE-asemien haku epäonnistui', code: 'UPSTREAM_ERROR' },
      { status: 502 },
    );
  }

  const stationsData = await stationsRes.json();
  const stations: SykeStation[] = stationsData.value ?? [];

  const candidates = stations
    .filter((s) => s.KoordLat && s.KoordLong)
    .map((s) => ({
      ...s,
      lat: ddmmssToDecimal(s.KoordLat),
      lon: ddmmssToDecimal(s.KoordLong),
    }))
    .map((s) => ({ ...s, distKm: haversineKm(lat, lon, s.lat, s.lon) }))
    .sort((a, b) => a.distKm - b.distKm)
    .slice(0, 10);

  if (candidates.length === 0) {
    return NextResponse.json({ data: { stations: [] }, meta: { attribution: 'SYKE CC BY 4.0', cached_at: new Date().toISOString() } });
  }

  const maxAgeMs = 72 * 60 * 60 * 1000;
  const now = Date.now();

  const readings = await Promise.all(
    candidates.map(async (station) => {
      const res = await fetch(
        `${SYKE_BASE}/Vedenkorkeus?$filter=Paikka_Id%20eq%20${station.Paikka_Id}&$orderby=Aika%20desc&$top=1`,
        { next: { revalidate: 600 }, headers: { 'User-Agent': USER_AGENT } },
      );
      if (!res.ok) return null;
      const data = await res.json();
      const reading = data.value?.[0];
      if (!reading) return null;
      const levelCm: number = reading.Arvo;
      const measuredAt: string = reading.Aika;
      if (now - new Date(measuredAt).getTime() > maxAgeMs) return null;
      if (levelCm < 0 || levelCm > 2000) return null;
      return {
        stationId: station.Paikka_Id,
        name: station.Nimi.trim(),
        latitude: station.lat,
        longitude: station.lon,
        distKm: Math.round(station.distKm * 10) / 10,
        levelCm,
        measuredAt,
        qualityFlag: reading.Lippu_id,
      };
    }),
  );

  const valid = readings.filter(Boolean).slice(0, 3);
  return NextResponse.json({
    data: { stations: valid },
    meta: { attribution: 'SYKE Hydrologiarajapinta, CC BY 4.0', cached_at: new Date().toISOString() },
  });
}
