"use client";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Data = {
  updated: string | null; device: string | null;
  latest: { pv_w: number; out_w: number; bat_w: number; soc: number; soc1?: number; soc2?: number; soc3?: number; soc4?: number; temp_sys?: number; temp_bat1?: number; temp_bat2?: number; pv_v?: number[]; pv_a?: number[]; packs?: number; status?: string; mode?: string } | null;
  info: { model?: string; dongle_model?: string; dongle_sw?: string; dongle_hw?: string; wifi_dbm?: string; updated?: string } | null;
  series: { t: string; pv: number; out: number; bat: number; soc: number }[];
  daily: { day: string; pv_kwh: number; out_kwh: number; charge_kwh: number; discharge_kwh: number }[];
  today: { pv_kwh: number; out_kwh: number; charge_kwh: number; discharge_kwh: number } | null;
  totals: { pv_kwh: number; out_kwh: number; since: string } | null;
  weather?: {
    current: { ts?: string; temperature?: number | null; cloud_cover?: number | null; shortwave_radiation?: number | null; wind_speed?: number | null; condition_en?: string | null; condition_de?: string | null;
               sunrise?: string | null; sunset?: string | null; sunshine_duration_today?: number | null; radiation_sum_today?: number | null } | null;
    forecast: { t: string; shortwave_radiation: number | null; cloud_cover: number | null; temperature: number | null }[];
    history: { t: string; radiation: number | null; cloud: number | null; temp: number | null }[];
  } | null;
};

const T = {
  en: { title: "Growatt Local", live: "live", stale: "stale", nodata: "no data yet", updated: "updated", now: "Now", pv: "PV power", out: "Output to house", bat: "Battery", soc: "State of charge",
        charging: "charging", discharging: "discharging", idle: "idle", mode: "Mode", tsys: "System temp.", packs: "Battery packs", pvin: "PV inputs in use",
        history: "Power and state of charge", energy: "Energy", today: "Today", pvYield: "PV yield", toHouse: "To house", charged: "Battery charged", discharged: "Battery discharged",
        total: "Total since", daily: "Energy per day (kWh)", pieA: "Where did today's PV energy go?", pieB: "Where did today's house energy come from?",
        direct: "Directly to house", intoBat: "Into the battery", fromPv: "Directly from PV", fromBat: "From the battery",
        hardware: "Hardware", pack: "Pack", temp: "Temperature", dongle: "Wi-Fi dongle", wifi: "Wi-Fi signal", string: "String", free: "free",
        modes: { "Load First": "Load first", "Battery First": "Battery first", "Smart Mode": "Smart" } as Record<string, string>,
        weather: "Weather", wtemp: "Temperature", wcond: "Conditions", wcloud: "Cloud cover", wrad: "Global radiation", wsun: "Sunrise – sunset", wsunshine: "Sunshine today", wradsum: "Radiation today",
        wnone: "no weather data yet", wchart: "Global radiation vs. PV power", wforecast: "Forecast 48 h", wradiation: "Radiation", apierr: "Data API is not responding",
        footer: "Read-only mirror of a local GroLo installation. Data every 30 s, no control from here.", range: { "24h": "24 h", "7d": "7 days", "30d": "30 days" } as Record<string, string> },
  de: { title: "Growatt Local", live: "live", stale: "veraltet", nodata: "noch keine Daten", updated: "aktualisiert", now: "Jetzt", pv: "PV-Leistung", out: "Ausgang ins Haus", bat: "Batterie", soc: "Ladezustand",
        charging: "lädt", discharging: "entlädt", idle: "Ruhe", mode: "Modus", tsys: "Systemtemp.", packs: "Batteriepacks", pvin: "PV-Eingänge belegt",
        history: "Leistung und Ladezustand", energy: "Energie", today: "Heute", pvYield: "PV-Ertrag", toHouse: "Ins Haus", charged: "Batterie geladen", discharged: "Batterie entladen",
        total: "Gesamt seit", daily: "Energie pro Tag (kWh)", pieA: "Wohin ging der PV-Strom heute?", pieB: "Woher kam der Hausstrom heute?",
        direct: "Direkt ins Haus", intoBat: "In die Batterie", fromPv: "Direkt aus PV", fromBat: "Aus der Batterie",
        hardware: "Hardware", pack: "Pack", temp: "Temperatur", dongle: "WLAN-Dongle", wifi: "WLAN-Signal", string: "String", free: "frei",
        modes: { "Load First": "Last zuerst", "Battery First": "Batterie zuerst", "Smart Mode": "Smart" } as Record<string, string>,
        weather: "Wetter", wtemp: "Temperatur", wcond: "Wetterlage", wcloud: "Bewölkung", wrad: "Globalstrahlung", wsun: "Sonnenaufgang – Sonnenuntergang", wsunshine: "Sonnenschein heute", wradsum: "Strahlung heute",
        wnone: "noch keine Wetterdaten", wchart: "Globalstrahlung und PV-Leistung", wforecast: "Vorhersage 48 h", wradiation: "Strahlung", apierr: "Daten-API antwortet nicht",
        footer: "Nur-Lese-Spiegel einer lokalen GroLo-Installation. Daten alle 30 s, keine Steuerung von hier.", range: { "24h": "24 h", "7d": "7 Tage", "30d": "30 Tage" } as Record<string, string> },
};

