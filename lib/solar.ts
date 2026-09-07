// Sonnenstand nach dem NOAA-Algorithmus, identisch zu grobro/sidecar/solar.py im GroLo-Stack.
// azimuth: 0 = Nord, 90 = Ost, 180 = Süd, 270 = West; elevation: Grad über dem Horizont (mit Refraktion).

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function sunPosition(ms: number, lat: number, lon: number): { azimuth: number; elevation: number } {
  const ts = ms / 1000;
  const jd = ts / 86400 + 2440587.5;
  const t = (jd - 2451545) / 36525;
  const l0 = (280.46646 + t * (36000.76983 + 0.0003032 * t)) % 360;
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const mr = rad(m);
  const c = Math.sin(mr) * (1.914602 - t * (0.004817 + 0.000014 * t)) + Math.sin(2 * mr) * (0.019993 - 0.000101 * t) + Math.sin(3 * mr) * 0.000289;
  const trueLong = l0 + c;
  const omega = 125.04 - 1934.136 * t;
  const appLong = trueLong - 0.00569 - 0.00478 * Math.sin(rad(omega));
  const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(rad(omega));
  const decl = Math.asin(Math.sin(rad(eps)) * Math.sin(rad(appLong)));
  const y = Math.tan(rad(eps / 2)) ** 2;
  const l0r = rad(l0);
  const eqtime = 4 * deg(y * Math.sin(2 * l0r) - 2 * e * Math.sin(mr) + 4 * e * y * Math.sin(mr) * Math.cos(2 * l0r) - 0.5 * y * y * Math.sin(4 * l0r) - 1.25 * e * e * Math.sin(2 * mr));
  const minutesUtc = (((ts % 86400) + 86400) % 86400) / 60;
  const tst = (((minutesUtc + eqtime + 4 * lon) % 1440) + 1440) % 1440;
  let ha = tst / 4 - 180;
  if (ha < -180) ha += 360;
  const latr = rad(lat), har = rad(ha);
  let cosZen = Math.sin(latr) * Math.sin(decl) + Math.cos(latr) * Math.cos(decl) * Math.cos(har);
  cosZen = Math.max(-1, Math.min(1, cosZen));
  const zen = Math.acos(cosZen);
  const el = 90 - deg(zen);
  const sinZen = Math.sin(zen);
  let az: number;
  if (Math.abs(sinZen) < 1e-9) az = 180;
  else {
    let cosAz = (Math.sin(latr) * cosZen - Math.sin(decl)) / (Math.cos(latr) * sinZen);
    cosAz = Math.max(-1, Math.min(1, cosAz));
    az = deg(Math.acos(cosAz));
    az = ha > 0 ? (az + 180) % 360 : (540 - az) % 360;
  }
  let refr = 0;
  if (el > 85) refr = 0;
  else if (el > 5) { const te = Math.tan(rad(el)); refr = (58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5) / 3600; }
  else if (el > -0.575) refr = (1735 + el * (-518.2 + el * (103.4 + el * (-12.79 + el * 0.711)))) / 3600;
  else refr = -20.772 / Math.tan(rad(el)) / 3600;
  return { azimuth: az, elevation: el + refr };
}

/** Sonnenbahn eines Tages: Punkte alle stepMin Minuten ab Tagesbeginn (ms), nur oberhalb von minEl Grad. */
export function sunPath(dayStartMs: number, lat: number, lon: number, stepMin = 10, minEl = -1) {
  const pts: { ms: number; azimuth: number; elevation: number }[] = [];
  for (let m = 0; m < 1440; m += stepMin) {
    const ms = dayStartMs + m * 60000;
    const p = sunPosition(ms, lat, lon);
    if (p.elevation >= minEl) pts.push({ ms, ...p });
  }
  return pts;
}

/** Polarkoordinaten des Sonnenbahn-Diagramms: Horizont = Rand, Zenit = Mitte, Norden oben, Osten rechts. */
export function polar(azimuth: number, elevation: number, cx: number, cy: number, R: number) {
  const r = (R * (90 - Math.max(elevation, 0))) / 90;
  return { x: cx + r * Math.sin(rad(azimuth)), y: cy - r * Math.cos(rad(azimuth)) };
}

export function compass(az: number, lang: "de" | "en") {
  const de = ["N", "NNO", "NO", "ONO", "O", "OSO", "SO", "SSO", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const en = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return (lang === "de" ? de : en)[Math.floor(((az + 11.25) % 360) / 22.5) % 16];
}
