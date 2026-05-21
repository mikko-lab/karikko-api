# karikko-api

Backend API ja demo [Karikko](https://github.com/mikko-lab/karikko)-sovellukselle.

**Demo:** [karikko-api.vercel.app/demo](https://karikko-api.vercel.app/demo)  
**API base:** `https://karikko-api.vercel.app/api/v1`

## Demo — reaaliaikainen vedenkorkeus-overlay

Interaktiivinen karttademo joka näyttää vedenkorkeuden poikkeaman kausinormaalista 9 SYKE-asemalla, 5 järvellä.

**Asemat:** Saimaa (Lauritsala, Savonlinna, Oravi), Keitele (Viitasaari), Kallavesi (Itkonniemi, Konnus ylä), Pielinen (Nurmes, Ahveninen), Päijänne (pohj.)

**Anomalia-laskenta:**
- 10 vuoden SYKE-historia (2015–) per asema
- P10 / P50 / P90 per ISO-kalenteriviikko
- Anomalia = nykyinen lukema − viikon mediaani (P50)
- Asemat joiden viimeisin mittaus on yli 72 h vanha suodatetaan automaattisesti pois

**Referenssitasot** rakennetaan kerran skriptillä:
```bash
npx tsx scripts/build-reference-levels.ts   # ~10–15 min
```
Tulos kirjoitetaan `lib/reference-levels.json` — commitoitava tiedosto, ei DB:tä.

## API-endpointit

Kaikki reitit alkavat `/api/v1/`. Koordinaatit WGS84-desimaaliasteina.

### Vedenkorkeus-anomalia (uusi)

```
GET /api/v1/depth-realtime?lat=&lon=
```

Palauttaa lähimmän SYKE-aseman (max 150 km) reaaliaikaisen vedenkorkeuden suhteessa kausinormaaliin.

```json
{
  "data": {
    "stationId": 1900,
    "name": "Saimaa, Lauritsala",
    "currentCm": 319,
    "measuredAt": "2026-05-21T18:00:00Z",
    "reference": { "isoWeek": 21, "p10": 338, "p50": 385, "p90": 411, "n": 79 },
    "anomalyCm": -66,
    "level": "below_p10"
  }
}
```

`level`: `below_p10` | `p10_to_p50` | `p50_to_p90` | `above_p90`

### Karttatilet (Traficom WMTS proxy)

```
GET /api/v1/chart-tile?z=&x=&y=&layer=M
```

| Layer | Kattavuus | Kuvaus |
|-------|-----------|--------|
| `M` | 19–31°E | Kaikki sarjat yhdistettynä (oletus) |
| `A` | 24–29°E | Merikarttasarja A (rannikko + Saimaan eteläosa) |
| `V` | 26–29°E | Veneilykartat (sisävesikartat, Saimaa-alue) |
| `G` | 23–26°E | Merikarttasarja G (Saaristomeri) |
| `F` | 20–24°E | Merikarttasarja F (länsirannikon sisäsaaristo) |
| `C` | 19–21°E | Merikarttasarja C (lounainen rannikko) |
| `R` | 19–28°E | Rannikkokartat |

### Matalikot

```
GET  /api/v1/hazards?lat=&lon=&radius_m=5000
POST /api/v1/hazards
POST /api/v1/hazards/:id/confirm
POST /api/v1/hazards/photo   (multipart/form-data)
```

### Muut

```
GET /api/v1/water-level?lat=&lon=
GET /api/v1/fairways?lat=&lon=&radius_m=5000
GET /api/v1/vessels?lat=&lon=&radius_m=10000
GET /api/v1/marine-forecast?lat=&lon=
GET /api/v1/lightning?lat=&lon=&radius_m=50000&minutes=60
GET /api/v1/notices
GET /api/v1/depth?lat=&lon=
```

## Stack

- Next.js 16 App Router (Turbopack), TypeScript strict
- Neon PostgreSQL (serverless), `@neondatabase/serverless`
- Vercel Blob (kuvasäilö, EU/Frankfurt)
- MapLibre GL JS (karttademo)
- Zod validointiin

## Ympäristömuuttujat

```
DATABASE_URL=postgresql://...          # Neon pooled connection string

# Valinnainen
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
ALLOWED_ORIGINS=https://karikko.fi,https://www.karikko.fi
CLOUDFLARE_TURNSTILE_SECRET_KEY=...
BLOB_READ_WRITE_TOKEN=...
```

## Tietolähteet

| Lähde | Käyttö | Lisenssi |
|-------|--------|----------|
| SYKE Hydrologiarajapinta | Vedenkorkeus, anomalia-laskenta | CC BY 4.0 |
| Traficom WMTS | Merikartat ja sisävesikartat | CC BY 4.0 |
| Traficom NtM | Merenkulkutiedotteet | CC BY 4.0 |
| Väylävirasto OGC Features | Väylät, turvalaitteet | CC BY 4.0 |
| FMI WFS | Sää, aallot, salamat | CC BY 4.0 |
| Digitraffic / Fintraffic | AIS-alusdata | CC BY 4.0 |
| EMODnet Bathymetry | Syvyystieto (merialueet) | CC BY 4.0 |
