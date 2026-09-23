// Erklärt in einem Satz, was der Smart-Regler (Nulleinspeisung mit Shelly) gerade tut und warum: aus Regler-Status
// (reason, limited, Ziel, Sollwert, Grenzen), NEXA-Werten (PV, Ausgang, Batterie, SoC) und Zählerwerten (Netz, Haus).
// Dieselbe Logik steckt in der Einstellungsseite (settings-ui/index.html, explainSmart) – bei Änderungen beide anpassen.

export type ExplainInput = {
  pv: number | null; out: number | null; bat: number | null; soc: number | null; mode: string | null; live: boolean;
  modeRaw?: string | null;   // unübersetzt, für Fallunterscheidungen
  sh: { enabled?: boolean | null; ok?: boolean | null; reason?: string | null; limited?: boolean | null; grid_w?: number | null; household_w?: number | null;
        target_w?: number | null; setpoint_w?: number | null; soc?: number | null; soc_limit?: number | null; max_w?: number | null } | null;
};

const X = {
  en: {
    off: "Smart control is off. The NEXA runs in “{mode}” with the slot power set by hand and delivers {out}.",
    offDev: "The local controller is off: the NEXA regulates by itself against its paired meter and delivers {out}. The slot power is only the upper limit.",
    offAc: "Smart control is off. The NEXA runs in “{mode}” and charges the battery ({soc} %) with {acin} from the grid plus {pv} solar; the house gets nothing from it right now.",
    acTail: " In addition it draws {acin} from the grid into the battery.",
    offGrid: " The house ({house}) draws {grid} from the grid.",
    unreachable: "Shelly unreachable: the controller cannot measure the grid and holds {target} as the safe value.",
    offline: "NEXA offline: no data from the dongle, the house ({house}) runs entirely on grid power.",
    wrongMode: "The NEXA is in “{mode}” and keeps all solar ({pv}) for the battery ({soc} %); the house ({house}) runs on grid power. Smart control needs “Load first”: the controller has written the slot mode back, the NEXA should follow within a minute.",
    batteryLow: "Battery at {soc} %, at the discharge limit ({lim} %): the NEXA charges first ({bat} from solar) and delivers nothing to the house, so the house ({house}) runs on grid power. The controller asks for {target} and waits until the pack is about 5 % above the limit.",
    limited: "The NEXA delivers {out} instead of the requested {target}, the house ({house}) draws {grid} from the grid. The controller holds the target just above the output until the NEXA follows again.",
    atMax: "The house needs {house}, more than the NEXA may deliver (max. {max}): it gives {out}, the remaining {grid} comes from the grid.",
    raising: "Grid draw {grid} is above the setpoint {setpoint}: the controller raises the NEXA output (target {target}).",
    export: "Exporting {grid}: the controller lowers the NEXA output (target {target}).",
    balanced: "Zero feed-in reached: the NEXA covers {out} of the {house} household load, grid draw {grid} (setpoint {setpoint}).",
    noMeter: "Smart control is on but no fresh meter reading yet; the NEXA delivers {out}.",
    charging: " Surplus of {bat} from solar charges the battery ({soc} %).",
    discharging: " {bat} of that comes from the battery ({soc} %).",
    solarOnly: " Solar covers it directly ({pv}).",
  },
  de: {
    off: "Smart-Regelung ist aus. Der NEXA läuft im Modus „{mode}“ mit der von Hand gesetzten Slot-Leistung und gibt {out} ab.",
    offDev: "Der lokale Regler ist aus: der NEXA regelt selbst nach seinem gekoppelten Zähler und gibt {out} ab. Die Slot-Leistung ist dabei nur die Obergrenze.",
    offAc: "Smart-Regelung ist aus. Der NEXA läuft im Modus „{mode}“ und lädt die Batterie ({soc} %) mit {acin} aus dem Netz plus {pv} Solar; das Haus bekommt gerade nichts von ihm.",
    acTail: " Zusätzlich zieht er {acin} aus dem Netz in die Batterie.",
    offGrid: " Das Haus ({house}) holt {grid} aus dem Netz.",
    unreachable: "Shelly nicht erreichbar: der Regler kann den Netzbezug nicht messen und hält {target} als Sicherheitswert.",
    offline: "NEXA offline: der Dongle liefert keine Daten, das Haus ({house}) wird komplett aus dem Netz versorgt.",
    wrongMode: "Der NEXA steht auf „{mode}“ und behält alle Solarleistung ({pv}) für die Batterie ({soc} %); das Haus ({house}) läuft aus dem Netz. Die Smart-Regelung braucht „Last zuerst“: der Regler hat den Slot-Modus zurückgeschrieben, der NEXA sollte binnen einer Minute folgen.",
    batteryLow: "Batterie bei {soc} % und damit an der Entladegrenze ({lim} %): der NEXA lädt zuerst ({bat} aus Solar) und gibt nichts ans Haus ab, das Haus ({house}) kommt aus dem Netz. Der Regler fordert {target} an und wartet, bis der Akku etwa 5 % über der Grenze liegt.",
    limited: "Der NEXA liefert {out} statt der angeforderten {target}, das Haus ({house}) holt {grid} aus dem Netz. Der Regler hält das Ziel knapp über dem Ausgang, bis der NEXA wieder folgt.",
    atMax: "Das Haus braucht {house}, mehr als der NEXA darf (max. {max}): er gibt {out} ab, die restlichen {grid} kommen aus dem Netz.",
    raising: "Netzbezug {grid} liegt über dem Sollwert {setpoint}: der Regler erhöht die NEXA-Abgabe (Ziel {target}).",
    export: "Einspeisung {grid}: der Regler senkt die NEXA-Abgabe (Ziel {target}).",
    balanced: "Nulleinspeisung erreicht: der NEXA deckt {out} von {house} Hausverbrauch, Netzbezug {grid} (Sollwert {setpoint}).",
    noMeter: "Smart-Regelung ist an, aber noch kein frischer Zählerwert; der NEXA gibt {out} ab.",
    charging: " Der Überschuss von {bat} aus Solar lädt die Batterie ({soc} %).",
    discharging: " {bat} davon kommen aus der Batterie ({soc} %).",
    solarOnly: " Solar deckt das direkt ({pv}).",
  },
};

