import { NextResponse } from "next/server";
import axios, { AxiosError } from "axios";
import { PYTH_FEED_IDS, HERMES_URL } from "@/lib/token-constants";
import { parseFeedToToken, type PythPriceFeed } from "@/lib/token-price";

export const revalidate = 10; // Revalidate every 10 seconds (Pyth publishes ~5s intervals)

// Keep individual requests under the revalidation budget so a slow upstream can't stall Next.js builds.
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 2;
const USER_AGENT = "cyclespace-website-api";

type PythFetchResult = ({ ok: true; feed: PythPriceFeed } | { ok: false; error: Error });

/** Try to fetch Pyth price data, retrying transient failures within a bounded deadline. */
async function fetchPythPrices(feedIds: string[]): Promise<PythFetchResult> {
  let lastError: unknown = "Unknown request failure";

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      // Short backoff between attempts; never wait past the timeout budget.
      const delay = Math.min(REQUEST_TIMEOUT_MS, REQUEST_TIMEOUT_MS - Date.now() % 1000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    try {
      const response = await axios.get<PythPriceFeed>(HERMES_URL, {
        params: { ids: feedIds }, // Axios serializes arrays as repeated `ids[]=…` query params.
        timeout: REQUEST_TIMEOUT_MS, // Prevent indefinite hangs on slow/unreachable upstreams.
        validateStatus: () => true, // Inspect the body regardless of HTTP status code.
        headers: { "User-Agent": USER_AGENT },
      });

      if (response.data?.parsed && response.data.parsed.length > 0) {
        return { ok: true, feed: response.data };
      }

      lastError = new Error(
        `Pyth Hermes returned no usable price data (status ${response.status}).` +
          `Body: ${JSON.stringify(response.data).slice(0, 500)}`,
      );
    } catch (error) {
      if (error instanceof AxiosError && (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT")) {
        lastError = new Error("Pyth Hermes request timed out.");
      } else {
        lastError = error;
      }
    }
  }

  return { ok: false, error: (lastError instanceof Error ? lastError : new Error(String(lastError))) };
}

export async function GET(): Promise<NextResponse> {
  const feedIds = Object.values(PYTH_FEED_IDS);
  let result: PythFetchResult | undefined;

  try {
    result = await fetchPythPrices(feedIds);
  } catch (error) {
    console.error("Unexpected error fetching Pyth prices:", error);
    return liveJson({ error: "Unexpected error fetching Pyth prices", prices: [] }, 500);
  }

  if (result.ok) {
    const feed = result.feed;

    // Build the reverse lookup once, then derive prices only for known tokens — in declaration order.
    const idToSymbol = buildIdToSymbolMap();
    const prices: Array<{ symbol: string; price: number; change: number; confidence: number; publishTime: number }> = [];

    for (const symbol of Object.keys(PYTH_FEED_IDS)) {
      const parsed = feed.parsed?.find((entry) => idToSymbol.get(entry.id) === symbol);
      if (!parsed) continue; // Feed unavailable this moment — skip gracefully rather than failing the whole call.

      const tokenPrice = parseFeedToToken(symbol, parsed);
      if (tokenPrice) prices.push(tokenPrice);
    }

    console.info(
      `Pyth Hermes OK: ${prices.length}/${Object.keys(PYTH_FEED_IDS).length} feeds resolved.`,
    );

    return liveJson({ prices });
  }

  // All attempts failed; classify as transient (retryable) vs permanent for observability.
  const isTransient = /timed out|retry/i.test(result.error.message);
  console.error("Pyth Hermes request failed after retries:", result.error.message);
  return liveJson({ error: "Failed to fetch prices", prices: [], retryable: isTransient }, isTransient ? 503 : 500);}

// Live price data must never be cached by proxies/CDNs or stored in shared caches —
// the UI polls this endpoint (up to every second on fallback), so we force fresh reads.
function liveJson(body: unknown, status: number = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0, private" },
  });
}

/** Reverse lookup from normalized feed id (without `0x`) to the token symbol. */
function buildIdToSymbolMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const [symbol, rawFeedId] of Object.entries(PYTH_FEED_IDS)) {
    map.set(rawFeedId.startsWith("0x") ? rawFeedId.slice(2) : rawFeedId, symbol);
  }
  return map;
}