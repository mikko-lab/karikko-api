'use client';

import { useEffect, useRef } from 'react';
import maplibregl, { type Map as MapLibreMap, type Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useLang } from '@/lib/i18n';
import { STATION_DISPLAY_OVERRIDES } from './station-display';
import type {
  DemoStation,
  DepthRealtimeData,
  ErrorPayload,
} from './DemoApp';

/** "Saimaa, Lauritsala" → "Lauritsala" markerin pikkulabeliin. */
function shortLabel(name: string): string {
  const i = name.indexOf(',');
  if (i < 0) return name;
  return name.substring(i + 1).trim();
}

/** Hae aseman näyttökoordinaatit: override jos olemassa, muuten SYKE:n omat. */
function displayCoords(s: DemoStation): { lat: number; lon: number } {
  const o = STATION_DISPLAY_OVERRIDES[s.stationId];
  return { lat: o?.lat ?? s.latitude, lon: o?.lon ?? s.longitude };
}

// Karikko-api proxaa Traficomin WMTS:n. Layer F = sisävedet.
// Muuta layer-parametria jos haluat eri kerroksen:
//   A = rannikko+saaristo, C = rannikko, F/G = sisävedet
const CHART_TILE_URL = '/api/v1/chart-tile?z={z}&x={x}&y={y}&layer=F';

// OSM taustakerroksena, jotta maa-alueet ja paikannimet näkyvät myös
// niillä alueilla joita Traficom-kerros ei kata.
const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

// Suomi-keskitetty näkymä, joka näyttää kaikki demo-asemat
const INITIAL_CENTER: [number, number] = [27.0, 62.5];
const INITIAL_ZOOM = 5.4;

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

    // Päivitä data-low-zoom-attribuutti zoom-tason mukaan.
    // CSS käyttää tätä piilottamaan marker-labelit country-tasolla
    // jossa ne menisivät päällekkäin Saimaan kolmen aseman välillä.
    const updateZoomClass = () => {
      const z = map.getZoom();
      const container = containerRef.current;
      if (!container) return;
      if (z < 7) {
        container.setAttribute('data-low-zoom', 'true');
      } else {
        container.removeAttribute('data-low-zoom');
      }
    };
    map.on('zoom', updateZoomClass);
    map.once('load', updateZoomClass);

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

      // Pikkulabel markerin alle
      const label = document.createElement('span');
      label.className = 'demo-marker__label';
      label.textContent = shortLabel(s.name);
      el.appendChild(label);

      const { lat, lon } = displayCoords(s);
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([lon, lat])
        .addTo(map);

      markersRef.current.set(s.stationId, { marker, el });
    }

    // Fit-to-bounds: keskitä kartta niin että kaikki markerit mahtuvat
    // ruutuun riippumatta selainikkunan koosta. maxZoom estää
    // yli-zoomauksen jos asemia olisi vähän tai lähekkäin.
    if (stations.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      for (const s of stations) {
        const { lat, lon } = displayCoords(s);
        bounds.extend([lon, lat]);
      }
      map.fitBounds(bounds, {
        padding: { top: 60, bottom: 60, left: 60, right: 60 },
        duration: 0,
        maxZoom: 6.5,
      });
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

  // Pan kartta valittuun asemaan kun selectedId muuttuu.
  // Säilyttää käyttäjän nykyisen zoomin jos hän on jo zoomannut sisään;
  // muuten zoomaa kohtuulliseen lake-mittakaavaan (8).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || selectedId == null) return;
    const station = stations.find((s) => s.stationId === selectedId);
    if (!station) return;
    const { lat, lon } = displayCoords(station);
    const currentZoom = map.getZoom();
    const targetZoom = currentZoom < 7 ? 8 : currentZoom;
    map.easeTo({
      center: [lon, lat],
      zoom: targetZoom,
      duration: 800,
    });
  }, [selectedId, stations]);

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
