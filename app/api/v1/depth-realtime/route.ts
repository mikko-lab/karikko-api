import { NextRequest, NextResponse } from 'next/server';
import { latLonSchema } from '@/lib/schemas';
import { haversineKm } from '@/lib/geo';
import referenceLevels from '@/lib/reference-levels.json';

export const dynamic = 'force-dynamic';

const USER_AGENT = 'Karikko/1.0 (mikko@wpsaavutettavuus.fi)';
const SYKE_BASE =
  'https://rajapinnat.ymparisto.fi/api/Hydrologiarajapinta/1.2/odata';
const MAX_AGE_MS = 72 * 60 * 60 * 1000;
const MAX_DIST_KM = 150;

const CORS = { 'Access-Control-Allow-Origin': '*' };
const SUCCESS_HEADERS = {
  ...CORS,
  'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=60',
};
const ERROR_HEADERS = { ...CORS, 'Cache-Control': 'no-store' };

function isoWeek(date: Date): number {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function classify(
  current: number,
  p10: number,
  p50: number,
  p90: number,
): 'below_p10' | 'p10_to_p50' | 'p50_to_p90' | 'above_p90' {
  if (current < p10) return 'below_p10';
  if (current < p50) return 'p10_to_p50';
  if (current < p90) return 'p50_to_p90';
  return 'above_p90';
}

export async function GET(req: NextRequest) {
  const parsed = latLonSchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message, code: 'INVALID_PARAMS' },
      { status: 400, headers: ERROR_HEADERS },
    );
  }

  const { lat, lon } = parsed.data;

  const nearest = referenceLevels.stations
    .map((s) => ({ ...s, distKm: haversineKm(lat, lon, s.latitude, s.longitude) }))
    .sort((a, b) => a.distKm - b.distKm)[0];

  if (!nearest || nearest.distKm > MAX_DIST_KM) {
    return NextResponse.json(
      { error: 'Ei viiteasemaa 150 km säteellä', code: 'NO_REFERENCE' },
      { status: 404, headers: ERROR_HEADERS },
    );
  }

  const res = await fetch(
    `${SYKE_BASE}/Vedenkorkeus?$filter=Paikka_Id%20eq%20${nearest.stationId}&$orderby=Aika%20desc&$top=1`,
    { next: { revalidate: 600 }, headers: { 'User-Agent': USER_AGENT } },
  );

  if (!res.ok) {
    return NextResponse.json(
      { error: 'SYKE-haku epäonnistui', code: 'UPSTREAM_ERROR' },
      { status: 502, headers: ERROR_HEADERS },
    );
  }

  const sykeData = await res.json() as { value: Array<{ Arvo: number; Aika: string; Lippu_id: number | null }> };
  const reading = sykeData.value?.[0];

  if (!reading) {
    return NextResponse.json(
      { error: 'Ei mittausdataa', code: 'NO_DATA' },
      { status: 404, headers: ERROR_HEADERS },
    );
  }

  if (Date.now() - new Date(reading.Aika).getTime() > MAX_AGE_MS) {
    return NextResponse.json(
      { error: 'Mittausdata vanhentunut', code: 'STALE_DATA' },
      { status: 404, headers: ERROR_HEADERS },
    );
  }

  const weeks = nearest.weeks as Record<string, { p10: number; p50: number; p90: number; n: number }>;
  const week = isoWeek(new Date());
  const ref = weeks[String(week)] ?? weeks['52'];

  if (!ref) {
    return NextResponse.json(
      { error: 'Viitearvo puuttuu tälle viikolle', code: 'NO_REFERENCE_WEEK' },
      { status: 404, headers: ERROR_HEADERS },
    );
  }

  const currentCm = reading.Arvo;
  const anomalyCm = Math.round(currentCm - ref.p50);

  return NextResponse.json({
    data: {
      stationId: nearest.stationId,
      name: nearest.name,
      region: nearest.region,
      distKm: Math.round(nearest.distKm * 10) / 10,
      currentCm,
      measuredAt: reading.Aika,
      reference: {
        isoWeek: week,
        p10: ref.p10,
        p50: ref.p50,
        p90: ref.p90,
        n: ref.n,
      },
      anomalyCm,
      level: classify(currentCm, ref.p10, ref.p50, ref.p90),
    },
    meta: {
      attribution: 'SYKE Hydrologiarajapinta, CC BY 4.0',
      disclaimer:
        'Decision-support data, not a chart correction. The official nautical chart ' +
        'remains the authoritative reference. Boater retains responsibility for navigation.',
      referencePeriod: {
        start: referenceLevels.historyStart,
        end: referenceLevels.historyEnd,
      },
      cached_at: new Date().toISOString(),
    },
  }, { headers: SUCCESS_HEADERS });
}
