// Seed tool: deliberately basic. Returns raw rows only, capped at 50.
import { readFileSync } from "node:fs";
import { z } from "zod";

export const name = "query_orders";
export const description = "Get order rows from the sales database. Optional region filter. Returns up to `limit` rows.";
export const schema = {
  region: z.string().optional().describe("Region name to filter on"),
  limit: z.number().int().min(1).max(50).default(20).describe("Max rows to return"),
};

export async function handler(args) {
  const orders = JSON.parse(readFileSync(new URL("../data/orders.json", import.meta.url), "utf8"));
  const rows = orders.filter((o) => !args.region || o.region === args.region).slice(0, args.limit);
  return { content: [{ type: "text", text: JSON.stringify(rows) }] };
}
