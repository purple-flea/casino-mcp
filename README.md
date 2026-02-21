# @purpleflea/casino-mcp

**Blue chip gambling infrastructure for AI agents.** Purple Flea Casino is the first provably fair casino built for autonomous agents — with cryptographic proofs on every outcome, Kelly Criterion bankroll protection, and the lowest house edge in the industry.

## Why Purple Flea?

- **0.5% house edge** — lowest in the industry, transparent on every bet
- **Provably fair** — HMAC-SHA256 commit-reveal on every outcome, independently verifiable
- **Kelly Criterion** — built-in bankroll protection prevents agents from over-betting
- **5 games** — coin flip, dice, roulette, crash, custom odds
- **Referral commission** — agents earn 10% of net losses from agents they refer
- **Multi-chain deposits** — Base, Ethereum, Arbitrum, Optimism, Polygon, Solana, Monero, Bitcoin, Lightning
- **Built for agents** — JSON API, MCP tools, zero human interaction required

## Quick Start

### Claude Desktop / Claude Code

Add to your MCP config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "purple-flea-casino": {
      "command": "npx",
      "args": ["-y", "@purpleflea/casino-mcp"],
      "env": {
        "PURPLE_FLEA_URL": "http://localhost:3000",
        "PURPLE_FLEA_API_KEY": "sk_live_your_key_here"
      }
    }
  }
}
```

### Run directly

```bash
npx @purpleflea/casino-mcp
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PURPLE_FLEA_URL` | `http://localhost:3000` | Casino API base URL |
| `PURPLE_FLEA_API_KEY` | _(empty)_ | Your API key. If not set, use the `register` tool to create an account. |

## Tools

### Account

| Tool | Description |
|---|---|
| `register` | Create a new agent account. Returns API key (store it — cannot be recovered). Optional referral code. |
| `balance` | Check USD balance, lifetime stats (wagered, won, net profit), and recent activity. |
| `deposit_address` | Get a crypto deposit address. Supports 9 chains. All deposits auto-convert to USD. |
| `withdraw` | Withdraw winnings to any crypto address. 0.1% + network fee. |
| `history` | Full transaction ledger — deposits, withdrawals, bets, commissions. |
| `referral_stats` | Your referral earnings and stats. Agents earn 10% of referred agents' net losses. |

### Games

All games are provably fair with HMAC-SHA256 cryptographic proofs.

| Tool | Odds | Payout | Description |
|---|---|---|---|
| `flip` | 50/50 | 1.99x | Coin flip — heads or tails |
| `dice` | Variable | Variable | Roll 1-100, bet over/under a threshold |
| `roulette` | European | 1.96x-35.28x | Number, color, odd/even, high/low, dozens, columns |
| `crash` | Variable | 1.01x-1000x | Pick a target multiplier, win if crash point exceeds it |
| `custom_bet` | You choose | Auto-calculated | Set any win probability (1-99%), payout calculated fairly |

### Strategy

| Tool | Description |
|---|---|
| `kelly_optimal` | Calculate mathematically optimal bet size using Kelly Criterion |
| `verify_proof` | Verify cryptographic fairness proof of any past bet |

## How Provably Fair Works

1. Before you bet, the server commits to a seed by publishing its SHA-256 hash
2. You optionally provide your own `client_seed`
3. The outcome is computed: `HMAC-SHA256(server_seed, client_seed:nonce)`
4. After seed rotation, the server seed is revealed
5. You can independently verify: the hash matches, and the outcome was predetermined

No manipulation is possible — the server cannot change the seed after committing to its hash.

## Referral System

Every agent gets a referral code (their `agent_id`). When a new agent registers with your code:

- You earn **10% commission** on their net losses
- Commission is credited automatically to your balance
- No cap on earnings — build a network of referred agents

Pass your `agent_id` as the `referral_code` parameter when another agent calls `register`.

## Example Session

```
Agent: Use the register tool to create an account
→ { agent_id: "ag_a1b2c3", api_key: "sk_live_...", balance: 0.0 }

Agent: Get a deposit address on Base
→ { chain: "base", address: "0x...", minimum: "$0.50" }

Agent: Check my balance
→ { balance_usd: 100.00, lifetime: { net_profit: 0.00 } }

Agent: Calculate optimal bet for coin flip
→ { max_bet: 1.25, suggested_bet: 0.63, bets_until_ruin: 160 }

Agent: Flip a coin, heads, $0.50
→ { won: true, payout_multiplier: 1.99, amount_won: 1.00, new_balance: 100.50 }

Agent: Verify that bet's fairness
→ { verified: true, proof: { hash_matches: true, server_seed: "..." } }
```

## Architecture

```
Your AI Agent
    ↓ MCP (stdio)
@purpleflea/casino-mcp
    ↓ HTTP
Purple Flea Casino API
    ↓
Provably Fair Engine + Kelly Criterion + SQLite Ledger
```

## License

MIT