const fmtW = (w: number | null | undefined) => w == null ? "–" : Math.abs(w) < 1 ? `${Math.round(w * 1000)} mW` : Math.abs(w) < 1000 ? `${w.toFixed(Math.abs(w) < 10 ? 1 : 0)} W` : `${(w / 1000).toFixed(2)} kW`;
const fmtKwh = (k: number | null | undefined) => k == null ? "–" : k < 1 ? `${(k * 1000).toFixed(0)} Wh` : `${k.toFixed(2)} kWh`;

export default function Page() {
  const [lang, setLang] = useState<"en" | "de">("en");
  const [range, setRange] = useState<"24h" | "7d" | "30d">("24h");
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const t = T[lang];
  useEffect(() => { try { const l = localStorage.getItem("grolo.lang"); if (l === "de" || l === "en") setLang(l); } catch {} }, []);
  useEffect(() => {
    let alive = true;
    const load = () => fetch(`/api/data?range=${range}`, { cache: "no-store" })
      .then(r => { if (r.status === 401) { window.location.href = "/login"; throw new Error("401"); } if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => { if (alive) { setData(d); setErr(null); } })
      .catch(e => alive && setErr(`${T[lang].apierr} (${e instanceof Error ? e.message : String(e)})`));
    load(); const id = setInterval(load, 30000); return () => { alive = false; clearInterval(id); };
  }, [range, lang]);
  const locale = lang === "de" ? "de-DE" : "en-GB";
  const ageSec = data?.updated ? (Date.now() - new Date(data.updated).getTime()) / 1000 : Infinity;
  const l = data?.latest;
  const series = useMemo(() => (data?.series || []).map(p => ({ ...p, label: new Date(p.t).toLocaleString(locale, range === "24h" ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "2-digit", hour: "2-digit" }) })), [data, locale, range]);
  const daily = (data?.daily || []).map(d => ({ ...d, label: new Date(d.day).toLocaleDateString(locale, { day: "2-digit", month: "2-digit" }) }));
  const pvIn = l?.pv_v ? l.pv_v.filter(v => (v ?? 0) > 15).length : null;
  const pieA = data?.today ? [{ name: t.direct, value: Math.max(data.today.pv_kwh - data.today.charge_kwh, 0), color: "var(--house)" }, { name: t.intoBat, value: data.today.charge_kwh, color: "var(--bat)" }] : [];
  const pieB = data?.today ? [{ name: t.fromPv, value: Math.max(data.today.out_kwh - data.today.discharge_kwh, 0), color: "var(--pv)" }, { name: t.fromBat, value: data.today.discharge_kwh, color: "var(--bat)" }] : [];
  const Tile = ({ k, v, unit, s, color }: { k: string; v: string; unit?: string; s?: string; color?: string }) => (
    <div className="tile"><div className="k">{k}</div><div className="v" style={{ color }}>{v || "–"}{v && unit && <small>{unit}</small>}</div>{s && <div className="s">{s}</div>}</div>);
  const tip = { contentStyle: { background: "#1c1f24", border: "1px solid #2c3235", fontSize: 12 } };
  const w = data?.weather?.current ?? null;
  const fmtT = (iso?: string | null) => iso ? new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : "–";
  const radVsPv = useMemo(() => {
    const hist = data?.weather?.history || []; if (!hist.length) return [] as { label: string; radiation: number | null; pv: number | null }[];
    const pvByT = new Map(series.map(p => [new Date(p.t).getTime(), p.pv]));
    return hist.map(h => ({ label: new Date(h.t).toLocaleString(locale, range === "24h" ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "2-digit", hour: "2-digit" }), radiation: h.radiation, pv: pvByT.get(new Date(h.t).getTime()) ?? null }));
  }, [data, series, locale, range]);
  const forecast = (data?.weather?.forecast || []).map(f => ({ ...f, label: new Date(f.t).toLocaleString(locale, { weekday: "short", hour: "2-digit" }) }));

  return (
    <>
      <header>
        <h1>GroLo <small>{t.title}</small></h1>
        <span className={"pill " + (ageSec < 120 ? "ok" : ageSec < 3600 ? "warn" : "bad")}>{!data?.updated ? t.nodata : `${ageSec < 120 ? t.live : t.stale} · ${t.updated} ${new Date(data.updated).toLocaleTimeString(locale)}`}</span>
        {data?.device && <span className="pill">{data.device}</span>}
        <span className="spacer" />
        <div className="toggle">{(["en", "de"] as const).map(x => <button key={x} className={lang === x ? "on" : ""} onClick={() => { setLang(x); try { localStorage.setItem("grolo.lang", x); } catch {} }}>{x.toUpperCase()}</button>)}</div>
      </header>
      <main>
        {err && <section style={{ color: "var(--red)" }}>{err}</section>}
        <section><h2>{t.now}</h2>
          <div className="tiles">
            <Tile k={t.pv} v={fmtW(l?.pv_w)} color="var(--pv)" s={pvIn != null ? `${t.pvin}: ${pvIn} / 4` : undefined} />
            <Tile k={t.out} v={fmtW(l?.out_w)} color="var(--house)" />
            <Tile k={t.bat} v={fmtW(l?.bat_w)} color="var(--bat)" s={l ? (l.bat_w > 2 ? t.charging : l.bat_w < -2 ? t.discharging : t.idle) : undefined} />
            <Tile k={t.soc} v={l ? `${Math.round(l.soc)}` : "–"} unit="%" color="var(--soc)" s={l?.packs ? `${t.packs}: ${l.packs}` : undefined} />
            <Tile k={t.mode} v={l?.mode ? (t.modes[l.mode] || l.mode) : "–"} />
            <Tile k={t.tsys} v={l?.temp_sys != null ? l.temp_sys.toFixed(1) : "–"} unit="°C" />
          </div>
        </section>
        <section>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}><h2 style={{ margin: 0 }}>{t.history}</h2><span className="spacer" />
            <div className="toggle">{(["24h", "7d", "30d"] as const).map(r => <button key={r} className={range === r ? "on" : ""} onClick={() => setRange(r)}>{t.range[r]}</button>)}</div></div>
          <div className="charts">
            <div className="chart"><ResponsiveContainer><LineChart data={series}><CartesianGrid stroke="#2c3235" /><XAxis dataKey="label" stroke="#8e8e8e" fontSize={11} minTickGap={30} /><YAxis stroke="#8e8e8e" fontSize={11} unit=" W" /><Tooltip {...tip} formatter={(v) => fmtW(Number(v))} /><Legend />
              <Line type="monotone" dataKey="pv" name={t.pv} stroke="#f2cc0c" dot={false} strokeWidth={2} /><Line type="monotone" dataKey="out" name={t.out} stroke="#ff9830" dot={false} strokeWidth={2} /><Line type="monotone" dataKey="bat" name={t.bat} stroke="#73bf69" dot={false} strokeWidth={2} /></LineChart></ResponsiveContainer></div>
            <div className="chart"><ResponsiveContainer><AreaChart data={series}><CartesianGrid stroke="#2c3235" /><XAxis dataKey="label" stroke="#8e8e8e" fontSize={11} minTickGap={30} /><YAxis stroke="#8e8e8e" fontSize={11} domain={[0, 100]} unit="%" /><Tooltip {...tip} formatter={(v) => `${Number(v).toFixed(0)} %`} />
              <Area type="monotone" dataKey="soc" name={t.soc} stroke="#5794f2" fill="#5794f2" fillOpacity={0.25} /></AreaChart></ResponsiveContainer></div>
          </div>
        </section>
        <section><h2>{t.energy}</h2>
          <div className="tiles" style={{ marginBottom: 14 }}>
            <Tile k={`${t.today}: ${t.pvYield}`} v={fmtKwh(data?.today?.pv_kwh)} color="var(--pv)" />
            <Tile k={`${t.today}: ${t.toHouse}`} v={fmtKwh(data?.today?.out_kwh)} color="var(--house)" />
            <Tile k={`${t.today}: ${t.charged}`} v={fmtKwh(data?.today?.charge_kwh)} color="var(--bat)" />
            <Tile k={`${t.today}: ${t.discharged}`} v={fmtKwh(data?.today?.discharge_kwh)} color="var(--house)" />
            <Tile k={`${t.total} ${data?.totals?.since ? new Date(data.totals.since).toLocaleDateString(locale) : "–"}`} v={fmtKwh(data?.totals?.pv_kwh)} color="var(--pv)" s={t.pvYield} />
          </div>
          <div className="charts">
            <div className="chart"><ResponsiveContainer><BarChart data={daily}><CartesianGrid stroke="#2c3235" /><XAxis dataKey="label" stroke="#8e8e8e" fontSize={11} /><YAxis stroke="#8e8e8e" fontSize={11} /><Tooltip {...tip} formatter={(v) => fmtKwh(Number(v))} /><Legend />
              <Bar dataKey="pv_kwh" name={t.pvYield} fill="#f2cc0c" /><Bar dataKey="out_kwh" name={t.toHouse} fill="#ff9830" /></BarChart></ResponsiveContainer></div>
            <div className="chart" style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
              {[{ title: t.pieA, d: pieA }, { title: t.pieB, d: pieB }].map(p => (
                <div key={p.title} style={{ textAlign: "center" }}><div className="muted" style={{ fontSize: 12 }}>{p.title}</div>
                  <ResponsiveContainer height={220}><PieChart><Pie data={p.d} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} label={({ percent }) => `${((percent ?? 0) * 100).toFixed(0)}%`}>{p.d.map((e, i) => <Cell key={i} fill={e.color} />)}</Pie><Tooltip {...tip} formatter={(v) => fmtKwh(Number(v))} /><Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} /></PieChart></ResponsiveContainer></div>))}
            </div>
          </div>
        </section>
        <section><h2>{t.weather}</h2>
          {!w ? <div className="muted">{t.wnone}</div> : <>
            <div className="tiles" style={{ marginBottom: 14 }}>
              <Tile k={t.wtemp} v={w.temperature != null ? w.temperature.toFixed(1) : ""} unit="°C" />
              <Tile k={t.wcond} v={(lang === "de" ? w.condition_de : w.condition_en) || ""} s={w.wind_speed != null ? `${w.wind_speed.toFixed(1)} m/s` : undefined} />
              <Tile k={t.wcloud} v={w.cloud_cover != null ? `${Math.round(w.cloud_cover)}` : ""} unit="%" />
              <Tile k={t.wrad} v={w.shortwave_radiation != null ? `${Math.round(w.shortwave_radiation)}` : ""} unit="W/m²" color="var(--pv)" />
              <Tile k={t.wsun} v={w.sunrise || w.sunset ? `${fmtT(w.sunrise)} – ${fmtT(w.sunset)}` : ""} />
              <Tile k={t.wsunshine} v={w.sunshine_duration_today != null ? (w.sunshine_duration_today / 3600).toFixed(1) : ""} unit="h" />
              <Tile k={t.wradsum} v={w.radiation_sum_today != null ? (w.radiation_sum_today / 3.6).toFixed(2) : ""} unit="kWh/m²" s={w.radiation_sum_today != null ? `${w.radiation_sum_today.toFixed(2)} MJ/m²` : undefined} />
            </div>
            <div className="charts">
              <div className="chart"><div className="muted" style={{ fontSize: 12 }}>{t.wchart}</div><ResponsiveContainer height={250}><LineChart data={radVsPv}><CartesianGrid stroke="#2c3235" /><XAxis dataKey="label" stroke="#8e8e8e" fontSize={11} minTickGap={30} /><YAxis yAxisId="l" stroke="#8e8e8e" fontSize={11} unit=" W/m²" /><YAxis yAxisId="r" orientation="right" stroke="#8e8e8e" fontSize={11} unit=" W" /><Tooltip {...tip} /><Legend />
                <Line yAxisId="l" type="monotone" dataKey="radiation" name={t.wrad} stroke="#c084fc" dot={false} strokeWidth={2} /><Line yAxisId="r" type="monotone" dataKey="pv" name={t.pv} stroke="#f2cc0c" dot={false} strokeWidth={2} /></LineChart></ResponsiveContainer></div>
              <div className="chart"><div className="muted" style={{ fontSize: 12 }}>{t.wforecast}</div><ResponsiveContainer height={250}><AreaChart data={forecast}><CartesianGrid stroke="#2c3235" /><XAxis dataKey="label" stroke="#8e8e8e" fontSize={11} minTickGap={30} /><YAxis yAxisId="l" stroke="#8e8e8e" fontSize={11} unit=" W/m²" /><YAxis yAxisId="r" orientation="right" stroke="#8e8e8e" fontSize={11} domain={[0, 100]} unit="%" /><Tooltip {...tip} /><Legend />
                <Area yAxisId="l" type="monotone" dataKey="shortwave_radiation" name={t.wradiation} stroke="#f2cc0c" fill="#f2cc0c" fillOpacity={0.3} /><Line yAxisId="r" type="monotone" dataKey="cloud_cover" name={t.wcloud} stroke="#8e8e8e" dot={false} strokeWidth={2} /></AreaChart></ResponsiveContainer></div>
            </div>
          </>}
        </section>
        <section><h2>{t.hardware}</h2>
          <table><thead><tr><th>{t.pack}</th><th>SoC</th><th>{t.temp}</th></tr></thead><tbody>
            {[1, 2, 3, 4].filter(i => i <= (l?.packs || 1)).map(i => { const soc = [l?.soc1, l?.soc2, l?.soc3, l?.soc4][i - 1]; const tp = [l?.temp_bat1, l?.temp_bat2][i - 1];
              return <tr key={i}><td>{t.pack} {i}</td><td>{soc != null ? `${Math.round(soc)} %` : "–"}</td><td>{tp != null ? `${tp.toFixed(1)} °C` : "–"}</td></tr>; })}
          </tbody></table>
          <div className="tiles" style={{ marginTop: 12 }}>
            {l?.pv_v && [1, 2, 3, 4].map(i => <Tile key={i} k={`${t.string} ${i}`} v={(l.pv_v![i - 1] ?? 0) > 15 ? fmtW((l.pv_v![i - 1] ?? 0) * (l.pv_a?.[i - 1] ?? 0)) : t.free} s={`${(l.pv_v![i - 1] ?? 0).toFixed(1)} V · ${((l.pv_a?.[i - 1] ?? 0) * 1000).toFixed(0)} mA`} color={(l.pv_v![i - 1] ?? 0) > 15 ? "var(--pv)" : "var(--muted)"} />)}
            {data?.info && <Tile k={t.dongle} v={data.info.dongle_model || "–"} s={`SW ${data.info.dongle_sw ?? "–"} · HW ${data.info.dongle_hw ?? "–"} · ${t.wifi} ${data.info.wifi_dbm ?? "–"} dBm`} />}
          </div>
        </section>
      </main>
      <footer>{t.footer} · <a href="https://github.com/csieb2001/grolo" target="_blank" rel="noreferrer">GroLo on GitHub</a> · <a href="/api/logout">{lang === "de" ? "Abmelden" : "Sign out"}</a></footer>
    </>
  );
}
