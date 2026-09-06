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

  const wcur = await sql`SELECT * FROM weather_current WHERE id = 1`;
  const wfc = await sql`SELECT t, shortwave_radiation, cloud_cover, temperature, weather_code FROM weather_forecast
    WHERE t >= date_trunc('hour', now()) AND t < now() + interval '48 hours' ORDER BY t`;
  const whist = await sql`
    SELECT to_timestamp(floor(extract(epoch FROM ts) / ${range.bucket}) * ${range.bucket}) AS t,
           avg(shortwave_radiation) AS radiation, avg(cloud_cover) AS cloud, avg(temperature) AS temp
    FROM weather_history WHERE ts > now() - make_interval(secs => ${range.seconds}) GROUP BY 1 ORDER BY 1`;

  const todayKey = new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
  const todayRow = daily.find((d) => d.day === todayKey);
  const l = latest[0];
  const num = (v: unknown) => (v == null ? null : Number(v));
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
    weather: {
      current: wcur[0] ? { ...wcur[0], id: undefined } : null,
      forecast: wfc.map((f) => ({ t: f.t, shortwave_radiation: num(f.shortwave_radiation), cloud_cover: num(f.cloud_cover), temperature: num(f.temperature), weather_code: f.weather_code })),
      history: whist.map((h) => ({ t: h.t, radiation: num(h.radiation), cloud: num(h.cloud), temp: num(h.temp) })),
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
