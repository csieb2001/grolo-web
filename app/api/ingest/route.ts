import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const TZ = "Europe/Berlin";   // Sekunden; große Nachholpuffer des Push-Dienstes brauchen mehr als die 10 s Standard

type WeatherCurrent = { temperature?: number | null; cloud_cover?: number | null; shortwave_radiation?: number | null; direct_radiation?: number | null; diffuse_radiation?: number | null;
  wind_speed?: number | null; weather_code?: number | null; is_day?: number | null; condition_en?: string | null; condition_de?: string | null;
  sunrise?: string | null; sunset?: string | null; sunshine_duration_today?: number | null; radiation_sum_today?: number | null };
type WeatherForecast = { t: string; shortwave_radiation?: number | null; cloud_cover?: number | null; temperature?: number | null; weather_code?: number | null };
type Site = { name?: string | null; lat?: number | null; lon?: number | null; strings?: Record<string, { tilt?: number | null; azimuth?: number | null; wp?: number | null }>; assumed?: Record<string, unknown>; names?: Record<string, string> };
type ModelRow = { t: string; string: number; gti?: number | null; expected_w?: number | null };
type ShellyState = { grid_w?: number|null; household_w?: number|null; out_w?: number|null; target_w?: number|null; setpoint_w?: number|null; ok?: boolean|null; enabled?: boolean|null; host?: string|null;
  limited?: boolean|null; reason?: string|null; soc?: number|null; soc_limit?: number|null; max_w?: number|null };
type HeatSample = { ts: string; hp_w?: number|null; heat_w?: number|null; flow_c?: number|null; return_c?: number|null; dhw_c?: number|null;
  outside_c?: number|null; spread?: number|null; freq?: number|null; flow_lpm?: number|null; compressor?: number|null; mode?: number|null };
type HeatDay = { day: string; heat_kwh?: number|null; el_kwh?: number|null; spf?: number|null };
type HeatCycle = { start?: number|null; end?: number|null; min?: number|null; pause_min?: number|null; mode?: string|null;
  t_out?: number|null; freq?: number|null; freq_max?: number|null; flow_c?: number|null; kwh?: number|null; cop?: number|null; defrost?: number|null };
type Heat = { ts?: string; samples?: HeatSample[]; days?: HeatDay[]; cycles?: HeatCycle[]; state?: Record<string, unknown> };
type Room = { name?: string; temp_c?: number|null; setpoint_c?: number|null; humidity_pct?: number|null;
  temp_source?: string|null; temp_fallback?: boolean|null; radiator_offset_k?: number|null;
  battery_level?: number|null; battery_text?: string|null; available?: boolean|null; nodes?: number[]; mode_text?: string|null };
type Tariff = { price_ct_kwh?: number|null; feedin_ct_kwh?: number|null; system_cost_eur?: number|null; currency?: string|null; updated?: number|null };
type Weather = { ts?: string; current?: WeatherCurrent & { sun_azimuth?: number | null; sun_elevation?: number | null }; forecast?: WeatherForecast[]; site?: Site; model?: ModelRow[]; fit?: Record<string, unknown> | null; advice?: Record<string, unknown> | null };

type Sample = {
  ts: string; device: string; pv_w: number; out_w: number; bat_w: number; soc: number;
  soc1?: number; soc2?: number; soc3?: number; soc4?: number;
  temp_sys?: number; temp_bat1?: number; temp_bat2?: number;
  pv_v?: number[]; pv_a?: number[]; packs?: number; status?: string; mode?: string;
  grid_w?: number | null; house_w?: number | null;
};

