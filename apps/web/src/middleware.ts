import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxies /api/* to the Fastify API and attaches the bearer token server-side,
 * so API_TOKEN never reaches the browser bundle.
 *
 * Rewriting here (instead of the next.config.js rewrite) is what lets us add the
 * Authorization header to the outgoing request.
 */

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const API_TOKEN = process.env.API_TOKEN?.trim() ?? "";

export const config = {
  matcher: "/api/:path*",
};

export function middleware(req: NextRequest) {
  const target = new URL(
    req.nextUrl.pathname.replace(/^\/api/, "") + req.nextUrl.search,
    API_URL,
  );

  const headers = new Headers(req.headers);
  if (API_TOKEN.length > 0) {
    headers.set("authorization", `Bearer ${API_TOKEN}`);
  }

  return NextResponse.rewrite(target, { request: { headers } });
}
