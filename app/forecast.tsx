"use client";
// Jahresprognose: wie viel Strom im Jahr zusammenkommt, was die Jahresrechnung kostet und welcher Abschlag
// beim Versorger richtig wäre. Gerechnet wird nichts hier – das macht der Sidecar forecast, Stunde für Stunde
// über ein volles Jahr mit dem echten Wetter des Standorts. Diese Seite zeigt sein Ergebnis, damit Grafana,
// Einstellungsseite und Website dieselbe Zahl nennen.

import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type ForecastMonth = {
  m: number; household_kwh: number; heatpump_kwh: number; heat_kwh: number; pv_kwh: number;
  self_kwh: number; grid_kwh: number; feedin_kwh: number; lost_kwh: number; cost_eur: number;
};
export type ForecastYear = {
  household_kwh: number; heatpump_kwh: number; heat_kwh: number; load_kwh: number; pv_kwh: number;
  self_kwh: number; grid_kwh: number; feedin_kwh: number; lost_kwh: number;
  spf: number | null; self_share_pct: number | null; autarky_pct: number | null;
  cost_energy_eur: number; cost_base_eur: number; revenue_eur: number; cost_total_eur: number;
  cost_without_pv_eur: number; saving_eur: number; price_ct_kwh: number; base_eur_month: number;
  eheat_kwh?: number; uncertainty_pct?: number | null; cost_low_eur?: number | null; cost_high_eur?: number | null;
};
export type ForecastData = {
  updated: number; period: [string, string]; quality: "measured" | "partial" | "assumed";
  year: ForecastYear; months: ForecastMonth[];
  abschlag: { recommended_eur: number; current_eur?: number | null; monthly_average_eur: number;
              low_eur?: number; high_eur?: number; delta_eur?: number; year_delta_eur?: number;
              action: string; de: string; en: string };
  assumptions: { key: string; de: string; en: string; source: string; value?: number | null }[];
  stored?: string;
};

const L = {
  en: {
    title: "Annual forecast",
    hint: "A full year modelled hour by hour with the real weather of this location: heat demand spread by heating degree hours and divided by the COP of each hour, PV from the tilt and azimuth of every string, the battery within its 800 W output limit. It is a calculation with assumptions, not a measurement — the list at the bottom says which figure rests on what.",
    load: "Consumption", loadS: "household plus heat pump", hp: "of it heat pump", house: "of it household",
    pv: "PV yield", pvS: "of which {s} % used yourself", grid: "Grid import", gridS: "what is left to buy",
    autarky: "Self-sufficiency", autarkyS: "share of consumption from your own system",
    bill: "Annual bill", billS: "{e} energy + {b} base fee", band: "range {l} to {h}", safe: "or {h} to be safe", saved: "Saved by the system", savedS: "against the same year without PV and battery",
    abschlag: "Recommended monthly payment", abschlagS: "bill ÷ 12, rounded up",
    current: "Your payment today", spf: "Seasonal performance factor", spfS: "heat produced per kWh of electricity",
    perMonth: "Consumption per month", perMonthHint: "Winter carries almost the whole heat pump share, and the PV runs exactly counter to it.",
    costMonth: "Grid import and cost per month", costMonthHint: "This is where the monthly payment comes from: the months are very uneven, and the payment smooths them into twelve equal instalments.",
    household: "Household", heatpump: "Heat pump", pvLabel: "PV yield", gridLabel: "Grid import", costLabel: "Cost",
    basis: "What this rests on", quality: { measured: "from measurements", partial: "partly estimated", assumed: "assumed" },
    source: { measured: "measured", config: "your entry", default: "assumed", missing: "missing" },
    none: "No forecast yet. The forecast service needs a location, an electricity price and a heat demand — all of them on the settings page of the stack.",
    period: "Weather year {a} to {b}",
  },
  de: {
    title: "Jahresprognose",
    hint: "Ein volles Jahr, Stunde für Stunde mit dem echten Wetter dieses Standorts gerechnet: der Wärmebedarf nach Heizgradstunden verteilt und durch den COP der jeweiligen Stunde geteilt, die PV aus Neigung und Azimut jedes Strings, die Batterie innerhalb ihrer 800-W-Abgabegrenze. Das ist eine Rechnung mit Annahmen, keine Messung – die Liste unten sagt, worauf jede Zahl beruht.",
    load: "Verbrauch", loadS: "Haushalt plus Wärmepumpe", hp: "davon Wärmepumpe", house: "davon Haushalt",
    pv: "PV-Ertrag", pvS: "davon {s} % selbst genutzt", grid: "Netzbezug", gridS: "was übrig bleibt zu kaufen",
    autarky: "Autarkie", autarkyS: "Anteil des Verbrauchs aus der eigenen Anlage",
    bill: "Jahresrechnung", billS: "{e} Arbeitspreis + {b} Grundpreis", band: "Spanne {l} bis {h}", safe: "sicherheitshalber {h}", saved: "Ersparnis durch die Anlage", savedS: "gegen dasselbe Jahr ohne PV und Batterie",
    abschlag: "Empfohlener Abschlag", abschlagS: "Rechnung ÷ 12, aufgerundet",
    current: "Dein Abschlag heute", spf: "Jahresarbeitszahl", spfS: "Wärme je kWh Strom",
    perMonth: "Verbrauch je Monat", perMonthHint: "Der Winter trägt fast den ganzen Wärmepumpenanteil, die PV steht ihm genau gegenläufig.",
    costMonth: "Netzbezug und Kosten je Monat", costMonthHint: "Daher kommt der Abschlag: die Monate sind sehr ungleich, der Abschlag glättet sie auf zwölf gleiche Raten.",
    household: "Haushalt", heatpump: "Wärmepumpe", pvLabel: "PV-Ertrag", gridLabel: "Netzbezug", costLabel: "Kosten",
    basis: "Worauf das beruht", quality: { measured: "aus Messwerten", partial: "teils geschätzt", assumed: "angenommen" },
    source: { measured: "gemessen", config: "deine Angabe", default: "angenommen", missing: "fehlt" },
    none: "Noch keine Prognose. Der Prognosedienst braucht Standort, Strompreis und Wärmebedarf – alles auf der Einstellungsseite des Stacks.",
    period: "Wetterjahr {a} bis {b}",
  },
};

