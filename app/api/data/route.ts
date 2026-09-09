import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema, anonymize } from "@/lib/db";
import { isAuthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TZ = "Europe/Berlin";
const RANGES: Record<string, { seconds: number; bucket: number }> = {
  "24h": { seconds: 24 * 3600, bucket: 300 },
  "7d": { seconds: 7 * 86400, bucket: 1800 },
  "30d": { seconds: 30 * 86400, bucket: 7200 },
};

export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await ensureSchema();
  const range = RANGES[req.nextUrl.searchParams.get("range") || "24h"] || RANGES["24h"];
  const todayKey = new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
  const dayParam = req.nextUrl.searchParams.get("day") || "";
  const day = /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : todayKey;

  const latest = await sql`SELECT * FROM samples ORDER BY ts DESC LIMIT 1`;
  const info = await sql`SELECT device, updated, info FROM device_info ORDER BY updated DESC LIMIT 1`;

  const series = await sql`
    SELECT to_timestamp(floor(extract(epoch FROM ts) / ${range.bucket}) * ${range.bucket}) AS t,
           avg(pv_w) AS pv, avg(out_w) AS out, avg(bat_w) AS bat, avg(soc) AS soc
    FROM samples
    WHERE ts > now() - make_interval(secs => ${range.seconds})
    GROUP BY 1 ORDER BY 1`;

  // Tagesenergie in kWh aus Minutenmitteln: Summe(W) / 60 = Wh, / 1000 = kWh
  const daily = await sql`
    WITH mins AS (
      SELECT date_trunc('minute', ts AT TIME ZONE ${TZ}) AS bucket_ts, avg(pv_w) AS pv, avg(out_w) AS outw, avg(bat_w) AS bat
      FROM samples WHERE ts > now() - interval '31 days' GROUP BY 1)
    SELECT to_char(bucket_ts::date, 'YYYY-MM-DD') AS day,
           sum(pv) / 60000.0 AS pv_kwh, sum(outw) / 60000.0 AS out_kwh,
           sum(greatest(bat, 0)) / 60000.0 AS charge_kwh, sum(greatest(-bat, 0)) / 60000.0 AS discharge_kwh
    FROM mins GROUP BY 1 ORDER BY 1`;

  const totals = await sql`
    WITH mins AS (SELECT date_trunc('minute', ts) AS bucket_ts, avg(pv_w) AS pv, avg(out_w) AS outw FROM samples GROUP BY 1)
    SELECT sum(pv) / 60000.0 AS pv_kwh, sum(outw) / 60000.0 AS out_kwh, min(bucket_ts) AS since FROM mins`;

  const shelly = await sql`SELECT updated, grid_w, household_w, out_w, target_w, setpoint_w, ok, enabled, host FROM shelly WHERE id = 1`;
  const wcur = await sql`SELECT * FROM weather_current WHERE id = 1`;
  const wfc = await sql`SELECT t, shortwave_radiation, cloud_cover, temperature, weather_code FROM weather_forecast
    WHERE t >= date_trunc('hour', now()) AND t < now() + interval '48 hours' ORDER BY t`;
  const whist = await sql`
    SELECT to_timestamp(floor(extract(epoch FROM ts) / ${range.bucket}) * ${range.bucket}) AS t,
           avg(shortwave_radiation) AS radiation, avg(cloud_cover) AS cloud, avg(temperature) AS temp
    FROM weather_history WHERE ts > now() - make_interval(secs => ${range.seconds}) GROUP BY 1 ORDER BY 1`;

  // Strings: Tagesspitzen (30 Tage), 5-Minuten-Verlauf des gewählten Tages, Stunde × Tag, Erwartungsmodell, Standort
  const site = await sql`SELECT name, lat, lon, strings, fit, advice, assumed, updated FROM site WHERE id = 1`;
  const dayBounds = await sql`SELECT (${day}::date::timestamp AT TIME ZONE ${TZ}) AS start, ((${day}::date + 1)::timestamp AT TIME ZONE ${TZ}) AS "end"`;
  const peaks = await sql`
    SELECT DISTINCT ON (day, s) day, s AS string, ts, p FROM (
      SELECT to_char(ts AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS day, s, ts, pv_v[s] * pv_a[s] AS p
      FROM samples, generate_series(1, 4) AS s
      WHERE ts > now() - interval '31 days' AND pv_v IS NOT NULL AND pv_a IS NOT NULL) x
    WHERE p > 5 ORDER BY day, s, p DESC`;
  const stringsDay = await sql`
    SELECT to_timestamp(floor(extract(epoch FROM ts) / 300) * 300) AS t,
           avg(pv_v[1] * pv_a[1]) AS s1, avg(pv_v[2] * pv_a[2]) AS s2, avg(pv_v[3] * pv_a[3]) AS s3, avg(pv_v[4] * pv_a[4]) AS s4, avg(pv_w) AS pv
    FROM samples WHERE ts >= ${dayBounds[0].start} AND ts < ${dayBounds[0].end} AND pv_v IS NOT NULL GROUP BY 1 ORDER BY 1`;
  const heat = await sql`
    SELECT to_char(ts AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS day, extract(hour FROM ts AT TIME ZONE ${TZ})::int AS hour,
           avg(pv_v[1] * pv_a[1]) AS s1, avg(pv_v[2] * pv_a[2]) AS s2, avg(pv_v[3] * pv_a[3]) AS s3, avg(pv_v[4] * pv_a[4]) AS s4, avg(pv_w) AS pv
    FROM samples WHERE ts > now() - interval '31 days' AND pv_v IS NOT NULL GROUP BY 1, 2 ORDER BY 1, 2`;
  // Allzeit je String und gesamt: höchster Rohwert (30-s-Sample, wie die Tagesspitzen) und Mittel bei Tageslicht über alle Minuten mit Daten.
  // Tageslicht = Sonnenhöhe > 0 aus einer SQL-Näherung (Deklination nach Cooper, Zeitgleichung nach Spencer); ohne Standort Mitteldeutschland.
  const allHigh = await sql`
    SELECT DISTINCT ON (s) s AS string, ts, p FROM (
      SELECT s, ts, CASE WHEN s = 0 THEN pv_w ELSE pv_v[s] * pv_a[s] END AS p
      FROM samples, generate_series(0, 4) AS s WHERE pv_v IS NOT NULL AND pv_a IS NOT NULL) x
    WHERE p > 5 ORDER BY s, p DESC`;
  const allAvg = await sql`
    WITH loc AS (SELECT coalesce((SELECT lat FROM site WHERE id = 1), 51.0) AS lat, coalesce((SELECT lon FROM site WHERE id = 1), 10.0) AS lon),
    mins AS (
      SELECT date_trunc('minute', ts) AS m, avg(pv_w) AS pv, avg(pv_v[1] * pv_a[1]) AS s1, avg(pv_v[2] * pv_a[2]) AS s2, avg(pv_v[3] * pv_a[3]) AS s3, avg(pv_v[4] * pv_a[4]) AS s4
      FROM samples WHERE pv_v IS NOT NULL AND pv_a IS NOT NULL GROUP BY 1),
    geo AS (
      SELECT m, pv, s1, s2, s3, s4, lat, lon,
             radians(23.45 * sin(radians(360.0 / 365 * (284 + extract(doy FROM m AT TIME ZONE 'UTC'))))) AS decl,
             radians(360.0 / 365 * (extract(doy FROM m AT TIME ZONE 'UTC') - 81)) AS b,
             extract(epoch FROM m) / 3600.0 - floor(extract(epoch FROM m) / 86400.0) * 24 AS utc_h
      FROM mins, loc),
    sun AS (
      SELECT m, pv, s1, s2, s3, s4,
             sin(radians(lat)) * sin(decl) + cos(radians(lat)) * cos(decl) * cos(radians(15 * (utc_h + lon / 15.0 + (9.87 * sin(2 * b) - 7.53 * cos(b) - 1.5 * sin(b)) / 60.0 - 12))) AS sin_el
      FROM geo)
    SELECT avg(pv) AS pv, avg(s1) AS s1, avg(s2) AS s2, avg(s3) AS s3, avg(s4) AS s4, count(*) AS minutes,
           count(DISTINCT (m AT TIME ZONE ${TZ})::date) AS days, (SELECT min(m) FROM mins) AS since
    FROM sun WHERE sin_el > 0`;
  const modelDay = await sql`SELECT t, string, gti, expected_w FROM pv_model WHERE t >= ${dayBounds[0].start}::timestamptz - interval '1 hour' AND t < ${dayBounds[0].end}::timestamptz + interval '1 hour' ORDER BY t`;

  const todayRow = daily.find((d) => d.day === todayKey);
  const l = latest[0];
  const num = (v: unknown) => (v == null ? null : Number(v));
  const a = allAvg[0];
  const allOf = (i: number) => { const h = allHigh.find((r) => Number(r.string) === i); return { avg_w: a ? num(i === 0 ? a.pv : a[`s${i}`]) : null, high_w: h ? num(h.p) : null, high_t: h ? h.ts : null }; };
  return NextResponse.json({
    updated: l?.ts ?? null,
    device: l ? anonymize(l.device) : null,
    latest: l ? { pv_w: num(l.pv_w), out_w: num(l.out_w), bat_w: num(l.bat_w), soc: num(l.soc), soc1: num(l.soc1), soc2: num(l.soc2), soc3: num(l.soc3), soc4: num(l.soc4),
                  temp_sys: num(l.temp_sys), temp_bat1: num(l.temp_bat1), temp_bat2: num(l.temp_bat2), pv_v: l.pv_v, pv_a: l.pv_a, packs: num(l.packs), status: l.status, mode: l.mode } : null,
    info: info[0] ? { ...(info[0].info as object), updated: info[0].updated } : null,
    series: series.map((r) => ({ t: r.t, pv: num(r.pv), out: num(r.out), bat: num(r.bat), soc: num(r.soc) })),
    daily: daily.map((d) => ({ day: d.day, pv_kwh: num(d.pv_kwh), out_kwh: num(d.out_kwh), charge_kwh: num(d.charge_kwh), discharge_kwh: num(d.discharge_kwh) })),
    today: todayRow ? { pv_kwh: num(todayRow.pv_kwh), out_kwh: num(todayRow.out_kwh), charge_kwh: num(todayRow.charge_kwh), discharge_kwh: num(todayRow.discharge_kwh) } : null,
    totals: totals[0] ? { pv_kwh: num(totals[0].pv_kwh), out_kwh: num(totals[0].out_kwh), since: totals[0].since } : null,
    site: site[0] ? { name: site[0].name, lat: num(site[0].lat), lon: num(site[0].lon), strings: site[0].strings || {}, fit: site[0].fit || null, advice: site[0].advice || null, assumed: site[0].assumed || {}, updated: site[0].updated } : null,
    day: { key: day, start: dayBounds[0].start, end: dayBounds[0].end, today: todayKey },
    string_peaks: peaks.map((r) => ({ day: String(r.day), string: Number(r.string), t: r.ts, w: num(r.p) })),
    strings_day: stringsDay.map((r) => ({ t: r.t, s1: num(r.s1), s2: num(r.s2), s3: num(r.s3), s4: num(r.s4), pv: num(r.pv) })),
    heat: heat.map((r) => ({ day: String(r.day), hour: Number(r.hour), s1: num(r.s1), s2: num(r.s2), s3: num(r.s3), s4: num(r.s4), pv: num(r.pv) })),
    alltime: { since: a?.since ?? null, days: a ? Number(a.days) : 0, minutes: a ? Number(a.minutes) : 0, total: allOf(0), strings: Object.fromEntries([1, 2, 3, 4].map((i) => [String(i), allOf(i)])) },
    model_day: modelDay.map((r) => ({ t: r.t, string: Number(r.string), gti: num(r.gti), expected_w: num(r.expected_w) })),
    shelly: shelly[0] ? { updated: shelly[0].updated, grid_w: num(shelly[0].grid_w), household_w: num(shelly[0].household_w), out_w: num(shelly[0].out_w), target_w: num(shelly[0].target_w), setpoint_w: num(shelly[0].setpoint_w), ok: shelly[0].ok, enabled: shelly[0].enabled, host: shelly[0].host } : null,
    weather: {
      current: wcur[0] ? { ...wcur[0], id: undefined } : null,
      forecast: wfc.map((f) => ({ t: f.t, shortwave_radiation: num(f.shortwave_radiation), cloud_cover: num(f.cloud_cover), temperature: num(f.temperature), weather_code: f.weather_code })),
      history: whist.map((h) => ({ t: h.t, radiation: num(h.radiation), cloud: num(h.cloud), temp: num(h.temp) })),
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