export function explainSmart(lang: "en" | "de", d: ExplainInput, fmtW: (w: number | null | undefined) => string): string {
  const x = X[lang]; const sh = d.sh;
  const fill = (s: string, m: Record<string, string | number | null | undefined>) => s.replace(/\{(\w+)\}/g, (_, k) => String(m[k] ?? "–"));
  const pct = (v: number | null | undefined) => v == null ? "–" : String(Math.round(v));
  const out = d.out ?? 0, bat = d.bat ?? 0;
  const soc = sh?.soc ?? d.soc, lim = sh?.soc_limit;
  const grid = sh?.grid_w ?? null, house = sh?.household_w ?? null, target = sh?.target_w ?? null, setpoint = sh?.setpoint_w ?? 20, max = sh?.max_w ?? null;
  const acIn = out < -2;
  const m = { mode: d.mode, out: fmtW(Math.max(0, out)), acin: fmtW(-out), target: fmtW(target), house: fmtW(house), grid: fmtW(grid == null ? null : Math.abs(grid)), soc: pct(soc), lim: pct(lim),
              bat: fmtW(Math.abs(bat)), pv: fmtW(d.pv), setpoint: fmtW(setpoint), max: fmtW(max) };
  const tail = acIn ? fill(x.acTail, m) : bat > 2 ? fill(x.charging, m) : bat < -2 ? fill(x.discharging, m) : (out > 2 ? fill(x.solarOnly, m) : "");
  // "Grid First" ist die Beschriftung, die dieser Stack bis 09/2026 für denselben Geräte-Wert 2 geschrieben hat.
  const raw = d.modeRaw ?? d.mode;
  const devSmart = raw === "Smart" || raw === "Grid First";
  if (!sh || !sh.enabled) {
    // Seit der NEXA seinen eigenen Smart-Modus kann (gekoppelter Zähler), ist "aus" nicht mehr gleich "von Hand":
    // dann regelt das Gerät selbst und die Slot-Leistung ist nur die Obergrenze.
    const base = acIn ? x.offAc : (devSmart ? x.offDev : x.off);
    return fill(base, m) + (devSmart && !acIn ? tail : "") + (d.live && grid != null && grid > 0 ? fill(x.offGrid, m) : "");
  }
  if (sh.ok === false || sh.reason === "shelly_unreachable") return fill(x.unreachable, m);
  if (sh.reason === "device_offline") return fill(x.offline, m);
  if (sh.reason === "wrong_mode") return fill(x.wrongMode, m);
  if (sh.reason === "battery_low") return fill(x.batteryLow, m);
  if (sh.limited || sh.reason === "device_limited") return fill(x.limited, m) + tail;
  if (!d.live || grid == null) return fill(x.noMeter, m) + tail;
  if (grid < -5) return fill(x.export, m) + tail;
  if (grid > setpoint + 30 && max != null && target != null && target >= max - 1) return fill(x.atMax, m) + tail;
  if (grid > setpoint + 30) return fill(x.raising, m) + tail;
  return fill(x.balanced, m) + tail;
}
