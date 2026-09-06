import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";

// Zugangsschutz: alles außer /login, /api/login, /api/ingest (Bearer-Token) und statischen Dateien braucht das Cookie.
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/login") || pathname.startsWith("/api/logout") || pathname.startsWith("/api/ingest") ||
      pathname.startsWith("/_next") || pathname === "/favicon.ico" || pathname === "/robots.txt") {
    return NextResponse.next();
  }
  if (await isAuthorized(req)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = req.nextUrl.clone(); url.pathname = "/login"; url.search = "";
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
