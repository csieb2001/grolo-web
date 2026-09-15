"use client";
// Jahreskalender: zwölf Monatsraster, jeder Tag eine Kachel, Farbe nach PV-Ertrag; darunter die Highlights des Jahres
// (stärkster/schwächster Tag, höchste Spitze, beste Eigenversorgung, bester Monat, Jahressumme). Klick auf einen Tag wählt ihn
// im Abschnitt "Strings und Sonne" aus.

export type CalDay = { day: string; pv_kwh: number | null; out_kwh: number | null; acin_kwh: number | null; charge_kwh?: number | null; discharge_kwh?: number | null; grid_kwh: number | null; house_kwh: number | null; minutes: number; peak_w: number | null; peak_t: string | null };
export const CO2_KG_PER_KWH = 0.38;   // deutscher Strommix, Richtwert (UBA 2024: ~0,38 kg CO₂/kWh)
export type CalData = { year: number; years: number[]; days: CalDay[] };

const L = {
  en: { title: "Year calendar", hint: "Each tile is one day, brighter = more PV yield. Click a day to open it in “Strings and sun”.", highlights: "Highlights of the year",
        best: "Strongest day", worst: "Weakest day with data", peak: "Highest PV peak", self: "Best self-sufficiency", house: "Highest household consumption", grid: "Most grid import",
        month: "Best month", total: "Year so far", days: "days recorded", avg: "Ø per day", noData: "no data for this year yet", at: "at", minutes: "min", legendLow: "little", legendHigh: "much",
        wd: ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"], self_of: "of the household load from the NEXA", partial: "day with less than 12 h of data",
        earn: "Best earnings", earnYear: "Saved this year", costDay: "Most expensive grid day", batDay: "Most battery power", batDayS: "discharged to the house", autark: "Self-sufficient days", autarkS: "days with ≥ 90 % from the NEXA, best streak {n} in a row",
        streak: "Longest run above the yearly average", streakS: "{n} days, {from} to {to}", week: "Best week", weekS: "calendar week {w}", co2: "CO₂ avoided", co2S: "output to house × {f} kg/kWh (German grid mix)", atPrice: "at {p} ct/kWh", noneYet: "none yet" },
  de: { title: "Jahreskalender", hint: "Jede Kachel ein Tag, heller = mehr PV-Ertrag. Klick auf einen Tag öffnet ihn unter „Strings und Sonne“.", highlights: "Highlights des Jahres",
        best: "Stärkster Tag", worst: "Schwächster Tag mit Daten", peak: "Höchste PV-Spitze", self: "Beste Eigenversorgung", house: "Höchster Hausverbrauch", grid: "Meister Netzbezug",
        month: "Bester Monat", total: "Jahr bisher", days: "Tage aufgezeichnet", avg: "Ø pro Tag", noData: "noch keine Daten für dieses Jahr", at: "um", minutes: "min", legendLow: "wenig", legendHigh: "viel",
        wd: ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"], self_of: "des Hausverbrauchs vom NEXA", partial: "Tag mit weniger als 12 h Daten",
        earn: "Bester Verdienst", earnYear: "Ersparnis dieses Jahr", costDay: "Teuerster Netztag", batDay: "Meiste Batterieleistung", batDayS: "ins Haus entladen", autark: "Autarke Tage", autarkS: "Tage mit ≥ 90 % vom NEXA, beste Serie {n} in Folge",
        streak: "Längste Serie über dem Jahresdurchschnitt", streakS: "{n} Tage, {from} bis {to}", week: "Beste Woche", weekS: "Kalenderwoche {w}", co2: "CO₂ vermieden", co2S: "Abgabe ins Haus × {f} kg/kWh (deutscher Strommix)", atPrice: "bei {p} ct/kWh", noneYet: "noch keine" },
};

const fmtKwh = (k: number | null | undefined) => k == null ? "–" : k < 1 ? `${(k * 1000).toFixed(0)} Wh` : `${k.toFixed(2)} kWh`;
const fmtW = (w: number | null | undefined) => w == null ? "–" : w < 1000 ? `${w.toFixed(0)} W` : `${(w / 1000).toFixed(2)} kW`;

