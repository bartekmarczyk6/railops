export const RATE_LIMIT_MAX = 20;
export const RATE_LIMIT_WINDOW_MS = 60_000;

const CLEANUP_THRESHOLD = 1000;

// config.matcher's ":path*" entries over-match; this regex is the precise
// guard enforced inside the middleware itself.
const RATE_LIMITED_PATH = /^\/api\/cases\/(?:email|[^/]+\/(?:run|rewrite))$/;

type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();
let clock: () => number = Date.now;

export function resetRateLimitBuckets(nextClock: () => number = Date.now): void {
  buckets.clear();
  clock = nextClock;
}

function clientIp(request: Request): string {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

export function middleware(request: Request): Response | undefined {
  const { pathname } = new URL(request.url);
  if (!RATE_LIMITED_PATH.test(pathname)) return undefined;

  const now = clock();

  if (buckets.size > CLEANUP_THRESHOLD) {
    for (const [key, bucket] of buckets) {
      if (now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) buckets.delete(key);
    }
  }

  const ip = clientIp(request);
  const bucket = buckets.get(ip);

  if (!bucket || now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
    buckets.set(ip, { count: 1, windowStart: now });
    return undefined;
  }

  bucket.count += 1;
  if (bucket.count <= RATE_LIMIT_MAX) return undefined;

  const retryAfter = Math.max(
    1,
    Math.ceil((bucket.windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000),
  );
  return new Response(
    JSON.stringify({
      error: "rate_limited",
      message: "Too many requests — please wait a moment.",
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
      },
    },
  );
}

export const config = {
  matcher: [
    "/api/cases/email",
    "/api/cases/:path*/run",
    "/api/cases/:path*/rewrite",
  ],
};
