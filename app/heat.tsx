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
};
export type HeatDay = { day: string; heat_kwh: number | null; el_kwh: number | null; spf: number | null; hp_kwh: number | null; solar_kwh: number | null; direct_kwh: number | null; minutes: number };
export type HeatData = {
  updated: string | null;
  state: HeatState | null;
  series: { t: string; hp: number | null; heat: number | null; flow: number | null; ret: number | null; dhw: number | null; outside: number | null; freq: number | null }[];
  days: HeatDay[];
};

const L = {
  en: {
    title: "Heat pump", hint: "Wolf CHA over the local WOLF Link. The heat pump reports its power input in whole kW, so the live figures are coarsely stepped; the daily kWh counters are exact.",
    mode: "Mode", compressor: "Compressor", cop: "COP now", heatOut: "Heat output", elIn: "Power input", flow: "Flow / return", spread: "spread",
    dhw: "Hot water", setpoint: "setpoint", outside: "Outside", heatToday: "Heat today", elToday: "Electricity today", pfToday: "Factor today",
    spf: "SPF this year", spfPrev: "last year", cycles: "Cycles today", perCycle: "per cycle", runtime: "runtime", eheat: "Immersion heater",
    power: "Heat output, power input and COP", temps: "Temperatures", perDay: "Heat and electricity per day", pf: "Performance factor",
    heat: "Heat", el: "Electricity", ret: "Return", noData: "no heat pump data yet",
    solar: "Where the heat pump's electricity came from", solarHint: "Per day, minute by minute: the part the NEXA could cover at that moment (the smaller of heat pump draw and NEXA output), split by how much of the NEXA output came straight from the panels rather than the battery; the rest came from the grid. An estimate, because the heat pump only reports whole kW.",
    fromSolar: "Straight from solar", fromBattery: "From the battery", fromGrid: "From the grid", solarShare: "Covered by the NEXA", solarShareS: "of the heat pump's electricity over the days shown",
    costs: "Costs", costsAt: "at {p} ct/kWh", costToday: "Heat cost today", costYear: "Heat cost this year", perKwh: "Per kWh of heat",
    perKwhS: "price divided by this year's performance factor", savedVsEl: "Saved vs. direct electric heating", savedVsElS: "{h} kWh of heat with {e} kWh of electricity",
    env: "Environment", co2Gas: "A gas boiler would emit", co2GasS: "{h} kWh of heat × {f} kg/kWh (gas at ~85 % efficiency)",
    co2Hp: "The heat pump emits", co2HpS: "grid share × {f} kg/kWh, the solar share counts as zero", co2Saved: "CO₂ avoided this year", co2SavedS: "difference between the two",
    year: "this year", month: "this month", noYear: "no full year yet", yesterday: "yesterday", totalShort: "total",
  },
  de: {
    title: "Wärmepumpe", hint: "Wolf CHA über den lokalen WOLF Link. Die Wärmepumpe meldet ihre Leistungsaufnahme nur in ganzen kW, die Live-Werte sind deshalb grob gestuft; die Tageszähler in kWh sind genau.",
    mode: "Betriebsart", compressor: "Verdichter", cop: "COP jetzt", heatOut: "Wärmeleistung", elIn: "Aufnahme", flow: "Vorlauf / Rücklauf", spread: "Spreizung",
    dhw: "Warmwasser", setpoint: "Soll", outside: "Außen", heatToday: "Wärme heute", elToday: "Strom heute", pfToday: "Arbeitszahl heute",
    spf: "JAZ dieses Jahr", spfPrev: "Vorjahr", cycles: "Takte heute", perCycle: "je Takt", runtime: "Laufzeit", eheat: "Heizstab",
    power: "Wärmeleistung, Aufnahme und COP", temps: "Temperaturen", perDay: "Wärme und Strom je Tag", pf: "Arbeitszahl",
    heat: "Wärme", el: "Strom", ret: "Rücklauf", noData: "noch keine Daten der Wärmepumpe",
    solar: "Woher der Strom der Wärmepumpe kam", solarHint: "Je Tag, Minute für Minute: der Teil, den der NEXA im selben Moment decken konnte (der kleinere Wert aus Aufnahme und NEXA-Abgabe), aufgeteilt danach, wie viel der NEXA-Abgabe gerade direkt von den Modulen kam statt aus der Batterie; der Rest kam aus dem Netz. Eine Schätzung, weil die Wärmepumpe nur ganze kW meldet.",
    fromSolar: "Direkt aus Solar", fromBattery: "Aus der Batterie", fromGrid: "Aus dem Netz", solarShare: "Vom NEXA gedeckt", solarShareS: "des Wärmepumpenstroms in den gezeigten Tagen",
    costs: "Kosten", costsAt: "bei {p} ct/kWh", costToday: "Wärmekosten heute", costYear: "Wärmekosten dieses Jahr", perKwh: "Je kWh Wärme",
    perKwhS: "Arbeitspreis geteilt durch die Arbeitszahl des Jahres", savedVsEl: "Gespart gegenüber Stromdirektheizung", savedVsElS: "{h} kWh Wärme mit {e} kWh Strom",
    env: "Umwelt", co2Gas: "Eine Gasheizung stieße aus", co2GasS: "{h} kWh Wärme × {f} kg/kWh (Gas bei rund 85 % Nutzungsgrad)",
    co2Hp: "Die Wärmepumpe stößt aus", co2HpS: "Netzanteil × {f} kg/kWh, der Solaranteil zählt als null", co2Saved: "CO₂ vermieden dieses Jahr", co2SavedS: "Differenz der beiden",
    year: "dieses Jahr", month: "dieser Monat", noYear: "noch kein volles Jahr", yesterday: "Vortag", totalShort: "gesamt",
  },
};

const fmtKwh = (k: number | null | undefined) => k == null ? "–" : k < 1 ? `${(k * 1000).toFixed(0)} Wh` : `${k.toFixed(k < 100 ? 1 : 0)} kWh`;
const fmtKw = (w: number | null | undefined) => w == null ? "–" : `${(w / 1000).toFixed(2)} kW`;
const fmtC = (c: number | null | undefined) => c == null || c < -100 ? "–" : `${c.toFixed(1)} °C`;
const n1 = (v: number | null | undefined) => v == null ? "–" : v.toFixed(1);
const n2 = (v: number | null | undefined) => v == null ? "–" : v.toFixed(2);

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
        <Tile k={t.cycles} v={s?.cycles_today == null ? "–" : String(s.cycles_today)}
              s={s?.runtime_per_cycle_min ? `${t.perCycle} ${Math.round(s.runtime_per_cycle_min)} min · ${t.runtime} ${Math.round(s.runtime_today_min ?? 0)} min` : undefined} />
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
