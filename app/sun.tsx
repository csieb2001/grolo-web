"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { compass, polar, sunPath, sunPosition } from "@/lib/solar";

export type SunData = {
  site: { name: string | null; lat: number | null; lon: number | null; strings: Record<string, { tilt?: number | null; azimuth?: number | null; wp?: number | null }>;
          fit?: { updated: number; days: number; strings: Record<string, { status: string; azimuth?: number; tilt?: number; wp?: number; r2?: number; hours?: number; az_range?: number[]; tilt_range?: number[]; peak_w?: number }> } | null;
          assumed?: Record<string, { tilt?: number; azimuth?: number; wp?: number; source?: string }>;
          advice?: Advice | null } | null;
  day: { key: string; start: string; end: string; today: string };
  string_peaks: { day: string; string: number; t: string; w: number | null }[];
  strings_day: { t: string; s1: number | null; s2: number | null; s3: number | null; s4: number | null; pv: number | null }[];
  heat: { day: string; hour: number; s1: number | null; s2: number | null; s3: number | null; s4: number | null; pv: number | null }[];
  model_day: { t: string; string: number; gti: number | null; expected_w: number | null }[];
};

export type Advice = {
  updated: number; period: string[]; site_best: { tilt: number; azimuth: number; kwh_kwp: number }; free_inputs: number;
  strings: Record<string, { basis: "config" | "fit" | null; unused?: boolean; tilt?: number; azimuth?: number; kwh_kwp?: number; pct_of_best?: number | null;
    best?: { tilt: number; azimuth: number; kwh_kwp: number; gain_pct: number | null }; same_azimuth?: { tilt: number; kwh_kwp: number; gain_pct: number | null };
    vertical?: { azimuth: number; kwh_kwp: number; gain_pct: number | null }; flat?: { kwh_kwp: number; gain_pct: number | null };
    winter_share_pct?: number; best_winter_share_pct?: number; peak_w?: number; wp_eff?: number;
    shading?: { az_from: number; az_to: number; ratio: number; hours: number; time_from: string | null; time_to: string | null }[]; shading_loss_pct?: number; ratio_median?: number | null }>;
};
const TZ = "Europe/Berlin";
export const STRING_COLORS = ["#f2cc0c", "#ff9830", "#8ab8ff", "#b877d9"];
const L = {
  en: { title: "Strings and sun", peakToday: "Peak", at: "at", free: "free", noPeak: "no peak yet", sunpath: "Sun path and daily peaks", legendPeaks: "dot = daily peak of a string (size = power), square = panel orientation",
        solstice: "21 Jun", winter: "21 Dec", equinox: "equinox", selected: "selected day", sunNow: "Sun", azimuth: "azimuth", elevation: "elevation", belowHorizon: "below the horizon",
        play: "Play day", pause: "Pause", now: "Now", prev: "previous day", next: "next day", today: "today", noLocation: "No location yet. Choose the place on the GroLo settings page (Location and panels), then the sun path appears here.",
        dayChart: "Measured vs. expected", expected: "expected", measured: "measured", noModel: "For the expected curve enter tilt, azimuth and Wp per string on the GroLo settings page.",
        heat: "Hour × day per string (30 days)", heatHint: "Row = day (click to select), column = hour. Brightness = mean power.", total: "Total", string: "String", peaks30: "Daily peaks (30 days)",
        model: "Model", panels: "Panels", tilt: "tilt", noStrings: "no panels configured",
        fit: "Estimated orientation", fitFrom: "from measurements", fitOk: "good", fitUncertain: "uncertain", fitInsufficient: "not determinable yet", fitUnused: "no panel", fitHours: "sunny hours",
        fitHint: "Estimated once a day by the GroLo stack from the hourly curves of the last 30 days against the irradiance model; apply it on the settings page.", fitNone: "no estimate yet", legendFit: "hollow diamond = estimated orientation",
        assumedLabel: "assumed", expectedAssumed: "Expected curve uses an assumed orientation", fromFit: "from the estimate", fromSiteBest: "site optimum", untilConfigured: "until you enter the panels on the settings page",
        advice: "Recommendations from the data", adviceBasisConfig: "configured", adviceBasisFit: "estimated", advYear: "kWh per kWp and year", advOfBest: "of the site optimum", advOptimum: "Site optimum",
        advSameAz: "Same direction, tilt", advVertical: "Vertical (balcony) facing", advFlat: "Flat", advWinter: "winter share", advLever: "Biggest lever", advFine: "Orientation is close to the optimum, nothing to gain by moving the panels.",
        advShade: "Shading", advShadeText: "between {from} and {to} (sun at {a}–{b}°) only {r} % of the expected power, loss about {loss} % of the sunny-hour energy. Look for an obstacle in that direction.",
        advNoShade: "No recurring shading found in the last 30 days.", advNoBasis: "Orientation unknown, enter it on the settings page or wait for the estimate.", advFree: "{n} of 4 inputs free: another string, e.g. facing {dir}, would use them.",
        advFewData: "shading check needs more sunny hours", advPeriod: "Year model" },
  de: { title: "Strings und Sonne", peakToday: "Spitze", at: "um", free: "frei", noPeak: "noch keine Spitze", sunpath: "Sonnenbahn und Tagesspitzen", legendPeaks: "Punkt = Tagesspitze eines Strings (Größe = Leistung), Quadrat = Modulausrichtung",
        solstice: "21. Jun", winter: "21. Dez", equinox: "Tagundnachtgleiche", selected: "gewählter Tag", sunNow: "Sonne", azimuth: "Azimut", elevation: "Höhe", belowHorizon: "unter dem Horizont",
        play: "Tag abspielen", pause: "Pause", now: "Jetzt", prev: "Vortag", next: "Folgetag", today: "heute", noLocation: "Noch kein Standort. Auf der GroLo-Einstellungsseite (Standort und Module) den Ort wählen, dann erscheint hier die Sonnenbahn.",
        dayChart: "Gemessen vs. erwartet", expected: "erwartet", measured: "gemessen", noModel: "Für die Erwartungskurve auf der GroLo-Einstellungsseite Neigung, Azimut und Wp je String eintragen.",
        heat: "Stunde × Tag je String (30 Tage)", heatHint: "Zeile = Tag (anklicken wählt ihn aus), Spalte = Stunde. Helligkeit = mittlere Leistung.", total: "Gesamt", string: "String", peaks30: "Tagesspitzen (30 Tage)",
        model: "Modell", panels: "Module", tilt: "Neigung", noStrings: "keine Module konfiguriert",
        fit: "Geschätzte Ausrichtung", fitFrom: "aus Messdaten", fitOk: "gut", fitUncertain: "unsicher", fitInsufficient: "noch nicht bestimmbar", fitUnused: "kein Modul", fitHours: "Sonnenstunden",
        fitHint: "Der GroLo-Stack schätzt täglich aus den Stundenkurven der letzten 30 Tage gegen das Einstrahlungsmodell; übernehmen auf der Einstellungsseite.", fitNone: "noch keine Schätzung", legendFit: "hohle Raute = geschätzte Ausrichtung",
        assumedLabel: "angenommen", expectedAssumed: "Erwartungskurve mit angenommener Ausrichtung", fromFit: "aus der Schätzung", fromSiteBest: "Standortoptimum", untilConfigured: "bis du die Module auf der Einstellungsseite einträgst",
        advice: "Empfehlungen aus den Daten", adviceBasisConfig: "konfiguriert", adviceBasisFit: "geschätzt", advYear: "kWh je kWp und Jahr", advOfBest: "des Standortoptimums", advOptimum: "Optimum am Standort",
        advSameAz: "Gleiche Richtung, Neigung", advVertical: "Senkrecht (Balkon) nach", advFlat: "Flach", advWinter: "Winteranteil", advLever: "Größter Hebel", advFine: "Die Ausrichtung liegt nahe am Optimum, Umbauen bringt nichts.",
        advShade: "Verschattung", advShadeText: "zwischen {from} und {to} Uhr (Sonne bei {a}–{b}°) nur {r} % der erwarteten Leistung, Verlust etwa {loss} % der Sonnenstunden-Energie. In dieser Richtung nach einem Hindernis schauen.",
        advNoShade: "Keine wiederkehrende Verschattung in den letzten 30 Tagen gefunden.", advNoBasis: "Ausrichtung unbekannt, auf der Einstellungsseite eintragen oder die Schätzung abwarten.", advFree: "{n} von 4 Eingängen frei: ein weiterer String, z. B. nach {dir}, würde sie nutzen.",
        advFewData: "Verschattungsprüfung braucht mehr Sonnenstunden", advPeriod: "Jahresmodell" },
};

