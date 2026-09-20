"use client";
// Wärmepumpe (Wolf CHA über den lokalen WOLF Link): Kacheln zum Jetzt, Leistung und Arbeitszahl im Verlauf,
// Wärme und Strom je Tag, und die Verbindung zur Anlage – welcher Teil des Wärmepumpenstroms vom NEXA kam.
// Kosten und CO₂ rechnen mit dem Arbeitspreis der Einstellungsseite und den Richtwerten aus calendar.tsx.

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CO2_KG_PER_KWH } from "./calendar";

// Erdgas: rund 0,20 kg CO₂ je kWh Brennstoff, bei etwa 85 % Nutzungsgrad einer Bestandsheizung also 0,24 kg je kWh Wärme.
export const CO2_KG_PER_KWH_GAS_HEAT = 0.24;

export type HeatState = {
  mode?: number | null; mode_text?: string | null; compressor_status?: number | null; compressor_text?: string | null;
  compressor?: number | null; eheat?: number | null; eheat_text?: string | null;
  hp_w?: number | null; heat_kw?: number | null; cop?: number | null;
  flow_c?: number | null; return_c?: number | null; spread?: number | null;
  dhw_c?: number | null; dhw_set_c?: number | null; outside_c?: number | null; freq?: number | null;
  flow_lpm?: number | null; pressure_bar?: number | null;
  heat_today?: number | null; el_today?: number | null; heat_month?: number | null; el_month?: number | null;
  heat_year?: number | null; el_year?: number | null;
  spf_year?: number | null; spf_prev_year?: number | null; taz_yesterday?: number | null;
  pf_today?: number | null; pf_month?: number | null; pf_year?: number | null;
  cycles_today?: number | null; runtime_today_min?: number | null; runtime_per_cycle_min?: number | null;
  defrosts_today?: number | null; dhw_min_today?: number | null; heating_min_today?: number | null; eheat_min_today?: number | null;
  hours_compressor?: number | null; hours_eheat?: number | null; starts?: number | null;
  serial?: number | null; power_class?: number | null; model?: string | null; firmware?: number | null;
  cycling?: Cycling | null;
};
// Auswertung der Taktung, unverändert aus der wolf-bridge. Befund und Schwellen werden dort gebildet,
// damit Website und Grafana dieselbe Aussage treffen.
export type CyclingParam = { device: string; key: string; de: string; en: string };
export type CyclingVerdict = { code: string; severity: "ok" | "info" | "warn" | "bad"; de: string; en: string; params?: CyclingParam[] };
export type Cycling = {
  window_days?: number; span_days?: number; cycles?: number; per_day?: number | null;
  median_min?: number | null; p25_min?: number | null; p75_min?: number | null; median_hz_min?: number | null;
  median_pause_min?: number | null; short_share?: number | null; short_per_day?: number | null;
  ww_per_day?: number | null; defrost_share?: number | null; runtime_share?: number | null;
  cycles_today?: number | null; runtime_today_min?: number | null; per_cycle_today_min?: number | null;
  starts_per_year?: number | null; starts_total?: number | null; lifetime_per_cycle_min?: number | null;
  max_starts_hour?: number | null;
  verdict?: CyclingVerdict | null; notes?: { code: string; severity: string; de: string; en: string }[];
};
export type HeatDay = { day: string; heat_kwh: number | null; el_kwh: number | null; spf: number | null; hp_kwh: number | null; solar_kwh: number | null; direct_kwh: number | null; minutes: number };
export type HeatData = {
  updated: string | null;
  state: HeatState | null;
  series: { t: string; hp: number | null; heat: number | null; flow: number | null; ret: number | null; dhw: number | null; outside: number | null; freq: number | null }[];
  days: HeatDay[];
  cycles?: {
    buckets: { lo: number; mode: string; n: number }[];
    temp: { t: number; n: number; med: number | null }[];
    days: { day: string; n: number; med: number | null }[];
  } | null;
};

