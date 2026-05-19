import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const SYKE_BASE = 'https://rajapinnat.ymparisto.fi/api/Hydrologiarajapinta/1.2/odata';

interface SykeStation {
  Paikka_Id: number;
  Nimi: string;
  KoordLat: string;
  KoordLong: string;
}

function ddmmssToDecimal(ddmmss: string): number {
  const s = ddmmss.padStart(6, '0');
  const deg = parseInt(s.slice(0, 2), 10);
  const min = parseInt(s.slice(2, 4), 10);
  const sec = parseInt(s.slice(4, 6), 10);
  return deg + min / 60 + sec / 3600;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const lat = parseFloat(searchParams.get('lat') ?? '');
  const lon = parseFloat(searchParams.get('lon') ?? '');

  if (isNaN(lat) || isNaN(lon)) {
    return NextResponse.json({ error: 'lat ja lon vaaditaan' }, { status: 400 });
  }

  // Fetch all water level stations (Suure_Id=7 = vedenkorkeus)
  const stationsRes = await fetch(
    `${SYKE_BASE}/Paikka?$filter=Suure_Id%20eq%207&$select=Paikka_Id,Nimi,KoordLat,KoordLong&$top=500`,
    { next: { revalidate: 3600 } }
  );

  if (!stationsRes.ok) {
    const text = await stationsRes.text();
    console.error('SYKE error', stationsRes.status, text.slice(0, 200));
    return NextResponse.json({ error: 'SYKE-asemien haku epäonnistui', status: stationsRes.status }, { status: 502 });
  }

  const stationsData = await stationsRes.json();
  const stations: SykeStation[] = stationsData.value ?? [];
  console.log('SYKE stations fetched:', stations.length);
  const nearest = stations
    .filter((s) => s.KoordLat && s.KoordLong)
    .map((s) => ({
      ...s,
      lat: ddmmssToDecimal(s.KoordLat),
      lon: ddmmssToDecimal(s.KoordLong),
    }))
    .map((s) => ({ ...s, distKm: haversineKm(lat, lon, s.lat, s.lon) }))
    .sort((a, b) => a.distKm - b.distKm)
    .slice(0, 3);
  console.log('Nearest:', nearest.map(s => `${s.Nimi.trim()} ${s.distKm}km lat=${s.lat} lon=${s.lon}`));

  if (nearest.length === 0) {
    return NextResponse.json({ stations: [] });
  }

  const results = await Promise.all(
    nearest.map(async (station) => {
      const readingRes = await fetch(
        `${SYKE_BASE}/Vedenkorkeus?$filter=Paikka_Id%20eq%20${station.Paikka_Id}&$orderby=Aika%20desc&$top=1`,
        { next: { revalidate: 600 } }
      );
      if (!readingRes.ok) return null;
      const data = await readingRes.json();
      const reading = data.value?.[0];
      if (!reading) return null;
      return {
        stationId: station.Paikka_Id,
        name: station.Nimi.trim(),
        latitude: station.lat,
        longitude: station.lon,
        distKm: Math.round(station.distKm * 10) / 10,
        levelCm: reading.Arvo,
        measuredAt: reading.Aika,
        qualityFlag: reading.Lippu_id,
      };
    })
  );

  return NextResponse.json({ stations: results.filter(Boolean) });
}