const fmtW = (w: number | null | undefined) => w == null ? "–" : Math.abs(w) < 1000 ? `${w.toFixed(0)} W` : `${(w / 1000).toFixed(2)} kW`;

export function SunSection({ d, lang, fmtDate, setDay }: { d: SunData; lang: "de" | "en"; fmtDate: (iso: string) => string; setDay: (key: string) => void }) {
  const t = L[lang];
  const locale = lang === "de" ? "de-DE" : "en-GB";
  const lat = d.site?.lat ?? null, lon = d.site?.lon ?? null;
  const dayStart = new Date(d.day.start).getTime();
  const isToday = d.day.key === d.day.today;
  const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", timeZone: TZ });

  // ---- Tages-Slider (Minuten seit Tagesbeginn), Autoplay
  const [minute, setMinute] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => { setMinute(null); setPlaying(false); }, [d.day.key]);
  useEffect(() => {
    if (!playing) { if (timer.current) clearInterval(timer.current); timer.current = null; return; }
    timer.current = setInterval(() => setMinute((m) => { const n = (m ?? 240) + 5; if (n >= 1440) { setPlaying(false); return 1435; } return n; }), 120);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing]);
  const nowMs = Date.now();
  const curMs = minute != null ? dayStart + minute * 60000 : isToday ? nowMs : dayStart + 12 * 3600000;
  const sun = lat != null && lon != null ? sunPosition(curMs, lat, lon) : null;

  // ---- Strings: konfiguriert oder mit Messwerten
  const strings = useMemo(() => {
    const cfg = d.site?.strings || {};
    const active = new Set<number>();
    for (const p of d.string_peaks) active.add(p.string);
    for (const k of Object.keys(cfg)) active.add(Number(k));
    for (const r of d.strings_day) [1, 2, 3, 4].forEach((i) => { const v = (r as Record<string, number | null | string>)[`s${i}`]; if (typeof v === "number" && v > 5) active.add(i); });
    return [1, 2, 3, 4].filter((i) => active.has(i));
  }, [d]);
  const cfgOf = (i: number) => d.site?.strings?.[String(i)];

  // ---- Leistung je String zum Slider-Zeitpunkt (nächster 5-Minuten-Wert)
  const powerAt = (i: number, ms: number) => {
    let best: { dt: number; v: number | null } | null = null;
    for (const r of d.strings_day) { const dt = Math.abs(new Date(r.t).getTime() + 150000 - ms); if (best == null || dt < best.dt) best = { dt, v: (r as Record<string, number | null | string>)[`s${i}`] as number | null }; }
    return best && best.dt <= 300000 ? best.v : null;
  };
  const expectedAt = (i: number, ms: number) => {
    const rows = d.model_day.filter((m) => m.string === i && m.expected_w != null).map((m) => ({ ms: new Date(m.t).getTime(), v: m.expected_w as number })).sort((a, b) => a.ms - b.ms);
    if (rows.length < 2) return null;
    for (let k = 0; k < rows.length - 1; k++) if (ms >= rows[k].ms && ms <= rows[k + 1].ms) { const f = (ms - rows[k].ms) / (rows[k + 1].ms - rows[k].ms); return rows[k].v + f * (rows[k + 1].v - rows[k].v); }
    return null;
  };
  const dayMax = Math.max(10, ...d.strings_day.flatMap((r) => [r.s1, r.s2, r.s3, r.s4].map((v) => v ?? 0)));

  // ---- Sonnenbahn-Diagramm
  const W = 420, cx = 210, cy = 210, R = 180;
  const year = new Date(curMs).getFullYear();
  const midnightUtc = (m: number, day: number) => new Date(Date.UTC(year, m, day, 0, 0)).getTime() - 2 * 3600000; // ≈ lokale Mitternacht MESZ, für die Referenzbahnen ausreichend
  const paths = useMemo(() => {
    if (lat == null || lon == null) return null;
    const mk = (start: number) => sunPath(start, lat, lon, 10, 0).map((p) => polar(p.azimuth, p.elevation, cx, cy, R));
    const sel = sunPath(dayStart, lat, lon, 10, 0);
    return { summer: mk(midnightUtc(5, 21)), winter: mk(midnightUtc(11, 21)), equinox: mk(midnightUtc(2, 20)), sel, selPts: sel.map((p) => polar(p.azimuth, p.elevation, cx, cy, R)) };
  }, [lat, lon, dayStart, year]);
  const poly = (pts: { x: number; y: number }[]) => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const maxPeak = Math.max(1, ...d.string_peaks.map((p) => p.w ?? 0));
  const peakDots = useMemo(() => {
    if (lat == null || lon == null) return [];
    return d.string_peaks.map((p) => { const ms = new Date(p.t).getTime(); const s = sunPosition(ms, lat, lon); return { ...p, ms, ...s, ...polar(s.azimuth, s.elevation, cx, cy, R) }; }).filter((p) => p.elevation > 0);
  }, [d.string_peaks, lat, lon]);
  const peaksToday = strings.map((i) => d.string_peaks.find((p) => p.string === i && p.day === d.day.key));
  const dirs = lang === "de" ? ["N", "O", "S", "W"] : ["N", "E", "S", "W"];

  // ---- Tagesdiagramm gemessen vs. erwartet
  const chart = useMemo(() => {
    const map = new Map<number, Record<string, number | string | null>>();
    for (const r of d.strings_day) { const ms = new Date(r.t).getTime(); map.set(ms, { ms, label: fmtTime(ms), s1: r.s1, s2: r.s2, s3: r.s3, s4: r.s4 }); }
    for (const m of d.model_day) {
      if (m.expected_w == null) continue;
      const ms = Math.round(new Date(m.t).getTime() / 300000) * 300000;
      if (ms < dayStart || ms >= dayStart + 86400000) continue;
      const row = map.get(ms) || { ms, label: fmtTime(ms) }; row[`e${m.string}`] = m.expected_w; map.set(ms, row);
    }
    return [...map.values()].sort((a, b) => (a.ms as number) - (b.ms as number));
  }, [d.strings_day, d.model_day, dayStart, locale]);
  const hasModel = d.model_day.some((m) => m.expected_w != null);

  // ---- Heatmap Stunde × Tag
  const [metric, setMetric] = useState<"pv" | 1 | 2 | 3 | 4>("pv");
  const heat = useMemo(() => {
    const days = [...new Set(d.heat.map((h) => h.day))].sort().reverse().slice(0, 30);
    const key = metric === "pv" ? "pv" : `s${metric}`;
    const val = (h: SunData["heat"][number]) => (h as Record<string, number | null | string>)[key] as number | null;
    const hoursWithData = d.heat.filter((h) => (val(h) ?? 0) > 2).map((h) => h.hour);
    const h0 = hoursWithData.length ? Math.max(0, Math.min(...hoursWithData) - 1) : 5, h1 = hoursWithData.length ? Math.min(23, Math.max(...hoursWithData) + 1) : 21;
    const hours = Array.from({ length: h1 - h0 + 1 }, (_, k) => h0 + k);
    const max = Math.max(1, ...d.heat.map((h) => val(h) ?? 0));
    const cell = new Map(d.heat.map((h) => [`${h.day}|${h.hour}`, val(h)]));
    return { days, hours, max, cell };
  }, [d.heat, metric]);
  const heatColor = metric === "pv" ? "242,204,12" : ["242,204,12", "255,152,48", "138,184,255", "184,119,217"][metric - 1];
  const shift = (n: number) => { const dt = new Date(dayStart + 12 * 3600000 + n * 86400000); setDay(dt.toLocaleDateString("sv-SE", { timeZone: TZ })); };

  return (
    <section>
      <h2>{t.title}</h2>
      <div className="tiles" style={{ marginBottom: 14 }}>
        {strings.length === 0 && <div className="muted">{t.noStrings}</div>}
        {strings.map((i, k) => { const p = peaksToday[k]; const c = cfgOf(i); return (
          <div className="tile" key={i}><div className="k">{t.string} {i} · {t.peakToday} {isToday ? t.today : fmtDate(d.day.start)}</div>
            <div className="v" style={{ color: STRING_COLORS[i - 1] }}>{p ? fmtW(p.w) : "–"}</div>
            <div className="s">{p ? `${t.at} ${fmtTime(new Date(p.t).getTime())}${lat != null && lon != null ? ` · ${t.sunNow} ${compass(sunPosition(new Date(p.t).getTime(), lat, lon).azimuth, lang)} ${sunPosition(new Date(p.t).getTime(), lat, lon).elevation.toFixed(0)}°` : ""}` : t.noPeak}
              {c?.tilt != null && c?.azimuth != null ? ` · ${t.panels}: ${compass(Number(c.azimuth), lang)} ${Number(c.azimuth).toFixed(0)}° / ${t.tilt} ${Number(c.tilt).toFixed(0)}°${c.wp ? ` / ${Number(c.wp).toFixed(0)} Wp` : ""}` : ""}</div></div>); })}
      </div>

      {d.site?.fit && (() => { const f = d.site!.fit!; const rows = strings.map((i) => [i, f.strings?.[String(i)]] as const).filter(([, v]) => v && v.status !== "unused");
        return rows.length ? <div className="fitrow"><span className="muted">{t.fit} {t.fitFrom} · {new Date(f.updated * 1000).toLocaleDateString(locale, { day: "2-digit", month: "2-digit", timeZone: TZ })} · {f.days} d</span>
          {rows.map(([i, v]) => <span key={i} className="fitchip" style={{ borderColor: STRING_COLORS[i - 1] }}><b style={{ color: STRING_COLORS[i - 1] }}>{t.string} {i}</b>{" "}
            {v!.status === "insufficient" ? `${t.fitInsufficient} (${v!.hours ?? 0} ${t.fitHours})` : `${compass(v!.azimuth!, lang)} ${v!.azimuth}° / ${t.tilt} ${v!.tilt}° / ${v!.wp} Wp · R² ${v!.r2?.toFixed(2)} (${v!.status === "ok" ? t.fitOk : t.fitUncertain}, ${v!.hours} ${t.fitHours})`}</span>)}
          <span className="muted" style={{ fontSize: 11 }}>{t.fitHint}</span></div> : null; })()}
      <div className="sunwrap">
        <div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>{t.sunpath} · {d.site?.name || (lat != null ? `${lat.toFixed(3)}, ${lon?.toFixed(3)}` : "")}</div>
          {lat == null || lon == null || !paths ? <div className="muted" style={{ padding: 20 }}>{t.noLocation}</div> : (
            <svg viewBox={`0 0 ${W} ${W}`} className="sunpath" role="img">
              <defs><radialGradient id="sky" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#1f2a3a" /><stop offset="100%" stopColor="#14171c" /></radialGradient>
                <filter id="glow"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
              <circle cx={cx} cy={cy} r={R} fill="url(#sky)" stroke="#3a4046" />
              {[30, 60].map((el) => <circle key={el} cx={cx} cy={cy} r={(R * (90 - el)) / 90} fill="none" stroke="#2c3235" strokeDasharray="3 3" />)}
              {[30, 60].map((el) => <text key={el} x={cx + 3} y={cy - (R * (90 - el)) / 90 - 3} fill="#5d6368" fontSize="9">{el}°</text>)}
              <line x1={cx} y1={cy - R} x2={cx} y2={cy + R} stroke="#2c3235" /><line x1={cx - R} y1={cy} x2={cx + R} y2={cy} stroke="#2c3235" />
              {dirs.map((n, k) => { const a = k * 90; const p = polar(a, -6, cx, cy, R); return <text key={n} x={p.x} y={p.y + 4} textAnchor="middle" fill="#8e8e8e" fontSize="12" fontWeight={600}>{n}</text>; })}
              <polyline points={poly(paths.summer)} fill="none" stroke="#6b7078" strokeDasharray="5 4" strokeWidth={1} />
              <polyline points={poly(paths.winter)} fill="none" stroke="#6b7078" strokeDasharray="5 4" strokeWidth={1} />
              <polyline points={poly(paths.equinox)} fill="none" stroke="#4d5259" strokeDasharray="2 3" strokeWidth={1} />
              <polyline points={poly(paths.selPts)} fill="none" stroke="#f2cc0c" strokeWidth={1.8} opacity={0.9} />
              {paths.sel.filter((p) => new Date(p.ms).getUTCMinutes() === 0 && p.elevation > 0).map((p) => { const q = polar(p.azimuth, p.elevation, cx, cy, R); const h = Number(new Date(p.ms).toLocaleTimeString("en-GB", { hour: "2-digit", hour12: false, timeZone: TZ }));
                return <g key={p.ms}><circle cx={q.x} cy={q.y} r={2} fill="#f2cc0c" />{h % 2 === 0 && <text x={q.x} y={q.y - 5} textAnchor="middle" fill="#c9b04a" fontSize="8">{h}</text>}</g>; })}
              {strings.map((i) => { const c = cfgOf(i); if (c?.tilt == null || c?.azimuth == null) return null; const q = polar(Number(c.azimuth), 90 - Number(c.tilt), cx, cy, R);
                return <g key={i}><rect x={q.x - 5} y={q.y - 5} width={10} height={10} fill={STRING_COLORS[i - 1]} stroke="#fff" strokeWidth={1} transform={`rotate(45 ${q.x} ${q.y})`} /><text x={q.x + 8} y={q.y + 4} fill={STRING_COLORS[i - 1]} fontSize="9">S{i}</text><title>{t.string} {i}: {Number(c.azimuth).toFixed(0)}° / {Number(c.tilt).toFixed(0)}°</title></g>; })}
              {strings.map((i) => { const v = d.site?.fit?.strings?.[String(i)]; if (!v || v.status !== "ok" && v.status !== "uncertain" || v.azimuth == null || v.tilt == null) return null; const q = polar(v.azimuth, 90 - v.tilt, cx, cy, R);
                return <g key={`fit${i}`}><rect x={q.x - 6} y={q.y - 6} width={12} height={12} fill="none" stroke={STRING_COLORS[i - 1]} strokeWidth={1.5} strokeDasharray={v.status === "ok" ? undefined : "2 2"} transform={`rotate(45 ${q.x} ${q.y})`} /><title>{t.fit} {t.string} {i}: {v.azimuth}° / {v.tilt}° (R² {v.r2?.toFixed(2)})</title></g>; })}
              {peakDots.map((p) => <circle key={`${p.day}-${p.string}`} cx={p.x} cy={p.y} r={2.5 + 6 * ((p.w ?? 0) / maxPeak)} fill={STRING_COLORS[p.string - 1]} fillOpacity={p.day === d.day.key ? 1 : 0.55} stroke={p.day === d.day.key ? "#fff" : "none"} strokeWidth={1}>
                <title>{t.string} {p.string} · {fmtDate(p.t)} {fmtTime(p.ms)} · {fmtW(p.w)} · {t.azimuth} {p.azimuth.toFixed(0)}°, {t.elevation} {p.elevation.toFixed(0)}°</title></circle>)}
              {sun && (() => { const q = polar(sun.azimuth, sun.elevation, cx, cy, R); const up = sun.elevation > 0; return (
                <g><circle cx={q.x} cy={q.y} r={up ? 9 : 6} fill={up ? "#ffe066" : "#3a3f46"} stroke={up ? "#fff3b0" : "#5d6368"} strokeWidth={1.5} filter={up ? "url(#glow)" : undefined} />
                  <title>{t.sunNow} {fmtTime(curMs)}: {t.azimuth} {sun.azimuth.toFixed(0)}° ({compass(sun.azimuth, lang)}), {t.elevation} {sun.elevation.toFixed(1)}°</title></g>); })()}
            </svg>)}
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>— {t.selected} · ╌ {t.solstice} / {t.winter} · ··· {t.equinox} · {t.legendPeaks} · {t.legendFit}</div>
        </div>

        <div>
          <div className="dayctl">
            <button onClick={() => shift(-1)} title={t.prev}>‹</button>
            <strong>{fmtDate(d.day.start)}{isToday ? ` (${t.today})` : ""}</strong>
            <button onClick={() => shift(1)} disabled={isToday} title={t.next}>›</button>
            <span className="spacer" />
            <button className={playing ? "on" : ""} onClick={() => { if (!playing && (minute == null || minute >= 1435)) setMinute(240); setPlaying(!playing); }}>{playing ? `⏸ ${t.pause}` : `▶ ${t.play}`}</button>
            {isToday && minute != null && <button onClick={() => { setPlaying(false); setMinute(null); }}>{t.now}</button>}
          </div>
          <input type="range" min={0} max={1435} step={5} value={minute ?? Math.min(1435, Math.floor((curMs - dayStart) / 60000))} onChange={(e) => { setPlaying(false); setMinute(Number(e.target.value)); }} style={{ width: "100%" }} />
          <div className="muted" style={{ fontSize: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--text)", fontWeight: 600 }}>{fmtTime(curMs)}</span>
            {sun && <span>{t.sunNow}: {sun.elevation > 0 ? `${t.azimuth} ${sun.azimuth.toFixed(0)}° (${compass(sun.azimuth, lang)}), ${t.elevation} ${sun.elevation.toFixed(1)}°` : t.belowHorizon}</span>}
          </div>
          <div className="stringcards">
            {strings.map((i) => { const p = powerAt(i, curMs); const e = expectedAt(i, curMs); const a = Math.min(1, Math.max(0, (p ?? 0) / dayMax)); const rgb = heatColorOf(i);
              return <div key={i} className="scard" style={{ background: `rgba(${rgb}, ${0.06 + 0.6 * a})`, borderColor: `rgba(${rgb}, ${0.3 + 0.7 * a})`, boxShadow: a > 0.05 ? `0 0 ${20 * a}px rgba(${rgb}, ${0.6 * a})` : "none" }}>
                <div className="k">{t.string} {i}</div><div className="v">{p == null ? "–" : fmtW(p)}</div>{e != null && <div className="s">{t.expected} {fmtW(e)}</div>}</div>; })}
          </div>
          <div className="muted" style={{ fontSize: 12, margin: "10px 0 2px" }}>{t.dayChart}{!hasModel ? ` · ${t.noModel}` : ""}
            {hasModel && strings.some((i) => d.site?.assumed?.[String(i)] && !cfgOf(i)) && ` · ${t.expectedAssumed} (${strings.filter((i) => d.site?.assumed?.[String(i)] && !cfgOf(i)).map((i) => { const a = d.site!.assumed![String(i)]; return `${t.string} ${i}: ${compass(Number(a.azimuth), lang)} ${a.azimuth}° / ${a.tilt}° / ${a.wp} Wp, ${a.source === "fit" ? t.fromFit : t.fromSiteBest}`; }).join("; ")}) ${t.untilConfigured}`}</div>
          <div style={{ height: 210 }}><ResponsiveContainer><LineChart data={chart}><CartesianGrid stroke="#2c3235" />
            <XAxis dataKey="ms" type="number" domain={[dayStart, dayStart + 86400000]} ticks={Array.from({ length: 9 }, (_, k) => dayStart + k * 3 * 3600000)} tickFormatter={(v) => fmtTime(Number(v))} stroke="#8e8e8e" fontSize={11} />
            <YAxis stroke="#8e8e8e" fontSize={11} unit=" W" /><Tooltip contentStyle={{ background: "#1c1f24", border: "1px solid #2c3235", fontSize: 12 }} formatter={(v) => fmtW(Number(v))} labelFormatter={(v) => fmtTime(Number(v))} /><Legend />
            {curMs >= dayStart && curMs <= dayStart + 86400000 && <ReferenceLine x={curMs} stroke="#fff" strokeDasharray="3 3" label={{ value: minute != null ? fmtTime(curMs) : `${t.now} ${fmtTime(curMs)}`, position: "insideTopLeft", fill: "#d8d9da", fontSize: 11 }} />}
            {strings.map((i) => <Line key={`s${i}`} type="monotone" dataKey={`s${i}`} name={`${t.string} ${i}`} stroke={STRING_COLORS[i - 1]} dot={false} strokeWidth={2} connectNulls isAnimationActive={false} />)}
            {strings.map((i) => <Line key={`e${i}`} type="monotone" dataKey={`e${i}`} name={`${t.string} ${i} ${t.expected}`} stroke={STRING_COLORS[i - 1]} strokeDasharray="6 4" dot={false} strokeWidth={1.2} connectNulls isAnimationActive={false} />)}
          </LineChart></ResponsiveContainer></div>
        </div>
      </div>

      {d.site?.advice && <AdviceBox a={d.site.advice} strings={strings} lang={lang} t={t} fmtDate={fmtDate} />}
      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "16px 0 6px", flexWrap: "wrap" }}>
        <div className="muted" style={{ fontSize: 12 }}>{t.heat} · {t.heatHint}</div><span className="spacer" />
        <div className="toggle">{(["pv", 1, 2, 3, 4] as const).map((m) => <button key={m} className={metric === m ? "on" : ""} onClick={() => setMetric(m)}>{m === "pv" ? t.total : m}</button>)}</div>
      </div>
      <div className="heatwrap"><table className="heat"><thead><tr><th></th>{heat.hours.map((h) => <th key={h}>{h}</th>)}<th className="muted" style={{ fontWeight: 400 }}>{t.peakToday}</th></tr></thead><tbody>
        {heat.days.map((day) => { const pk = d.string_peaks.filter((p) => p.day === day && (metric === "pv" || p.string === metric)).sort((a, b) => (b.w ?? 0) - (a.w ?? 0))[0];
          return <tr key={day} className={day === d.day.key ? "sel" : ""} onClick={() => setDay(day)}><th>{fmtDate(day + "T12:00:00Z")}</th>
            {heat.hours.map((h) => { const v = heat.cell.get(`${day}|${h}`) ?? null; const a = v == null || v <= 1 ? 0 : Math.pow(v / heat.max, 0.7);
              return <td key={h} style={{ background: a > 0 ? `rgba(${heatColor}, ${0.06 + 0.9 * a})` : "transparent" }} title={`${fmtDate(day + "T12:00:00Z")} ${h}:00 · ${fmtW(v)}`} />; })}
            <td className="pk">{pk ? `${fmtW(pk.w)} ${t.at} ${fmtTime(new Date(pk.t).getTime())}` : ""}</td></tr>; })}
      </tbody></table></div>
    </section>
  );
}

