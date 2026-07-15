import { NextResponse, type NextRequest } from "next/server";

// Duplicated from src/lib/session.ts on purpose: this file must stay a cheap,
// dependency-free cookie-presence check (no Prisma / next/headers imports), since
// it runs on every matched request. Real enforcement lives in src/lib/rbac.ts,
// called from layouts and Server Actions.
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? "lab_chatbot_session";

const PROTECTED_PREFIXES = ["/chat", "/account", "/admin"];
const AUTH_ONLY_PATHS = ["/login", "/signup"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE_NAME);

  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = hasSession ? "/chat" : "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  if (isProtected && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const isAuthOnly = AUTH_ONLY_PATHS.includes(pathname);
  if (isAuthOnly && hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/chat";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)",
  ],
};
