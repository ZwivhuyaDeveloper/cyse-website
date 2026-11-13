"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import { HermesClient } from "@pythnetwork/hermes-client";
import { PYTH_FEED_IDS, HERMES_SSE_URL } from "@/lib/token-constants";
import {
  type TokenPrice,
  parseFeedToToken,
  type PythPriceUpdate,
} from "@/lib/token-price";

// Types for Pyth SSE messages. These mirror the shared server types in
// `lib/token-price.ts` so both endpoints agree on the wire format.
interface PythMessage {
  parsed?: PythPriceUpdate[];
}

const TOKEN_CONFIGS = [
  { symbol: "BTC", name: "Bitcoin", logo: "/tokens/Bitcoin.svg" },
  { symbol: "ETH", name: "Ethereum", logo: "/tokens/Ethereum ETH.svg" },
  { symbol: "BNB", name: "BNB", logo: "/tokens/Binance.svg" },
  { symbol: "TRX", name: "Tron", logo: "/tokens/Tron.svg" },
  { symbol: "XRP", name: "XRP", logo: "/tokens/XRP.svg" },
];

function formatPrice(price: number): string {
  if (price >= 1000) {
    return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  } else if (price >= 1) {
    return `$${price.toFixed(2)}`;
  } else {
    return `$${price.toFixed(4)}`;
  }
}

