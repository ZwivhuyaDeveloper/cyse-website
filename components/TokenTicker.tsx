"use client";

import React, { useEffect, useRef, memo, useState } from 'react';
import { LogoLoop, LogoItem } from './LogoLoop';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { HermesClient } from '@pythnetwork/hermes-client';
import { cn } from '@/lib/utils';
import { PYTH_FEED_IDS, HERMES_SSE_URL } from '@/lib/token-constants';
import { parseFeedToToken, type PythPriceUpdate } from '@/lib/token-price';

interface TokenData {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  logo: string;
}

interface TokenTickerProps {
  className?: string;
  speed?: number;
}

const TOKEN_CONFIGS = [
  { symbol: 'BTC', name: 'Bitcoin', logo: '/tokens/Bitcoin.svg' },
  { symbol: 'ETH', name: 'Ethereum', logo: '/tokens/Ethereum ETH.svg' },
  { symbol: 'USDT', name: 'Tether', logo: '/tokens/Tether.svg' },
  { symbol: 'BNB', name: 'BNB', logo: '/tokens/Binance.svg' },
  { symbol: 'XRP', name: 'XRP', logo: '/tokens/XRP.svg' },
  { symbol: 'ADA', name: 'Cardano', logo: '/tokens/Cardano ADA.svg' },
  { symbol: 'SOL', name: 'Solana', logo: '/tokens/Solana SOL.svg' },
  { symbol: 'DOT', name: 'Polkadot', logo: '/tokens/Polkadot.svg' },
  { symbol: 'USDC', name: 'USD Coin', logo: '/tokens/USD Coin.svg' },
  { symbol: 'MATIC', name: 'Polygon', logo: '/tokens/Polygon.svg' },
  { symbol: 'SHIB', name: 'Shiba Inu', logo: '/tokens/Shiba Inu SHIB.svg' },
  { symbol: 'TRX', name: 'Tron', logo: '/tokens/Tron.svg' },
  { symbol: 'AVAX', name: 'Avalanche', logo: '/tokens/Avalanche.svg' },
  { symbol: 'UNI', name: 'Uniswap', logo: '/tokens/Uniswap UNI.svg' },
];

// Global price store for all TokenCard instances (module-level variable, not a hook)
const priceStore: Record<string, { price: number; change24h: number }> = {};

// Token-specific decimal places for accurate price formatting
const TOKEN_DECIMALS: Record<string, number> = {
  BTC: 2,
  ETH: 2,
  USDT: 2,
  USDC: 2,
  BNB: 2,
  XRP: 4,
  ADA: 4,
  SOL: 2,
  DOT: 4,
  MATIC: 4,
  SHIB: 8,
  TRX: 4,
  AVAX: 2,
  UNI: 2,
};