// POST { samples: Sample[], info?: {...} }  Authorization: Bearer <INGEST_TOKEN>
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  if (!process.env.INGEST_TOKEN || auth !== `Bearer ${process.env.INGEST_TOKEN}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { samples?: Sample[]; info?: Record<string, unknown> & { device?: string }; weather?: Weather; shelly?: ShellyState; tariff?: Tariff; heat?: Heat;
              forecast?: Record<string, unknown>; rooms?: Record<string, Room> };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  await ensureSchema();
  // Samples gebündelt einfügen: eine Abfrage je 100 Zeilen statt einer je Zeile (jede Abfrage ist ein HTTP-Roundtrip zu Neon;
  // einzeln dauerten 200 Zeilen länger als der 20-s-Timeout des Push-Dienstes, der Puffer kam nie leer).
  const samples = (body.samples || []).slice(0, 500).filter((s) => s.ts && s.device);
  const COLS = ["ts", "device", "pv_w", "out_w", "bat_w", "soc", "soc1", "soc2", "soc3", "soc4", "temp_sys", "temp_bat1", "temp_bat2", "pv_v", "pv_a", "packs", "status", "mode", "grid_w", "house_w"];
  const rowOf = (s: Sample) => [s.ts, s.device, s.pv_w, s.out_w, s.bat_w, s.soc, s.soc1 ?? null, s.soc2 ?? null, s.soc3 ?? null, s.soc4 ?? null,
    s.temp_sys ?? null, s.temp_bat1 ?? null, s.temp_bat2 ?? null, s.pv_v ?? null, s.pv_a ?? null, s.packs ?? null, s.status ?? null, s.mode ?? null, s.grid_w ?? null, s.house_w ?? null];
  let n = 0;
  for (let i = 0; i < samples.length; i += 100) {
    const chunk = samples.slice(i, i + 100);
    const params: unknown[] = []; const tuples: string[] = [];
    for (const s of chunk) {
      const row = rowOf(s);
      tuples.push("(" + row.map((_, j) => `$${params.length + j + 1}` + (j === 0 ? "::timestamptz" : j === 13 || j === 14 ? "::real[]" : "")).join(", ") + ")");
      params.push(...row);
    }
    const upd = COLS.slice(2).map((c) => `${c} = EXCLUDED.${c}`).join(", ");
    await sql.query(`INSERT INTO samples (${COLS.join(", ")}) VALUES ${tuples.join(", ")} ON CONFLICT (device, ts) DO UPDATE SET ${upd}`, params);
    n += chunk.length;
  }
  if (body.info && body.info.device) {
    const { device, ...info } = body.info;
    await sql`INSERT INTO device_info (device, updated, info) VALUES (${device as string}, now(), ${JSON.stringify(info)}::jsonb)
      ON CONFLICT (device) DO UPDATE SET updated = now(), info = EXCLUDED.info`;
  }
  let weather = 0;
  const w = body.weather;
  if (w && (w.current || w.forecast || w.site || w.model || w.fit || w.advice)) {
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
      if (c.sun_azimuth != null) await sql`UPDATE weather_current SET sun_azimuth = ${c.sun_azimuth}, sun_elevation = ${c.sun_elevation ?? null} WHERE id = 1`;
      await sql`INSERT INTO weather_history (ts, temperature, cloud_cover, shortwave_radiation) VALUES (${ts}, ${c.temperature ?? null}, ${c.cloud_cover ?? null}, ${c.shortwave_radiation ?? null})
        ON CONFLICT (ts) DO UPDATE SET temperature = EXCLUDED.temperature, cloud_cover = EXCLUDED.cloud_cover, shortwave_radiation = EXCLUDED.shortwave_radiation`;
      weather++;
    }
    if (w.site && w.site.lat != null && w.site.lon != null) {
      await sql`INSERT INTO site (id, updated, name, lat, lon, strings, assumed, names) VALUES (1, now(), ${w.site.name ?? null}, ${w.site.lat}, ${w.site.lon}, ${JSON.stringify(w.site.strings || {})}::jsonb, ${JSON.stringify(w.site.assumed || {})}::jsonb, ${JSON.stringify(w.site.names || {})}::jsonb)
        ON CONFLICT (id) DO UPDATE SET updated = now(), name = EXCLUDED.name, lat = EXCLUDED.lat, lon = EXCLUDED.lon, strings = EXCLUDED.strings, assumed = EXCLUDED.assumed, names = EXCLUDED.names`;
      weather++;
    }
    if (w.advice && typeof w.advice === "object") {
      await sql`INSERT INTO site (id, updated, advice) VALUES (1, now(), ${JSON.stringify(w.advice)}::jsonb) ON CONFLICT (id) DO UPDATE SET advice = EXCLUDED.advice`;
      weather++;
    }
    if (w.fit && typeof w.fit === "object") {
      await sql`INSERT INTO site (id, updated, fit) VALUES (1, now(), ${JSON.stringify(w.fit)}::jsonb) ON CONFLICT (id) DO UPDATE SET fit = EXCLUDED.fit`;
      weather++;
    }
    const model = (w.model || []).slice(0, 400).filter((m) => m.t && m.string != null);
    for (let i = 0; i < model.length; i += 100) {
      const chunk = model.slice(i, i + 100); const params: unknown[] = [];
      const tuples = chunk.map((m) => { const k = params.length; params.push(m.t, m.string, m.gti ?? null, m.expected_w ?? null); return `($${k + 1}::timestamptz, $${k + 2}, $${k + 3}, $${k + 4})`; });
      await sql.query(`INSERT INTO pv_model (t, string, gti, expected_w) VALUES ${tuples.join(", ")} ON CONFLICT (t, string) DO UPDATE SET gti = EXCLUDED.gti, expected_w = EXCLUDED.expected_w`, params);
      weather += chunk.length;
    }
    const fc = (w.forecast || []).slice(0, 96).filter((f) => f.t);
    if (fc.length) {
      const params: unknown[] = [];
      const tuples = fc.map((f) => { const k = params.length; params.push(f.t, f.shortwave_radiation ?? null, f.cloud_cover ?? null, f.temperature ?? null, f.weather_code ?? null); return `($${k + 1}::timestamptz, $${k + 2}, $${k + 3}, $${k + 4}, $${k + 5})`; });
      await sql.query(`INSERT INTO weather_forecast (t, shortwave_radiation, cloud_cover, temperature, weather_code) VALUES ${tuples.join(", ")}
        ON CONFLICT (t) DO UPDATE SET shortwave_radiation = EXCLUDED.shortwave_radiation, cloud_cover = EXCLUDED.cloud_cover, temperature = EXCLUDED.temperature, weather_code = EXCLUDED.weather_code`, params);
      weather += fc.length;
    }
  }
  const sh = body.shelly;
  if (sh && typeof sh === "object") {
    await sql`INSERT INTO shelly (id, updated, grid_w, household_w, out_w, target_w, setpoint_w, ok, enabled, host, limited, reason, soc, soc_limit, max_w)
      VALUES (1, now(), ${sh.grid_w ?? null}, ${sh.household_w ?? null}, ${sh.out_w ?? null}, ${sh.target_w ?? null}, ${sh.setpoint_w ?? null}, ${sh.ok ?? null}, ${sh.enabled ?? null}, ${sh.host ?? null},
              ${sh.limited ?? null}, ${sh.reason ?? null}, ${sh.soc ?? null}, ${sh.soc_limit ?? null}, ${sh.max_w ?? null})
      ON CONFLICT (id) DO UPDATE SET updated = now(), grid_w = EXCLUDED.grid_w, household_w = EXCLUDED.household_w, out_w = EXCLUDED.out_w,
        target_w = EXCLUDED.target_w, setpoint_w = EXCLUDED.setpoint_w, ok = EXCLUDED.ok, enabled = EXCLUDED.enabled, host = EXCLUDED.host,
        limited = EXCLUDED.limited, reason = EXCLUDED.reason, soc = EXCLUDED.soc, soc_limit = EXCLUDED.soc_limit, max_w = EXCLUDED.max_w`;
  }
  let tariff = 0;
  const tf = body.tariff;
  if (tf && typeof tf === "object" && tf.price_ct_kwh != null && Number.isFinite(Number(tf.price_ct_kwh))) {
    await sql`INSERT INTO tariff (id, updated, price_ct_kwh, feedin_ct_kwh, system_cost_eur, currency)
      VALUES (1, now(), ${Number(tf.price_ct_kwh)}, ${tf.feedin_ct_kwh ?? 0}, ${tf.system_cost_eur ?? 0}, ${tf.currency ?? "EUR"})
      ON CONFLICT (id) DO UPDATE SET updated = now(), price_ct_kwh = EXCLUDED.price_ct_kwh, feedin_ct_kwh = EXCLUDED.feedin_ct_kwh,
        system_cost_eur = EXCLUDED.system_cost_eur, currency = EXCLUDED.currency`;
    tariff = 1;
  }
  // Wärmepumpe: Samples wie die NEXA-Samples gebündelt, Tageswerte als Höchststand (die Zähler wachsen im Tag nur),
  // der aktuelle Stand als eine Zeile.
  let heat = 0;
  const h = body.heat;
  if (h && typeof h === "object") {
    const hs = (h.samples || []).slice(0, 500).filter((s) => s.ts);
    const HCOLS = ["ts", "hp_w", "heat_w", "flow_c", "return_c", "dhw_c", "outside_c", "spread", "freq", "flow_lpm", "compressor", "mode"];
    for (let i = 0; i < hs.length; i += 100) {
      const chunk = hs.slice(i, i + 100);
      const params: unknown[] = []; const tuples: string[] = [];
      for (const s of chunk) {
        const row = [s.ts, s.hp_w ?? null, s.heat_w ?? null, s.flow_c ?? null, s.return_c ?? null, s.dhw_c ?? null,
          s.outside_c ?? null, s.spread ?? null, s.freq ?? null, s.flow_lpm ?? null, s.compressor ?? null, s.mode ?? null];
        tuples.push("(" + row.map((_, j) => `$${params.length + j + 1}` + (j === 0 ? "::timestamptz" : "")).join(", ") + ")");
        params.push(...row);
      }
      const upd = HCOLS.slice(1).map((c) => `${c} = EXCLUDED.${c}`).join(", ");
      await sql.query(`INSERT INTO heat_samples (${HCOLS.join(", ")}) VALUES ${tuples.join(", ")} ON CONFLICT (ts) DO UPDATE SET ${upd}`, params);
      heat += chunk.length;
    }
    for (const d of (h.days || []).slice(0, 40)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.day || "")) continue;
      await sql`INSERT INTO heat_days (day, heat_kwh, el_kwh, spf) VALUES (${d.day}::date, ${d.heat_kwh ?? null}, ${d.el_kwh ?? null}, ${d.spf ?? null})
        ON CONFLICT (day) DO UPDATE SET heat_kwh = greatest(heat_days.heat_kwh, EXCLUDED.heat_kwh), el_kwh = greatest(heat_days.el_kwh, EXCLUDED.el_kwh),
          spf = coalesce(EXCLUDED.spf, heat_days.spf)`;
      heat++;
    }
    // Takte: Unix-Sekunden vom Sidecar, Schlüssel ist das Ende des Laufs. Doppelte Lieferungen (Nachholpuffer)
    // laufen ins ON CONFLICT und ändern nichts.
    const hc = (h.cycles || []).slice(0, 500).filter((c) => c.end && c.min != null);
    for (let i = 0; i < hc.length; i += 100) {
      const chunk = hc.slice(i, i + 100);
      const params: unknown[] = []; const tuples: string[] = [];
      for (const c of chunk) {
        const row = [new Date((c.end as number) * 1000).toISOString(), c.start ? new Date(c.start * 1000).toISOString() : null,
          c.min ?? null, c.pause_min ?? null, c.mode ?? null, c.t_out ?? null, c.freq ?? null, c.freq_max ?? null,
          c.flow_c ?? null, c.kwh ?? null, c.cop ?? null, c.defrost ?? null];
        tuples.push("(" + row.map((_, j) => `$${params.length + j + 1}` + (j <= 1 ? "::timestamptz" : "")).join(", ") + ")");
        params.push(...row);
      }
      await sql.query(`INSERT INTO heat_cycles (ts, started, minutes, pause_min, mode, t_out, freq, freq_max, flow_c, kwh, cop, defrost)
        VALUES ${tuples.join(", ")} ON CONFLICT (ts) DO NOTHING`, params);
      heat += chunk.length;
    }
    if (h.state && typeof h.state === "object") {
      await sql`INSERT INTO heat_state (id, updated, state) VALUES (1, now(), ${JSON.stringify(h.state)}::jsonb)
        ON CONFLICT (id) DO UPDATE SET updated = now(), state = EXCLUDED.state`;
      heat++;
    }
  }
  const fc = body.forecast;
  let forecast = 0;
  if (fc && typeof fc === "object" && fc.year) {
    await sql`INSERT INTO forecast (id, updated, data) VALUES (1, now(), ${JSON.stringify(fc)}::jsonb)
      ON CONFLICT (id) DO UPDATE SET updated = now(), data = EXCLUDED.data`;
    forecast = 1;
  }
  let rooms = 0;
  const rm = body.rooms;
  if (rm && typeof rm === "object" && Object.keys(rm).length) {
    await sql`INSERT INTO rooms (id, updated, data) VALUES (1, now(), ${JSON.stringify(rm)}::jsonb)
      ON CONFLICT (id) DO UPDATE SET updated = now(), data = EXCLUDED.data`;
    // Zeitreihe je Raum, auf den Zeitstempel des Pushes gerundet – dieselbe Achse wie Samples und Wärmepumpe
    const ts = new Date().toISOString();
    const entries = Object.entries(rm).slice(0, 60).filter(([, r]) => r && r.temp_c != null);
    if (entries.length) {
      const params: unknown[] = []; const tuples: string[] = [];
      for (const [key, r] of entries) {
        const row = [ts, key, r.temp_c ?? null, r.setpoint_c ?? null, r.humidity_pct ?? null];
        tuples.push("(" + row.map((_, j) => `$${params.length + j + 1}` + (j === 0 ? "::timestamptz" : "")).join(", ") + ")");
        params.push(...row);
      }
      await sql.query(`INSERT INTO room_samples (ts, room, temp_c, setpoint_c, humidity_pct) VALUES ${tuples.join(", ")}
        ON CONFLICT (ts, room) DO UPDATE SET temp_c = EXCLUDED.temp_c, setpoint_c = EXCLUDED.setpoint_c, humidity_pct = EXCLUDED.humidity_pct`, params);
    }
    // Tagesbilanz fortschreiben: je Raum eine Zeile pro Tag, die mit jedem Push wächst.
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: TZ });   // sv-SE liefert YYYY-MM-DD
    const dayRows = Object.entries(rm).filter(([, r]) => r && r.temp_c != null);
    if (dayRows.length) {
      const params: unknown[] = []; const tuples: string[] = [];
      for (const [key, r] of dayRows) {
        const temp = r.temp_c as number;
        const hum = r.humidity_pct ?? null;
        const set = r.setpoint_c ?? null;
        const row = [today, key, temp, temp, temp, 1,
                     hum ?? 0, hum == null ? 0 : 1,
                     set ?? 0, set == null ? 0 : 1,
                     set != null && temp < set - 0.5 ? 1 : 0,
                     hum != null && hum > 60 ? 1 : 0];
        tuples.push("(" + row.map((_, j) => `$${params.length + j + 1}` + (j === 0 ? "::date" : "")).join(", ") + ")");
        params.push(...row);
      }
      await sql.query(`INSERT INTO room_days (day, room, min_c, max_c, sum_c, n, sum_hum, n_hum, sum_set, n_set, below_n, hum60_n)
        VALUES ${tuples.join(", ")}
        ON CONFLICT (day, room) DO UPDATE SET
          min_c = least(room_days.min_c, EXCLUDED.min_c), max_c = greatest(room_days.max_c, EXCLUDED.max_c),
          sum_c = room_days.sum_c + EXCLUDED.sum_c, n = room_days.n + 1,
          sum_hum = room_days.sum_hum + EXCLUDED.sum_hum, n_hum = room_days.n_hum + EXCLUDED.n_hum,
          sum_set = room_days.sum_set + EXCLUDED.sum_set, n_set = room_days.n_set + EXCLUDED.n_set,
          below_n = room_days.below_n + EXCLUDED.below_n, hum60_n = room_days.hum60_n + EXCLUDED.hum60_n`, params);
    }
    // Die Rohwerte werden nur für die Kurzverläufe gebraucht; älteres verdichtet room_days ohnehin.
    if (Math.random() < 0.02) await sql`DELETE FROM room_samples WHERE ts < now() - interval '30 days'`;
    rooms = Object.keys(rm).length;
  }
  return NextResponse.json({ ok: true, inserted: n, weather, tariff, heat, forecast, rooms });
}
