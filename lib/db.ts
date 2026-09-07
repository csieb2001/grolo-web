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
      await sql`CREATE TABLE IF NOT EXISTS pv_model (
        t timestamptz NOT NULL, string smallint NOT NULL, gti real, expected_w real, PRIMARY KEY (t, string)
      )`;
    })();
  }
  return ready;
}

export function anonymize(device: string) {
  return device.length > 8 ? device.slice(0, 4) + "••••" + device.slice(-4) : device;
}