function formatPrice(price: number, symbol: string): string {
  const decimals = TOKEN_DECIMALS[symbol] || 2;
  if (price >= 1000) {
    return price.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
  return price.toFixed(decimals);
}

// React state-based token card for reliable price updates
const TokenCard = memo(function TokenCard({ token }: { token: TokenData }) {
  const [price, setPrice] = useState(token.price);
  const [change24h, setChange24h] = useState(token.change24h);

  useEffect(() => {
    const updateFromStore = () => {
      const storedData = priceStore[token.symbol];
      if (!storedData) return;

      setPrice(storedData.price);
      setChange24h(storedData.change24h);
    };

    // Update immediately from store
    updateFromStore();

    // Poll for updates from store
    const interval = setInterval(updateFromStore, 100);

    return () => clearInterval(interval);
  }, [token.symbol]);

  const isPositive = change24h >= 0;

  return (
    <div 
      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 min-w-fit shadow-sm"
      style={{ transform: 'translateZ(0)', willChange: 'transform' }}
    >
      <img
        src={token.logo}
        alt={token.name}
        className="w-5 h-5 object-contain flex-shrink-0"
        loading="lazy"
        decoding="async"
        style={{ transform: 'translateZ(0)' }}
      />
      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-xs text-slate-900 dark:text-slate-100 uppercase">
            {token.symbol}
          </span>
          <span 
            className="text-xs font-semibold tabular-nums transition-colors duration-200"
            style={{ color: isPositive ? '#16a34a' : '#dc2626' }}
          >
            ${formatPrice(price, token.symbol)}
          </span>
        </div>
        <div className={cn(
          "flex items-center gap-0.5 text-[10px] font-medium"
        )}>
          {isPositive ? (
            <TrendingUp className="w-3 h-3 transition-transform duration-200" />
          ) : (
            <TrendingDown className="w-3 h-3 transition-transform duration-200" style={{ transform: 'rotate(180deg)' }} />
          )}
          <span className={cn("tabular-nums", isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
            {isPositive ? '+' : ''}{change24h.toFixed(2)}%
          </span>
        </div>
      </div>
    </div>
  );
});

// Feed ids for the tokens in this ticker; computed once so it's a stable value.
const feedIds = Object.values(PYTH_FEED_IDS);

// Retry/fallback tuning for the Pyth SSE → REST fallback path.
const MAX_SSE_ATTEMPTS = 3; // connect retries before falling back to polling our own /api/token-prices
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 20_000;
const FALLBACK_POLL_INTERVAL_MS = 8000;
const FALLBACK_POLL_TIMEOUT_MS = 90_000; // stop polling after ~90s of no SSE recovery (avoids an infinite loop)
const SSE_INACTIVITY_FALLOVER_MS = 15_000; // fall back to REST polling if the feed is silent this long

export function TokenTicker({ className, speed = 40 }: TokenTickerProps) {
  // SSE refs - must be at component level, not inside useEffect
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const baselinePricesRef = useRef<Record<string, number>>({});
  const sseConnectedRef = useRef(false);
  const errorCountRef = useRef(0);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fallbackStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Triple the tokens for seamless looping - more content = smoother transitions
  const tokens = useRef<TokenData[]>(
    [...TOKEN_CONFIGS, ...TOKEN_CONFIGS, ...TOKEN_CONFIGS].map((t, i) => ({
      ...t,
      symbol: t.symbol,
      name: t.name,
      logo: t.logo,
      price: 0, // Will be populated by SSE
      change24h: 0, // Will be populated by SSE
    }))
  ).current;

  // Create logo items once - never changes
  const logoItems: LogoItem[] = useRef(
    tokens.map((token, i) => ({
      node: <TokenCard key={`${token.symbol}-${i}`} token={token} />,
      title: token.name,
    }))
  ).current;

  // SSE Connection Logic — live prices via Pyth, falling back to our own /api/token-prices when the feed is unreachable.
  useEffect(() => {
    let cancelled = false;

    // Write a denominated price into the shared store (baseline + implied 24h change).
    function applyPrice(symbol: string, price: number) {
      if (!Number.isFinite(price)) return;
      if (price <= 0) return; // ignore zero/negative raw values
      if (!baselinePricesRef.current[symbol]) baselinePricesRef.current[symbol] = price;
      const change24h = ((price - baselinePricesRef.current[symbol]) / baselinePricesRef.current[symbol]) * 100;
      priceStore[symbol] = { price, change24h };
    }

    // Apply a parsed Pyth update (shared shape for both the SSE stream and REST response).
    function applyUpdates(parsed: PythPriceUpdate[]): void {
      for (const entry of parsed) {
        if (!entry || !Number.isFinite(entry.price?.expo)) continue;
        const normalizedId = String(entry.id).startsWith("0x") ? String(entry.id).slice(2) : String(entry.id);
        const symbol = Object.keys(PYTH_FEED_IDS).find((key) => PYTH_FEED_IDS[key as keyof typeof PYTH_FEED_IDS] === normalizedId);
        if (!symbol) continue; // not one of the tokens shown in this ticker

        applyPrice(symbol, parseFeedToToken(symbol, entry)?.price ?? 0);
      }
    }

    // Apply REST snapshot prices directly (they're already denominated).
    function applyRestPrices(restPrices: Array<{ symbol: string; price: number }>): void {
      restPrices.forEach((item) => applyPrice(item.symbol ?? "", item.price));
    }

    async function handleMessage(data: string): Promise<void> {
      try {
        const parsed = JSON.parse(data).parsed as PythPriceUpdate[] | undefined;
        if (Array.isArray(parsed)) applyUpdates(parsed);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn("Error parsing SSE message:", msg);
      }
    }

    async function connectSSE(): Promise<void> {
      if (cancelled || sseConnectedRef.current) return;

      try {
        const client = new HermesClient(HERMES_SSE_URL, { httpRetries: 2 });
        const eventSource = await client.getPriceUpdatesStream(feedIds);
        eventSourceRef.current = eventSource;

        errorCountRef.current = 0;
        sseConnectedRef.current = true;
        stopPolling();

        eventSource.onmessage = (event) => handleMessage(event.data);
        // Native EventSource auto-reconnects on transient drops; only flag repeated failures.
        eventSource.onerror = () => {
          if (!sseConnectedRef.current) return; // not connected yet — the retry loop handles it
          errorCountRef.current++;
          console.warn(`Pyth SSE stream dropped (errors since connect: ${errorCountRef.current}); keeping native auto-reconnect.`);
        };

        // If the feed goes silent for a while, fall back to polling our own server.
        if (SSE_INACTIVITY_FALLOVER_MS) {
          reconnectTimeoutRef.current = setTimeout(() => {
            sseConnectedRef.current = false;
            stopPolling();
            startPollingFallback();
          }, SSE_INACTIVITY_FALLOVER_MS);
        }
      } catch (error) {
        errorCountRef.current++;
        const msg = error instanceof Error ? error.message : String(error);
        console.warn("HermesClient failed to open SSE stream:", msg);
        reconnectAttemptsRef.current++;
        if (!cancelled && reconnectAttemptsRef.current < MAX_SSE_ATTEMPTS) scheduleReconnect();
        else startPollingFallback();
      }
    }

    function stopPolling(): void {
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
    }

    // REST fallback: poll our own /api/token-prices so prices still update when Pyth is unreachable.
    function startPollingFallback(): void {
      stopPolling();
      console.info("Pyth feed unavailable via SSE — polling /api/token-prices as fallback.");
      const tick = async (): Promise<void> => {
        try {
          const response = await fetch("/api/token-prices");
          if (!response.ok) return; // upstream unreachable/auth-required — ignore and retry later
          const data = await response.json();
          if (!data || typeof data !== "object") return;
          applyRestPrices((data as { prices?: Array<{ symbol: string; price: number }> }).prices ?? []);
        } catch {
          // transient network error while polling — keep trying on the next tick
        }
      };
      pollIntervalRef.current = setInterval(tick, FALLBACK_POLL_INTERVAL_MS);

      // Stop polling once SSE recovers or after a bounded window (avoids an infinite loop).
      if (FALLBACK_POLL_TIMEOUT_MS) {
        fallbackStopTimeoutRef.current = setTimeout(() => {
          console.info("Fallback polling timed out; stopping until next mount.");
          stopPolling();
        }, FALLBACK_POLL_TIMEOUT_MS);
      }
    }

    function scheduleReconnect(): void {
      if (cancelled || sseConnectedRef.current) return;
      const delay = Math.min(RECONNECT_BASE_DELAY_MS * Math.pow(2, reconnectAttemptsRef.current), RECONNECT_MAX_DELAY_MS);
      reconnectTimeoutRef.current = setTimeout(() => { connectSSE(); }, delay);
    }

    function cleanup(): void {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      stopPolling();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      cancelled = true;
    }

    connectSSE();

    return cleanup;
  }, []);

  return (
    <div 
      className={cn(
        "w-full overflow-hidde py-1  ",
        className
      )}
      style={{ contain: 'layout style paint' }}
    >
      <LogoLoop
        logos={logoItems}
        speed={speed}
        direction="left"
        pauseOnHover={true}
        hoverSpeed={8}
        gap={8}
        logoHeight={38}
        ariaLabel="Live token price ticker"
        fadeOut={true}
      />
    </div>
  );
}

export default TokenTicker;
