# karikko-api

Backend API [Karikko](https://github.com/mikko-lab/karikko)-sovellukselle. Deployattu Verceliin: `https://karikko-api.vercel.app`

## Endpointit

Kaikki reitit alkavat `/api/v1/`. Koordinaatit WGS84-desimaaliasteina, etäisyydet metreinä.

### Matalikot

```
GET  /api/v1/hazards?lat=&lon=&radius_m=5000
POST /api/v1/hazards
POST /api/v1/hazards/:id/confirm
```

POST-body:
```json
{ "latitude": 61.5, "longitude": 28.0, "depth_cm": 40, "note": "Kivi" }
```

### Vedenkorkeus

```
GET /api/v1/water-level?lat=&lon=
```

### Väylät ja turvalaitteet

```
GET /api/v1/fairways?lat=&lon=&radius_m=5000
```

Palauttaa `{ data: { fairways, lines, marks } }`.

### Merikartat (Traficom WMTS)

```
GET /api/v1/chart-tile?z=&x=&y=&layer=A
GET /api/v1/chart-meta
```

Layerit: `A` (rannikko+saaristo), `C` (rannikko), `F` (sisävedet), `G` (sisävedet).

### AIS-alukset

```
GET /api/v1/vessels?lat=&lon=&radius_m=10000
```

Palauttaa max 20 lähintä alusta nimellä, tyypillä, nopeudella ja suunnalla.

### Meriennuste

```
GET /api/v1/marine-forecast?lat=&lon=
```

FMI:n tuuli (nopeus, suunta, puuska) ja aallot 24h tunneittain.

### Salamahavainnot

```
GET /api/v1/lightning?lat=&lon=&radius_m=50000&minutes=60
```

Maasalamat ja pilvisalamat, huippuvirta kA:ssa.

### Merenkulkutiedotteet

```
GET /api/v1/notices
```

Traficomin voimassaolevat NtM-varoitukset suomeksi ja englanniksi.

### Syvyystieto

```
GET /api/v1/depth?lat=&lon=
```

EMODnet-syvyys metreinä. Kattaa merialueet ja rannikon — ei sisävesiä.

## Stack

- Next.js 15 App Router, TypeScript strict
- Neon PostgreSQL (serverless), `@neondatabase/serverless`
- Zod v4 validointiin, Vitest + MSW testaukseen
- Vercel (Edge Runtime chart-tileille, Node muille)

## Ympäristömuuttujat

```
DATABASE_URL=postgresql://...          # Neon pooled connection string

# Valinnainen — rate limiting
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# Valinnainen — sallitut originit POST /hazards -kutsuille
ALLOWED_ORIGINS=https://karikko.fi,https://www.karikko.fi

# Valinnainen — Cloudflare Turnstile web-frontendille
CLOUDFLARE_TURNSTILE_SECRET_KEY=...
```

Mobiilisovellus ohittaa Turnstilen automaattisesti (`X-App-Platform: karikko-mobile`).

## Tietolähteet

| Lähde | Käyttö | Lisenssi |
|-------|--------|----------|
| SYKE Hydrologiarajapinta | Vedenkorkeus | CC BY 4.0 |
| Väylävirasto OGC Features | Väylät, turvalaitteet | CC BY 4.0 |
| Traficom WMTS | Merikartat | CC BY 4.0 + disclaimer |
| Traficom NtM | Merenkulkutiedotteet | CC BY 4.0 |
| FMI WFS | Sää, aallot, salamat | CC BY 4.0 |
| Digitraffic / Fintraffic | AIS-alusdata | CC BY 4.0 |
| EMODnet Bathymetry | Syvyystieto | CC BY 4.0 |
