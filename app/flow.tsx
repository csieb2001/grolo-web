"use client";
// Energiefluss-Schema im Stil der App-Startseiten von Anker SOLIX & Co.: das Haus (mit dem Standortnamen von der
// Einstellungsseite) in der Mitte, Solar oben links → NEXA/Batterie unten links → Haus, Netz rechts ↔ Haus (nur mit Shelly).
// Knoten mit Symbol, Live-Leistung je Verbindung, animierte Punkte in Flussrichtung, Geschwindigkeit nach Leistung.
// Alle Leistungen in W: pv, out (NEXA → Haus), bat (+ laden / − entladen), grid (+ Bezug / − Einspeisung), house (Shelly).

export type FlowLabels = { solar: string; battery: string; home: string; grid: string; nexa: string; noGrid: string; self: string; charging: string; discharging: string; idle: string; socLimit: string; acIn: string;
  etaTo: string; etaHint: string };
export type FlowProps = {
  pv: number | null; out: number | null; bat: number | null; soc: number | null; grid?: number | null; house?: number | null;
  packs?: number | null; socLimit?: number | null; limited?: boolean | null; siteName?: string | null; labels: FlowLabels; fmtW: (w: number | null | undefined) => string;
  whPerPct?: number | null;   // gemessene Wattstunden je Prozentpunkt; ohne das keine Restzeit
};

const C = { pv: "#f2cc0c", house: "#ff9830", bat: "#73bf69", grid: "#5794f2", red: "#f2495c", muted: "#8e8e8e", line: "#2c3235", panel: "#1c1f24" };

// Animationsdauer aus der Leistung: wenige Watt → langsam, ab ~800 W schnell; unter 2 W steht der Fluss.
const speed = (w: number | null | undefined) => { const a = Math.abs(w ?? 0); return a < 2 ? null : `${Math.max(0.5, Math.min(6, 6 - 5.5 * Math.min(1, a / 800)))}s`; };

