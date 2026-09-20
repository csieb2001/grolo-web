"use client";
// Räume (tado° X, lokal über Matter): was in den Zimmern ankommt und was dort eingestellt ist.
// Gelesen wird nichts aus der tado-Cloud – die Werte kommen über Thread von den Geräten selbst, über den
// Matter-Controller im Stack. Diese Seite zeigt nur; gerechnet und geschrieben wird in der tado-Bridge.

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type Room = {
  name?: string; temp_c?: number | null; setpoint_c?: number | null; humidity_pct?: number | null;
  temp_source?: string | null; temp_fallback?: boolean | null; radiator_offset_k?: number | null;
  battery_level?: number | null; battery_text?: string | null; available?: boolean | null;
  nodes?: number[]; sensors?: number[]; thermostats?: number[]; mode_text?: string | null;
  setpoint_split?: number[] | null;
};
export type RoomDay = { day: string; room: string; min: number | null; max: number | null; avg: number | null;
  hum: number | null; n: number; below: number; hum60: number };
export type RoomPeriod = { period: "today" | "month" | "year" | string; room: string; min: number | null;
  max: number | null; avg: number | null; hum: number | null; below_share: number | null;
  hum60_share: number | null; n: number; days: number };
export type RoomsData = {
  updated: string | null;
  rooms: Record<string, Room>;
  series: { t: string; room: string; temp: number | null; setp: number | null; hum: number | null }[];
  days?: RoomDay[];
  periods?: RoomPeriod[];
  ranks?: { room: string; cold_days: number; warm_days: number }[];
};

const L = {
  en: {
    title: "Rooms", hint: "tado° X read locally over Thread — no cloud in between. Where a room has a wireless sensor its temperature counts, because a thermostat sits on the radiator and measures its heat build-up as well.",
    temp: "Temperature", target: "target", humidity: "Humidity", offset: "Radiator build-up",
    offsetS: "how much warmer the thermostat reads than the free-hanging sensor",
    mean: "Mean room temperature", meanS: "what the annual forecast works from", coldest: "Coldest", warmest: "Warmest",
    spread: "Spread", spreadS: "between the coldest and the warmest room",
    course: "Room temperatures", courseHint: "One line per room. Drifting apart in winter points at hydraulic balancing, not at the thermostats.",
    humCourse: "Humidity", humHint: "Above 60 % for long stretches is where mould on cold external walls becomes possible.",
    sensor: "sensor", thermostat: "thermostat", fallback: "sensor unavailable, thermostat used",
    battery: "battery", none: "No rooms yet. Pair a tado° X device on the settings page of the stack.",
    offline: "offline", split: "thermostats disagree",
    long: "Over time", longHint: "Daily figures per room. The averages say how the house is really kept; the two counters say which room is chronically the problem — and a room that is coldest again and again is a balancing job, not a thermostat fault.",
    today: "today", month: "this month", year: "this year",
    pAvg: "Average", pCold: "Coldest", pWarm: "Warmest", pSpread: "Spread", pDays: "{d} days",
    tblRoom: "Room", tblAvg: "Ø °C", tblMin: "Lowest", tblMax: "Highest", tblHum: "Ø humidity",
    tblBelow: "Below target", tblBelowT: "share of the time more than half a degree below its own target",
    tblHum60: "Over 60 %", tblHum60T: "share of the time above 60 % humidity — the threshold for mould on cold walls",
    tblCold: "Coldest on", tblWarm: "Warmest on", days: "d",
    daily: "Daily averages per room", dailyHint: "One point per room and day. Early on this is a short line; it becomes the picture of the heating season.",
    nolong: "No daily figures yet — they start with the first full day.",
  },
  de: {
    title: "Räume", hint: "tado° X lokal über Thread gelesen — keine Cloud dazwischen. Wo ein Funkfühler hängt, zählt dessen Temperatur: ein Thermostat sitzt am Heizkörper und misst dessen Wärmestau mit.",
    temp: "Temperatur", target: "Soll", humidity: "Feuchte", offset: "Wärmestau am Heizkörper",
    offsetS: "um so viel misst das Thermostat wärmer als der frei hängende Fühler",
    mean: "Mittlere Raumtemperatur", meanS: "der Bezugspunkt der Jahresprognose", coldest: "Kältester", warmest: "Wärmster",
    spread: "Spreizung", spreadS: "zwischen dem kältesten und dem wärmsten Raum",
    course: "Raumtemperaturen", courseHint: "Eine Linie je Raum. Laufen sie im Winter auseinander, ist das ein hydraulischer Abgleich und kein Thermostatproblem.",
    humCourse: "Luftfeuchte", humHint: "Über 60 % über längere Zeit ist die Schwelle, ab der Schimmel an kalten Außenwänden möglich wird.",
    sensor: "Fühler", thermostat: "Thermostat", fallback: "Fühler nicht erreichbar, Thermostat genommen",
    battery: "Batterie", none: "Noch keine Räume. Auf der Einstellungsseite des Stacks ein tado°-X-Gerät koppeln.",
    offline: "offline", split: "Thermostate weichen ab",
    long: "Über die Zeit", longHint: "Tageswerte je Raum. Die Mittel sagen, wie das Haus wirklich gefahren wird; die beiden Zähler sagen, welcher Raum das chronische Problem ist — und ein Raum, der immer wieder der kälteste ist, ist ein Abgleich und kein Thermostatfehler.",
    today: "heute", month: "dieser Monat", year: "dieses Jahr",
    pAvg: "Mittel", pCold: "Kältester", pWarm: "Wärmster", pSpread: "Spreizung", pDays: "{d} Tage",
    tblRoom: "Raum", tblAvg: "Ø °C", tblMin: "Tiefster", tblMax: "Höchster", tblHum: "Ø Feuchte",
    tblBelow: "Unter Soll", tblBelowT: "Anteil der Zeit, in der der Raum mehr als ein halbes Grad unter seinem eigenen Sollwert lag",
    tblHum60: "Über 60 %", tblHum60T: "Anteil der Zeit über 60 % Luftfeuchte — die Schwelle für Schimmel an kalten Wänden",
    tblCold: "Kältester an", tblWarm: "Wärmster an", days: "T",
    daily: "Tagesmittel je Raum", dailyHint: "Ein Punkt je Raum und Tag. Anfangs ist das ein kurzer Strich; daraus wird das Bild der Heizsaison.",
    nolong: "Noch keine Tageswerte — sie beginnen mit dem ersten vollen Tag.",
  },
};

