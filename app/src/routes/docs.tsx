import { createFileRoute, Link } from "@tanstack/react-router";
import { TimingTable } from "../components/carvy/progress";

import { CHAINS, CURVE_SUPPLY, TRADE_FEE } from "../lib/carvy";
import { ChainIcon } from "../components/carvy/icons";

export const Route = createFileRoute("/docs")({
  head: () => ({ meta: [{ title: "Docs | Runehood" }] }),
  component: Docs,
});

const TOC = [
  { id: "what", t: "What is Runehood" },
  { id: "chains", t: "Supported chains" },
  { id: "curve", t: "Bonding curve" },
  { id: "fees", t: "Fees" },
  { id: "buyback", t: "Buyback and burn" },
  { id: "bridge", t: "Bridge to Bitcoin" },
  { id: "testnet", t: "Testnet preview" },
];

function Docs() {
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 pt-12 sm:px-6 lg:grid-cols-[220px_1fr]">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <span className="c-eyebrow">Docs</span>
        <nav className="mt-4 space-y-1 text-sm">
          {TOC.map((x) => (
            <a key={x.id} href={`#${x.id}`} className="c-muted block rounded-lg px-3 py-1.5 hover:bg-white/5 hover:text-white">
              {x.t}
            </a>
          ))}
        </nav>
      </aside>
      <article className="max-w-3xl space-y-12 pb-10">
        <Sec id="what" title="What is Runehood">
          <p>Runehood launches real Bitcoin Runes in one click and makes them tradable at full speed on the chain where your community already is. You pick a name, ticker, picture and chain, approve once, and Runehood handles the rest: the bonding curve opens instantly, the Rune is etched on Bitcoin a few blocks later, and holders can move it 1:1 between Bitcoin and the trading chain whenever they like.</p>
        </Sec>
        <Sec id="chains" title="Supported chains">
          <p>Each Rune is 50% Bitcoin and 50% the chain its creator chooses. Pairs per chain:</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {CHAINS.map((c) => (
              <div key={c.id} className="c-card-2 flex items-start gap-3 p-4">
                <ChainIcon chain={c.id} size={30} />
                <div>
                  <div className="font-semibold text-white">{c.name}</div>
                  <div className="text-xs">{c.blurb}</div>
                  <div className="c-rose mt-1 text-xs">Pairs: {c.quotes.join(", ")}</div>
                </div>
              </div>
            ))}
          </div>
        </Sec>
        <Sec id="curve" title="Bonding curve">
          <p>Every Rune starts on a constant product bonding curve priced in BTC, with virtual reserves of 0.04 BTC and 1,073,000,000 tokens. Payments in ETH, SOL, WBTC, cbBTC or USDC are converted to sats at the live price before they hit the curve, so every Rune shares the same BTC-denominated price path whatever chain it trades on.</p>
          <p className="mt-3">When {CURVE_SUPPLY.toLocaleString("en-US")} tokens have been sold, the Rune graduates. One transaction, which anyone can send, moves the raised funds and the matching tokens into a full-range Uniswap V4 pool at the final curve price on Ethereum, Base and Robinhood Chain, and into a PancakeSwap pair on BNB Chain (creator tax keeps working there too, enforced by the token). Leftover tokens are burned and the liquidity stays locked forever.</p>
          <p className="mt-3">On Robinhood Chain a Rune can also be paired with a Robinhood Stock Token (TSLA, NVDA, AAPL, SPY, QQQ, MSTR, COIN, GOOGL, AMZN, META, MSFT, PLTR, AMD, GME, CRCL). Buyers pay in the stock, creator fees and tax are paid in the stock, and the Uniswap V4 pool after graduation is Rune / stock. Stock Tokens are issued by Robinhood and are not available to U.S. persons and some other jurisdictions.</p>
          <p className="mt-3">On Solana, Runes launch on a Meteora Dynamic Bonding Curve (1B supply, 6 decimals). At about 86 SOL raised the pool graduates automatically to Meteora DAMM v2 with locked liquidity; the creator tax tier (0, 1, 3 or 5%) stays on the pool. Bridging to Bitcoin sends tokens to the Runehood vault with your Bitcoin address in the memo; bridging back releases them from the vault.</p>
        </Sec>
        <Sec id="fees" title="Fees">
          <p>Trading fee is {(TRADE_FEE * 100).toFixed(0)}% on every buy and sell. Half goes to the creator side, which the creator configures at launch:</p>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            <li><b className="text-white">Dev</b>: paid to the creator wallet.</li>
            <li><b className="text-white">Holders</b>: the creator share and creator tax go to the Runehood holder-rewards contract and are split between all holders by balance every 6 hours. Holders claim on their Account page (EVM chains).</li>
            <li><b className="text-white">Routed</b>: paid in BTC to any Bitcoin address the creator chooses.</li>
          </ul>
          <p className="mt-3">Creators can also set a creator tax at launch, up to 5% on buys and 5% on sells. It is paid to the creator fee wallet on every curve trade and keeps applying in the Uniswap V4 pool after graduation through the Runehood hook. It is fixed forever. Wallet transfers are never taxed.</p>
          <p className="mt-3">Launching is free. Runehood pays the Bitcoin etching fee.</p>
        </Sec>
        <Sec id="buyback" title="Buyback and burn">
          <p>The other half of every fee goes to the platform. 20% of all platform fees are sent on chain to the buyback vault, used for buybacks.</p>
        </Sec>
        

        <Sec id="bridge" title="Bridge to Bitcoin">
          <div className="c-card-2 mb-4 p-4">
            <div className="c-dim mb-2 text-[10px] uppercase tracking-wider">How long things take</div>
            <TimingTable />
          </div>
          <p>Every mainnet Rune is etched on Bitcoin automatically after launch: a commit transaction reserves the name, and after 6 confirmations (about an hour) the reveal etches the Rune with its full 1,000,000,000 supply, 18 decimals and the logo, into the Runehood custody address. The Rune id appears on its page as soon as it is confirmed.</p>
          <p className="mt-3"><b className="text-white">To Bitcoin:</b> on the Rune page, enter an amount and your Bitcoin address (bc1p… Taproot from Xverse, Unisat, Magic Eden or any Runes wallet) and confirm one transaction. The tokens are burned on their chain and the same amount of the native Rune is sent from custody, usually within a few minutes plus one Bitcoin block. Runehood pays the Bitcoin fee.</p>
          <p className="mt-3"><b className="text-white">From Bitcoin:</b> your Account page shows a personal Bitcoin deposit address. Send Runehood Runes there; after 3 confirmations they are swept into custody and the same amount is minted to your wallet on the Rune's chain.</p>
          <p className="mt-3">Supply on both sides always adds up to 1,000,000,000: what is on Bitcoin outside custody was burned on the trading chain, and the other way round. Names need at least 6 letters on Bitcoin today and must not exist yet; the Create page checks this before launch.</p>
        </Sec>
        <Sec id="testnet" title="Testnet preview">
          <p>This preview runs on test networks with test funds from the faucet on your <Link to="/account" className="c-rose underline">Account</Link> page. Trades, balances and bridges are recorded by Runehood so you can try the full flow without risk. Mainnet adds the on-chain deposit contracts on each chain and the custody signer on Bitcoin.</p>
        </Sec>
      </article>
    </div>
  );
}

function Sec({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="font-display text-3xl font-bold tracking-tight text-white">{title}</h2>
      <div className="c-muted mt-4 leading-relaxed">{children}</div>
    </section>
  );
}
