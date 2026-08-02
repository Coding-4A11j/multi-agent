import crypto from "crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";

/**
 * Bearer-token guard for every route except /health.
 *
 * The API can execute arbitrary shell commands through the SHELL worker, so it must
 * never be reachable without a token once it is deployed on a public host.
 *
 * When API_TOKEN is unset the guard stays off (local development) and logs a warning.
 */

const PUBLIC_PATHS = new Set(["/health"]);

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function extractToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length).trim();

  // EventSource cannot set headers, so the SSE stream also accepts ?token=
  const query = req.query as Record<string, unknown> | undefined;
  const queryToken = query?.token;
  if (typeof queryToken === "string" && queryToken.length > 0) return queryToken;

  return null;
}

export function registerAuth(app: FastifyInstance): void {
  const expected = process.env.API_TOKEN?.trim() ?? "";

  if (expected.length === 0) {
    app.log.warn(
      "API_TOKEN is not set — the API is UNAUTHENTICATED. Never expose it publicly like this: " +
        "the SHELL worker runs arbitrary commands.",
    );
    return;
  }

  app.addHook("onRequest", async (req, reply) => {
    if (req.method === "OPTIONS") return;

    const pathname = req.url.split("?")[0];
    if (PUBLIC_PATHS.has(pathname)) return;

    const token = extractToken(req);
    if (token === null || !timingSafeEqual(token, expected)) {
      return reply.status(401).send({ error: "Unauthorized", statusCode: 401 });
    }
  });
}
