'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { LangProvider } from '@/lib/i18n';
import MapView from './MapView';
import Sidebar from './Sidebar';

export interface DemoStation {
  stationId: number;
  name: string;
  region: string;
  latitude: number;
  longitude: number;
}

export interface DepthRealtimeData {
  stationId: number;
  name: string;
  region: string;
  distKm: number;
  currentCm: number;
  measuredAt: string;
  reference: {
    isoWeek: number;
    p10: number;
    p50: number;
    p90: number;
    n: number;
  };
  anomalyCm: number;
  level: 'below_p10' | 'p10_to_p50' | 'p50_to_p90' | 'above_p90';
}

export interface ErrorPayload {
  error: string;
  code:
    | 'INVALID_PARAMS'
    | 'NO_REFERENCE'
    | 'UPSTREAM_ERROR'
    | 'NO_DATA'
    | 'STALE_DATA'
    | 'NO_REFERENCE_WEEK';
}

interface DemoAppProps {
  stations: DemoStation[];
  referencePeriod: { start: string; end: string };
}

async function fetchDepthRealtime(
  lat: number,
  lon: number,
): Promise<DepthRealtimeData | ErrorPayload> {
  const url = `/api/v1/depth-realtime?lat=${lat}&lon=${lon}`;
  const res = await fetch(url, { cache: 'no-store' });
  const body = (await res.json()) as
    | { data: DepthRealtimeData }
    | ErrorPayload;
  if ('error' in body) return body;
  return body.data;
}

export default function DemoApp({ stations, referencePeriod }: DemoAppProps) {
  // Per-asema anomalia, key = stationId
  const [anomalies, setAnomalies] = useState<
    Map<number, DepthRealtimeData | ErrorPayload>
  >(new Map());

  // Valittu asema näkyy sivupaneelissa. Default: ensimmäinen (yleensä Lauritsala).
  const [selectedId, setSelectedId] = useState<number | null>(
    stations[0]?.stationId ?? null,
  );

  // Esihae kaikki anomaliat rinnakkain mountilla.
  // s-maxage=600 → CDN-cache pitää tämän nopeana toistuville vierailijoille.
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      stations.map(async (s) => {
        try {
          const result = await fetchDepthRealtime(s.latitude, s.longitude);
          return [s.stationId, result] as const;
        } catch {
          return [
            s.stationId,
            {
              error: 'fetch failed',
              code: 'UPSTREAM_ERROR' as const,
            },
          ] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setAnomalies(new Map(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [stations]);

  const handleStationSelect = useCallback((stationId: number) => {
    setSelectedId(stationId);
  }, []);

  // Klikkaus kartalla missä tahansa kohdassa → kutsu endpoint suoraan tällä
  // lat/lonilla; endpoint löytää lähimmän aseman ja anomalia näytetään.
  const handleMapClick = useCallback(
    async (lat: number, lon: number) => {
      const result = await fetchDepthRealtime(lat, lon);
      if ('error' in result) {
        // Jos virhe, ei vaihdeta valittua asemaa
        return;
      }
      // Päivitä cache + valitse asema johon endpoint mätsäsi
      setAnomalies((prev) => {
        const next = new Map(prev);
        next.set(result.stationId, result);
        return next;
      });
      setSelectedId(result.stationId);
    },
    [],
  );

  const selectedStation = useMemo(
    () => stations.find((s) => s.stationId === selectedId) ?? null,
    [stations, selectedId],
  );
  const selectedAnomaly = useMemo(
    () => (selectedId != null ? anomalies.get(selectedId) ?? null : null),
    [anomalies, selectedId],
  );

  return (
    <LangProvider>
      <div className="demo-shell">
        <MapView
          stations={stations}
          anomalies={anomalies}
          selectedId={selectedId}
          onStationSelect={handleStationSelect}
          onMapClick={handleMapClick}
        />
        <Sidebar
          stations={stations}
          anomalies={anomalies}
          selectedId={selectedId}
          station={selectedStation}
          data={selectedAnomaly}
          referencePeriod={referencePeriod}
          onStationSelect={handleStationSelect}
        />
      </div>
    </LangProvider>
  );
}