export function PowerFlow({ pv, out, bat, soc, grid, house, packs, socLimit, limited, siteName, labels, fmtW, whPerPct }: FlowProps) {
  const hasGrid = grid != null;
  const acIn = (out ?? 0) < -2;   // Register 116 negativ: der NEXA zieht Leistung aus dem Netz (AC-Laden, z. B. Batterie zuerst)
  const homeW = house ?? (out != null && !acIn ? out + Math.max(0, grid ?? 0) : null);
  const self = homeW && homeW > 0 && out != null && !acIn ? Math.max(0, Math.min(100, out / homeW * 100)) : null;
  const gridDraw = (grid ?? 0) > 0;
  const socPct = soc == null ? 0 : Math.max(0, Math.min(100, soc));
  const socColor = socPct <= (socLimit ?? 8) + 2 ? C.red : socPct < 30 ? C.house : C.bat;
  const batState = bat == null ? "" : bat > 2 ? labels.charging : bat < -2 ? labels.discharging : labels.idle;

  // Restzeit bis zu einem Ladezustand. Nur mit gemessenem Energiebedarf je Prozent und nur, solange sich
  // etwas bewegt – eine Schätzung aus einer Annahme wäre hier schlimmer als gar keine.
  const fmtEta = (mins: number) => mins < 1 ? "< 1 min"
    : mins < 90 ? `${Math.round(mins)} min`
    : `${Math.floor(mins / 60)} h ${String(Math.round(mins % 60)).padStart(2, "0")} min`;
  const eta = (targetPct: number) => {
    if (whPerPct == null || soc == null || bat == null || Math.abs(bat) < 5) return null;
    const delta = targetPct - socPct;
    if (delta === 0) return null;
    if (delta > 0 && bat <= 0) return null;        // Ziel liegt oben, aber es wird entladen
    if (delta < 0 && bat >= 0) return null;        // Ziel liegt unten, aber es wird geladen
    const mins = Math.abs(delta) * whPerPct / Math.abs(bat) * 60;
    return mins > 60 * 48 ? null : fmtEta(mins);   // über zwei Tage sagt die Zahl nichts mehr
  };
  const limitPct = socLimit ?? null;
  const etaLimit = limitPct != null && socPct < limitPct ? eta(limitPct) : null;
  const etaFull = eta(100);
  const etaEmpty = limitPct != null && socPct > limitPct ? eta(limitPct) : null;
  const etaLines = (etaLimit ? 1 : 0) + (etaFull ? 1 : 0) + (etaEmpty ? 1 : 0);

  // Kante: ruhige Grundlinie, darauf kleine Pfeile, die in Flussrichtung entlanglaufen (drei versetzt, Tempo nach Leistung)
  const Edge = ({ d, w, color, rev }: { d: string; w: number | null | undefined; color: string; rev?: boolean }) => {
    const s = speed(w); const secs = s ? parseFloat(s) : 0;
    return (<g>
      <path className="base" d={d} />
      {s ? [0, 1, 2].map(i => (
        <polygon key={i} points="-5,-3.5 4,0 -5,3.5" fill={color}>
          <animateMotion dur={s} repeatCount="indefinite" begin={`${-(i * secs / 3)}s`} rotate={rev ? "auto-reverse" : "auto"} path={d}
                         keyPoints={rev ? "1;0" : "0;1"} keyTimes="0;1" calcMode="linear" />
        </polygon>))
        : <path className="fe idle" d={d} stroke={color} />}
    </g>);
  };
  const Node = ({ x, y, r = 30, color, label, value, sub, right, children }: { x: number; y: number; r?: number; color: string; label: string; value: string; sub?: string; right?: boolean; children?: React.ReactNode }) => (
    <g transform={`translate(${x} ${y})`}>
      <circle r={r} fill={C.panel} stroke={color} strokeWidth="2.5" />
      <g stroke={color} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</g>
      <text className="nl" y={-r - 10} textAnchor="middle">{label}</text>
      {right ? <text className="nv" x={r + 8} y={5} textAnchor="start" fill={color}>{value}</text>
             : <text className="nv" y={r + 20} textAnchor="middle" fill={color}>{value}</text>}
      {sub && <text className="ns" y={r + 34} textAnchor="middle">{sub}</text>}
    </g>
  );

  return (
    <svg className="flow" viewBox={`0 0 440 ${320 + etaLines * 17}`} role="img" aria-label="power flow">
      {/* Kanten unter den Knoten: Solar → NEXA, NEXA → Haus, Netz ↔ Haus */}
      <Edge d="M85 92 L85 200" w={pv} color={C.pv} />
      <Edge d="M160 222 C 176 222, 182 200, 193 192" w={out} color={acIn ? C.grid : C.house} rev={acIn} />
      {hasGrid
        ? <Edge d="M333 170 L263 170" w={grid} color={gridDraw ? C.grid : C.bat} rev={!gridDraw} />
        : <path className="base" d="M263 170 L333 170" opacity="0.3" />}
      {hasGrid && <text className="ns" x="298" y="188" textAnchor="middle" fill={gridDraw ? C.grid : C.bat}>{gridDraw ? "←" : "→"} {fmtW(Math.abs(grid ?? 0))}</text>}

      {/* Solar (oben links) */}
      <Node x={85} y={62} color={C.pv} label={labels.solar} value={fmtW(pv)} right>
        <circle r="7" /><path d="M0 -13 V-17 M0 13 V17 M-13 0 H-17 M13 0 H17 M-9 -9 L-12 -12 M9 9 L12 12 M9 -9 L12 -12 M-9 9 L-12 12" />
      </Node>

      {/* NEXA mit Batterie (unten links) */}
      <g transform="translate(85 250)">
        {/* Der Kasten wächst um die Restzeiten mit – sie gehören zum NEXA und sollen nicht auf seinem Rand liegen */}
        <rect x="-75" y="-50" width="150" height={100 + etaLines * 17} rx="12" fill={C.panel} stroke={limited ? C.house : C.bat} strokeWidth="2.5" />
        <text className="nl" y="-34" textAnchor="middle">{labels.nexa}{packs ? ` · ${packs} × ${labels.battery}` : ""}</text>
        <rect x="-62" y="-22" width="60" height="28" rx="4" fill="none" stroke={C.muted} strokeWidth="2" />
        <rect x="-1" y="-13" width="5" height="10" rx="1" fill={C.muted} />
        <rect x="-59" y="-19" width={Math.max(0, 54 * socPct / 100)} height="22" rx="2" fill={socColor} opacity="0.85" />
        {socLimit != null && <line x1={-59 + 54 * Math.min(100, socLimit) / 100} x2={-59 + 54 * Math.min(100, socLimit) / 100} y1="-22" y2="6" stroke={C.red} strokeWidth="1.5" strokeDasharray="2 2" />}
        <text className="nv" x="38" y="-3" textAnchor="middle" fill={socColor}>{soc == null ? "–" : `${Math.round(soc)} %`}</text>
        <text className="ns" y="22" textAnchor="middle" fill={bat != null && Math.abs(bat) > 2 ? (bat > 0 ? C.bat : C.house) : C.muted}>
          {bat == null ? "" : `${bat > 2 ? "▲ " : bat < -2 ? "▼ " : ""}${fmtW(Math.abs(bat))} ${batState}`}
        </text>
        <text className="ns" y="38" textAnchor="middle" fill={acIn ? C.grid : C.house}>{acIn ? `← ${labels.acIn}: ${fmtW(-(out ?? 0))}` : `→ ${labels.home}: ${fmtW(out)}`}</text>
        {/* Restzeiten: nur wenn sie etwas aussagen – gemessener Bedarf je Prozent und eine Richtung, in die es geht */}
        {etaLimit && <text className="ne" y="56" textAnchor="middle" fill={C.red}>{labels.etaTo} {Math.round(limitPct!)} %: {etaLimit}</text>}
        {etaFull && <text className="ne" y={etaLimit ? 73 : 56} textAnchor="middle" fill={C.bat}>{labels.etaTo} 100 %: {etaFull}</text>}
        {etaEmpty && <text className="ne" y="56" textAnchor="middle" fill={C.house}>{labels.etaTo} {Math.round(limitPct!)} %: {etaEmpty}</text>}
      </g>

      {/* Haus (Mitte) mit Standortname */}
      <Node x={225} y={170} r={36} color={C.house} label={siteName || labels.home} value={fmtW(homeW)} sub={self != null ? `${Math.round(self)} % ${labels.self}` : undefined}>
        <path d="M-16 2 L0 -14 L16 2 M-12 -1 V14 H12 V-1 M-4 14 V5 H4 V14" />
      </Node>

      {/* Netz (rechts) */}
      <Node x={365} y={170} color={hasGrid ? (gridDraw ? C.grid : C.bat) : C.muted} label={labels.grid}
            value={hasGrid ? fmtW(Math.abs(grid ?? 0)) : "–"} sub={hasGrid ? undefined : labels.noGrid}>
        <path d="M-9 14 L-4 -12 H4 L9 14 M-8 -4 H8 M-10 4 H10 M-4 -12 L-14 -6 M4 -12 L14 -6 M-6 14 L0 4 L6 14" />
      </Node>
    </svg>
  );
}