// Genug Farben für ein Haus; danach wiederholen sie sich, was bei mehr als zwölf Räumen zu verschmerzen ist.
const COLORS = ["#ff9830", "#73bf69", "#5794f2", "#f2cc0c", "#f2495c", "#b877d9",
                "#ff7383", "#8ab8ff", "#c8f2c2", "#fde5a3", "#ffb357", "#a352cc"];

const Tile = ({ k, v, unit, s, color }: { k: string; v: string; unit?: string; s?: string; color?: string }) => (
  <div className="tile"><div className="k">{k}</div><div className="v" style={color ? { color } : undefined}>{v}{unit && <small>{unit}</small>}</div>{s && <div className="s">{s}</div>}</div>
);

export function RoomsSection({ d, lang, locale }: { d: RoomsData | null; lang: "en" | "de"; locale: string }) {
  const t = L[lang];
  const entries = Object.entries(d?.rooms || {});
  if (!entries.length) return <section><h2>{t.title}</h2><p className="muted">{t.none}</p></section>;

  const n1 = (v: number | null | undefined) => v == null ? "–" : v.toFixed(1);
  const temps = entries.map(([, r]) => r.temp_c).filter((v): v is number => v != null);
  const mean = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null;
  const lo = temps.length ? Math.min(...temps) : null;
  const hi = temps.length ? Math.max(...temps) : null;
  const coldest = entries.find(([, r]) => r.temp_c === lo)?.[1];
  const warmest = entries.find(([, r]) => r.temp_c === hi)?.[1];
  const tip = { contentStyle: { background: "#1c1f24", border: "1px solid #2c3235", fontSize: 12 } };

  // Die Zeitreihe kommt lang: je Zeitpunkt und Raum eine Zeile. Für die Diagramme wird sie zu einer
  // Zeile je Zeitpunkt mit einer Spalte je Raum gedreht.
  const keys = entries.map(([k]) => k).sort();
  const pivot = (field: "temp" | "hum") => {
    const rows = new Map<string, Record<string, number | string | null>>();
    for (const p of d?.series || []) {
      const row = rows.get(p.t) || { t: p.t, label: new Date(p.t).toLocaleString(locale, { hour: "2-digit", minute: "2-digit" }) };
      row[p.room] = p[field];
      rows.set(p.t, row);
    }
    return [...rows.values()];
  };
  const tempRows = pivot("temp");
  const humRows = pivot("hum");
  // Die Achsengrenzen selbst rechnen: Recharts' Zeichenketten-Domains („dataMin - 0.5") haben hier
  // Unsinn ergeben, weil in den Zeilen auch nicht-numerische Spalten stehen.
  const allTemps = (d?.series || []).map((p) => p.temp).filter((v): v is number => v != null);
  const tempDomain: [number, number] = allTemps.length
    ? [Math.floor(Math.min(...allTemps) * 2) / 2 - 0.5, Math.ceil(Math.max(...allTemps) * 2) / 2 + 0.5]
    : [18, 24];
  const label = (k: string) => d?.rooms[k]?.name || k;

  // ---------------------------------------------------------------- Langzeit
  const periods = d?.periods || [];
  const ranks = d?.ranks || [];
  const year = periods.filter((p) => p.period === "year");
  // Tagesmittel: eine Zeile je Tag mit einer Spalte je Raum, wie bei den Kurzverläufen
  const dayMap = new Map<string, Record<string, number | string | null>>();
  for (const r of d?.days || []) {
    const row = dayMap.get(r.day) || { day: r.day, label: new Date(r.day + "T12:00:00").toLocaleDateString(locale, { day: "2-digit", month: "2-digit" }) };
    row[r.room] = r.avg;
    dayMap.set(r.day, row);
  }
  const dayRows = [...dayMap.values()];
  const dayAvgs = (d?.days || []).map((r) => r.avg).filter((v): v is number => v != null);
  const dayDomain: [number, number] = dayAvgs.length
    ? [Math.floor(Math.min(...dayAvgs) * 2) / 2 - 0.5, Math.ceil(Math.max(...dayAvgs) * 2) / 2 + 0.5]
    : [18, 24];

  return (
    <section>
      <h2>{t.title} <small className="muted" style={{ fontSize: 12, fontWeight: 400 }}>· {t.hint}</small></h2>

      <div className="tiles">
        <Tile k={t.mean} v={n1(mean)} unit="°C" s={t.meanS} color="var(--house)" />
        <Tile k={t.coldest} v={n1(lo)} unit="°C" s={coldest?.name} color="var(--soc)" />
        <Tile k={t.warmest} v={n1(hi)} unit="°C" s={warmest?.name} color="var(--red)" />
        <Tile k={t.spread} v={lo != null && hi != null ? n1(hi - lo) : "–"} unit="K" s={t.spreadS} />
      </div>

      <div className="tiles" style={{ marginTop: 10 }}>
        {entries.sort((a, b) => label(a[0]).localeCompare(label(b[0]))).map(([key, r]) => {
          const bad = r.battery_level ? (r.battery_level > 1 ? "var(--red)" : "var(--house)") : null;
          const sub = [
            `${t.target} ${n1(r.setpoint_c)} °C`,
            `${n1(r.humidity_pct)} %`,
            r.temp_source === "sensor" ? t.sensor : t.thermostat,
          ].join(" · ");
          return (
            <div key={key} className="tile">
              <div className="k">{r.name || key}{r.available === false && <span style={{ color: "var(--red)" }}> · {t.offline}</span>}</div>
              <div className="v" style={{ color: r.temp_c != null && r.setpoint_c != null && r.temp_c < r.setpoint_c - 0.5 ? "var(--soc)" : "var(--house)" }}>
                {n1(r.temp_c)}<small>°C</small>
              </div>
              <div className="s">{sub}</div>
              {r.temp_fallback && <div className="s" style={{ color: "var(--house)" }}>⚠ {t.fallback}</div>}
              {r.setpoint_split && <div className="s" style={{ color: "var(--house)" }}>⚠ {t.split}: {r.setpoint_split.join(" / ")} °C</div>}
              {r.radiator_offset_k != null && <div className="s">{t.offset}: {r.radiator_offset_k > 0 ? "+" : ""}{n1(r.radiator_offset_k)} K</div>}
              {bad && <div className="s" style={{ color: bad }}>⚠ {t.battery}: {r.battery_text}</div>}
            </div>
          );
        })}
      </div>

      {tempRows.length > 1 && <>
        <h3 style={{ fontSize: 13, margin: "16px 0 2px", color: "var(--muted)", fontWeight: 600 }}>{t.course}</h3>
        <p className="muted" style={{ margin: "0 0 6px", fontSize: 12 }}>{t.courseHint}</p>
        <div className="chart">
          <ResponsiveContainer>
            <LineChart data={tempRows}>
              <CartesianGrid stroke="#2c3235" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#8e8e8e" }} minTickGap={40} />
              <YAxis tick={{ fontSize: 11, fill: "#8e8e8e" }} width={44} unit=" °C" domain={tempDomain} allowDecimals />
              <Tooltip {...tip} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {keys.map((k, i) => (
                <Line key={k} type="monotone" dataKey={k} name={label(k)} stroke={COLORS[i % COLORS.length]}
                      strokeWidth={1.6} dot={false} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        <h3 style={{ fontSize: 13, margin: "16px 0 2px", color: "var(--muted)", fontWeight: 600 }}>{t.humCourse}</h3>
        <p className="muted" style={{ margin: "0 0 6px", fontSize: 12 }}>{t.humHint}</p>
        <div className="chart">
          <ResponsiveContainer>
            <LineChart data={humRows}>
              <CartesianGrid stroke="#2c3235" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#8e8e8e" }} minTickGap={40} />
              <YAxis tick={{ fontSize: 11, fill: "#8e8e8e" }} width={44} unit=" %" />
              <Tooltip {...tip} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {keys.map((k, i) => (
                <Line key={k} type="monotone" dataKey={k} name={label(k)} stroke={COLORS[i % COLORS.length]}
                      strokeWidth={1.6} dot={false} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </>}

      {periods.length > 0 && <>
        <h3 style={{ fontSize: 13, margin: "18px 0 2px", color: "var(--muted)", fontWeight: 600 }}>{t.long}</h3>
        <p className="muted" style={{ margin: "0 0 8px", fontSize: 12 }}>{t.longHint}</p>

        <div className="tiles">
          {(["today", "month", "year"] as const).map((per) => {
            const rows = periods.filter((p) => p.period === per && p.avg != null);
            if (!rows.length) return null;
            const avg = rows.reduce((a, r) => a + (r.avg as number), 0) / rows.length;
            const cold = rows.reduce((a, r) => (r.avg as number) < (a.avg as number) ? r : a);
            const warm = rows.reduce((a, r) => (r.avg as number) > (a.avg as number) ? r : a);
            const days = Math.max(...rows.map((r) => r.days));
            return (
              <div key={per} className="tile">
                <div className="k">{t[per]}</div>
                <div className="v" style={{ color: "var(--house)" }}>{n1(avg)}<small>°C</small></div>
                <div className="s">{t.pCold} {label(cold.room)} {n1(cold.avg)} °C</div>
                <div className="s">{t.pWarm} {label(warm.room)} {n1(warm.avg)} °C</div>
                <div className="s">{t.pSpread} {n1((warm.avg as number) - (cold.avg as number))} K · {t.pDays.replace("{d}", String(days))}</div>
              </div>
            );
          })}
        </div>

        <div className="tablewrap" style={{ marginTop: 12 }}>
          <table>
            <thead><tr>
              <th>{t.tblRoom}</th><th>{t.tblAvg}</th><th>{t.tblMin}</th><th>{t.tblMax}</th><th>{t.tblHum}</th>
              <th title={t.tblBelowT}>{t.tblBelow}</th><th title={t.tblHum60T}>{t.tblHum60}</th>
              <th>{t.tblCold}</th><th>{t.tblWarm}</th>
            </tr></thead>
            <tbody>
              {year.slice().sort((a, b) => (a.avg ?? 0) - (b.avg ?? 0)).map((r) => {
                const rank = ranks.find((x) => x.room === r.room);
                const pct = (v: number | null | undefined) => v == null ? "–" : `${(v * 100).toFixed(0)} %`;
                return (
                  <tr key={r.room}>
                    <td><b>{label(r.room)}</b></td>
                    <td>{n1(r.avg)} °C</td>
                    <td style={{ color: "var(--soc)" }}>{n1(r.min)} °C</td>
                    <td style={{ color: "var(--red)" }}>{n1(r.max)} °C</td>
                    <td>{n1(r.hum)} %</td>
                    <td style={{ color: (r.below_share ?? 0) > 0.25 ? "var(--house)" : undefined }}>{pct(r.below_share)}</td>
                    <td style={{ color: (r.hum60_share ?? 0) > 0.5 ? "var(--house)" : undefined }}>{pct(r.hum60_share)}</td>
                    <td className="muted">{rank?.cold_days ? `${rank.cold_days} ${t.days}` : "–"}</td>
                    <td className="muted">{rank?.warm_days ? `${rank.warm_days} ${t.days}` : "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {dayRows.length > 1 && <>
          <h3 style={{ fontSize: 13, margin: "16px 0 2px", color: "var(--muted)", fontWeight: 600 }}>{t.daily}</h3>
          <p className="muted" style={{ margin: "0 0 6px", fontSize: 12 }}>{t.dailyHint}</p>
          <div className="chart">
            <ResponsiveContainer>
              <LineChart data={dayRows}>
                <CartesianGrid stroke="#2c3235" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#8e8e8e" }} minTickGap={24} />
                <YAxis tick={{ fontSize: 11, fill: "#8e8e8e" }} width={44} unit=" °C" domain={dayDomain} allowDecimals />
                <Tooltip {...tip} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {keys.map((k, i) => (
                  <Line key={k} type="monotone" dataKey={k} name={label(k)} stroke={COLORS[i % COLORS.length]}
                        strokeWidth={1.6} dot={false} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>}
      </>}
      {!periods.length && <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>{t.nolong}</p>}
    </section>
  );
}