export default function TokenDisplay() {
  const [prices, setPrices] = useState<TokenPrice[]>([]);
  const [baselinePrices, setBaselinePrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error' | 'fallback'>('disconnected');
  const [useSSE, setUseSSE] = useState(true);
  const hermesClientRef = useRef<HermesClient | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    async function fetchPrices() {
      try {
        const response = await fetch("/api/token-prices");
        const data = await response.json();
        if (data.prices) {
          setBaselinePrices((prev) => {
            const newBaseline: Record<string, number> = { ...prev };
            data.prices.forEach((price: TokenPrice) => {
              if (!newBaseline[price.symbol]) {
                newBaseline[price.symbol] = price.price;
              }
            });
            return newBaseline;
          });
          setPrices(data.prices);
        }
      } catch (error) {
        console.error("Failed to fetch prices:", error);
      } finally {
        setLoading(false);
      }
    }

    async function connectSSE() {
      setConnectionStatus('connecting');
      const feedIds = Object.values(PYTH_FEED_IDS);

      const client = new HermesClient(HERMES_SSE_URL);
      hermesClientRef.current = client;

      try {
        const eventSource = await client.getPriceUpdatesStream(feedIds);
        eventSourceRef.current = eventSource;

        eventSource.onmessage = (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data) as PythMessage;
            const parsedPrices = data.parsed;
            if (!parsedPrices) return;

            const newPrices = parsedPrices
              .map((parsed): TokenPrice | null => {
                const feedId = parsed.id.startsWith("0x") ? parsed.id.slice(2) : parsed.id;
                const token = Object.keys(PYTH_FEED_IDS).find(
                  (key) => PYTH_FEED_IDS[key as keyof typeof PYTH_FEED_IDS] === feedId
                );

                if (!token) return null;

                // Reuse the shared scaling logic so server and client agree exactly.
                return parseFeedToToken(token, parsed);
              })
              .filter((item): item is TokenPrice => item !== null);

            if (newPrices.length > 0) {
              setBaselinePrices((prev) => {
                const newBaseline: Record<string, number> = { ...prev };
                newPrices.forEach((price) => {
                  if (!newBaseline[price.symbol]) {
                    newBaseline[price.symbol] = price.price;
                  }
                });
                return newBaseline;
              });
              setPrices(newPrices);
              setConnectionStatus('connected');
              reconnectAttemptsRef.current = 0;
              setLoading(false);
            }
          } catch (error) {
            console.error("Error parsing SSE message:", error);
          }
        };

        eventSource.onerror = (error: Event) => {
          // Avoid logging empty error object; show readyState for debugging
          console.warn(
            `SSE connection lost (readyState: ${eventSource.readyState}), attempting reconnect...`
          );
          setConnectionStatus('error');
          eventSource.close();
          reconnectWithBackoff();
        };
      } catch (error) {
        console.warn("Failed to create SSE connection:", error);
        setConnectionStatus('error');
        reconnectWithBackoff();
      }
    }

    function reconnectWithBackoff() {
      const maxRetries = 5;
      const initialDelay = 1000;
      const maxDelay = 30000;

      if (reconnectAttemptsRef.current >= maxRetries) {
        console.log("Max reconnection attempts reached, switching to polling fallback");
        setConnectionStatus('fallback');
        setUseSSE(false);
        startPolling();
        return;
      }

      const delay = Math.min(initialDelay * Math.pow(2, reconnectAttemptsRef.current), maxDelay);
      reconnectAttemptsRef.current++;

      console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${maxRetries})`);

      reconnectTimeoutRef.current = setTimeout(() => {
        connectSSE();
      }, delay);
    }

    function startPolling() {
      setConnectionStatus('fallback');
      fetchPrices();
      pollingIntervalRef.current = setInterval(fetchPrices, 1000);
    }

    function cleanup() {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }

    if (useSSE) {
      connectSSE();
    } else {
      startPolling();
    }

    return cleanup;
  }, [useSSE]);

  return (
    <div className="w-full flex flex-col gap-2 px-2 py-2 pb-3 border-b border-zinc-200 dark:border-zinc-800">
      <div className="w-full flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              connectionStatus === 'connected'
                ? 'bg-green-500 animate-pulse'
                : connectionStatus === 'connecting'
                ? 'bg-yellow-500 animate-pulse'
                : connectionStatus === 'fallback'
                ? 'bg-orange-500'
                : 'bg-red-500'
            }`}
          />
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
            {connectionStatus === 'connected' && 'Live'}
            {connectionStatus === 'connecting' && 'Connecting...'}
            {connectionStatus === 'fallback' && 'Polling'}
            {connectionStatus === 'error' && 'Error'}
            {connectionStatus === 'disconnected' && 'Disconnected'}
          </span>
        </div>
      </div>
      <div className="w-full grid grid-cols-5 items-center justify-between gap-6">
        {TOKEN_CONFIGS.map((token) => {
          const tokenPrice = prices.find((p: TokenPrice) => p.symbol === token.symbol);
          const baselinePrice = baselinePrices[token.symbol];

          // Calculate percentage change from baseline price
          let percentChange = 0;
          if (baselinePrice && tokenPrice) {
            percentChange = ((tokenPrice.price - baselinePrice) / baselinePrice) * 100;
          }
          const isPositive = percentChange >= 0;

          return (
            <div key={token.symbol} className="flex items-center gap-2 min-w-[100px]">
              <div className="w-6 h-6 relative shrink-0">
                <Image
                  src={token.logo}
                  alt={token.name}
                  width={24}
                  height={24}
                  className="rounded-full"
                />
              </div>
              <div className="flex flex-row gap-2 items-center">
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 w-8 shrink-0">
                  {token.symbol}
                </span>
                {loading ? (
                  <span className="text-[10px] text-zinc-400">Loading...</span>
                ) : tokenPrice ? (
                  <div className="flex items-center gap-1 min-w-[70px]">
                    <span className="text-xs text-zinc-600 dark:text-zinc-400 font-sans font-semibold transition-all duration-300 ease-out">
                      {formatPrice(tokenPrice.price)}
                    </span>
                    {Math.abs(percentChange) > 0.001 && (
                      <span
                        className={`text-xs font-mono transition-all duration-300 ease-out ${
                          isPositive
                            ? "text-green-600 dark:text-green-400"
                            : "text-red-600 dark:text-red-400"
                        }`}
                      >
                        {isPositive ? "+" : ""}
                        {percentChange.toFixed(3)}%
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-[10px] text-zinc-400">--</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}