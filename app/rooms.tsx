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
export type RoomsData = {
  updated: string | null;
  rooms: Record<string, Room>;
  series: { t: string; room: string; temp: number | null; setp: number | null; hum: number | null }[];
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
  const label = (k: string) => d?.rooms[k]?.name || k;

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
              <YAxis tick={{ fontSize: 11, fill: "#8e8e8e" }} width={44} unit=" °C" domain={["dataMin - 0.5", "dataMax + 0.5"]} />
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
    </section>
  );
}
