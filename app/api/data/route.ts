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

  // Tagesenergie in kWh aus Minutenmitteln: Summe(W) / 60 = Wh, / 1000 = kWh. Netz/Haus (Shelly) nur, wenn die Regelung lief.
  const daily = await sql`
    WITH mins AS (
      SELECT date_trunc('minute', ts AT TIME ZONE ${TZ}) AS bucket_ts, avg(pv_w) AS pv, avg(out_w) AS outw, avg(bat_w) AS bat, avg(grid_w) AS grid, avg(house_w) AS house
      FROM samples WHERE ts > now() - interval '31 days' GROUP BY 1)
    SELECT to_char(bucket_ts::date, 'YYYY-MM-DD') AS day,
           sum(pv) / 60000.0 AS pv_kwh, sum(greatest(outw, 0)) / 60000.0 AS out_kwh, sum(greatest(-outw, 0)) / 60000.0 AS acin_kwh,
           sum(least(pv, greatest(outw, 0))) / 60000.0 AS direct_kwh,
           sum(greatest(bat, 0)) / 60000.0 AS charge_kwh, sum(greatest(-bat, 0)) / 60000.0 AS discharge_kwh,
           sum(greatest(grid, 0)) / 60000.0 AS grid_kwh, sum(greatest(-grid, 0)) / 60000.0 AS feedin_kwh, sum(house) / 60000.0 AS house_kwh
    FROM mins GROUP BY 1 ORDER BY 1`;

  const totals = await sql`
    WITH mins AS (SELECT date_trunc('minute', ts) AS bucket_ts, avg(pv_w) AS pv, avg(out_w) AS outw FROM samples GROUP BY 1)
    SELECT sum(pv) / 60000.0 AS pv_kwh, sum(greatest(outw, 0)) / 60000.0 AS out_kwh, min(bucket_ts) AS since FROM mins`;

  // Zeiträume für Ersparnis und Netzkosten: seit Monats- und Jahresbeginn (lokale Zeit) und gesamt, aus Minutenmitteln
  const periods = await sql`
    WITH mins AS (SELECT date_trunc('minute', ts) AS m, avg(out_w) AS outw, avg(grid_w) AS grid FROM samples GROUP BY 1),
    b AS (SELECT (date_trunc('month', now() AT TIME ZONE ${TZ}) AT TIME ZONE ${TZ}) AS ms, (date_trunc('year', now() AT TIME ZONE ${TZ}) AT TIME ZONE ${TZ}) AS ys)
    SELECT sum(greatest(outw, 0)) FILTER (WHERE m >= b.ms) / 60000.0 AS out_month, sum(greatest(outw, 0)) FILTER (WHERE m >= b.ys) / 60000.0 AS out_year, sum(greatest(outw, 0)) / 60000.0 AS out_total,
           sum(greatest(-outw, 0)) FILTER (WHERE m >= b.ms) / 60000.0 AS acin_month, sum(greatest(-outw, 0)) FILTER (WHERE m >= b.ys) / 60000.0 AS acin_year, sum(greatest(-outw, 0)) / 60000.0 AS acin_total,
           sum(greatest(grid, 0)) FILTER (WHERE m >= b.ms) / 60000.0 AS grid_month, sum(greatest(grid, 0)) FILTER (WHERE m >= b.ys) / 60000.0 AS grid_year, sum(greatest(grid, 0)) / 60000.0 AS grid_total,
           sum(greatest(-grid, 0)) FILTER (WHERE m >= b.ms) / 60000.0 AS feedin_month, sum(greatest(-grid, 0)) FILTER (WHERE m >= b.ys) / 60000.0 AS feedin_year, sum(greatest(-grid, 0)) / 60000.0 AS feedin_total,
           count(DISTINCT (m AT TIME ZONE ${TZ})::date) AS days, min(m) AS since
    FROM mins, b GROUP BY b.ms, b.ys`;
  const tariff = await sql`SELECT price_ct_kwh, feedin_ct_kwh, system_cost_eur, currency, updated FROM tariff WHERE id = 1`;

  const shelly = await sql`SELECT updated, grid_w, household_w, out_w, target_w, setpoint_w, ok, enabled, host, limited, reason, soc, soc_limit, max_w FROM shelly WHERE id = 1`;
  const wcur = await sql`SELECT * FROM weather_current WHERE id = 1`;
  const wfc = await sql`SELECT t, shortwave_radiation, cloud_cover, temperature, weather_code FROM weather_forecast
    WHERE t >= date_trunc('hour', now()) AND t < now() + interval '48 hours' ORDER BY t`;
  const whist = await sql`
    SELECT to_timestamp(floor(extract(epoch FROM ts) / ${range.bucket}) * ${range.bucket}) AS t,
           avg(shortwave_radiation) AS radiation, avg(cloud_cover) AS cloud, avg(temperature) AS temp
    FROM weather_history WHERE ts > now() - make_interval(secs => ${range.seconds}) GROUP BY 1 ORDER BY 1`;

  // Strings: Tagesspitzen (30 Tage), 5-Minuten-Verlauf des gewählten Tages, Stunde × Tag, Erwartungsmodell, Standort
  const site = await sql`SELECT name, lat, lon, strings, fit, advice, assumed, names, updated FROM site WHERE id = 1`;
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
  // Rangliste der Strings: Energie je Eingang in den letzten 24 h, 7 und 30 Tagen aus Minutenmitteln (Spannung × Strom)
  const rank = await sql`
    WITH mins AS (
      SELECT date_trunc('minute', ts) AS m, avg(pv_v[1] * pv_a[1]) AS s1, avg(pv_v[2] * pv_a[2]) AS s2, avg(pv_v[3] * pv_a[3]) AS s3, avg(pv_v[4] * pv_a[4]) AS s4
      FROM samples WHERE ts > now() - interval '30 days' AND pv_v IS NOT NULL AND pv_a IS NOT NULL GROUP BY 1)
    SELECT s AS string,
           sum(CASE s WHEN 1 THEN s1 WHEN 2 THEN s2 WHEN 3 THEN s3 ELSE s4 END) FILTER (WHERE m > now() - interval '24 hours') / 60000.0 AS kwh_24h,
           sum(CASE s WHEN 1 THEN s1 WHEN 2 THEN s2 WHEN 3 THEN s3 ELSE s4 END) FILTER (WHERE m > now() - interval '7 days') / 60000.0 AS kwh_7d,
           sum(CASE s WHEN 1 THEN s1 WHEN 2 THEN s2 WHEN 3 THEN s3 ELSE s4 END) / 60000.0 AS kwh_30d
    FROM mins, generate_series(1, 4) AS s GROUP BY s ORDER BY s`;
  // Jahreskalender: Tageswerte des gewählten Jahres (Standard: laufendes Jahr) mit PV-Spitze und Uhrzeit, plus vorhandene Jahre
  const yearParam = Number(req.nextUrl.searchParams.get("year") || "");
  const year = Number.isInteger(yearParam) && yearParam > 2000 && yearParam < 2100 ? yearParam : Number(todayKey.slice(0, 4));
  const yStart = `${year}-01-01`, yEnd = `${year + 1}-01-01`;
  const years = await sql`SELECT DISTINCT extract(year FROM ts AT TIME ZONE ${TZ})::int AS y FROM samples ORDER BY 1`;
  const calDays = await sql`
    WITH mins AS (
      SELECT date_trunc('minute', ts AT TIME ZONE ${TZ}) AS m, avg(pv_w) AS pv, avg(out_w) AS outw, avg(bat_w) AS bat, avg(grid_w) AS grid, avg(house_w) AS house
      FROM samples WHERE ts >= (${yStart}::date::timestamp AT TIME ZONE ${TZ}) AND ts < (${yEnd}::date::timestamp AT TIME ZONE ${TZ}) GROUP BY 1),
    d AS (
      SELECT m::date AS day, sum(pv) / 60000.0 AS pv_kwh, sum(greatest(outw, 0)) / 60000.0 AS out_kwh, sum(greatest(-outw, 0)) / 60000.0 AS acin_kwh,
             sum(greatest(bat, 0)) / 60000.0 AS charge_kwh, sum(greatest(-bat, 0)) / 60000.0 AS discharge_kwh,
             sum(greatest(grid, 0)) / 60000.0 AS grid_kwh, sum(house) / 60000.0 AS house_kwh, count(*) AS minutes, max(pv) AS peak_w
      FROM mins GROUP BY 1),
    pk AS (
      SELECT DISTINCT ON (day) day, peak_t FROM (
        SELECT (ts AT TIME ZONE ${TZ})::date AS day, ts AS peak_t, pv_w
        FROM samples WHERE ts >= (${yStart}::date::timestamp AT TIME ZONE ${TZ}) AND ts < (${yEnd}::date::timestamp AT TIME ZONE ${TZ})) x
      ORDER BY day, pv_w DESC)
    SELECT to_char(d.day, 'YYYY-MM-DD') AS day, d.pv_kwh, d.out_kwh, d.acin_kwh, d.charge_kwh, d.discharge_kwh, d.grid_kwh, d.house_kwh, d.minutes, d.peak_w, pk.peak_t
    FROM d LEFT JOIN pk USING (day) ORDER BY d.day`;
  const modelDay = await sql`SELECT t, string, gti, expected_w FROM pv_model WHERE t >= ${dayBounds[0].start}::timestamptz - interval '1 hour' AND t < ${dayBounds[0].end}::timestamptz + interval '1 hour' ORDER BY t`;

  // ---------------------------------------------------------------- Wärmepumpe
  const heatState = await sql`SELECT updated, state FROM heat_state WHERE id = 1`;
  const heatSeries = await sql`
    SELECT to_timestamp(floor(extract(epoch FROM ts) / ${range.bucket}) * ${range.bucket}) AS t,
           avg(hp_w) AS hp, avg(heat_w) AS heat, avg(flow_c) AS flow, avg(return_c) AS ret,
           avg(dhw_c) AS dhw, avg(outside_c) AS outside, avg(freq) AS freq
    FROM heat_samples WHERE ts > now() - make_interval(secs => ${range.seconds}) GROUP BY 1 ORDER BY 1`;
  // Tageswerte der Wolf-Zähler, dazu der Anteil, den der NEXA im selben Moment decken konnte.
  // heat_samples und samples tragen denselben Zeitstempel (beide kommen aus demselben Push), daher der direkte Join.
  const heatDays = await sql`
    WITH ns AS (SELECT ts, avg(out_w) AS outw, avg(pv_w) AS pv FROM samples WHERE ts > now() - interval '400 days' GROUP BY 1),
    j AS (SELECT h.ts, h.hp_w, greatest(coalesce(ns.outw, 0), 0) AS outw, greatest(coalesce(ns.pv, 0), 0) AS pv
          FROM heat_samples h LEFT JOIN ns USING (ts)
          WHERE h.ts > now() - interval '400 days' AND h.hp_w IS NOT NULL),
    mins AS (
      SELECT date_trunc('minute', ts AT TIME ZONE ${TZ}) AS m, avg(hp_w) AS hp, avg(least(hp_w, outw)) AS solar,
             -- Der vom NEXA gedeckte Teil wird im Verhältnis aufgeteilt, in dem die NEXA-Abgabe in diesem Moment
             -- direkt aus den Modulen kam statt aus der Batterie.
             avg(CASE WHEN outw > 0 THEN least(hp_w, outw) * least(pv, outw) / outw ELSE 0 END) AS direct
      FROM j GROUP BY 1),
    cov AS (SELECT m::date AS day, sum(hp) / 60000.0 AS hp_kwh, sum(solar) / 60000.0 AS solar_kwh,
                   sum(direct) / 60000.0 AS direct_kwh, count(*) AS minutes FROM mins GROUP BY 1)
    SELECT to_char(d.day, 'YYYY-MM-DD') AS day, d.heat_kwh, d.el_kwh, d.spf, cov.hp_kwh, cov.solar_kwh, cov.direct_kwh, cov.minutes
    FROM heat_days d FULL JOIN cov ON cov.day = d.day ORDER BY 1`;

  // Taktung: aus den einzelnen Verdichterläufen die drei Sichten, die die Frage beantworten – wie lang
  // laufen die Takte, bei welcher Außentemperatur passiert das Kurztakten, und wie geht es über die Tage.
  const cycleBuckets = await sql`
    SELECT CASE WHEN minutes < 10 THEN 0 WHEN minutes < 20 THEN 10 WHEN minutes < 30 THEN 20
                WHEN minutes < 60 THEN 30 ELSE 60 END AS lo,
           CASE WHEN mode = 'ww' THEN 'ww' ELSE 'hz' END AS mode, count(*) AS n
    FROM heat_cycles WHERE ts > now() - interval '14 days' GROUP BY 1, 2 ORDER BY 1`;
  const cycleTemp = await sql`
    SELECT floor(t_out / 2) * 2 AS t, count(*) AS n,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes) AS med
    FROM heat_cycles WHERE ts > now() - interval '14 days' AND t_out IS NOT NULL GROUP BY 1 ORDER BY 1`;
  const cycleDays = await sql`
    SELECT to_char((ts AT TIME ZONE ${TZ})::date, 'YYYY-MM-DD') AS day, count(*) AS n,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes) AS med
    FROM heat_cycles WHERE ts > now() - interval '30 days' GROUP BY 1 ORDER BY 1`;

  // Wie viel Energie ein Prozent Ladezustand kostet – gemessen statt angenommen. Über alle Ladephasen
  // hinweg: hineingeflossene Wattstunden geteilt durch den Hub in Prozentpunkten. Darin stecken auch die
  // Ladeverluste, und genau das will man für eine Restzeit wissen: nicht wie viel in der Zelle ankommt,
  // sondern wie viel man oben hineinstecken muss.
  //
  // Wichtig ist, die Energie ÜBER DEN GANZEN Ladezeitraum zu zählen, nicht nur in den Messpunkten, in denen
  // der Ladezustand gerade um ein Prozent springt: er wird nur in ganzen Prozent gemeldet, und zwischen zwei
  // Sprüngen fließt der Großteil der Energie. Wer nur die Sprungmomente zählt, bekommt einen Bruchteil.
  // Ab 99 % zählt nichts mehr, dort fließt Energie ohne dass der Ladezustand noch steigt.
  //
  // Und die Fensterfunktionen müssen nach Gerät getrennt laufen: in samples steht auch eine Handvoll
  // Zeilen eines zweiten "Geräts", und ohne PARTITION BY vergleicht lag() den Ladezustand des einen mit
  // dem des anderen. Das Ergebnis sah plausibel aus und war um den Faktor sieben daneben.
  const battery = await sql`
    WITH dev AS (SELECT device FROM samples WHERE packs IS NOT NULL ORDER BY ts DESC LIMIT 1),
    s AS (
      SELECT ts, soc, bat_w,
             lag(soc) OVER (PARTITION BY device ORDER BY ts) AS prev_soc,
             extract(epoch FROM ts - lag(ts) OVER (PARTITION BY device ORDER BY ts)) AS dt
      FROM samples WHERE ts > now() - interval '90 days' AND device = (SELECT device FROM dev)
    )
    SELECT sum(bat_w * dt / 3600.0)    FILTER (WHERE bat_w > 5 AND dt BETWEEN 10 AND 180 AND soc < 99) AS wh_in,
           sum(greatest(soc - prev_soc, 0)) FILTER (WHERE bat_w > 5 AND dt BETWEEN 10 AND 180 AND soc < 99) AS pct_up
    FROM s`;

  const forecastRow = await sql`SELECT updated, data FROM forecast WHERE id = 1`;
  const roomsRow = await sql`SELECT updated, data FROM rooms WHERE id = 1`;
  // Langzeit: Tagesbilanz je Raum, dazu drei Zeiträume als fertige Kennzahlen. Gerechnet wird in SQL,
  // weil die Website sonst ein Jahr Tageszeilen durch den Browser schieben müsste.
  const roomDays = await sql`
    SELECT to_char(day, 'YYYY-MM-DD') AS day, room, min_c, max_c,
           CASE WHEN n > 0 THEN sum_c / n END AS avg_c,
           CASE WHEN n_hum > 0 THEN sum_hum / n_hum END AS avg_hum,
           n, below_n, hum60_n
    FROM room_days WHERE day >= date_trunc('year', now() AT TIME ZONE ${TZ})::date ORDER BY day, room`;
  const roomPeriods = await sql`
    WITH p AS (
      SELECT 'today' AS period, * FROM room_days WHERE day = (now() AT TIME ZONE ${TZ})::date
      UNION ALL SELECT 'month', * FROM room_days WHERE day >= date_trunc('month', now() AT TIME ZONE ${TZ})::date
      UNION ALL SELECT 'year', * FROM room_days WHERE day >= date_trunc('year', now() AT TIME ZONE ${TZ})::date
    )
    SELECT period, room, min(min_c) AS min_c, max(max_c) AS max_c,
           sum(sum_c) / nullif(sum(n), 0) AS avg_c,
           sum(sum_hum) / nullif(sum(n_hum), 0) AS avg_hum,
           sum(below_n)::float / nullif(sum(n), 0) AS below_share,
           sum(hum60_n)::float / nullif(sum(n_hum), 0) AS hum60_share,
           sum(n) AS n, count(DISTINCT day) AS days
    FROM p GROUP BY period, room`;
  // Wie oft ein Raum der kälteste des Tages war – das trifft den chronischen Problemraum besser als ein Mittel
  const roomColdest = await sql`
    WITH d AS (
      SELECT day, room, sum_c / nullif(n, 0) AS avg_c FROM room_days
      WHERE day >= date_trunc('year', now() AT TIME ZONE ${TZ})::date AND n > 0
    ), r AS (
      SELECT day, room, avg_c,
             rank() OVER (PARTITION BY day ORDER BY avg_c ASC) AS cold,
             rank() OVER (PARTITION BY day ORDER BY avg_c DESC) AS warm
      FROM d
    )
    SELECT room, count(*) FILTER (WHERE cold = 1) AS cold_days, count(*) FILTER (WHERE warm = 1) AS warm_days
    FROM r GROUP BY room`;
  const roomSeries = await sql`
    SELECT to_timestamp(floor(extract(epoch FROM ts) / ${range.bucket}) * ${range.bucket}) AS t, room,
           avg(temp_c) AS temp, avg(setpoint_c) AS setp, avg(humidity_pct) AS hum
    FROM room_samples WHERE ts > now() - make_interval(secs => ${range.seconds}) GROUP BY 1, 2 ORDER BY 1`;

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
    daily: daily.map((d) => ({ day: d.day, pv_kwh: num(d.pv_kwh), out_kwh: num(d.out_kwh), acin_kwh: num(d.acin_kwh), direct_kwh: num(d.direct_kwh), charge_kwh: num(d.charge_kwh), discharge_kwh: num(d.discharge_kwh),
                               grid_kwh: num(d.grid_kwh), feedin_kwh: num(d.feedin_kwh), house_kwh: num(d.house_kwh) })),
    today: todayRow ? { pv_kwh: num(todayRow.pv_kwh), out_kwh: num(todayRow.out_kwh), acin_kwh: num(todayRow.acin_kwh), direct_kwh: num(todayRow.direct_kwh), charge_kwh: num(todayRow.charge_kwh), discharge_kwh: num(todayRow.discharge_kwh),
                        grid_kwh: num(todayRow.grid_kwh), feedin_kwh: num(todayRow.feedin_kwh), house_kwh: num(todayRow.house_kwh) } : null,
    totals: totals[0] ? { pv_kwh: num(totals[0].pv_kwh), out_kwh: num(totals[0].out_kwh), since: totals[0].since } : null,
    periods: periods[0] ? {
      month: { out_kwh: num(periods[0].out_month), acin_kwh: num(periods[0].acin_month), grid_kwh: num(periods[0].grid_month), feedin_kwh: num(periods[0].feedin_month) },
      year: { out_kwh: num(periods[0].out_year), acin_kwh: num(periods[0].acin_year), grid_kwh: num(periods[0].grid_year), feedin_kwh: num(periods[0].feedin_year) },
      total: { out_kwh: num(periods[0].out_total), acin_kwh: num(periods[0].acin_total), grid_kwh: num(periods[0].grid_total), feedin_kwh: num(periods[0].feedin_total), days: Number(periods[0].days), since: periods[0].since },
    } : null,
    tariff: tariff[0] ? { price_ct_kwh: num(tariff[0].price_ct_kwh), feedin_ct_kwh: num(tariff[0].feedin_ct_kwh) ?? 0, system_cost_eur: num(tariff[0].system_cost_eur) ?? 0, currency: tariff[0].currency || "EUR", updated: tariff[0].updated } : null,
    site: site[0] ? { name: site[0].name, lat: num(site[0].lat), lon: num(site[0].lon), strings: site[0].strings || {}, fit: site[0].fit || null, advice: site[0].advice || null, assumed: site[0].assumed || {}, names: site[0].names || {}, updated: site[0].updated } : null,
    day: { key: day, start: dayBounds[0].start, end: dayBounds[0].end, today: todayKey },
    string_peaks: peaks.map((r) => ({ day: String(r.day), string: Number(r.string), t: r.ts, w: num(r.p) })),
    strings_day: stringsDay.map((r) => ({ t: r.t, s1: num(r.s1), s2: num(r.s2), s3: num(r.s3), s4: num(r.s4), pv: num(r.pv) })),
    heat: heat.map((r) => ({ day: String(r.day), hour: Number(r.hour), s1: num(r.s1), s2: num(r.s2), s3: num(r.s3), s4: num(r.s4), pv: num(r.pv) })),
    alltime: { since: a?.since ?? null, days: a ? Number(a.days) : 0, minutes: a ? Number(a.minutes) : 0, total: allOf(0), strings: Object.fromEntries([1, 2, 3, 4].map((i) => [String(i), allOf(i)])) },
    calendar: { year, years: years.map((r) => Number(r.y)), days: calDays.map((r) => ({ day: String(r.day), pv_kwh: num(r.pv_kwh), out_kwh: num(r.out_kwh), acin_kwh: num(r.acin_kwh), charge_kwh: num(r.charge_kwh), discharge_kwh: num(r.discharge_kwh), grid_kwh: num(r.grid_kwh), house_kwh: num(r.house_kwh), minutes: Number(r.minutes), peak_w: num(r.peak_w), peak_t: r.peak_t })) },
    string_rank: rank.map((r) => ({ string: Number(r.string), kwh_24h: num(r.kwh_24h), kwh_7d: num(r.kwh_7d), kwh_30d: num(r.kwh_30d) })),
    model_day: modelDay.map((r) => ({ t: r.t, string: Number(r.string), gti: num(r.gti), expected_w: num(r.expected_w) })),
    shelly: shelly[0] ? { updated: shelly[0].updated, grid_w: num(shelly[0].grid_w), household_w: num(shelly[0].household_w), out_w: num(shelly[0].out_w), target_w: num(shelly[0].target_w), setpoint_w: num(shelly[0].setpoint_w), ok: shelly[0].ok, enabled: shelly[0].enabled, host: shelly[0].host,
                          limited: shelly[0].limited ?? null, reason: shelly[0].reason ?? null, soc: num(shelly[0].soc), soc_limit: num(shelly[0].soc_limit), max_w: num(shelly[0].max_w) } : null,
    heatpump: heatState[0] || heatDays.length ? {
      updated: heatState[0]?.updated ?? null,
      state: (heatState[0]?.state as Record<string, unknown>) ?? null,
      series: heatSeries.map((r) => ({ t: r.t, hp: num(r.hp), heat: num(r.heat), flow: num(r.flow), ret: num(r.ret), dhw: num(r.dhw), outside: num(r.outside), freq: num(r.freq) })),
      days: heatDays.map((r) => ({ day: String(r.day), heat_kwh: num(r.heat_kwh), el_kwh: num(r.el_kwh), spf: num(r.spf),
                                   hp_kwh: num(r.hp_kwh), solar_kwh: num(r.solar_kwh), direct_kwh: num(r.direct_kwh),
                                   minutes: r.minutes == null ? 0 : Number(r.minutes) })),
      cycles: {
        buckets: cycleBuckets.map((r) => ({ lo: Number(r.lo), mode: String(r.mode), n: Number(r.n) })),
        temp: cycleTemp.map((r) => ({ t: Number(r.t), n: Number(r.n), med: num(r.med) })),
        days: cycleDays.map((r) => ({ day: String(r.day), n: Number(r.n), med: num(r.med) })),
      },
    } : null,
    battery: (() => {
      const wh = num(battery[0]?.wh_in), pct = num(battery[0]?.pct_up);
      // Unter 40 Prozentpunkten beobachtetem Hub ist die Zahl noch zu zufällig, um eine Restzeit darauf zu stützen
      if (wh == null || pct == null || pct < 40 || wh <= 0) return { wh_per_pct: null, pct_observed: pct ?? 0 };
      return { wh_per_pct: Math.round((wh / pct) * 10) / 10, pct_observed: Math.round(pct), kwh: Math.round(wh / pct * 100) / 1000 };
    })(),
    forecast: forecastRow[0] ? { ...(forecastRow[0].data as Record<string, unknown>), stored: forecastRow[0].updated } : null,
    rooms: roomsRow[0] ? {
      updated: roomsRow[0].updated,
      rooms: roomsRow[0].data as Record<string, unknown>,
      series: roomSeries.map((r) => ({ t: r.t, room: String(r.room), temp: num(r.temp), setp: num(r.setp), hum: num(r.hum) })),
      days: roomDays.map((r) => ({ day: String(r.day), room: String(r.room), min: num(r.min_c), max: num(r.max_c),
                                   avg: num(r.avg_c), hum: num(r.avg_hum), n: Number(r.n),
                                   below: Number(r.below_n), hum60: Number(r.hum60_n) })),
      periods: roomPeriods.map((r) => ({ period: String(r.period), room: String(r.room), min: num(r.min_c), max: num(r.max_c),
                                         avg: num(r.avg_c), hum: num(r.avg_hum), below_share: num(r.below_share),
                                         hum60_share: num(r.hum60_share), n: Number(r.n), days: Number(r.days) })),
      ranks: roomColdest.map((r) => ({ room: String(r.room), cold_days: Number(r.cold_days), warm_days: Number(r.warm_days) })),
    } : null,
    weather: {
      current: wcur[0] ? { ...wcur[0], id: undefined } : null,
      forecast: wfc.map((f) => ({ t: f.t, shortwave_radiation: num(f.shortwave_radiation), cloud_cover: num(f.cloud_cover), temperature: num(f.temperature), weather_code: f.weather_code })),
      history: whist.map((h) => ({ t: h.t, radiation: num(h.radiation), cloud: num(h.cloud), temp: num(h.temp) })),
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