function AdviceBox({ a, strings, lang, t, fmtDate }: { a: Advice; strings: number[]; lang: "de" | "en"; t: (typeof L)["de"]; fmtDate: (iso: string) => string }) {
  const pct = (v: number | null | undefined) => v == null ? "–" : `${v > 0 ? "+" : ""}${Math.round(v)} %`;
  const dir = (az: number) => `${compass(az, lang)} ${Math.round(az)}°`;
  const fill = (s: string, m: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(m[k] ?? ""));
  const items: { i: number; lines: string[]; lever?: string }[] = [];
  for (const i of strings) {
    const v = a.strings[String(i)]; if (!v || v.unused) continue;
    if (!v.basis) { items.push({ i, lines: [t.advNoBasis, `${t.advOptimum}: ${dir(a.site_best.azimuth)}, ${t.tilt} ${a.site_best.tilt}° (${a.site_best.kwh_kwp} ${t.advYear})`] }); continue; }
    const lines: string[] = [];
    lines.push(`${dir(v.azimuth!)}, ${t.tilt} ${v.tilt}° (${v.basis === "config" ? t.adviceBasisConfig : t.adviceBasisFit}): ${v.kwh_kwp} ${t.advYear}, ${v.pct_of_best} % ${t.advOfBest} (${dir(a.site_best.azimuth)}, ${a.site_best.tilt}°: ${a.site_best.kwh_kwp}). ${t.advWinter} ${v.winter_share_pct} % (${t.advOptimum.toLowerCase()} ${v.best_winter_share_pct} %).`);
    const opts = [[`${t.advSameAz} ${v.same_azimuth!.tilt}°`, v.same_azimuth!.gain_pct], [`${t.advVertical} ${dir(v.vertical!.azimuth)}`, v.vertical!.gain_pct], [t.advFlat, v.flat!.gain_pct], [`${t.advOptimum} ${dir(v.best!.azimuth)} / ${v.best!.tilt}°`, v.best!.gain_pct]] as [string, number | null][];
    lines.push(opts.map(([n, g]) => `${n}: ${pct(g)}`).join(" · "));
    const best = opts.filter(([, g]) => (g ?? 0) >= 5).sort((x, y) => (y[1] ?? 0) - (x[1] ?? 0))[0];
    const lever = best ? `${t.advLever}: ${best[0]} (${pct(best[1])})` : t.advFine;
    if (v.shading && v.shading.length) for (const z of v.shading) lines.push(`${t.advShade}: ${fill(t.advShadeText, { from: z.time_from ?? "?", to: z.time_to ?? "?", a: z.az_from, b: z.az_to, r: Math.round(z.ratio * 100), loss: v.shading_loss_pct ?? 0 })}`);
    else lines.push(v.ratio_median == null ? `${t.advShade}: ${t.advFewData}.` : t.advNoShade);
    items.push({ i, lines, lever });
  }
  if (!items.length && !a.free_inputs) return null;
  return (
    <div className="advice">
      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{t.advice} · {t.advPeriod} {a.period[0]} – {a.period[1]} · {fmtDate(new Date(a.updated * 1000).toISOString())}</div>
      {items.map((it) => <div key={it.i} className="advitem" style={{ borderLeftColor: STRING_COLORS[it.i - 1] }}>
        <b style={{ color: STRING_COLORS[it.i - 1] }}>{t.string} {it.i}</b>{it.lever && <span className="lever">{it.lever}</span>}
        {it.lines.map((l, k) => <div key={k}>{l}</div>)}
      </div>)}
      {a.free_inputs > 0 && <div className="advitem" style={{ borderLeftColor: "var(--muted)" }}>{fill(t.advFree, { n: a.free_inputs, dir: dir(a.site_best.azimuth) })}</div>}
    </div>);
}

function heatColorOf(i: number) { return ["242,204,12", "255,152,48", "138,184,255", "184,119,217"][i - 1]; }