export function YearCalendar({ d, lang, today, setDay, setYear, priceCt }: { d: CalData; lang: "en" | "de"; today: string; setDay: (k: string) => void; setYear: (y: number) => void; priceCt: number }) {
  const t = L[lang]; const locale = lang === "de" ? "de-DE" : "en-GB";
  const eur = (v: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(v);
  const price = priceCt / 100;
  const byDay = new Map(d.days.map((x) => [x.day, x]));
  const withData = d.days.filter((x) => x.minutes >= 60);           // mindestens eine Stunde Daten
  const full = withData.filter((x) => x.minutes >= 12 * 60);         // für "schwächster Tag" nur ganze Tage
  const maxPv = Math.max(0.01, ...withData.map((x) => x.pv_kwh ?? 0));
  const fmtDate = (day: string) => new Date(day + "T12:00:00").toLocaleDateString(locale, { weekday: "short", day: "2-digit", month: "long" });
  const fmtTime = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }) : "";

  // ---- Highlights
  const best = [...withData].sort((a, b) => (b.pv_kwh ?? 0) - (a.pv_kwh ?? 0))[0];
  const worst = [...full].filter((x) => (x.pv_kwh ?? 0) > 0).sort((a, b) => (a.pv_kwh ?? 0) - (b.pv_kwh ?? 0))[0];
  const peak = [...withData].filter((x) => x.peak_w != null).sort((a, b) => (b.peak_w ?? 0) - (a.peak_w ?? 0))[0];
  const selfDays = full.filter((x) => (x.house_kwh ?? 0) > 0.5).map((x) => ({ x, pct: Math.min(100, (x.out_kwh ?? 0) / (x.house_kwh as number) * 100) })).sort((a, b) => b.pct - a.pct);
  const house = [...full].filter((x) => x.house_kwh != null).sort((a, b) => (b.house_kwh ?? 0) - (a.house_kwh ?? 0))[0];
  const grid = [...full].filter((x) => x.grid_kwh != null).sort((a, b) => (b.grid_kwh ?? 0) - (a.grid_kwh ?? 0))[0];
  const months = new Map<string, number>();
  for (const x of withData) months.set(x.day.slice(0, 7), (months.get(x.day.slice(0, 7)) ?? 0) + (x.pv_kwh ?? 0));
  const bestMonth = [...months.entries()].sort((a, b) => b[1] - a[1])[0];
  const totalPv = withData.reduce((a, x) => a + (x.pv_kwh ?? 0), 0);
  const items: { k: string; v: string; s?: string; color?: string }[] = [];
  if (best) items.push({ k: t.best, v: fmtKwh(best.pv_kwh), s: fmtDate(best.day), color: "var(--pv)" });
  if (worst && worst !== best) items.push({ k: t.worst, v: fmtKwh(worst.pv_kwh), s: fmtDate(worst.day), color: "var(--muted)" });
  if (peak) items.push({ k: t.peak, v: fmtW(peak.peak_w), s: `${fmtDate(peak.day)} ${t.at} ${fmtTime(peak.peak_t)}`, color: "var(--pv)" });
  if (selfDays[0]) items.push({ k: t.self, v: `${Math.round(selfDays[0].pct)} %`, s: `${fmtDate(selfDays[0].x.day)} · ${t.self_of}`, color: "var(--bat)" });
  if (house) items.push({ k: t.house, v: fmtKwh(house.house_kwh), s: fmtDate(house.day), color: "var(--house)" });
  if (grid) items.push({ k: t.grid, v: fmtKwh(grid.grid_kwh), s: fmtDate(grid.day), color: "var(--red)" });
  if (bestMonth) items.push({ k: t.month, v: fmtKwh(bestMonth[1]), s: new Date(bestMonth[0] + "-15T12:00:00").toLocaleDateString(locale, { month: "long", year: "numeric" }), color: "var(--pv)" });
  if (withData.length) items.push({ k: t.total, v: fmtKwh(totalPv), s: `${withData.length} ${t.days} · ${t.avg} ${fmtKwh(totalPv / withData.length)}`, color: "var(--pv)" });
  // ---- Geld, Batterie, Autarkie, Serien, Woche, CO₂
  const earn = [...withData].sort((a, b) => (b.out_kwh ?? 0) - (a.out_kwh ?? 0))[0];
  const totalOut = withData.reduce((a, x) => a + (x.out_kwh ?? 0), 0);
  if (earn && (earn.out_kwh ?? 0) > 0) items.push({ k: t.earn, v: eur((earn.out_kwh ?? 0) * price), s: `${fmtDate(earn.day)} · ${fmtKwh(earn.out_kwh)} · ${t.atPrice.replace("{p}", String(priceCt))}`, color: "var(--bat)" });
  if (withData.length) items.push({ k: t.earnYear, v: eur(totalOut * price), s: `${fmtKwh(totalOut)} · ${t.avg} ${eur(totalOut * price / withData.length)}`, color: "var(--bat)" });
  const costDay = [...full].filter((x) => x.grid_kwh != null).sort((a, b) => (b.grid_kwh ?? 0) - (a.grid_kwh ?? 0))[0];
  if (costDay) items.push({ k: t.costDay, v: eur((costDay.grid_kwh ?? 0) * price), s: `${fmtDate(costDay.day)} · ${fmtKwh(costDay.grid_kwh)}`, color: "var(--red)" });
  const batDay = [...withData].filter((x) => x.discharge_kwh != null).sort((a, b) => (b.discharge_kwh ?? 0) - (a.discharge_kwh ?? 0))[0];
  if (batDay && (batDay.discharge_kwh ?? 0) > 0.05) items.push({ k: t.batDay, v: fmtKwh(batDay.discharge_kwh), s: `${fmtDate(batDay.day)} · ${t.batDayS}`, color: "var(--bat)" });
  const autarkDays = full.filter((x) => (x.house_kwh ?? 0) > 0.5 && (x.out_kwh ?? 0) / (x.house_kwh as number) >= 0.9).map((x) => x.day).sort();
  if (full.some((x) => (x.house_kwh ?? 0) > 0.5)) {
    let bestRun = 0, run = 0, prev = "";
    for (const day of autarkDays) { run = prev && (new Date(day).getTime() - new Date(prev).getTime()) === 86400000 ? run + 1 : 1; bestRun = Math.max(bestRun, run); prev = day; }
    items.push({ k: t.autark, v: String(autarkDays.length), s: autarkDays.length ? t.autarkS.replace("{n}", String(bestRun)) : t.noneYet, color: "var(--bat)" });
  }
  if (withData.length >= 3) {
    const avg = totalPv / withData.length; const sorted = [...withData].sort((a, b) => a.day.localeCompare(b.day));
    let best: { n: number; from: string; to: string } | null = null, cur: { n: number; from: string; to: string } | null = null, prev = "";
    for (const x of sorted) {
      const consecutive = prev && (new Date(x.day).getTime() - new Date(prev).getTime()) === 86400000;
      if ((x.pv_kwh ?? 0) > avg) { cur = cur && consecutive ? { n: cur.n + 1, from: cur.from, to: x.day } : { n: 1, from: x.day, to: x.day }; if (!best || cur.n > best.n) best = cur; } else cur = null;
      prev = x.day;
    }
    if (best && best.n >= 2) items.push({ k: t.streak, v: `${best.n} ${lang === "de" ? "Tage" : "days"}`, s: t.streakS.replace("{n}", String(best.n)).replace("{from}", fmtDate(best.from)).replace("{to}", fmtDate(best.to)), color: "var(--pv)" });
  }
  const isoWeek = (day: string) => { const dt = new Date(day + "T12:00:00Z"); const dn = (dt.getUTCDay() + 6) % 7; dt.setUTCDate(dt.getUTCDate() - dn + 3); const y1 = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4)); return `${dt.getUTCFullYear()}-W${String(1 + Math.round(((dt.getTime() - y1.getTime()) / 86400000 - 3 + ((y1.getUTCDay() + 6) % 7)) / 7)).padStart(2, "0")}`; };
  const weeks = new Map<string, number>();
  for (const x of withData) weeks.set(isoWeek(x.day), (weeks.get(isoWeek(x.day)) ?? 0) + (x.pv_kwh ?? 0));
  const bestWeek = [...weeks.entries()].sort((a, b) => b[1] - a[1])[0];
  if (bestWeek && weeks.size >= 2) items.push({ k: t.week, v: fmtKwh(bestWeek[1]), s: t.weekS.replace("{w}", bestWeek[0].split("-W")[1]), color: "var(--pv)" });
  if (withData.length) items.push({ k: t.co2, v: `${(totalOut * CO2_KG_PER_KWH).toFixed(1)} kg`, s: t.co2S.replace("{f}", String(CO2_KG_PER_KWH).replace(".", lang === "de" ? "," : ".")), color: "var(--bat)" });

  // ---- Monatsraster
  const monthGrid = (m: number) => {
    const first = new Date(Date.UTC(d.year, m, 1)); const start = (first.getUTCDay() + 6) % 7;   // Montag = 0
    const daysIn = new Date(Date.UTC(d.year, m + 1, 0)).getUTCDate();
    const cells: (string | null)[] = Array(start).fill(null);
    for (let i = 1; i <= daysIn; i++) cells.push(`${d.year}-${String(m + 1).padStart(2, "0")}-${String(i).padStart(2, "0")}`);
    return cells;
  };
  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>{t.title} <small className="muted" style={{ fontSize: 12, fontWeight: 400 }}>· {t.hint}</small></h2><span className="spacer" />
        {d.years.length > 1 && <div className="toggle">{d.years.map((y) => <button key={y} className={y === d.year ? "on" : ""} onClick={() => setYear(y)}>{y}</button>)}</div>}
      </div>
      {!withData.length && <div className="muted" style={{ marginTop: 10 }}>{t.noData}</div>}
      <div className="calgrid">
        {Array.from({ length: 12 }, (_, m) => (
          <div key={m} className="calmonth">
            <div className="calname">{new Date(Date.UTC(d.year, m, 15)).toLocaleDateString(locale, { month: "short" })}</div>
            <div className="calwd">{t.wd.map((w) => <span key={w}>{w[0]}</span>)}</div>
            <div className="caldays">
              {monthGrid(m).map((key, i) => {
                if (!key) return <span key={i} />;
                const x = byDay.get(key); const has = !!x && x.minutes >= 60; const future = key > today;
                const inten = has ? Math.max(0.12, (x!.pv_kwh ?? 0) / maxPv) : 0;
                const bg = has ? `rgba(242, 204, 12, ${inten.toFixed(2)})` : future ? "transparent" : "#1c1f24";
                const title = has ? `${fmtDate(key)}: PV ${fmtKwh(x!.pv_kwh)}${x!.house_kwh != null ? ` · ${lang === "de" ? "Haus" : "house"} ${fmtKwh(x!.house_kwh)}` : ""}${x!.peak_w != null ? ` · ${lang === "de" ? "Spitze" : "peak"} ${fmtW(x!.peak_w)} ${t.at} ${fmtTime(x!.peak_t)}` : ""}${x!.minutes < 720 ? ` · ${t.partial}` : ""}` : fmtDate(key);
                return <button key={key} className={"calday" + (key === today ? " today" : "") + (has ? " has" : "")} style={{ background: bg, opacity: future ? 0.25 : 1 }} title={title} onClick={() => has && setDay(key)}>{new Date(key + "T12:00:00").getDate()}</button>;
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="callegend muted">{t.legendLow} <span className="calscale" /> {t.legendHigh} · max {fmtKwh(maxPv)}</div>
      {items.length > 0 && <>
        <h3 className="calh3">{t.highlights}</h3>
        <div className="tiles">
          {items.map((it) => <div key={it.k} className="tile"><div className="k">{it.k}</div><div className="v" style={{ color: it.color, fontSize: 22 }}>{it.v}</div>{it.s && <div className="s">{it.s}</div>}</div>)}
        </div>
      </>}
    </section>
  );
}
