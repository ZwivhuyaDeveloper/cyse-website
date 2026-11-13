/**
 * Shared types for Pyth Network price data and our normalized token prices.
 *
 * The same shapes are used by both the REST endpoint (`/api/token-prices`) and
 * the client-side SSE stream in `components/news/tokenDisplay.tsx`, so we keep
 * them in one place to avoid drift between server and UI.
 */

/** A single Pyth feed's latest price update as returned over the Hermes API. */
export interface PythPriceUpdate {
  id: string; // hex feed id, prefixed with "0x" by the API/SSE layer
  price: {
    /** Raw integer price encoded as a decimal string (e.g. "1"). */
    price: string;
    /** Raw confidence value, also scaled by `expo`. May be negative/zero. */
    conf: string;
    /** Exponent applied to the raw integers (typically negative). */
    expo: number;
    /** Unix timestamp (ms) of when this update was published. */
    publish_time: number;
  };
}

/** The payload returned by `GET /v2/updates/price/latest`. */
export interface PythPriceFeed {
  parsed?: PythPriceUpdate[];
}

/** Public shape served by `/api/token-prices` and consumed by the UI. */
export interface TokenPrice {
  symbol: string; // token ticker, e.g. "BTC"
  price: number; // denominated value in base units (e.g. USD)
  change: number; // percent change since baseline; Pyth's latest endpoint doesn't provide this
  confidence: number; // scaled confidence value from the feed
  publishTime: number; // ms timestamp of the reading
}

/**
 * Scale a raw Pyth integer to its decimal value using the feed exponent.
 * Returns null when the input cannot be parsed as a finite number so callers can
 * gracefully skip malformed feeds instead of throwing.
 */
export function scalePythValue(rawValue: unknown, expo: number): number | null {
  if (typeof rawValue !== "number" && typeof rawValue !== "string") return null;
  const numeric = Number(rawValue);
  return Number.isFinite(numeric) ? numeric * Math.pow(10, expo) : null;
}

/** Normalize a Pyth feed update into a {@link TokenPrice}, or null if unusable. */
export function parseFeedToToken(symbol: string, parsed: PythPriceUpdate): TokenPrice | null {
  const price = scalePythValue(parsed.price?.price, parsed.price?.expo);
  if (price === null) return null;

  return {
    symbol,
    price,
    change: 0,
    confidence: scalePythValue(parsed.price?.conf, parsed.price?.expo) ?? 0,
    publishTime: typeof parsed.price?.publish_time === "number"
      ? parsed.price.publish_time
      : Date.now(),
  };
}
