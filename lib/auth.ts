import type { NextRequest } from "next/server";

export const COOKIE = "grolo_auth";
const enc = new TextEncoder();

// HMAC-SHA256(SITE_PASSWORD, "grolo-site") als Cookie-Wert; edge- und node-kompatibel (Web Crypto)
export async function expectedToken(): Promise<string | null> {
  const pw = process.env.SITE_PASSWORD;
  if (!pw) return null;
  const key = await crypto.subtle.importKey("raw", enc.encode(pw), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode("grolo-site"));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function isAuthorized(req: NextRequest | { cookies: { get(name: string): { value: string } | undefined } }): Promise<boolean> {
  const want = await expectedToken();
  if (!want) return false;
  const got = req.cookies.get(COOKIE)?.value;
  return !!got && got.length === want.length && timingSafeEqual(got, want);
}

function timingSafeEqual(a: string, b: string) {
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
