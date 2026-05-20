import { describe, it, expect } from 'vitest';
import { latLonSchema, hazardPostSchema, idSchema } from '@/lib/schemas';

describe('latLonSchema', () => {
  it('hyväksyy Suomen koordinaatit', () => {
    const r = latLonSchema.safeParse({ lat: '60.17', lon: '24.94' });
    expect(r.success).toBe(true);
  });

  it('hylkää koordinaatit Suomen ulkopuolella', () => {
    expect(latLonSchema.safeParse({ lat: '51.5', lon: '24.94' }).success).toBe(false);
    expect(latLonSchema.safeParse({ lat: '60.17', lon: '15.0' }).success).toBe(false);
  });
});

describe('hazardPostSchema', () => {
  it('hyväksyy täydelliset tiedot', () => {
    const r = hazardPostSchema.safeParse({ latitude: 60.17, longitude: 24.94, depth_cm: 40, note: 'testi' });
    expect(r.success).toBe(true);
  });

  it('hyväksyy ilman depth_cm ja note', () => {
    const r = hazardPostSchema.safeParse({ latitude: 60.17, longitude: 24.94 });
    expect(r.success).toBe(true);
  });

  it('hylkää epärealistisen depth_cm', () => {
    expect(hazardPostSchema.safeParse({ latitude: 60.17, longitude: 24.94, depth_cm: -1 }).success).toBe(false);
    expect(hazardPostSchema.safeParse({ latitude: 60.17, longitude: 24.94, depth_cm: 10001 }).success).toBe(false);
  });

  it('hylkää koordinaatit Suomen ulkopuolella', () => {
    expect(hazardPostSchema.safeParse({ latitude: 0, longitude: 0 }).success).toBe(false);
  });
});

describe('idSchema', () => {
  it('hyväksyy positiivisen kokonaisluvun', () => {
    expect(idSchema.safeParse({ id: '42' }).success).toBe(true);
  });

  it('hylkää nollan ja negatiivisen', () => {
    expect(idSchema.safeParse({ id: '0' }).success).toBe(false);
    expect(idSchema.safeParse({ id: '-1' }).success).toBe(false);
  });
});
