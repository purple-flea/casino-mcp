#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE_URL = process.env.PURPLE_FLEA_URL || "http://localhost:3000";
let API_KEY = process.env.PURPLE_FLEA_API_KEY || "";

// ─── HTTP Client ───

async function api(
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: Record<string, unknown>
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (API_KEY) {
    headers["Authorization"] = `Bearer ${API_KEY}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

function json(data: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    isError,
  };
}

// ─── MCP Server ───

const server = new McpServer({
  name: "purple-flea-casino",
  version: "1.0.0",
});

// ─── register ───

server.tool(
  "register",
  "Register a new agent account at Purple Flea Casino. Returns your API key and agent ID. Store the API key — it cannot be recovered. Optionally provide a referral code to earn the referrer 10% commission on your net losses.",
  {
    referral_code: z
      .string()
      .optional()
      .describe(
        "Another agent's ID (ag_xxx) to register under their referral. They earn 10% of your net losses as commission."
      ),
  },
  async ({ referral_code }) => {
    const body: Record<string, unknown> = {};
    if (referral_code) body.referral_code = referral_code;

    const { ok, data } = await api("POST", "/api/v1/auth/register", body);
    if (ok && data && typeof data === "object" && "api_key" in data) {
      API_KEY = (data as { api_key: string }).api_key;
    }
    return json(data, !ok);
  }
);

// ─── balance ───

server.tool(
  "balance",
  "Check your Purple Flea Casino balance, lifetime stats, and recent activity. Shows USD balance, total wagered, total won, net profit, and last transactions.",
  {},
  async () => {
    const { ok, data } = await api("GET", "/api/v1/auth/balance");
    return json(data, !ok);
  }
);

// ─── deposit_address ───

server.tool(
  "deposit_address",
  "Get a crypto deposit address to fund your casino account. Supports Base, Ethereum, Arbitrum, Optimism, Polygon, Solana, Monero, Bitcoin, and Lightning. All deposits auto-convert to USD. Base (USDC) recommended for lowest fees.",
  {
    chain: z
      .enum([
        "base",
        "ethereum",
        "arbitrum",
        "optimism",
        "polygon",
        "solana",
        "monero",
        "bitcoin",
        "lightning",
      ])
      .describe(
        "Blockchain to deposit on. 'base' recommended for lowest fees."
      ),
  },
  async ({ chain }) => {
    const { ok, data } = await api("POST", "/api/v1/auth/deposit-address", {
      chain,
    });
    return json(data, !ok);
  }
);

// ─── withdraw ───

server.tool(
  "withdraw",
  "Withdraw winnings to any crypto address. Fee: 0.1% + network fee. Withdrawals over $1000 reviewed within 1 hour. Minimum $1.00.",
  {
    amount: z.number().positive().describe("USD amount to withdraw"),
    chain: z
      .enum([
        "base",
        "ethereum",
        "arbitrum",
        "optimism",
        "polygon",
        "solana",
        "monero",
        "bitcoin",
        "lightning",
      ])
      .describe("Target blockchain"),
    token: z.string().describe("Token to send (e.g. USDC, ETH, BTC)"),
    address: z.string().describe("Destination wallet address"),
  },
  async ({ amount, chain, token, address }) => {
    const { ok, data } = await api("POST", "/api/v1/auth/withdraw", {
      amount,
      chain,
      token,
      address,
    });
    return json(data, !ok);
  }
);

// ─── flip ───

server.tool(
  "flip",
  "Flip a provably fair coin. 50/50 odds, 1.99x payout, 0.5% house edge. Every outcome backed by HMAC-SHA256 cryptographic proof you can independently verify.",
  {
    side: z.enum(["heads", "tails"]).describe("Your call — heads or tails"),
    amount: z.number().positive().describe("Bet amount in USD"),
    client_seed: z
      .string()
      .optional()
      .describe(
        "Your seed for provable fairness — combine with server seed to verify outcome"
      ),
  },
  async ({ side, amount, client_seed }) => {
    const body: Record<string, unknown> = { side, amount };
    if (client_seed) body.client_seed = client_seed;
    const { ok, data } = await api("POST", "/api/v1/games/coin-flip", body);
    return json(data, !ok);
  }
);

// ─── dice ───

server.tool(
  "dice",
  "Roll a provably fair dice (1-100). Bet over or under a threshold. Variable odds — higher risk means higher payout. 0.5% house edge. Example: over 75 = 4x payout at 25% win chance.",
  {
    direction: z
      .enum(["over", "under"])
      .describe("Bet the roll lands over or under your threshold"),
    threshold: z
      .number()
      .min(1)
      .max(99)
      .describe(
        "Threshold number (1-99). Over 75 = 25% chance. Under 25 = 25% chance."
      ),
    amount: z.number().positive().describe("Bet amount in USD"),
    client_seed: z
      .string()
      .optional()
      .describe("Your seed for provable fairness verification"),
  },
  async ({ direction, threshold, amount, client_seed }) => {
    const body: Record<string, unknown> = { direction, threshold, amount };
    if (client_seed) body.client_seed = client_seed;
    const { ok, data } = await api("POST", "/api/v1/games/dice", body);
    return json(data, !ok);
  }
);

// ─── roulette ───

server.tool(
  "roulette",
  "Play European roulette (0-36). Bet on number (35.28x), color (1.96x), odd/even (1.96x), high/low (1.96x), dozens (2.94x), or columns (2.94x). 0.5% house edge. Provably fair.",
  {
    bet_type: z
      .enum([
        "number",
        "red",
        "black",
        "odd",
        "even",
        "high",
        "low",
        "dozen_1",
        "dozen_2",
        "dozen_3",
        "column_1",
        "column_2",
        "column_3",
      ])
      .describe("Type of roulette bet"),
    bet_value: z
      .number()
      .min(0)
      .max(36)
      .optional()
      .describe("Number (0-36) — required for number bets"),
    amount: z.number().positive().describe("Bet amount in USD"),
    client_seed: z
      .string()
      .optional()
      .describe("Your seed for provable fairness verification"),
  },
  async ({ bet_type, bet_value, amount, client_seed }) => {
    const body: Record<string, unknown> = { bet_type, amount };
    if (bet_value !== undefined) body.bet_value = bet_value;
    if (client_seed) body.client_seed = client_seed;
    const { ok, data } = await api("POST", "/api/v1/games/roulette", body);
    return json(data, !ok);
  }
);

// ─── crash ───

server.tool(
  "crash",
  "Place a crash (multiplier) bet. Pick a target multiplier (1.01x-1000x) — if the crash point exceeds it, you win your target multiplier. 0.5% house edge. Higher multiplier = higher risk, higher reward.",
  {
    target_multiplier: z
      .number()
      .min(1.01)
      .max(1000)
      .describe(
        "Your target multiplier (1.01x-1000x). Win if crash point >= this."
      ),
    amount: z.number().positive().describe("Bet amount in USD"),
    client_seed: z
      .string()
      .optional()
      .describe("Your seed for provable fairness verification"),
  },
  async ({ target_multiplier, amount, client_seed }) => {
    const body: Record<string, unknown> = { target_multiplier, amount };
    if (client_seed) body.client_seed = client_seed;
    const { ok, data } = await api("POST", "/api/v1/games/multiplier", body);
    return json(data, !ok);
  }
);

// ─── custom_bet ───

server.tool(
  "custom_bet",
  "Create a bet with any win probability you choose (1-99%). Payout auto-calculated: (1/probability) * 0.995. Example: 25% chance = 3.98x payout, 10% chance = 9.95x payout. 0.5% house edge.",
  {
    win_probability: z
      .number()
      .min(1)
      .max(99)
      .describe(
        "Your desired win probability as a percentage (1-99). Lower = higher payout."
      ),
    amount: z.number().positive().describe("Bet amount in USD"),
    client_seed: z
      .string()
      .optional()
      .describe("Your seed for provable fairness verification"),
  },
  async ({ win_probability, amount, client_seed }) => {
    const body: Record<string, unknown> = { win_probability, amount };
    if (client_seed) body.client_seed = client_seed;
    const { ok, data } = await api("POST", "/api/v1/games/custom", body);
    return json(data, !ok);
  }
);

// ─── kelly_optimal ───

server.tool(
  "kelly_optimal",
  "Calculate the mathematically optimal bet size using Kelly Criterion. Returns max recommended bet, ruin probability, expected value, and suggested bet size. Protects your bankroll from over-betting.",
  {
    game: z
      .enum(["coin_flip", "dice_over", "dice_under", "custom"])
      .describe("Game type to calculate optimal bet for"),
    threshold: z
      .number()
      .min(1)
      .max(99)
      .optional()
      .describe("Threshold for dice games (1-99)"),
    win_probability: z
      .number()
      .min(1)
      .max(99)
      .optional()
      .describe("Win probability for custom bets (1-99%)"),
    risk_factor: z
      .number()
      .min(0.1)
      .max(1.0)
      .optional()
      .describe(
        "Fractional Kelly multiplier. 0.1 = ultra conservative, 0.25 = default, 0.5 = aggressive, 1.0 = full Kelly."
      ),
  },
  async ({ game, threshold, win_probability, risk_factor }) => {
    const body: Record<string, unknown> = { game };
    if (threshold !== undefined) body.threshold = threshold;
    if (win_probability !== undefined) body.win_probability = win_probability;
    if (risk_factor !== undefined) body.risk_factor = risk_factor;
    const { ok, data } = await api("POST", "/api/v1/kelly/optimal", body);
    return json(data, !ok);
  }
);

// ─── verify_proof ───

server.tool(
  "verify_proof",
  "Verify the cryptographic fairness proof of any past bet. Returns the server seed, HMAC-SHA256 computation, and whether the result matches — proving the outcome was predetermined and not manipulated.",
  {
    bet_id: z
      .string()
      .describe(
        "The bet ID to verify (e.g. bet_xxxxxxxx). Get from bet results or history."
      ),
  },
  async ({ bet_id }) => {
    const { ok, data } = await api("POST", "/api/v1/fairness/verify", {
      bet_id,
    });
    return json(data, !ok);
  }
);

// ─── history ───

server.tool(
  "history",
  "View your full transaction ledger — deposits, withdrawals, bets, wins, losses, referral commissions. Most recent first.",
  {
    limit: z
      .number()
      .min(1)
      .max(200)
      .optional()
      .describe("Number of entries to return (default 50, max 200)"),
  },
  async ({ limit }) => {
    const path = `/api/v1/auth/ledger${limit ? `?limit=${limit}` : ""}`;
    const { ok, data } = await api("GET", path);
    return json(data, !ok);
  }
);

// ─── referral_stats ───

server.tool(
  "referral_stats",
  "View your referral statistics and commission earnings. Agents earn 10% of net losses from agents they referred. Share your agent ID as a referral code to earn passive income.",
  {},
  async () => {
    const { ok, data } = await api("GET", "/api/v1/stats/me");
    return json(data, !ok);
  }
);

// ─── Start ───

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