const L = {
  en: {
    title: "Heat pump", hint: "Wolf CHA over the local WOLF Link. The heat pump reports its power input in whole kW, so the live figures are coarsely stepped; the daily kWh counters are exact.",
    mode: "Mode", compressor: "Compressor", cop: "COP now", heatOut: "Heat output", elIn: "Power input", flow: "Flow / return", spread: "spread",
    dhw: "Hot water", setpoint: "setpoint", outside: "Outside", heatToday: "Heat today", elToday: "Electricity today", pfToday: "Factor today",
    spf: "SPF this year", spfPrev: "last year", eheat: "Immersion heater",
    power: "Heat output, power input and COP", temps: "Temperatures", perDay: "Heat and electricity per day", pf: "Performance factor",
    heat: "Heat", el: "Electricity", ret: "Return", noData: "no heat pump data yet",
    solar: "Where the heat pump's electricity came from", solarHint: "Per day, minute by minute: the part the NEXA could cover at that moment (the smaller of heat pump draw and NEXA output), split by how much of the NEXA output came straight from the panels rather than the battery; the rest came from the grid. An estimate, because the heat pump only reports whole kW.",
    fromSolar: "Straight from solar", fromBattery: "From the battery", fromGrid: "From the grid", solarShare: "Covered by the NEXA", solarShareS: "of the heat pump's electricity over the days shown",
    costs: "Costs", costsAt: "at {p} ct/kWh", costToday: "Heat cost today", costYear: "Heat cost this year", perKwh: "Per kWh of heat",
    perKwhS: "price divided by this year's performance factor", savedVsEl: "Saved vs. direct electric heating", savedVsElS: "{h} kWh of heat with {e} kWh of electricity",
    env: "Environment", co2Gas: "A gas boiler would emit", co2GasS: "{h} kWh of heat × {f} kg/kWh (gas at ~85 % efficiency)",
    co2Hp: "The heat pump emits", co2HpS: "grid share × {f} kg/kWh, the solar share counts as zero", co2Saved: "CO₂ avoided this year", co2SavedS: "difference between the two",
    year: "this year", month: "this month", noYear: "no full year yet", yesterday: "yesterday", totalShort: "total",
    cycling: "Cycling", cyclingHint: "Cycling is judged by the uninterrupted runtime, not by a maximum number of starts: below ten minutes is short cycling, ten to twenty is common, thirty to sixty is the ideal.",
    medianRun: "Runtime per cycle", medianRunS: "median over {d} days", shortShare: "Short cycles", shortShareS: "under ten minutes",
    perDayC: "Cycles per day", perDayCS: "ten to fifteen is a good value", perYear: "Starts per year", perYearS: "projected; under 2000 optimal, from 6000 it costs compressor life",
    runShare: "Runtime share", runShareS: "long runs at low output are the best state", pause: "Pause between cycles", pauseS: "median; short runs and short pauses mean the hysteresis is too tight",
    lengths: "Distribution of cycle lengths", lengthsHint: "How many cycles fall into each class. An average hides whether there are many short and a few long ones. Hot water charges are shown separately, they are allowed to be short.",
    byTemp: "Cycles by outside temperature", byTempHint: "This is where the decision is made: a bump at eight to fifteen degrees is shoulder-season cycling, where the house needs less than the compressor can turn down to. A bump at freezing is hydraulic, or the unit is oversized.",
    trend: "Cycles per day over time", trendHint: "After a settings change the bars should fall and the line should rise.",
    turn: "Where to turn:", cyclesLabel: "Cycles", heating: "Heating", hotwater: "Hot water", noCycles: "No cycles recorded yet.",
    cyclesToday: "Cycles today", perCycleToday: "Runtime per cycle today",
    perCycleTodayS: "today's cycles only", sinceMidnight: "since midnight",
  },
  de: {
    title: "Wärmepumpe", hint: "Wolf CHA über den lokalen WOLF Link. Die Wärmepumpe meldet ihre Leistungsaufnahme nur in ganzen kW, die Live-Werte sind deshalb grob gestuft; die Tageszähler in kWh sind genau.",
    mode: "Betriebsart", compressor: "Verdichter", cop: "COP jetzt", heatOut: "Wärmeleistung", elIn: "Aufnahme", flow: "Vorlauf / Rücklauf", spread: "Spreizung",
    dhw: "Warmwasser", setpoint: "Soll", outside: "Außen", heatToday: "Wärme heute", elToday: "Strom heute", pfToday: "Arbeitszahl heute",
    spf: "JAZ dieses Jahr", spfPrev: "Vorjahr", eheat: "Heizstab",
    power: "Wärmeleistung, Aufnahme und COP", temps: "Temperaturen", perDay: "Wärme und Strom je Tag", pf: "Arbeitszahl",
    heat: "Wärme", el: "Strom", ret: "Rücklauf", noData: "noch keine Daten der Wärmepumpe",
    solar: "Woher der Strom der Wärmepumpe kam", solarHint: "Je Tag, Minute für Minute: der Teil, den der NEXA im selben Moment decken konnte (der kleinere Wert aus Aufnahme und NEXA-Abgabe), aufgeteilt danach, wie viel der NEXA-Abgabe gerade direkt von den Modulen kam statt aus der Batterie; der Rest kam aus dem Netz. Eine Schätzung, weil die Wärmepumpe nur ganze kW meldet.",
    fromSolar: "Direkt aus Solar", fromBattery: "Aus der Batterie", fromGrid: "Aus dem Netz", solarShare: "Vom NEXA gedeckt", solarShareS: "des Wärmepumpenstroms in den gezeigten Tagen",
    costs: "Kosten", costsAt: "bei {p} ct/kWh", costToday: "Wärmekosten heute", costYear: "Wärmekosten dieses Jahr", perKwh: "Je kWh Wärme",
    perKwhS: "Arbeitspreis geteilt durch die Arbeitszahl des Jahres", savedVsEl: "Gespart gegenüber Stromdirektheizung", savedVsElS: "{h} kWh Wärme mit {e} kWh Strom",
    env: "Umwelt", co2Gas: "Eine Gasheizung stieße aus", co2GasS: "{h} kWh Wärme × {f} kg/kWh (Gas bei rund 85 % Nutzungsgrad)",
    co2Hp: "Die Wärmepumpe stößt aus", co2HpS: "Netzanteil × {f} kg/kWh, der Solaranteil zählt als null", co2Saved: "CO₂ vermieden dieses Jahr", co2SavedS: "Differenz der beiden",
    year: "dieses Jahr", month: "dieser Monat", noYear: "noch kein volles Jahr", yesterday: "Vortag", totalShort: "gesamt",
    cycling: "Taktung", cyclingHint: "Maßstab ist die Laufzeit am Stück, nicht eine Höchstzahl an Starts: unter zehn Minuten ist Kurztakten, zehn bis zwanzig sind üblich, dreißig bis sechzig das Ideal.",
    medianRun: "Laufzeit je Takt", medianRunS: "Mittelwert über {d} Tage", shortShare: "Kurztakte", shortShareS: "unter zehn Minuten",
    perDayC: "Takte je Tag", perDayCS: "zehn bis fünfzehn gelten als guter Wert", perYear: "Starts im Jahr", perYearS: "hochgerechnet; unter 2000 optimal, ab 6000 kostet es Lebensdauer",
    runShare: "Laufzeitanteil", runShareS: "lange Läufe auf kleiner Leistung sind der beste Zustand", pause: "Pause zwischen Takten", pauseS: "Median; kurze Läufe und kurze Pausen heißen, die Hysterese ist zu eng",
    lengths: "Verteilung der Taktlängen", lengthsHint: "Wie viele Takte in welche Klasse fallen. Ein Mittelwert verdeckt, ob es viele kurze und wenige lange sind. Warmwasserladungen stehen getrennt, sie dürfen kurz sein.",
    byTemp: "Takte je Außentemperatur", byTempHint: "Hier entscheidet sich, was zu tun ist: ein Buckel bei acht bis fünfzehn Grad ist Übergangszeit-Takten, das Haus braucht weniger als der Verdichter herunterregeln kann. Ein Buckel bei Frost ist hydraulisch, oder die Anlage ist zu groß.",
    trend: "Takte je Tag im Verlauf", trendHint: "Nach einer Einstellungsänderung sollen die Balken sinken und die Linie steigen.",
    turn: "Stellschraube:", cyclesLabel: "Takte", heating: "Heizen", hotwater: "Warmwasser", noCycles: "Noch keine Takte aufgezeichnet.",
    cyclesToday: "Takte heute", perCycleToday: "Laufzeit je Takt heute",
    perCycleTodayS: "nur die Takte von heute", sinceMidnight: "seit Mitternacht",
  },
};

