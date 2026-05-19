import { NextRequest, NextResponse } from 'next/server';

const SYKE_BASE = 'https://rajapinnat.ymparisto.fi/api/Hydrologiarajapinta/1.2/odata';

interface SykeStation {
  Paikka_Id: number;
  Nimi: string;
  Latitude: number;
  Longitude: number;
}

interface SykeReading {
  Paikka_Id: number;
  Aika: string;
  Arvo: number;
  Lippu_id: number | null;
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

  const margin = 0.5;
  const filter = [
    `Latitude gt ${lat - margin}`,
    `Latitude lt ${lat + margin}`,
    `Longitude gt ${lon - margin}`,
    `Longitude lt ${lon + margin}`,
  ].join(' and ');

  const stationsRes = await fetch(
    `${SYKE_BASE}/Paikka?$filter=${encodeURIComponent(filter)}&$select=Paikka_Id,Nimi,Latitude,Longitude&$top=100`,
    { next: { revalidate: 3600 } }
  );

  if (!stationsRes.ok) {
    return NextResponse.json({ error: 'SYKE-asemien haku epäonnistui' }, { status: 502 });
  }

  const stationsData = await stationsRes.json();
  const stations: SykeStation[] = stationsData.value ?? [];

  if (stations.length === 0) {
    return NextResponse.json({ stations: [] });
  }

  const nearest = stations
    .map((s) => ({ ...s, distKm: haversineKm(lat, lon, s.Latitude, s.Longitude) }))
    .sort((a, b) => a.distKm - b.distKm)
    .slice(0, 3);

  const results = await Promise.all(
    nearest.map(async (station) => {
      const readingRes = await fetch(
        `${SYKE_BASE}/Vedenkorkeus?$filter=${encodeURIComponent(`Paikka_Id eq ${station.Paikka_Id}`)}&$orderby=Aika desc&$top=1`,
        { next: { revalidate: 600 } }
      );
      if (!readingRes.ok) return null;
      const data = await readingRes.json();
      const reading: SykeReading | undefined = data.value?.[0];
      if (!reading) return null;
      return {
        stationId: station.Paikka_Id,
        name: station.Nimi,
        latitude: station.Latitude,
        longitude: station.Longitude,
        distKm: Math.round(station.distKm * 10) / 10,
        levelCm: reading.Arvo,
        measuredAt: reading.Aika,
        qualityFlag: reading.Lippu_id,
      };
    })
  );

  return NextResponse.json({
    stations: results.filter(Boolean),
  });
}
