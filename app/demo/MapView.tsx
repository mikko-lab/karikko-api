'use client';

import { useEffect, useRef } from 'react';
import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useLang } from '@/lib/i18n';
import type {
  DemoStation,
  DepthRealtimeData,
  ErrorPayload,
} from './DemoApp';

// M = Merikarttasarjat (kaikki sarjat yhdistetty, kattaa 19–31°E koko Suomi)
// V = Veneilykartat (Saimaa-alue 26–29°E), A = Saimaa+Itämeri 24–29°E
const CHART_TILE_URL = '/api/v1/chart-tile?z={z}&x={x}&y={y}&layer=M';

// OSM taustakerroksena, jotta maa-alueet ja paikannimet näkyvät myös
// niillä alueilla joita Traficom-kerros ei kata.
const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

// Suomi-keskitetty näkymä, joka näyttää kaikki demo-asemat
// Lauritsala (Saimaa) — ensimmäinen demo-asema, anomalia näkyy heti
const INITIAL_CENTER: [number, number] = [28.18, 61.05];
const INITIAL_ZOOM = 8;

interface MapViewProps {
  stations: DemoStation[];
  anomalies: Map<number, DepthRealtimeData | ErrorPayload>;
  selectedId: number | null;
  onStationSelect: (stationId: number) => void;
  onMapClick: (lat: number, lon: number) => void;
}

export default function MapView({
  stations,
  anomalies,
  selectedId,
  onStationSelect,
  onMapClick,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Map<number, { marker: Marker; el: HTMLElement }>>(
    new Map(),
  );

  const { t, lang } = useLang();

  // Init kartta kerran
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        glyphs:
          'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
          osm: {
            type: 'raster',
            tiles: [OSM_TILE_URL],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
            maxzoom: 19,
          },
          traficom: {
            type: 'raster',
            tiles: [CHART_TILE_URL],
            tileSize: 256,
            attribution: 'Merikartat: Traficom (CC BY 4.0)',
            minzoom: 4,
            maxzoom: 15,
          },
        },
        layers: [
          {
            id: 'osm-base',
            type: 'raster',
            source: 'osm',
            paint: {
              'raster-saturation': -0.6,
              'raster-brightness-max': 0.7,
              'raster-brightness-min': 0.05,
              'raster-contrast': 0.15,
            },
          },
          {
            id: 'traficom-charts',
            type: 'raster',
            source: 'traficom',
            paint: {
              'raster-opacity': 0.9,
            },
          },
        ],
      },
      center: INITIAL_CENTER,
      zoom: INITIAL_ZOOM,
      minZoom: 4,
      maxZoom: 13,
      attributionControl: { compact: true },
    });

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      'top-right',
    );

    // Klikkaus muualla kuin markerin päällä
    map.on('click', (e) => {
      // MapLibre triggeröi markerklikkauksen erikseen markerin omasta
      // event-handleristä, joten ei tarvita propagation-tarkistusta.
      onMapClick(e.lngLat.lat, e.lngLat.lng);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Luo markerit asemien perusteella (kerran asemien ollessa staattisia)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Poista vanhat ennen luontia (defensiivinen — pitäisi olla tyhjä)
    markersRef.current.forEach(({ marker }) => marker.remove());
    markersRef.current.clear();

    for (const s of stations) {
      const el = document.createElement('div');
      el.className = 'demo-marker';
      el.title = s.name;
      el.addEventListener('click', (e) => {
        // Estä propagation karttaklikkaukseen
        e.stopPropagation();
        onStationSelect(s.stationId);
      });

      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([s.longitude, s.latitude])
        .addTo(map);

      markersRef.current.set(s.stationId, { marker, el });
    }
  }, [stations, onStationSelect]);

  // Päivitä markereiden väri kun anomalia-data tulee
  useEffect(() => {
    markersRef.current.forEach(({ el }, stationId) => {
      const a = anomalies.get(stationId);
      if (a && !('error' in a)) {
        el.setAttribute('data-level', a.level);
      } else {
        el.removeAttribute('data-level');
      }
    });
  }, [anomalies]);

  // Päivitä valitun markerin tila
  useEffect(() => {
    markersRef.current.forEach(({ el }, stationId) => {
      if (stationId === selectedId) {
        el.setAttribute('data-selected', 'true');
      } else {
        el.removeAttribute('data-selected');
      }
    });
  }, [selectedId]);

  return (
    <div className="demo-map">
      <div ref={containerRef} className="demo-map__canvas" />
      <div className="demo-map__legend" aria-label={t('legend')}>
        <div className="demo-map__legend-title">{t('legend')}</div>
        <div className="demo-map__legend-row">
          <span
            className="demo-map__legend-dot"
            style={{ background: 'var(--color-below-p10)' }}
          />
          <span>{lang === 'fi' ? 'Alle P10' : 'Below P10'}</span>
        </div>
        <div className="demo-map__legend-row">
          <span
            className="demo-map__legend-dot"
            style={{ background: 'var(--color-p10-p50)' }}
          />
          <span>{lang === 'fi' ? 'P10–mediaani' : 'P10–median'}</span>
        </div>
        <div className="demo-map__legend-row">
          <span
            className="demo-map__legend-dot"
            style={{ background: 'var(--color-p50-p90)' }}
          />
          <span>{lang === 'fi' ? 'Mediaani–P90' : 'Median–P90'}</span>
        </div>
        <div className="demo-map__legend-row">
          <span
            className="demo-map__legend-dot"
            style={{ background: 'var(--color-above-p90)' }}
          />
          <span>{lang === 'fi' ? 'Yli P90' : 'Above P90'}</span>
        </div>
      </div>
    </div>
  );
}