const fmtKwh = (k: number | null | undefined) => k == null ? "–" : k < 1 ? `${(k * 1000).toFixed(0)} Wh` : `${k.toFixed(k < 100 ? 1 : 0)} kWh`;
const fmtKw = (w: number | null | undefined) => w == null ? "–" : `${(w / 1000).toFixed(2)} kW`;
const fmtC = (c: number | null | undefined) => c == null || c < -100 ? "–" : `${c.toFixed(1)} °C`;
const n1 = (v: number | null | undefined) => v == null ? "–" : v.toFixed(1);
const n2 = (v: number | null | undefined) => v == null ? "–" : v.toFixed(2);

// Der Befund kommt fertig aus dem Sidecar. Hier wird er nur eingefärbt und die genannte Stellschraube
// als Chip angehängt – verstellt wird nichts, dafür ist die Bedienseite des Stacks da.
const VERDICT_COLOR: Record<string, string> = { ok: "var(--bat)", info: "var(--soc)", warn: "var(--house)", bad: "var(--red)" };

const Verdict = ({ v, lang, turn }: { v: CyclingVerdict; lang: "en" | "de"; turn: string }) => {
  const color = VERDICT_COLOR[v.severity] || "var(--muted)";
  return (
    <div style={{ background: "#1c1f24", border: "1px solid var(--line)", borderLeft: `3px solid ${color}`,
                  borderRadius: 6, padding: "10px 12px", margin: "0 0 10px" }}>
      <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{lang === "de" ? v.de : v.en}</div>
      {!!v.params?.length && (
        <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span className="muted" style={{ fontSize: 12 }}>{turn}</span>
          {v.params.map((p) => (
            <span key={p.key} className="pill" style={{ fontSize: 11.5 }}>{lang === "de" ? p.de : p.en}</span>
          ))}
        </div>
      )}
    </div>
  );
};

