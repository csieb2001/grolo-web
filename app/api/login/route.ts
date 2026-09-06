import { NextRequest, NextResponse } from "next/server";
import { COOKIE, expectedToken } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const password = String(form?.get("password") ?? "");
  const lang = String(form?.get("lang") ?? "en") === "de" ? "de" : "en";
  const ok = !!process.env.SITE_PASSWORD && password === process.env.SITE_PASSWORD;
  if (!ok) {
    return NextResponse.redirect(new URL(`/login?error=1&lang=${lang}`, req.url), { status: 303 });
  }
  const res = NextResponse.redirect(new URL("/", req.url), { status: 303 });
  res.cookies.set(COOKIE, (await expectedToken())!, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 30 * 24 * 3600 });
  return res;
}
