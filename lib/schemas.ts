import { z } from 'zod';

export const latLonSchema = z.object({
  lat: z.coerce.number().min(59.5).max(70.1),
  lon: z.coerce.number().min(19.0).max(31.6),
});

export const radiusSchema = z.object({
  radius_m: z.coerce.number().min(1).max(50_000).default(5_000),
});

export const hazardPostSchema = z.object({
  latitude: z.number().min(59.5).max(70.1),
  longitude: z.number().min(19.0).max(31.6),
  depth_cm: z.number().int().min(0).max(10_000).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  photo_url: z.string().url().max(1000).nullable().optional(),
});

export const idSchema = z.object({
  id: z.coerce.number().int().positive(),
});