const QUALITY_COLOR: Record<string, string> = { measured: "var(--bat)", partial: "var(--soc)", assumed: "var(--house)" };
const SOURCE_COLOR: Record<string, string> = { measured: "var(--bat)", config: "var(--soc)", default: "var(--muted)", missing: "var(--red)" };
const ACTION_COLOR: Record<string, string> = { keep: "var(--bat)", lower: "var(--soc)", raise: "var(--red)", unknown: "var(--muted)" };

const Tile = ({ k, v, unit, s, color }: { k: string; v: string; unit?: string; s?: string; color?: string }) => (
  <div className="tile"><div className="k">{k}</div><div className="v" style={color ? { color } : undefined}>{v}{unit && <small>{unit}</small>}</div>{s && <div className="s">{s}</div>}</div>
);

export function ForecastSection({ d, lang, locale }: { d: ForecastData | null; lang: "en" | "de"; locale: string }) {
  const t = L[lang];
  if (!d || !d.year) return <section><h2>{t.title}</h2><p className="muted">{t.none}</p></section>;

  const y = d.year, ab = d.abschlag;
  const tip = { contentStyle: { background: "#1c1f24", border: "1px solid #2c3235", fontSize: 12 } };
  const nf = (v: number | null | undefined, digits = 0) =>
    v == null ? "–" : new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(v);
  const eur = (v: number | null | undefined) =>
    v == null ? "–" : new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
  const monthName = (m: number) => new Date(2025, m - 1, 1).toLocaleDateString(locale, { month: "short" });
  const months = (d.months || []).map((m) => ({ ...m, label: monthName(m.m) }));

  return (
    <section>
      <h2>{t.title}{" "}
        <small style={{ fontSize: 12, fontWeight: 500, color: QUALITY_COLOR[d.quality] || "var(--muted)" }}>
          · {t.quality[d.quality] || d.quality}
        </small>
        {d.period && <small className="muted" style={{ fontSize: 12, fontWeight: 400 }}>
          {" "}· {t.period.replace("{a}", d.period[0]).replace("{b}", d.period[1])}
        </small>}
      </h2>
      <p className="muted" style={{ margin: "0 0 10px", fontSize: 12 }}>{t.hint}</p>

      <div className="tiles">
        <Tile k={t.load} v={nf(y.load_kwh)} unit="kWh" s={t.loadS} color="var(--house)" />
        <Tile k={t.hp} v={nf(y.heatpump_kwh)} unit="kWh"
              s={y.spf ? `${t.spfS}: ${nf(y.spf, 2)}` : undefined} color="var(--red)" />
        <Tile k={t.house} v={nf(y.household_kwh)} unit="kWh" />
        <Tile k={t.pv} v={nf(y.pv_kwh)} unit="kWh"
              s={y.self_share_pct != null ? t.pvS.replace("{s}", nf(y.self_share_pct)) : undefined} color="var(--pv)" />
        <Tile k={t.grid} v={nf(y.grid_kwh)} unit="kWh" s={t.gridS} color="var(--red)" />
        <Tile k={t.autarky} v={y.autarky_pct == null ? "–" : `${nf(y.autarky_pct)} %`} s={t.autarkyS} color="var(--bat)" />
      </div>

      <div className="tiles" style={{ marginTop: 10 }}>
        <Tile k={t.bill} v={eur(y.cost_total_eur)}
              s={y.cost_low_eur != null
                   ? `${t.billS.replace("{e}", eur(y.cost_energy_eur)).replace("{b}", eur(y.cost_base_eur))} · ${t.band.replace("{l}", eur(y.cost_low_eur)).replace("{h}", eur(y.cost_high_eur))}`
                   : t.billS.replace("{e}", eur(y.cost_energy_eur)).replace("{b}", eur(y.cost_base_eur))} color="var(--red)" />
        <Tile k={t.saved} v={eur(y.saving_eur)} s={t.savedS} color="var(--bat)" />
        <Tile k={t.abschlag} v={eur(ab.recommended_eur)}
              s={ab.high_eur ? `${t.abschlagS} · ${t.safe.replace("{h}", eur(ab.high_eur))}` : t.abschlagS}
              color={ACTION_COLOR[ab.action] || "var(--bat)"} />
        {ab.current_eur != null && <Tile k={t.current} v={eur(ab.current_eur)}
              s={ab.year_delta_eur ? `${ab.year_delta_eur > 0 ? "+" : ""}${eur(ab.year_delta_eur)} / a` : undefined} />}
      </div>

      <div style={{ background: "#1c1f24", border: "1px solid var(--line)", borderLeft: `3px solid ${ACTION_COLOR[ab.action] || "var(--muted)"}`,
                    borderRadius: 6, padding: "10px 12px", margin: "12px 0 0", fontSize: 13.5, lineHeight: 1.5 }}>
        {lang === "de" ? ab.de : ab.en}
      </div>

      <div className="charts" style={{ marginTop: 14 }}>
        <div>
          <h3 style={{ fontSize: 13, margin: "0 0 2px", color: "var(--muted)", fontWeight: 600 }}>{t.perMonth}</h3>
          <p className="muted" style={{ margin: "0 0 6px", fontSize: 12 }}>{t.perMonthHint}</p>
          <div className="chart">
            <ResponsiveContainer>
              <BarChart data={months}>
                <CartesianGrid stroke="#2c3235" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#8e8e8e" }} />
                <YAxis tick={{ fontSize: 11, fill: "#8e8e8e" }} width={48} unit=" kWh" />
                <Tooltip {...tip} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="household_kwh" name={t.household} stackId="l" fill="var(--house)" />
                <Bar dataKey="heatpump_kwh" name={t.heatpump} stackId="l" fill="var(--red)" />
                <Bar dataKey="pv_kwh" name={t.pvLabel} fill="var(--pv)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <h3 style={{ fontSize: 13, margin: "0 0 2px", color: "var(--muted)", fontWeight: 600 }}>{t.costMonth}</h3>
          <p className="muted" style={{ margin: "0 0 6px", fontSize: 12 }}>{t.costMonthHint}</p>
          <div className="chart">
            <ResponsiveContainer>
              <ComposedChart data={months}>
                <CartesianGrid stroke="#2c3235" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#8e8e8e" }} />
                <YAxis yAxisId="kwh" tick={{ fontSize: 11, fill: "#8e8e8e" }} width={48} unit=" kWh" />
                <YAxis yAxisId="eur" orientation="right" tick={{ fontSize: 11, fill: "#8e8e8e" }} width={44} unit=" €" />
                <Tooltip {...tip} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="kwh" dataKey="grid_kwh" name={t.gridLabel} fill="var(--red)" />
                <Line yAxisId="eur" type="monotone" dataKey="cost_eur" name={t.costLabel} stroke="var(--bat)" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <h3 style={{ fontSize: 13, margin: "16px 0 6px", color: "var(--muted)", fontWeight: 600 }}>{t.basis}</h3>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
        {(d.assumptions || []).map((a) => (
          <li key={a.key}>
            <span style={{ color: SOURCE_COLOR[a.source] || "var(--muted)", fontWeight: 600 }}>
              {(t.source as Record<string, string>)[a.source] || a.source}
            </span>{" · "}{lang === "de" ? a.de : a.en}
          </li>
        ))}
      </ul>
    </section>
  );
}
