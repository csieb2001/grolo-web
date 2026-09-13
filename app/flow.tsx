"use client";
// Energiefluss-Schema im Stil der App-Startseiten von Anker SOLIX & Co.: das Haus (mit dem Standortnamen von der
// Einstellungsseite) in der Mitte, Solar oben links → NEXA/Batterie unten links → Haus, Netz rechts ↔ Haus (nur mit Shelly).
// Knoten mit Symbol, Live-Leistung je Verbindung, animierte Punkte in Flussrichtung, Geschwindigkeit nach Leistung.
// Alle Leistungen in W: pv, out (NEXA → Haus), bat (+ laden / − entladen), grid (+ Bezug / − Einspeisung), house (Shelly).

export type FlowLabels = { solar: string; battery: string; home: string; grid: string; nexa: string; noGrid: string; self: string; charging: string; discharging: string; idle: string; socLimit: string };
export type FlowProps = {
  pv: number | null; out: number | null; bat: number | null; soc: number | null; grid?: number | null; house?: number | null;
  packs?: number | null; socLimit?: number | null; limited?: boolean | null; siteName?: string | null; labels: FlowLabels; fmtW: (w: number | null | undefined) => string;
};

const C = { pv: "#f2cc0c", house: "#ff9830", bat: "#73bf69", grid: "#5794f2", red: "#f2495c", muted: "#8e8e8e", line: "#2c3235", panel: "#1c1f24" };

// Animationsdauer aus der Leistung: wenige Watt → langsam, ab ~800 W schnell; unter 2 W steht der Fluss.
const speed = (w: number | null | undefined) => { const a = Math.abs(w ?? 0); return a < 2 ? null : `${Math.max(0.5, Math.min(6, 6 - 5.5 * Math.min(1, a / 800)))}s`; };

export function PowerFlow({ pv, out, bat, soc, grid, house, packs, socLimit, limited, siteName, labels, fmtW }: FlowProps) {
  const hasGrid = grid != null;
  const homeW = house ?? (out != null ? out + Math.max(0, grid ?? 0) : null);
  const self = homeW && homeW > 0 && out != null ? Math.max(0, Math.min(100, out / homeW * 100)) : null;
  const gridDraw = (grid ?? 0) > 0;
  const socPct = soc == null ? 0 : Math.max(0, Math.min(100, soc));
  const socColor = socPct <= (socLimit ?? 8) + 2 ? C.red : socPct < 30 ? C.house : C.bat;
  const batState = bat == null ? "" : bat > 2 ? labels.charging : bat < -2 ? labels.discharging : labels.idle;

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
  const Node = ({ x, y, r = 30, color, label, value, sub, children }: { x: number; y: number; r?: number; color: string; label: string; value: string; sub?: string; children?: React.ReactNode }) => (
    <g transform={`translate(${x} ${y})`}>
      <circle r={r} fill={C.panel} stroke={color} strokeWidth="2.5" />
      <g stroke={color} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</g>
      <text className="nl" y={-r - 10} textAnchor="middle">{label}</text>
      <text className="nv" y={r + 20} textAnchor="middle" fill={color}>{value}</text>
      {sub && <text className="ns" y={r + 34} textAnchor="middle">{sub}</text>}
    </g>
  );

  return (
    <svg className="flow" viewBox="0 0 420 320" role="img" aria-label="power flow">
      {/* Kanten unter den Knoten: Solar → NEXA, NEXA → Haus, Netz ↔ Haus */}
      <Edge d="M70 92 L70 208" w={pv} color={C.pv} />
      <Edge d="M134 232 C 158 232, 168 205, 178 190" w={out} color={C.house} />
      {hasGrid
        ? <Edge d="M248 170 L318 170" w={grid} color={gridDraw ? C.grid : C.bat} rev={!gridDraw} />
        : <path className="base" d="M248 170 L318 170" opacity="0.3" />}
      <text className="ns" x="150" y="256" textAnchor="middle" fill={C.house}>→ {fmtW(out)}</text>
      {hasGrid && <text className="ns" x="283" y="188" textAnchor="middle" fill={gridDraw ? C.grid : C.bat}>{gridDraw ? "→" : "←"} {fmtW(Math.abs(grid ?? 0))}</text>}

      {/* Solar (oben links) */}
      <Node x={70} y={62} color={C.pv} label={labels.solar} value={fmtW(pv)}>
        <circle r="7" /><path d="M0 -13 V-17 M0 13 V17 M-13 0 H-17 M13 0 H17 M-9 -9 L-12 -12 M9 9 L12 12 M9 -9 L12 -12 M-9 9 L-12 12" />
      </Node>

      {/* NEXA mit Batterie (unten links) */}
      <g transform="translate(70 250)">
        <rect x="-64" y="-40" width="128" height="80" rx="12" fill={C.panel} stroke={limited ? C.house : C.bat} strokeWidth="2.5" />
        <text className="nl" y="-24" textAnchor="middle">{labels.nexa}{packs ? ` · ${packs} × ${labels.battery}` : ""}</text>
        <rect x="-50" y="-12" width="70" height="28" rx="4" fill="none" stroke={C.muted} strokeWidth="2" />
        <rect x="21" y="-3" width="5" height="10" rx="1" fill={C.muted} />
        <rect x="-47" y="-9" width={Math.max(0, 64 * socPct / 100)} height="22" rx="2" fill={socColor} opacity="0.85" />
        {socLimit != null && <line x1={-47 + 64 * Math.min(100, socLimit) / 100} x2={-47 + 64 * Math.min(100, socLimit) / 100} y1="-12" y2="16" stroke={C.red} strokeWidth="1.5" strokeDasharray="2 2" />}
        <text className="nv" x="46" y="7" textAnchor="middle" fill={socColor}>{soc == null ? "–" : `${Math.round(soc)} %`}</text>
        <text className="ns" y="32" textAnchor="middle" fill={bat != null && Math.abs(bat) > 2 ? (bat > 0 ? C.bat : C.house) : C.muted}>
          {bat == null ? "" : `${bat > 2 ? "▲ " : bat < -2 ? "▼ " : ""}${fmtW(Math.abs(bat))} ${batState}`}
        </text>
      </g>

      {/* Haus (Mitte) mit Standortname */}
      <Node x={210} y={170} r={36} color={C.house} label={siteName || labels.home} value={fmtW(homeW)} sub={self != null ? `${Math.round(self)} % ${labels.self}` : undefined}>
        <path d="M-16 2 L0 -14 L16 2 M-12 -1 V14 H12 V-1 M-4 14 V5 H4 V14" />
      </Node>

      {/* Netz (rechts) */}
      <Node x={350} y={170} color={hasGrid ? (gridDraw ? C.grid : C.bat) : C.muted} label={labels.grid}
            value={hasGrid ? fmtW(Math.abs(grid ?? 0)) : "–"} sub={hasGrid ? undefined : labels.noGrid}>
        <path d="M-9 14 L-4 -12 H4 L9 14 M-8 -4 H8 M-10 4 H10 M-4 -12 L-14 -6 M4 -12 L14 -6 M-6 14 L0 4 L6 14" />
      </Node>
    </svg>
  );
}
