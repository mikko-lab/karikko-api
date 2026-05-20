import { describe, it, expect } from 'vitest';
import { metersToDegreesLat, metersToDegreesLon, haversineKm } from '@/lib/geo';

describe('metersToDegreesLat', () => {
  it('5000m ≈ 0.0449 astetta', () => {
    expect(metersToDegreesLat(5000)).toBeCloseTo(0.04493, 4);
  });
});

describe('metersToDegreesLon', () => {
  it('leveyspiirikorjaus — pienempi kuin lat-konversio pohjoisessa', () => {
    const lat = metersToDegreesLat(5000);
    const lon = metersToDegreesLon(5000, 60);
    expect(lon).toBeGreaterThan(lat); // cos(60°)=0.5, joten lon-asteet isompia
  });

  it('päiväntasaajalla lat ja lon yhtä suuria', () => {
    expect(metersToDegreesLon(5000, 0)).toBeCloseTo(metersToDegreesLat(5000), 3);
  });
});

describe('haversineKm', () => {
  it('sama piste → 0 km', () => {
    expect(haversineKm(60, 25, 60, 25)).toBe(0);
  });

  it('Helsinki–Turku ≈ 150 km', () => {
    expect(haversineKm(60.17, 24.94, 60.45, 22.27)).toBeCloseTo(150, -1);
  });
});
