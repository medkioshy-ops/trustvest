import "server-only";
import { alpacaConfigured } from "../config";
import { AlpacaProvider } from "./alpaca";
import { SimulatedProvider } from "./simulated";
import type { MarketProvider } from "./types";

export function getMarketProvider(): MarketProvider {
  if (alpacaConfigured()) {
    return new AlpacaProvider(
      process.env.ALPACA_API_KEY_ID!,
      process.env.ALPACA_API_SECRET_KEY!,
      process.env.ALPACA_PAPER !== "false",
    );
  }
  return new SimulatedProvider();
}

export type { MarketProvider } from "./types";
