import type { SVGProps } from "react";

import type { ChainId } from "../../lib/carvy";

type P = SVGProps<SVGSVGElement> & { size?: number };

export function ChainIcon({ chain, size = 18, ...rest }: P & { chain: ChainId | "bitcoin" }) {
  const s = { width: size, height: size, ...rest };
  if (chain === "bitcoin")
    return (
      <svg viewBox="0 0 32 32" {...s}>
        <circle cx="16" cy="16" r="16" fill="#F7931A" />
        <path fill="#fff" d="M22.6 14c.3-2-1.2-3.1-3.3-3.8l.7-2.7-1.6-.4-.7 2.6-1.3-.3.7-2.6-1.6-.4-.7 2.7-1-.3-2.2-.5-.4 1.7s1.2.3 1.2.3c.7.2.8.6.8 1l-.8 3.1.2.1-.2-.1-1.1 4.4c-.1.2-.3.5-.8.4l-1.2-.3-.8 1.8 2.1.5 1.1.3-.7 2.8 1.6.4.7-2.7 1.3.3-.7 2.7 1.6.4.7-2.8c2.8.5 4.9.3 5.8-2.2.7-2-.04-3.2-1.5-3.9 1.1-.3 1.9-1 2.1-2.5zm-3.7 5.2c-.5 2-3.9.9-5 .6l.9-3.6c1.1.3 4.6.8 4.1 3zm.5-5.2c-.5 1.8-3.3.9-4.2.7l.8-3.2c.9.2 3.9.7 3.4 2.5z" />
      </svg>
    );
  if (chain === "ethereum")
    return (
      <svg viewBox="0 0 32 32" {...s}>
        <circle cx="16" cy="16" r="16" fill="#627EEA" />
        <path fill="#fff" fillOpacity=".6" d="M16.5 4v8.9l7.5 3.3z" />
        <path fill="#fff" d="M16.5 4L9 16.2l7.5-3.3z" />
        <path fill="#fff" fillOpacity=".6" d="M16.5 22v6l7.5-10.4z" />
        <path fill="#fff" d="M16.5 28v-6L9 17.6z" />
        <path fill="#fff" fillOpacity=".2" d="M16.5 20.6l7.5-4.4-7.5-3.3z" />
        <path fill="#fff" fillOpacity=".6" d="M9 16.2l7.5 4.4v-7.7z" />
      </svg>
    );
  if (chain === "base")
    return (
      <svg viewBox="0 0 32 32" {...s}>
        <circle cx="16" cy="16" r="16" fill="#0052FF" />
        <path fill="#fff" d="M16 26c5.5 0 10-4.5 10-10S21.5 6 16 6c-5.2 0-9.5 4-9.9 9.1h13.2v1.8H6.1C6.5 22 10.8 26 16 26z" />
      </svg>
    );
  if (chain === "bsc")
    return (
      <svg viewBox="0 0 32 32" {...s}>
        <circle cx="16" cy="16" r="16" fill="#F3BA2F" />
        <path fill="#fff" d="M12.1 14.4 16 10.5l3.9 3.9 2.3-2.3L16 5.9l-6.2 6.2 2.3 2.3zM5.9 16l2.3-2.3 2.3 2.3-2.3 2.3L5.9 16zm6.2 1.6L16 21.5l3.9-3.9 2.3 2.3-6.2 6.2-6.2-6.2 2.3-2.3zm9.4-1.6 2.3-2.3 2.3 2.3-2.3 2.3-2.3-2.3zm-3.2 0L16 13.7 13.7 16 16 18.3 18.3 16z" />
      </svg>
    );
  if (chain === "solana")
    return (
      <svg viewBox="0 0 32 32" {...s}>
        <defs>
          <linearGradient id="solg" x1="0" x2="1" y1="1" y2="0">
            <stop offset="0" stopColor="#9945FF" />
            <stop offset="1" stopColor="#14F195" />
          </linearGradient>
        </defs>
        <circle cx="16" cy="16" r="16" fill="#111" />
        <path fill="url(#solg)" d="M10 20.2c.1-.1.3-.2.5-.2h12.3c.3 0 .5.4.3.6l-2.4 2.4c-.1.1-.3.2-.5.2H7.9c-.3 0-.5-.4-.3-.6zm0-9.2c.1-.1.3-.2.5-.2h12.3c.3 0 .5.4.3.6l-2.4 2.4c-.1.1-.3.2-.5.2H7.9c-.3 0-.5-.4-.3-.6zm12.1 4.5c-.1-.1-.3-.2-.5-.2H9.3c-.3 0-.5.4-.3.6l2.4 2.4c.1.1.3.2.5.2h12.3c.3 0 .5-.4.3-.6z" />
      </svg>
    );
  // robinhood
  return (
    <svg viewBox="0 0 32 32" {...s}>
      <circle cx="16" cy="16" r="15.25" fill="#0D1F14" stroke="#3DDC84" strokeWidth="1.5" />
      <path fill="#3DDC84" d="M20.9 6.5c-3.7 1.2-7.5 4.3-9.6 8.5-1.1 2.2-1.6 4.6-1.4 7.1.1.7.2 1.5.4 2.2l.3.9 1.5-2.6.9-1.6c.6-1 1.6-1.7 2.7-1.9l3.3-.7c.4-.1.6-.4.6-.8l.3-3.6c.1-1 .5-2 1.2-2.7l1.9-2.1c.6-.7.6-1.7-.1-2.2-.6-.5-1.3-.6-2-.5z" />
    </svg>
  );
}

