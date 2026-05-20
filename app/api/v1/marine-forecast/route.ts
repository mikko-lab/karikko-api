import { NextRequest, NextResponse } from 'next/server';
import { latLonSchema } from '@/lib/schemas';

export const dynamic = 'force-dynamic';

const FMI_BASE = 'https://opendata.fmi.fi/wfs';
const USER_AGENT = 'Karikko/1.0 (kontakti@example.fi)';

function fmiUrl(storedQuery: string, lat: number, lon: number, parameters: string): string {
  const now = new Date();
  const end = new Date(now.getTime() + 26 * 60 * 60 * 1000);
  return (
    `${FMI_BASE}?service=WFS&version=2.0.0&request=GetFeature` +
    `&storedquery_id=${storedQuery}` +
    `&latlon=${lat},${lon}` +
    `&parameters=${parameters}` +
    `&timestep=60` +
    `&starttime=${now.toISOString().slice(0, 16)}:00Z` +
    `&endtime=${end.toISOString().slice(0, 16)}:00Z`
  );
}

interface ParsedStep {
  time: number;
  values: (number | null)[];
}

function parseMultiPointCoverage(xml: string, paramCount: number): ParsedStep[] {
  const posMatch = xml.match(/<gmlcov:positions>([\s\S]*?)<\/gmlcov:positions>/);
  const valMatch = xml.match(/<gml:doubleOrNilReasonTupleList>([\s\S]*?)<\/gml:doubleOrNilReasonTupleList>/);
  if (!posMatch || !valMatch) return [];

  const posTokens = posMatch[1].trim().split(/\s+/);
  const valTokens = valMatch[1].trim().split(/\s+/);

  const steps: ParsedStep[] = [];
  for (let i = 0; i + 2 < posTokens.length; i += 3) {
    const time = parseInt(posTokens[i + 2], 10);
    const base = (i / 3) * paramCount;
    const values = Array.from({ length: paramCount }, (_, j) => {
      const raw = valTokens[base + j];
      if (!raw || raw === 'NaN') return null;
      const n = parseFloat(raw);
      return isNaN(n) ? null : n;
    });
    steps.push({ time, values });
  }
  return steps;
}

function round1(v: number | null): number | null {
  return v === null ? null : Math.round(v * 10) / 10;
}

export async function GET(req: NextRequest) {
  const parsed = latLonSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message, code: 'INVALID_PARAMS' },
      { status: 400 },
    );
  }

  const { lat, lon } = parsed.data;

  const [windRes, waveRes] = await Promise.all([
    fetch(
      fmiUrl('fmi::forecast::harmonie::surface::point::multipointcoverage', lat, lon, 'windspeedms,winddirection,WindGust'),
      { headers: { 'User-Agent': USER_AGENT } },
    ),
    fetch(
      fmiUrl('fmi::forecast::wam::point::multipointcoverage', lat, lon, 'SigWaveHeight,WaveDirection'),
      { headers: { 'User-Agent': USER_AGENT } },
    ),
  ]);

  if (!windRes.ok) {
    console.log(JSON.stringify({ event: 'fmi_wind_error', status: windRes.status }));
    return NextResponse.json({ error: 'FMI wind forecast unavailable', code: 'UPSTREAM_ERROR' }, { status: 502 });
  }

  const [windXml, waveXml] = await Promise.all([
    windRes.text(),
    waveRes.ok ? waveRes.text() : Promise.resolve(''),
  ]);

  const windSteps = parseMultiPointCoverage(windXml, 3);
  const waveSteps = waveRes.ok ? parseMultiPointCoverage(waveXml, 2) : [];

  const waveByTime = new Map(waveSteps.map(s => [s.time, s.values]));

  const hours = windSteps.slice(0, 24).map(step => {
    const [windSpeed, windDir, windGust] = step.values;
    const wave = waveByTime.get(step.time);
    const [waveHeight, waveDir] = wave ?? [null, null];
    return {
      time: new Date(step.time * 1000).toISOString(),
      wind_speed_ms: round1(windSpeed),
      wind_direction_deg: windDir !== null ? Math.round(windDir) : null,
      wind_gust_ms: round1(windGust),
      wave_height_m: round1(waveHeight),
      wave_direction_deg: waveDir !== null ? Math.round(waveDir) : null,
    };
  });

  console.log(JSON.stringify({ event: 'marine_forecast', lat, lon, hours: hours.length }));

  return NextResponse.json(
    {
      data: { hours },
      meta: {
        attribution: 'FMI (c) 2024, CC BY 4.0',
        license: 'CC BY 4.0',
        cached_at: new Date().toISOString(),
      },
    },
    {
      headers: { 'Cache-Control': 'public, max-age=1800, s-maxage=3600' },
    },
  );
}