const Tile = ({ k, v, unit, s, color }: { k: string; v: string; unit?: string; s?: string; color?: string }) => (
  <div className="tile"><div className="k">{k}</div><div className="v" style={color ? { color } : undefined}>{v}{unit && <small>{unit}</small>}</div>{s && <div className="s">{s}</div>}</div>
);

export function HeatSection({ d, lang, locale, priceCt }: { d: HeatData; lang: "en" | "de"; locale: string; priceCt: number }) {
  const t = L[lang];
  const s = d.state;
  const price = priceCt / 100;
  const eur = (v: number | null | undefined) => v == null ? "–" : new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(v);
  const tip = { contentStyle: { background: "#1c1f24", border: "1px solid #2c3235", fontSize: 12 } };

  const series = d.series.map((p) => ({
    ...p,
    label: new Date(p.t).toLocaleString(locale, { hour: "2-digit", minute: "2-digit" }),
    cop: p.hp != null && p.heat != null && p.hp > 200 ? Number((p.heat / p.hp).toFixed(2)) : null,
  }));

  // Tage mit Werten, jüngste 30. „aus dem Netz" ist der Rest des gemessenen Stroms nach dem Anteil, den der NEXA decken konnte.
  const days = d.days
    .filter((x) => (x.el_kwh ?? 0) > 0 || (x.heat_kwh ?? 0) > 0)
    .slice(-30)
    .map((x) => {
      const el = x.el_kwh ?? 0;
      const solar = Math.min(x.solar_kwh ?? 0, el);
      const direct = Math.min(x.direct_kwh ?? 0, solar);
      return {
        day: x.day, label: new Date(x.day + "T12:00:00").toLocaleDateString(locale, { day: "2-digit", month: "2-digit" }),
        heat: x.heat_kwh ?? 0, el, solar, direct, battery: Math.max(solar - direct, 0), grid: Math.max(el - solar, 0),
        pf: el > 0 && x.heat_kwh != null ? Number((x.heat_kwh / el).toFixed(2)) : null,
      };
    });
  const elSum = days.reduce((a, x) => a + x.el, 0);
  const solarSum = days.reduce((a, x) => a + x.solar, 0);
  const solarShare = elSum > 0 ? (solarSum / elSum) * 100 : null;

  // Jahreszahlen kommen aus den Zählern der Wärmepumpe; der Solaranteil wird auf das Jahr hochgerechnet,
  // weil wir ihn nur für die Tage kennen, an denen beides aufgezeichnet wurde.
  const heatYear = s?.heat_year ?? null;
  const elYear = s?.el_year ?? null;
  const gridYear = elYear == null ? null : elYear * (1 - (solarShare ?? 0) / 100);
  const co2Gas = heatYear == null ? null : heatYear * CO2_KG_PER_KWH_GAS_HEAT;
  const co2Hp = gridYear == null ? null : gridYear * CO2_KG_PER_KWH;
  const co2Saved = co2Gas != null && co2Hp != null ? co2Gas - co2Hp : null;

  // ---------------------------------------------------------------- Taktung
  // Die Kennzahlen und der Befund kommen fertig aus dem Sidecar, die drei Verteilungen aus der Datenbank.
  const cy = s?.cycling ?? null;
  const cyc = d.cycles ?? null;
  const BUCKETS: [number, string][] = [[0, "< 10"], [10, "10–20"], [20, "20–30"], [30, "30–60"], [60, "> 60"]];
  const lengths = BUCKETS.map(([lo, label]) => ({
    label: `${label} min`,
    hz: (cyc?.buckets ?? []).filter((b) => b.lo === lo && b.mode !== "ww").reduce((a, b) => a + b.n, 0),
    ww: (cyc?.buckets ?? []).filter((b) => b.lo === lo && b.mode === "ww").reduce((a, b) => a + b.n, 0),
  }));
  const byTemp = (cyc?.temp ?? []).map((r) => ({ label: `${r.t} °C`, n: r.n, med: r.med == null ? null : Number(r.med.toFixed(1)) }));
  const cycDays = (cyc?.days ?? []).map((r) => ({
    label: new Date(r.day + "T12:00:00").toLocaleDateString(locale, { day: "2-digit", month: "2-digit" }),
    n: r.n, med: r.med == null ? null : Number(r.med.toFixed(1)),
  }));
  const hasCycles = lengths.some((b) => b.hz + b.ww > 0);
  // Tageswerte: die Auswertung führt sie mit, der Zustand hat sie ohnehin – beides kommt aus denselben Zählern.
  const today = cy?.cycles_today ?? s?.cycles_today ?? null;
  const runToday = cy?.runtime_today_min ?? s?.runtime_today_min ?? null;
  const perCycleToday = cy?.per_cycle_today_min ?? s?.runtime_per_cycle_min ?? null;
  const shortPct = cy?.short_share == null ? null : cy.short_share * 100;
  const band = (v: number | null | undefined, good: number, bad: number, invert = false) =>
    v == null ? undefined : (invert ? v <= good : v >= good) ? "var(--bat)" : (invert ? v <= bad : v >= bad) ? "var(--house)" : "var(--red)";

  if (!s && !days.length) return <section><h2>{t.title}</h2><p className="muted">{t.noData}</p></section>;

  return (
    <section>
      <h2>{t.title} <small className="muted" style={{ fontSize: 12, fontWeight: 400 }}>· {t.hint}</small></h2>

      <div className="tiles">
        <Tile k={t.mode} v={s?.mode_text || "–"} s={s?.compressor_text ? `${t.compressor}: ${s.compressor_text}` : undefined} color="var(--soc)" />
        <Tile k={t.cop} v={n2(s?.cop)} s={`${fmtKw(s?.heat_kw != null ? s.heat_kw * 1000 : null)} / ${fmtKw(s?.hp_w)}`} color="var(--bat)" />
        <Tile k={t.flow} v={`${n1(s?.flow_c)} / ${n1(s?.return_c)}`} unit="°C" s={`${t.spread} ${n1(s?.spread)} K`} color="var(--house)" />
        <Tile k={t.dhw} v={fmtC(s?.dhw_c)} s={s?.dhw_set_c != null ? `${t.setpoint} ${s.dhw_set_c} °C` : undefined} />
        <Tile k={t.outside} v={fmtC(s?.outside_c)} color="var(--soc)" />
        <Tile k={t.heatToday} v={fmtKwh(s?.heat_today)} color="var(--house)" />
        <Tile k={t.elToday} v={fmtKwh(s?.el_today)} color="var(--red)" />
        <Tile k={t.pfToday} v={n2(s?.pf_today)} s={s?.taz_yesterday ? `${t.yesterday} ${n2(s.taz_yesterday)}` : undefined} color="var(--bat)" />
        <Tile k={t.spf} v={n2(s?.spf_year)} s={s?.spf_prev_year ? `${t.spfPrev} ${n2(s.spf_prev_year)}` : t.noYear} color="var(--bat)" />
        {s?.eheat_min_today != null && s.eheat_min_today > 0 &&
          <Tile k={t.eheat} v={`${Math.round(s.eheat_min_today)} min`} s={s.hours_eheat != null ? `${Math.round(s.hours_eheat)} h ${t.totalShort}` : undefined} color="var(--red)" />}
      </div>

      <div className="charts" style={{ marginTop: 14 }}>
        <div>
          <h3 style={{ fontSize: 13, margin: "0 0 6px", color: "var(--muted)", fontWeight: 600 }}>{t.power}</h3>
          <div className="chart">
            <ResponsiveContainer>
              <ComposedChart data={series}>
                <CartesianGrid stroke="#2c3235" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#8e8e8e" }} minTickGap={40} />
                <YAxis yAxisId="w" tick={{ fontSize: 11, fill: "#8e8e8e" }} width={48} unit=" W" />
                <YAxis yAxisId="cop" orientation="right" tick={{ fontSize: 11, fill: "#8e8e8e" }} width={34} domain={[0, 8]} />
                <Tooltip {...tip} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area yAxisId="w" type="monotone" dataKey="heat" name={t.heatOut} stroke="var(--house)" fill="var(--house)" fillOpacity={0.25} dot={false} />
                <Area yAxisId="w" type="monotone" dataKey="hp" name={t.elIn} stroke="var(--red)" fill="var(--red)" fillOpacity={0.25} dot={false} />
                <Line yAxisId="cop" type="monotone" dataKey="cop" name="COP" stroke="var(--bat)" strokeWidth={2} dot={false} connectNulls={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <h3 style={{ fontSize: 13, margin: "0 0 6px", color: "var(--muted)", fontWeight: 600 }}>{t.temps}</h3>
          <div className="chart">
            <ResponsiveContainer>
              <AreaChart data={series}>
                <CartesianGrid stroke="#2c3235" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#8e8e8e" }} minTickGap={40} />
                <YAxis tick={{ fontSize: 11, fill: "#8e8e8e" }} width={40} unit=" °C" />
                <Tooltip {...tip} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="flow" name={t.flow.split(" / ")[0]} stroke="var(--house)" fill="none" dot={false} />
                <Area type="monotone" dataKey="ret" name={t.ret} stroke="var(--pv)" fill="none" dot={false} />
                <Area type="monotone" dataKey="dhw" name={t.dhw} stroke="var(--red)" fill="none" dot={false} />
                <Area type="monotone" dataKey="outside" name={t.outside} stroke="var(--soc)" fill="none" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {days.length > 0 && <>
        <h3 style={{ fontSize: 13, margin: "16px 0 6px", color: "var(--muted)", fontWeight: 600 }}>{t.perDay}</h3>
        <div className="chart">
          <ResponsiveContainer>
            <ComposedChart data={days}>
              <CartesianGrid stroke="#2c3235" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#8e8e8e" }} minTickGap={16} />
              <YAxis yAxisId="kwh" tick={{ fontSize: 11, fill: "#8e8e8e" }} width={48} unit=" kWh" />
              <YAxis yAxisId="pf" orientation="right" tick={{ fontSize: 11, fill: "#8e8e8e" }} width={34} domain={[0, 8]} />
              <Tooltip {...tip} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="kwh" dataKey="heat" name={t.heat} fill="var(--house)" />
              <Bar yAxisId="kwh" dataKey="el" name={t.el} fill="var(--red)" />
              <Line yAxisId="pf" type="monotone" dataKey="pf" name={t.pf} stroke="var(--bat)" strokeWidth={2} dot={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <h3 style={{ fontSize: 13, margin: "16px 0 2px", color: "var(--muted)", fontWeight: 600 }}>{t.solar}</h3>
        <p className="muted" style={{ margin: "0 0 6px", fontSize: 12 }}>{t.solarHint}</p>
        <div className="chart">
          <ResponsiveContainer>
            <BarChart data={days}>
              <CartesianGrid stroke="#2c3235" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#8e8e8e" }} minTickGap={16} />
              <YAxis tick={{ fontSize: 11, fill: "#8e8e8e" }} width={48} unit=" kWh" />
              <Tooltip {...tip} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="direct" name={t.fromSolar} stackId="el" fill="var(--pv)" />
              <Bar dataKey="battery" name={t.fromBattery} stackId="el" fill="var(--bat)" />
              <Bar dataKey="grid" name={t.fromGrid} stackId="el" fill="var(--muted)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </>}

      {(cy || hasCycles) && <>
        <h3 style={{ fontSize: 13, margin: "18px 0 2px", color: "var(--muted)", fontWeight: 600 }}>{t.cycling}</h3>
        <p className="muted" style={{ margin: "0 0 8px", fontSize: 12 }}>{t.cyclingHint}</p>
        {cy?.verdict && <Verdict v={cy.verdict} lang={lang} turn={t.turn} />}
        {cy?.notes?.map((n) => (
          <div key={n.code} className="muted" style={{ fontSize: 12, margin: "0 0 6px", paddingLeft: 3,
                                                       borderLeft: `2px solid ${VERDICT_COLOR[n.severity] || "var(--line)"}`, paddingInlineStart: 8 }}>
            {lang === "de" ? n.de : n.en}
          </div>
        ))}

        {cy && <div className="tiles" style={{ marginTop: 10 }}>
          {/* Heute steht ab dem ersten Takt fest und wartet nicht auf das Auswertefenster. */}
          <Tile k={t.cyclesToday} v={today == null ? "–" : String(today)}
                s={runToday == null ? undefined : `${Math.round(runToday)} min ${t.sinceMidnight}`}
                color={band(today, 0, 20, true)} />
          <Tile k={t.perCycleToday} v={perCycleToday == null ? "–" : String(Math.round(perCycleToday))} unit="min"
                s={t.perCycleTodayS} color={band(perCycleToday, 30, 10)} />
          <Tile k={t.medianRun} v={cy.median_min == null ? "–" : String(Math.round(cy.median_min))} unit="min"
                s={t.medianRunS.replace("{d}", String(Math.round(cy.span_days ?? cy.window_days ?? 14)))}
                color={band(cy.median_min, 30, 10)} />
          <Tile k={t.shortShare} v={shortPct == null ? "–" : `${shortPct.toFixed(0)} %`} s={t.shortShareS}
                color={band(shortPct, 15, 30, true)} />
          <Tile k={t.perDayC} v={cy.per_day == null ? "–" : n1(cy.per_day)} s={t.perDayCS}
                color={band(cy.per_day, 16, 30, true)} />
          <Tile k={t.perYear} v={cy.starts_per_year == null ? "–" : new Intl.NumberFormat(locale).format(cy.starts_per_year)}
                s={t.perYearS} color={band(cy.starts_per_year, 2000, 6000, true)} />
          <Tile k={t.runShare} v={cy.runtime_share == null ? "–" : `${(cy.runtime_share * 100).toFixed(0)} %`} s={t.runShareS} color="var(--soc)" />
          <Tile k={t.pause} v={cy.median_pause_min == null ? "–" : String(Math.round(cy.median_pause_min))} unit="min" s={t.pauseS} />
        </div>}

        {hasCycles ? <>
          <div className="charts" style={{ marginTop: 14 }}>
            <div>
              <h3 style={{ fontSize: 13, margin: "0 0 2px", color: "var(--muted)", fontWeight: 600 }}>{t.lengths}</h3>
              <p className="muted" style={{ margin: "0 0 6px", fontSize: 12 }}>{t.lengthsHint}</p>
              <div className="chart">
                <ResponsiveContainer>
                  <BarChart data={lengths}>
                    <CartesianGrid stroke="#2c3235" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#8e8e8e" }} />
                    <YAxis tick={{ fontSize: 11, fill: "#8e8e8e" }} width={36} allowDecimals={false} />
                    <Tooltip {...tip} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="hz" name={t.heating} stackId="c" fill="var(--house)" />
                    <Bar dataKey="ww" name={t.hotwater} stackId="c" fill="var(--soc)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div>
              <h3 style={{ fontSize: 13, margin: "0 0 2px", color: "var(--muted)", fontWeight: 600 }}>{t.byTemp}</h3>
              <p className="muted" style={{ margin: "0 0 6px", fontSize: 12 }}>{t.byTempHint}</p>
              <div className="chart">
                <ResponsiveContainer>
                  <ComposedChart data={byTemp}>
                    <CartesianGrid stroke="#2c3235" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#8e8e8e" }} minTickGap={8} />
                    <YAxis yAxisId="n" tick={{ fontSize: 11, fill: "#8e8e8e" }} width={32} allowDecimals={false} />
                    <YAxis yAxisId="m" orientation="right" tick={{ fontSize: 11, fill: "#8e8e8e" }} width={40} unit=" min" />
                    <Tooltip {...tip} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar yAxisId="n" dataKey="n" name={t.cyclesLabel} fill="var(--house)" />
                    <Line yAxisId="m" type="monotone" dataKey="med" name={t.medianRun} stroke="var(--bat)" strokeWidth={2} dot={false} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {cycDays.length > 1 && <>
            <h3 style={{ fontSize: 13, margin: "16px 0 2px", color: "var(--muted)", fontWeight: 600 }}>{t.trend}</h3>
            <p className="muted" style={{ margin: "0 0 6px", fontSize: 12 }}>{t.trendHint}</p>
            <div className="chart">
              <ResponsiveContainer>
                <ComposedChart data={cycDays}>
                  <CartesianGrid stroke="#2c3235" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#8e8e8e" }} minTickGap={16} />
                  <YAxis yAxisId="n" tick={{ fontSize: 11, fill: "#8e8e8e" }} width={32} allowDecimals={false} />
                  <YAxis yAxisId="m" orientation="right" tick={{ fontSize: 11, fill: "#8e8e8e" }} width={40} unit=" min" />
                  <Tooltip {...tip} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="n" dataKey="n" name={t.cyclesLabel} fill="var(--house)" />
                  <Line yAxisId="m" type="monotone" dataKey="med" name={t.medianRun} stroke="var(--bat)" strokeWidth={2} dot={false} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </>}
        </> : <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>{t.noCycles}</p>}
      </>}

      <h3 style={{ fontSize: 13, margin: "16px 0 6px", color: "var(--muted)", fontWeight: 600 }}>
        {t.costs} <span style={{ fontWeight: 400 }}>· {t.costsAt.replace("{p}", new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(priceCt))}</span>
      </h3>
      <div className="tiles">
        <Tile k={t.costToday} v={eur(s?.el_today != null ? s.el_today * price : null)} color="var(--red)" />
        <Tile k={t.costYear} v={eur(elYear != null ? elYear * price : null)} s={`${fmtKwh(elYear)} ${t.year}`} color="var(--red)" />
        <Tile k={t.perKwh} v={s?.spf_year ? `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(priceCt / s.spf_year)} ct` : "–"} s={t.perKwhS} color="var(--house)" />
        <Tile k={t.savedVsEl} v={eur(heatYear != null && elYear != null ? (heatYear - elYear) * price : null)}
              s={t.savedVsElS.replace("{h}", String(Math.round(heatYear ?? 0))).replace("{e}", String(Math.round(elYear ?? 0)))} color="var(--bat)" />
        {solarShare != null && <Tile k={t.solarShare} v={`${solarShare.toFixed(0)} %`} s={t.solarShareS} color="var(--bat)" />}
      </div>

      <h3 style={{ fontSize: 13, margin: "16px 0 6px", color: "var(--muted)", fontWeight: 600 }}>{t.env}</h3>
      <div className="tiles">
        <Tile k={t.co2Gas} v={co2Gas == null ? "–" : `${co2Gas.toFixed(0)} kg`}
              s={t.co2GasS.replace("{h}", String(Math.round(heatYear ?? 0))).replace("{f}", String(CO2_KG_PER_KWH_GAS_HEAT).replace(".", lang === "de" ? "," : "."))} color="var(--muted)" />
        <Tile k={t.co2Hp} v={co2Hp == null ? "–" : `${co2Hp.toFixed(0)} kg`}
              s={t.co2HpS.replace("{f}", String(CO2_KG_PER_KWH).replace(".", lang === "de" ? "," : "."))} color="var(--muted)" />
        <Tile k={t.co2Saved} v={co2Saved == null ? "–" : `${co2Saved.toFixed(0)} kg`} s={t.co2SavedS} color="var(--bat)" />
      </div>
    </section>
  );
}
