import { NextResponse, type NextRequest } from "next/server";

/**
 * Two jobs, in order:
 *
 * 1. Gate the whole app behind HTTP Basic auth when APP_PASSWORD is set. Without this, anyone who
 *    can open the deployed URL can create tasks, which run shell commands and spend OpenRouter
 *    credit.
 * 2. Proxy /api/* to the Fastify API with the bearer token attached server-side, so API_TOKEN
 *    never reaches the browser bundle.
 *
 * Both gates are skipped when their env var is unset, which keeps local development frictionless.
 */

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const API_TOKEN = process.env.API_TOKEN?.trim() ?? "";

const APP_USERNAME = process.env.APP_USERNAME?.trim() ?? "admin";
const APP_PASSWORD = process.env.APP_PASSWORD?.trim() ?? "";

export const config = {
  // Everything except Next's own static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

/** Length-independent comparison so a wrong guess does not leak length via timing. */
function slowEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function basicAuthOk(req: NextRequest): boolean {
  const header = req.headers.get("authorization");
  if (header === null || !header.startsWith("Basic ")) return false;

  let decoded: string;
  try {
    decoded = atob(header.slice("Basic ".length).trim());
  } catch {
    return false;
  }

  const separator = decoded.indexOf(":");
  if (separator === -1) return false;

  const user = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);
  return slowEquals(user, APP_USERNAME) && slowEquals(password, APP_PASSWORD);
}

export function middleware(req: NextRequest) {
  const gateEnabled = APP_PASSWORD.length > 0;

  if (gateEnabled && !basicAuthOk(req)) {
    return new NextResponse("Authentication required", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Multi-Agent", charset="UTF-8"' },
    });
  }

  if (!req.nextUrl.pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const target = new URL(
    req.nextUrl.pathname.replace(/^\/api/, "") + req.nextUrl.search,
    API_URL,
  );

  const headers = new Headers(req.headers);
  // Drop the browser's Basic credentials and send the API's own bearer token instead.
  headers.delete("authorization");
  if (API_TOKEN.length > 0) {
    headers.set("authorization", `Bearer ${API_TOKEN}`);
  }

  return NextResponse.rewrite(target, { request: { headers } });
}
