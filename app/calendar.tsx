"use client";
// Jahreskalender: zwölf Monatsraster, jeder Tag eine Kachel, Farbe nach PV-Ertrag; darunter die Highlights des Jahres
// (stärkster/schwächster Tag, höchste Spitze, beste Eigenversorgung, bester Monat, Jahressumme). Klick auf einen Tag wählt ihn
// im Abschnitt "Strings und Sonne" aus.

export type CalDay = { day: string; pv_kwh: number | null; out_kwh: number | null; acin_kwh: number | null; grid_kwh: number | null; house_kwh: number | null; minutes: number; peak_w: number | null; peak_t: string | null };
export type CalData = { year: number; years: number[]; days: CalDay[] };

const L = {
  en: { title: "Year calendar", hint: "Each tile is one day, brighter = more PV yield. Click a day to open it in “Strings and sun”.", highlights: "Highlights of the year",
        best: "Strongest day", worst: "Weakest day with data", peak: "Highest PV peak", self: "Best self-sufficiency", house: "Highest household consumption", grid: "Most grid import",
        month: "Best month", total: "Year so far", days: "days recorded", avg: "Ø per day", noData: "no data for this year yet", at: "at", minutes: "min", legendLow: "little", legendHigh: "much",
        wd: ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"], self_of: "of the household load from the NEXA", partial: "day with less than 12 h of data" },
  de: { title: "Jahreskalender", hint: "Jede Kachel ein Tag, heller = mehr PV-Ertrag. Klick auf einen Tag öffnet ihn unter „Strings und Sonne“.", highlights: "Highlights des Jahres",
        best: "Stärkster Tag", worst: "Schwächster Tag mit Daten", peak: "Höchste PV-Spitze", self: "Beste Eigenversorgung", house: "Höchster Hausverbrauch", grid: "Meister Netzbezug",
        month: "Bester Monat", total: "Jahr bisher", days: "Tage aufgezeichnet", avg: "Ø pro Tag", noData: "noch keine Daten für dieses Jahr", at: "um", minutes: "min", legendLow: "wenig", legendHigh: "viel",
        wd: ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"], self_of: "des Hausverbrauchs vom NEXA", partial: "Tag mit weniger als 12 h Daten" },
};

const fmtKwh = (k: number | null | undefined) => k == null ? "–" : k < 1 ? `${(k * 1000).toFixed(0)} Wh` : `${k.toFixed(2)} kWh`;
const fmtW = (w: number | null | undefined) => w == null ? "–" : w < 1000 ? `${w.toFixed(0)} W` : `${(w / 1000).toFixed(2)} kW`;

export function YearCalendar({ d, lang, today, setDay, setYear }: { d: CalData; lang: "en" | "de"; today: string; setDay: (k: string) => void; setYear: (y: number) => void }) {
  const t = L[lang]; const locale = lang === "de" ? "de-DE" : "en-GB";
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
