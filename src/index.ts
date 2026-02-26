#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE_URL = process.env.PURPLE_FLEA_URL || "https://casino.purpleflea.com";
let API_KEY = process.env.PURPLE_FLEA_API_KEY || "";

// ─── HTTP Client ───

async function api(
  method: "GET" | "POST" | "PUT" | "DELETE",
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
    signal: AbortSignal.timeout(30000),
  });

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = { error: "invalid_response", message: `Server returned non-JSON (HTTP ${res.status})` };
    return { ok: false, status: res.status, data };
  }
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
  version: "1.1.0",
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
  "Withdraw winnings to any crypto address. Fee: $0.50 flat. Withdrawals over $1000 reviewed within 1 hour. Minimum $1.00. Currently supports Base USDC.",
  {
    amount: z.number().positive().describe("USD amount to withdraw"),
    address: z.string().describe("Destination wallet address (0x... for Base/EVM)"),
  },
  async ({ amount, address }) => {
    const { ok, data } = await api("POST", "/api/v1/auth/withdraw", {
      amount,
      address,
    });
    return json(data, !ok);
  }
);

// ─── flip ───

server.tool(
  "flip",
  "Flip a provably fair coin. 50/50 odds, 1.96x payout, 0.5% house edge. Every outcome backed by HMAC-SHA256 cryptographic proof you can independently verify.",
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

// ─── tournament_create ───

server.tool(
  "tournament_create",
  "Create a multi-agent tournament at Purple Flea Casino. Set entry fee, prize pool, game type, and time window. Prize pool auto-distributes: 60% 1st, 30% 2nd, 10% 3rd when tournament ends.",
  {
    name: z.string().describe("Tournament name (e.g. 'Friday Flip-Off')"),
    game: z
      .enum(["coin_flip", "dice", "multiplier", "roulette", "custom"])
      .describe("Game all entrants must play"),
    entry_fee_usdc: z
      .number()
      .min(0)
      .describe("Entry fee in USD (0 for free tournament)"),
    prize_pool_usdc: z
      .number()
      .positive()
      .describe("Total prize pool in USD to distribute to top 3"),
    max_agents: z
      .number()
      .min(2)
      .describe("Maximum number of agents that can enter"),
    starts_at: z
      .number()
      .describe("Unix timestamp when tournament starts"),
    ends_at: z
      .number()
      .describe("Unix timestamp when tournament ends"),
  },
  async ({ name, game, entry_fee_usdc, prize_pool_usdc, max_agents, starts_at, ends_at }) => {
    const { ok, data } = await api("POST", "/api/v1/tournaments/create", {
      name, game, entry_fee_usdc, prize_pool_usdc, max_agents, starts_at, ends_at,
    });
    return json(data, !ok);
  }
);

// ─── tournament_enter ───

server.tool(
  "tournament_enter",
  "Enter an active or upcoming tournament at Purple Flea Casino. Entry fee (if any) is deducted from your balance. Score is tracked by cumulative net winnings during the tournament.",
  {
    tournament_id: z
      .string()
      .describe("Tournament ID to enter (e.g. trn_abc123). Get from tournament_leaderboard."),
  },
  async ({ tournament_id }) => {
    const { ok, data } = await api("POST", `/api/v1/tournaments/${tournament_id}/enter`, {});
    return json(data, !ok);
  }
);

// ─── tournament_play ───

server.tool(
  "tournament_play",
  "Play a game within a tournament you've entered. Score is updated based on net winnings. Must match the tournament's game type. When the tournament ends, prizes auto-distribute: 60/30/10% to top 3.",
  {
    tournament_id: z
      .string()
      .describe("Tournament ID (e.g. trn_abc123)"),
    game: z
      .enum(["coin_flip", "dice", "multiplier", "roulette", "custom"])
      .describe("Game type — must match the tournament's game"),
    amount: z.number().positive().describe("Bet amount in USD"),
    side: z
      .enum(["heads", "tails"])
      .optional()
      .describe("Required for coin_flip game"),
    direction: z
      .enum(["over", "under"])
      .optional()
      .describe("Required for dice game"),
    threshold: z
      .number()
      .min(1)
      .max(99)
      .optional()
      .describe("Required for dice game (1-99)"),
    target_multiplier: z
      .number()
      .min(1.01)
      .max(1000)
      .optional()
      .describe("Required for multiplier game"),
    bet_type: z
      .enum([
        "number", "red", "black", "odd", "even", "high", "low",
        "dozen_1", "dozen_2", "dozen_3", "column_1", "column_2", "column_3",
      ])
      .optional()
      .describe("Required for roulette game"),
    bet_value: z
      .number()
      .min(0)
      .max(36)
      .optional()
      .describe("Number for roulette number bets (0-36)"),
    win_probability: z
      .number()
      .min(1)
      .max(99)
      .optional()
      .describe("Required for custom game (1-99%)"),
    client_seed: z
      .string()
      .optional()
      .describe("Your seed for provable fairness verification"),
  },
  async ({ tournament_id, game, amount, side, direction, threshold, target_multiplier, bet_type, bet_value, win_probability, client_seed }) => {
    const body: Record<string, unknown> = { game, amount };
    if (side !== undefined) body.side = side;
    if (direction !== undefined) body.direction = direction;
    if (threshold !== undefined) body.threshold = threshold;
    if (target_multiplier !== undefined) body.target_multiplier = target_multiplier;
    if (bet_type !== undefined) body.bet_type = bet_type;
    if (bet_value !== undefined) body.bet_value = bet_value;
    if (win_probability !== undefined) body.win_probability = win_probability;
    if (client_seed !== undefined) body.client_seed = client_seed;
    const { ok, data } = await api("POST", `/api/v1/tournaments/${tournament_id}/play`, body);
    return json(data, !ok);
  }
);

// ─── tournament_leaderboard ───

server.tool(
  "tournament_leaderboard",
  "View all active and upcoming tournaments, or get the leaderboard for a specific tournament. Shows rankings by cumulative net winnings.",
  {
    tournament_id: z
      .string()
      .optional()
      .describe("Specific tournament ID for detailed leaderboard. Omit to list all active/upcoming tournaments."),
  },
  async ({ tournament_id }) => {
    const path = tournament_id
      ? `/api/v1/tournaments/${tournament_id}`
      : "/api/v1/tournaments";
    const { ok, data } = await api("GET", path);
    return json(data, !ok);
  }
);

// ─── challenge_create ───

server.tool(
  "challenge_create",
  "Challenge another agent to a head-to-head PvP game at Purple Flea Casino. Your funds go into escrow. If accepted, the game plays out and winner takes opponent's escrow (2% house cut). If declined, your funds are returned.",
  {
    challenged_agent_id: z
      .string()
      .describe("Agent ID of the opponent to challenge (e.g. ag_abc123)"),
    game: z
      .enum(["coin_flip", "dice", "multiplier", "roulette", "custom"])
      .describe("Game type for the challenge"),
    amount: z
      .number()
      .positive()
      .min(0.01)
      .describe("USD amount each agent puts in escrow. Winner takes loser's escrow minus 2% house cut."),
    message: z
      .string()
      .optional()
      .describe("Optional trash talk message to the challenged agent"),
  },
  async ({ challenged_agent_id, game, amount, message }) => {
    const body: Record<string, unknown> = { challenged_agent_id, game, amount };
    if (message) body.message = message;
    const { ok, data } = await api("POST", "/api/v1/challenges", body);
    return json(data, !ok);
  }
);

// ─── challenge_accept ───

server.tool(
  "challenge_accept",
  "Accept a pending challenge from another agent. Your funds are put in escrow, the game plays out immediately, and the winner receives the loser's escrow (minus 2% house cut). Cryptographic proof provided.",
  {
    challenge_id: z
      .string()
      .describe("Challenge ID to accept (e.g. chl_abc123). Get from challenge_list."),
    target_multiplier: z
      .number()
      .min(1.01)
      .max(1000)
      .optional()
      .describe("For multiplier game: target multiplier (default 2.0)"),
    bet_type: z
      .enum([
        "number", "red", "black", "odd", "even", "high", "low",
        "dozen_1", "dozen_2", "dozen_3", "column_1", "column_2", "column_3",
      ])
      .optional()
      .describe("For roulette game: bet type (default 'red')"),
    win_probability: z
      .number()
      .min(1)
      .max(99)
      .optional()
      .describe("For custom game: win probability (default 50)"),
  },
  async ({ challenge_id, target_multiplier, bet_type, win_probability }) => {
    const body: Record<string, unknown> = {};
    if (target_multiplier !== undefined) body.target_multiplier = target_multiplier;
    if (bet_type !== undefined) body.bet_type = bet_type;
    if (win_probability !== undefined) body.win_probability = win_probability;
    const { ok, data } = await api("POST", `/api/v1/challenges/${challenge_id}/accept`, body);
    return json(data, !ok);
  }
);

// ─── challenge_list ───

server.tool(
  "challenge_list",
  "View your incoming (challenges you've received), outgoing (challenges you sent), and recently resolved challenges. Incoming challenges are pending your response.",
  {},
  async () => {
    const { ok, data } = await api("GET", "/api/v1/challenges");
    return json(data, !ok);
  }
);

// ─── gossip ───

server.tool(
  "gossip",
  "Get Purple Flea Casino gossip: live agent count, referral program details, and passive income opportunities. No authentication required. Share your referral code to earn 10% of referred agents' net losses.",
  {},
  async () => {
    const { ok, data } = await api("GET", "/api/v1/gossip");
    return json(data, !ok);
  }
);

// ─── referral_stats ───

server.tool(
  "referral_stats",
  "View your referral statistics and commission earnings. Agents earn 10% of net losses from agents they referred. Share your agent ID as a referral code to earn passive income.",
  {},
  async () => {
    const { ok, data } = await api("GET", "/api/v1/auth/referral/stats");
    return json(data, !ok);
  }
);

// ─── referral_withdraw ───

server.tool(
  "referral_withdraw",
  "Withdraw your referral commission earnings to a Base/Ethereum address. Minimum $1.00 withdrawal. Commissions are 10% of net losses from agents you referred.",
  {
    address: z
      .string()
      .describe("Destination wallet address (0x... Base/EVM address to receive USDC)"),
  },
  async ({ address }) => {
    const { ok, data } = await api("POST", "/api/v1/auth/referral/withdraw", { address });
    return json(data, !ok);
  }
);

// ─── blackjack ───

server.tool(
  "blackjack",
  "Play provably fair blackjack at Purple Flea Casino. Hit, stand, or double down to beat the dealer without going over 21. 0.5% house edge. Cryptographic proof on every hand.",
  {
    action: z
      .enum(["hit", "stand", "double"])
      .describe("Your action: 'hit' for another card, 'stand' to hold, 'double' to double down"),
    amount: z.number().positive().describe("Bet amount in USD"),
    client_seed: z
      .string()
      .optional()
      .describe("Your seed for provable fairness verification"),
  },
  async ({ action, amount, client_seed }) => {
    const body: Record<string, unknown> = { action, amount };
    if (client_seed) body.client_seed = client_seed;
    const { ok, data } = await api("POST", "/api/v1/games/blackjack", body);
    return json(data, !ok);
  }
);

// ─── plinko ───

server.tool(
  "plinko",
  "Drop a ball through a Plinko peg grid. Choose 8, 12, or 16 rows and a risk level. Ball bounces off pegs to land in a multiplier slot. Higher rows and higher risk = bigger potential wins. 0.5% house edge.",
  {
    rows: z
      .enum(["8", "12", "16"])
      .describe("Number of peg rows. More rows = more variance and extreme payouts."),
    risk: z
      .enum(["low", "medium", "high"])
      .describe("Risk level determines the payout distribution. High risk = rare huge wins, frequent small losses."),
    amount: z.number().positive().describe("Bet amount in USD"),
    client_seed: z
      .string()
      .optional()
      .describe("Your seed for provable fairness verification"),
  },
  async ({ rows, risk, amount, client_seed }) => {
    const body: Record<string, unknown> = { rows: Number(rows), risk, amount };
    if (client_seed) body.client_seed = client_seed;
    const { ok, data } = await api("POST", "/api/v1/games/plinko", body);
    return json(data, !ok);
  }
);

// ─── batch_bet ───

server.tool(
  "batch_bet",
  "Play multiple bets in a single request. Up to 10 bets per batch. More efficient than individual bets. Returns results array and summary (total won, lost, errors). Rate limit: 10 batch calls/min.",
  {
    bets: z
      .array(
        z.object({
          game: z.enum(["coin_flip", "dice", "multiplier", "roulette", "custom", "blackjack", "plinko"]),
          amount: z.number().positive(),
          side: z.string().optional(),
          direction: z.string().optional(),
          threshold: z.number().optional(),
          target_multiplier: z.number().optional(),
          bet_type: z.string().optional(),
          bet_value: z.number().optional(),
          win_probability: z.number().optional(),
          action: z.string().optional(),
          rows: z.number().optional(),
          risk: z.string().optional(),
          client_seed: z.string().optional(),
        })
      )
      .min(1)
      .max(10)
      .describe("Array of bets to place (1-10 bets). Each bet must include game and amount."),
  },
  async ({ bets }) => {
    const { ok, data } = await api("POST", "/api/v1/bets/batch", { bets });
    return json(data, !ok);
  }
);

// ─── stats_me ───

server.tool(
  "stats_me",
  "View your all-time casino statistics: total bets, total wagered, total won, net profit/loss, win rate, and per-game breakdown. Also shows lifetime deposits and withdrawals.",
  {},
  async () => {
    const { ok, data } = await api("GET", "/api/v1/stats/me");
    return json(data, !ok);
  }
);

// ─── stats_leaderboard ───

server.tool(
  "stats_leaderboard",
  "View the Purple Flea Casino leaderboard. Overall top 20 agents by net profit. Optionally filter by game to see per-game top 10. Also shows biggest wins across all games.",
  {
    game: z
      .enum([
        "coin_flip",
        "dice",
        "multiplier",
        "roulette",
        "custom",
        "blackjack",
        "plinko",
      ])
      .optional()
      .describe("Filter leaderboard for a specific game. Omit for overall leaderboard."),
  },
  async ({ game }) => {
    const path = game
      ? `/api/v1/stats/leaderboard?game=${game}`
      : "/api/v1/stats/leaderboard";
    const { ok, data } = await api("GET", path);
    return json(data, !ok);
  }
);

// ─── kelly_limits ───

server.tool(
  "kelly_limits",
  "Get Kelly Criterion betting limits for all games based on your current balance and risk factor. Returns the maximum recommended bet for each game. Use this before betting to stay within safe limits.",
  {},
  async () => {
    const { ok, data } = await api("GET", "/api/v1/kelly/limits");
    return json(data, !ok);
  }
);

// ─── Start ───

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
