import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WeatherCurrent = { temperature?: number | null; cloud_cover?: number | null; shortwave_radiation?: number | null; direct_radiation?: number | null; diffuse_radiation?: number | null;
  wind_speed?: number | null; weather_code?: number | null; is_day?: number | null; condition_en?: string | null; condition_de?: string | null;
  sunrise?: string | null; sunset?: string | null; sunshine_duration_today?: number | null; radiation_sum_today?: number | null };
type WeatherForecast = { t: string; shortwave_radiation?: number | null; cloud_cover?: number | null; temperature?: number | null; weather_code?: number | null };
type Weather = { ts?: string; current?: WeatherCurrent; forecast?: WeatherForecast[] };

type Sample = {
  ts: string; device: string; pv_w: number; out_w: number; bat_w: number; soc: number;
  soc1?: number; soc2?: number; soc3?: number; soc4?: number;
  temp_sys?: number; temp_bat1?: number; temp_bat2?: number;
  pv_v?: number[]; pv_a?: number[]; packs?: number; status?: string; mode?: string;
};

// POST { samples: Sample[], info?: {...} }  Authorization: Bearer <INGEST_TOKEN>
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  if (!process.env.INGEST_TOKEN || auth !== `Bearer ${process.env.INGEST_TOKEN}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { samples?: Sample[]; info?: Record<string, unknown> & { device?: string }; weather?: Weather };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  await ensureSchema();
  const samples = (body.samples || []).slice(0, 500);
  let n = 0;
  for (const s of samples) {
    if (!s.ts || !s.device) continue;
    await sql`INSERT INTO samples (ts, device, pv_w, out_w, bat_w, soc, soc1, soc2, soc3, soc4, temp_sys, temp_bat1, temp_bat2, pv_v, pv_a, packs, status, mode)
      VALUES (${s.ts}, ${s.device}, ${s.pv_w}, ${s.out_w}, ${s.bat_w}, ${s.soc}, ${s.soc1 ?? null}, ${s.soc2 ?? null}, ${s.soc3 ?? null}, ${s.soc4 ?? null},
              ${s.temp_sys ?? null}, ${s.temp_bat1 ?? null}, ${s.temp_bat2 ?? null}, ${s.pv_v ?? null}, ${s.pv_a ?? null}, ${s.packs ?? null}, ${s.status ?? null}, ${s.mode ?? null})
      ON CONFLICT (device, ts) DO UPDATE SET pv_w = EXCLUDED.pv_w, out_w = EXCLUDED.out_w, bat_w = EXCLUDED.bat_w, soc = EXCLUDED.soc,
        soc1 = EXCLUDED.soc1, soc2 = EXCLUDED.soc2, soc3 = EXCLUDED.soc3, soc4 = EXCLUDED.soc4, temp_sys = EXCLUDED.temp_sys,
        temp_bat1 = EXCLUDED.temp_bat1, temp_bat2 = EXCLUDED.temp_bat2, pv_v = EXCLUDED.pv_v, pv_a = EXCLUDED.pv_a, packs = EXCLUDED.packs,
        status = EXCLUDED.status, mode = EXCLUDED.mode`;
    n++;
  }
  if (body.info && body.info.device) {
    const { device, ...info } = body.info;
    await sql`INSERT INTO device_info (device, updated, info) VALUES (${device as string}, now(), ${JSON.stringify(info)}::jsonb)
      ON CONFLICT (device) DO UPDATE SET updated = now(), info = EXCLUDED.info`;
  }
  let weather = 0;
  const w = body.weather;
  if (w && (w.current || w.forecast)) {
    const ts = w.ts || new Date().toISOString();
    if (w.current) {
      const c = w.current;
      await sql`INSERT INTO weather_current (id, ts, temperature, cloud_cover, shortwave_radiation, direct_radiation, diffuse_radiation, wind_speed, weather_code, is_day,
                  condition_en, condition_de, sunrise, sunset, sunshine_duration_today, radiation_sum_today)
        VALUES (1, ${ts}, ${c.temperature ?? null}, ${c.cloud_cover ?? null}, ${c.shortwave_radiation ?? null}, ${c.direct_radiation ?? null}, ${c.diffuse_radiation ?? null},
                ${c.wind_speed ?? null}, ${c.weather_code ?? null}, ${c.is_day ?? null}, ${c.condition_en ?? null}, ${c.condition_de ?? null}, ${c.sunrise ?? null}, ${c.sunset ?? null},
                ${c.sunshine_duration_today ?? null}, ${c.radiation_sum_today ?? null})
        ON CONFLICT (id) DO UPDATE SET ts = EXCLUDED.ts, temperature = EXCLUDED.temperature, cloud_cover = EXCLUDED.cloud_cover, shortwave_radiation = EXCLUDED.shortwave_radiation,
          direct_radiation = EXCLUDED.direct_radiation, diffuse_radiation = EXCLUDED.diffuse_radiation, wind_speed = EXCLUDED.wind_speed, weather_code = EXCLUDED.weather_code,
          is_day = EXCLUDED.is_day, condition_en = EXCLUDED.condition_en, condition_de = EXCLUDED.condition_de, sunrise = EXCLUDED.sunrise, sunset = EXCLUDED.sunset,
          sunshine_duration_today = EXCLUDED.sunshine_duration_today, radiation_sum_today = EXCLUDED.radiation_sum_today`;
      await sql`INSERT INTO weather_history (ts, temperature, cloud_cover, shortwave_radiation) VALUES (${ts}, ${c.temperature ?? null}, ${c.cloud_cover ?? null}, ${c.shortwave_radiation ?? null})
        ON CONFLICT (ts) DO UPDATE SET temperature = EXCLUDED.temperature, cloud_cover = EXCLUDED.cloud_cover, shortwave_radiation = EXCLUDED.shortwave_radiation`;
      weather++;
    }
    for (const f of (w.forecast || []).slice(0, 96)) {
      if (!f.t) continue;
      await sql`INSERT INTO weather_forecast (t, shortwave_radiation, cloud_cover, temperature, weather_code)
        VALUES (${f.t}, ${f.shortwave_radiation ?? null}, ${f.cloud_cover ?? null}, ${f.temperature ?? null}, ${f.weather_code ?? null})
        ON CONFLICT (t) DO UPDATE SET shortwave_radiation = EXCLUDED.shortwave_radiation, cloud_cover = EXCLUDED.cloud_cover, temperature = EXCLUDED.temperature, weather_code = EXCLUDED.weather_code`;
      weather++;
    }
  }
  return NextResponse.json({ ok: true, inserted: n, weather });
}
