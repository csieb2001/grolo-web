import { neon } from "@neondatabase/serverless";

export const sql = neon(process.env.DATABASE_URL!);

let ready: Promise<void> | null = null;
export function ensureSchema() {
  if (!ready) {
    ready = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS samples (
        ts timestamptz NOT NULL,
        device text NOT NULL,
        pv_w real, out_w real, bat_w real, soc real,
        soc1 real, soc2 real, soc3 real, soc4 real,
        temp_sys real, temp_bat1 real, temp_bat2 real,
        pv_v real[], pv_a real[],
        packs smallint, status text, mode text,
        PRIMARY KEY (device, ts)
      )`;
      await sql`CREATE INDEX IF NOT EXISTS samples_ts_idx ON samples (ts DESC)`;
      await sql`CREATE TABLE IF NOT EXISTS device_info (
        device text PRIMARY KEY, updated timestamptz NOT NULL, info jsonb NOT NULL
      )`;
      await sql`CREATE TABLE IF NOT EXISTS weather_current (
        id smallint PRIMARY KEY DEFAULT 1, ts timestamptz NOT NULL,
        temperature real, cloud_cover real, shortwave_radiation real, direct_radiation real, diffuse_radiation real,
        wind_speed real, weather_code smallint, is_day smallint, condition_en text, condition_de text,
        sunrise text, sunset text, sunshine_duration_today real, radiation_sum_today real
      )`;
      await sql`CREATE TABLE IF NOT EXISTS weather_history (
        ts timestamptz PRIMARY KEY, temperature real, cloud_cover real, shortwave_radiation real
      )`;
      await sql`CREATE TABLE IF NOT EXISTS weather_forecast (
        t timestamptz PRIMARY KEY, shortwave_radiation real, cloud_cover real, temperature real, weather_code smallint
      )`;
      await sql`ALTER TABLE weather_current ADD COLUMN IF NOT EXISTS sun_azimuth real, ADD COLUMN IF NOT EXISTS sun_elevation real`;
      // Standort und Module (Einstellungsseite des Stacks), Erwartungsmodell je String (Sidecar weather)
      await sql`CREATE TABLE IF NOT EXISTS site (
        id smallint PRIMARY KEY DEFAULT 1, updated timestamptz NOT NULL, name text, lat real, lon real, strings jsonb
      )`;
      await sql`ALTER TABLE site ADD COLUMN IF NOT EXISTS fit jsonb, ADD COLUMN IF NOT EXISTS advice jsonb, ADD COLUMN IF NOT EXISTS assumed jsonb, ADD COLUMN IF NOT EXISTS names jsonb`;
      await sql`CREATE TABLE IF NOT EXISTS shelly (
        id smallint PRIMARY KEY DEFAULT 1, updated timestamptz NOT NULL,
        grid_w real, household_w real, out_w real, target_w real, setpoint_w real, ok boolean, enabled boolean, host text
      )`;
      await sql`CREATE TABLE IF NOT EXISTS pv_model (
        t timestamptz NOT NULL, string smallint NOT NULL, gti real, expected_w real, PRIMARY KEY (t, string)
      )`;
      // Netzbezug und Hausverbrauch (Shelly, Mittel je Intervall) am Sample, für Netzkosten und Eigenversorgung pro Tag
      await sql`ALTER TABLE samples ADD COLUMN IF NOT EXISTS grid_w real, ADD COLUMN IF NOT EXISTS house_w real`;
      await sql`ALTER TABLE shelly ADD COLUMN IF NOT EXISTS limited boolean, ADD COLUMN IF NOT EXISTS reason text, ADD COLUMN IF NOT EXISTS soc real, ADD COLUMN IF NOT EXISTS soc_limit real, ADD COLUMN IF NOT EXISTS max_w real`;
      // Strompreis von der Einstellungsseite des Stacks (retained grolo/config/tariff), Grundlage für Ersparnis und Kosten
      await sql`CREATE TABLE IF NOT EXISTS tariff (
        id smallint PRIMARY KEY DEFAULT 1, updated timestamptz NOT NULL, price_ct_kwh real NOT NULL, feedin_ct_kwh real, system_cost_eur real, currency text
      )`;
      // Wärmepumpe (Wolf CHA über den lokalen WOLF Link). Die Zeitstempel sind dieselben wie bei samples,
      // deshalb lässt sich der Verbrauch der Wärmepumpe direkt gegen die NEXA-Abgabe rechnen.
      await sql`CREATE TABLE IF NOT EXISTS heat_samples (
        ts timestamptz PRIMARY KEY,
        hp_w real, heat_w real, flow_c real, return_c real, dhw_c real, outside_c real,
        spread real, freq real, flow_lpm real, compressor smallint, mode smallint
      )`;
      // Tageswerte aus den Zählern der Wärmepumpe selbst (sie zählt Wärme und Strom je Tag und setzt um Mitternacht zurück)
      await sql`CREATE TABLE IF NOT EXISTS heat_days (
        day date PRIMARY KEY, heat_kwh real, el_kwh real, spf real
      )`;
      await sql`CREATE TABLE IF NOT EXISTS heat_state (
        id smallint PRIMARY KEY DEFAULT 1, updated timestamptz NOT NULL, state jsonb NOT NULL
      )`;
      // Ein Datensatz je beendetem Verdichterlauf. Die Tageszähler sagen, wie oft getaktet wird; erst der
      // einzelne Takt sagt, wie: Laufzeit am Stück, Pause davor und bei welcher Außentemperatur.
      await sql`CREATE TABLE IF NOT EXISTS heat_cycles (
        ts timestamptz PRIMARY KEY, started timestamptz, minutes real, pause_min real, mode text,
        t_out real, freq real, freq_max real, flow_c real, kwh real, cop real, defrost smallint
      )`;
      await sql`CREATE INDEX IF NOT EXISTS heat_cycles_ts ON heat_cycles (ts DESC)`;
      // Jahresprognose des Sidecars forecast: eine Zeile, komplett als JSON. Die Rechnung passiert dort,
      // die Website zeigt sie nur – so steht auf Grafana, Einstellungsseite und Website dieselbe Zahl.
      await sql`CREATE TABLE IF NOT EXISTS forecast (
        id smallint PRIMARY KEY DEFAULT 1, updated timestamptz NOT NULL, data jsonb NOT NULL
      )`;
      // Räume (tado X, lokal über Matter): der aktuelle Stand als eine Zeile, dazu eine Zeitreihe je Raum
      await sql`CREATE TABLE IF NOT EXISTS rooms (
        id smallint PRIMARY KEY DEFAULT 1, updated timestamptz NOT NULL, data jsonb NOT NULL
      )`;
      await sql`CREATE TABLE IF NOT EXISTS room_samples (
        ts timestamptz NOT NULL, room text NOT NULL, temp_c real, setpoint_c real, humidity_pct real,
        PRIMARY KEY (ts, room)
      )`;
    })();
  }
  return ready;
}

export function anonymize(device: string) {
  return device.length > 8 ? device.slice(0, 4) + "••••" + device.slice(-4) : device;
}