export function QuoteIcon({ quote, size = 16 }: { quote: string; size?: number }) {
  if (quote === "ETH") return <ChainIcon chain="ethereum" size={size} />;
  if (quote === "SOL") return <ChainIcon chain="solana" size={size} />;
  if (quote === "BNB") return <ChainIcon chain="bsc" size={size} />;
  if (quote === "BTCB") return <ChainIcon chain="bitcoin" size={size} />;
  if (quote === "WBTC" || quote === "cbBTC") return <ChainIcon chain="bitcoin" size={size} />;
  if (/^[A-Z]{2,5}$/.test(quote) && !["USDC", "USDT"].includes(quote))
    return (
      <svg viewBox="0 0 32 32" width={size} height={size} aria-label={quote}>
        <circle cx="16" cy="16" r="16" fill="#0f2418" stroke="#2fd27a" strokeWidth="1.5" />
        <text x="16" y={quote.length > 3 ? "19.5" : "20.5"} textAnchor="middle" fontSize={quote.length > 3 ? "8.5" : "10"} fontWeight="700" fill="#8ff0bd" fontFamily="Inter, sans-serif">
          {quote}
        </text>
      </svg>
    );
  // STOCK_TICKERS: any other short ticker renders as a stock badge above
  return (
    <svg viewBox="0 0 32 32" width={size} height={size}>
      <circle cx="16" cy="16" r="16" fill="#2775CA" />
      <text x="16" y="21" textAnchor="middle" fontSize="14" fontWeight="700" fill="#fff" fontFamily="Inter, sans-serif">
        $
      </text>
    </svg>
  );
}

const base = (size: number) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const });

export const ArrowRight = ({ size = 16 }: { size?: number }) => (
  <svg {...base(size)}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
export const External = ({ size = 13 }: { size?: number }) => (
  <svg {...base(size)}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </svg>
);
export const Copy = ({ size = 14 }: { size?: number }) => (
  <svg {...base(size)}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a1 1 0 0 1 1-1h10" />
  </svg>
);
export const Shield = ({ size = 14 }: { size?: number }) => (
  <svg {...base(size)}>
    <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);
export const WalletIcon = ({ size = 16 }: { size?: number }) => (
  <svg {...base(size)}>
    <rect x="3" y="6" width="18" height="14" rx="3" />
    <path d="M16 13h2M3 10h18M6 6V5a2 2 0 0 1 2-2h9" />
  </svg>
);
export const XLogo = ({ size = 15 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
    <path d="M17.8 3h3.1l-6.8 7.8L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.3-8.3L1.9 3h6.4l4.4 5.8zm-1.1 16.2h1.7L7.4 4.7H5.6z" />
  </svg>
);
export const Bolt = ({ size = 14 }: { size?: number }) => (
  <svg {...base(size)}>
    <path d="M13 2L4 14h7l-1 8 9-12h-7z" />
  </svg>
);
