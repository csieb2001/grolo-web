# GroLo web

Password-protected live mirror of a Growatt NEXA 2000 balcony battery, hosted on Vercel. The local
[GroLo stack](https://github.com/csieb2001/grolo) pushes cleaned measurements and weather data every 30 s; this app
stores them in Neon Postgres and renders tiles, charts and daily energy figures in English and German.

```
GroLo stack (LXC) ── web-push sidecar ──POST /api/ingest (Bearer token)──▶ Vercel ──▶ Neon Postgres
                                                                              │
                          browser ──cookie login──▶ /  (Next.js page) ◀── GET /api/data ◀┘
```

Production: https://grolo-web.vercel.app (alias `grolo-local.vercel.app` also points here).

## Environment variables (Vercel → Project → Settings → Environment Variables)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string (set automatically by the Neon marketplace integration) |
| `INGEST_TOKEN` | Bearer token the push service sends to `/api/ingest` (`openssl rand -hex 24`) |
| `SITE_PASSWORD` | Password for the page; the cookie stores an HMAC of it, never the password |

The push service in the stack needs `WEB_URL=https://grolo-web.vercel.app` and `WEB_TOKEN=<INGEST_TOKEN>` in its `.env`.

## API

`POST /api/ingest` with `Authorization: Bearer <INGEST_TOKEN>`:

```json
{
  "samples": [{ "ts": "2026-09-06T10:00:00Z", "device": "<serial>", "pv_w": 45.2, "out_w": 85.0, "bat_w": -39.8, "soc": 48,
                "soc1": 51, "soc2": 46, "temp_sys": 29.5, "temp_bat1": 21.0, "temp_bat2": 18.0,
                "pv_v": [33.1, 7.2, 7.2, 7.2], "pv_a": [1.44, 0.1, 0, 0.04], "packs": 2, "status": "Idle", "mode": "Load First" }],
  "info": { "device": "<serial>", "dongle_model": "GTSW0000", "dongle_sw": "4.0.2.6", "dongle_hw": "V1.0", "wifi_dbm": "-68" },
  "weather": {
    "ts": "2026-09-06T10:00:00Z",
    "current": { "temperature": 9.1, "cloud_cover": 29, "shortwave_radiation": 412.0, "direct_radiation": 300.0, "diffuse_radiation": 112.0,
                 "wind_speed": 3.2, "weather_code": 1, "is_day": 1, "condition_en": "Mainly clear", "condition_de": "Überwiegend klar",
                 "sunrise": "2026-09-06T06:39:00+02:00", "sunset": "2026-09-06T20:02:00+02:00", "sunshine_duration_today": 25400, "radiation_sum_today": 3.9 },
    "forecast": [{ "t": "2026-09-06T11:00:00Z", "shortwave_radiation": 300, "cloud_cover": 40, "temperature": 12.3, "weather_code": 3 }]
  }
}
```

All fields are optional except `ts` and `device` per sample; `info` and `weather` may be missing. Samples are upserted on
`(device, ts)`, `weather.current` is kept as a single row plus a history row per timestamp, `weather.forecast` is upserted per
hour so newer forecasts overwrite older ones. Tables are created on first use.

`GET /api/data?range=24h|7d|30d` (cookie required) returns `latest`, `series` (bucketed), `daily` (kWh per day from minute
averages), `today`, `totals`, `info` and `weather { current, forecast (next 48 h), history }`.

Auth: `POST /api/login` (form field `password`) sets the `grolo_auth` cookie for 30 days, `/api/logout` clears it. Everything
except `/login`, `/api/login`, `/api/ingest` and static assets requires the cookie (`proxy.ts`).

## Develop and deploy

```bash
npm install
vercel env pull .env.local --environment production   # DATABASE_URL, INGEST_TOKEN, SITE_PASSWORD
npm run dev
vercel --prod --yes && vercel alias set <deployment-url> grolo-web.vercel.app
```

Deployment Protection (Vercel Authentication) is set to preview deployments only, so production is reachable with the
site password alone.

License: MIT.
