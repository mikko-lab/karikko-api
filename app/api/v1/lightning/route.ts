import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { latLonSchema } from '@/lib/schemas';
import { metersToDegreesLat, metersToDegreesLon } from '@/lib/geo';

export const dynamic = 'force-dynamic';

const FMI_BASE = 'https://opendata.fmi.fi/wfs';
const USER_AGENT = 'Karikko/1.0 (kontakti@example.fi)';

const querySchema = latLonSchema.extend({
  radius_m: z.coerce.number().min(1_000).max(200_000).default(50_000),
  minutes: z.coerce.number().int().min(10).max(180).default(60),
});

interface Strike {
  lat: number;
  lon: number;
  time: string;
  peak_current_ka: number | null;
  cloud_flash: boolean;
  multiplicity: number;
  accuracy_km: number | null;
}

function parseSimpleXml(xml: string): Strike[] {
  const memberRe = /<wfs:member>([\s\S]*?)<\/wfs:member>/g;
  const posRe = /<gml:pos>([\s\S]*?)<\/gml:pos>/;
  const timeRe = /<BsWfs:Time>([\s\S]*?)<\/BsWfs:Time>/;
  const nameRe = /<BsWfs:ParameterName>([\s\S]*?)<\/BsWfs:ParameterName>/;
  const valRe = /<BsWfs:ParameterValue>([\s\S]*?)<\/BsWfs:ParameterValue>/;

  const map = new Map<string, Strike>();

  let m: RegExpExecArray | null;
  while ((m = memberRe.exec(xml)) !== null) {
    const block = m[1];
    const posM = posRe.exec(block);
    const timeM = timeRe.exec(block);
    const nameM = nameRe.exec(block);
    const valM = valRe.exec(block);
    if (!posM || !timeM || !nameM || !valM) continue;

    const [latStr, lonStr] = posM[1].trim().split(/\s+/);
    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);
    const time = timeM[1].trim();
    const key = `${lat}|${lon}|${time}`;
    const name = nameM[1].trim();
    const val = valM[1].trim();

    if (!map.has(key)) {
      map.set(key, { lat, lon, time, peak_current_ka: null, cloud_flash: false, multiplicity: 1, accuracy_km: null });
    }
    const strike = map.get(key)!;

    switch (name) {
      case 'peak_current': strike.peak_current_ka = parseFloat(val) || null; break;
      case 'cloud_indicator': strike.cloud_flash = val === '1'; break;
      case 'multiplicity': strike.multiplicity = parseInt(val, 10) || 1; break;
      case 'ellipse_major': strike.accuracy_km = parseFloat(val) || null; break;
    }
  }

  return Array.from(map.values());
}

export async function GET(req: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message, code: 'INVALID_PARAMS' },
      { status: 400 },
    );
  }

  const { lat, lon, radius_m, minutes } = parsed.data;
  const dLat = metersToDegreesLat(radius_m);
  const dLon = metersToDegreesLon(radius_m, lat);

  const now = new Date();
  const start = new Date(now.getTime() - minutes * 60 * 1000);

  const bbox = `${(lon - dLon).toFixed(4)},${(lat - dLat).toFixed(4)},${(lon + dLon).toFixed(4)},${(lat + dLat).toFixed(4)}`;
  const url =
    `${FMI_BASE}?service=WFS&version=2.0.0&request=GetFeature` +
    `&storedquery_id=fmi::observations::lightning::simple` +
    `&bbox=${bbox}` +
    `&starttime=${start.toISOString().slice(0, 19)}Z` +
    `&endtime=${now.toISOString().slice(0, 19)}Z`;

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    return NextResponse.json({ error: 'FMI unavailable', code: 'UPSTREAM_ERROR' }, { status: 502 });
  }

  const xml = await res.text();

  if (xml.includes('ExceptionText')) {
    const m = xml.match(/<ExceptionText>([\s\S]*?)<\/ExceptionText>/);
    const msg = m ? m[1].trim() : 'FMI error';
    console.log(JSON.stringify({ event: 'fmi_lightning_error', msg }));
    return NextResponse.json({ error: msg, code: 'UPSTREAM_ERROR' }, { status: 502 });
  }

  const strikes = parseSimpleXml(xml)
    .sort((a, b) => b.time.localeCompare(a.time));

  console.log(JSON.stringify({ event: 'lightning_get', lat, lon, radius_m, minutes, count: strikes.length }));

  return NextResponse.json(
    {
      data: {
        strikes,
        query: { lat, lon, radius_m, minutes },
      },
      meta: {
        attribution: 'FMI (c) 2024, CC BY 4.0',
        license: 'CC BY 4.0',
        cached_at: now.toISOString(),
      },
    },
    { headers: { 'Cache-Control': 'public, max-age=55, s-maxage=60' } },
  );
}
