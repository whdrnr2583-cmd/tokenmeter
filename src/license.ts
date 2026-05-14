// License entitlement resolution.
//
// Status (v0.1.3): gating is **disabled by default** during the beta. Every
// caller of getEntitlement() sees Pro+ unless TOKEN_METER_GATING=1 is set.
// This keeps existing dogfood + beta behavior intact while the gating code
// lands and gets exercised in CI.
//
// Once the Polar checkout + webhook → license issuance (γ in 05-decisions
// D-031) is live, the default flips to enabled and TOKEN_METER_GATING is
// reinterpreted to mean "force gating off" (developer escape hatch).

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type Tier = 'free' | 'pro' | 'pro_plus';

export interface Entitlement {
  tier: Tier;
  /** Epoch ms when the license expires. null for free / lifetime. */
  valid_until_ms: number | null;
  source:
    | 'gating_disabled'
    | 'free_default'
    | 'env'
    | 'config_file'
    | 'expired_fallback';
  message: string | null;
}

const GATING_ENV = 'TOKEN_METER_GATING';
const LICENSE_ENV = 'TOKEN_METER_LICENSE';
const CONFIG_PATH = join(homedir(), '.tokenmeter', 'license.json');

export const HISTORY_CAP: Record<Tier, number | null> = {
  free: 7,
  pro: 30,
  pro_plus: null,
};

export const FREE_RULE_CAP = 1;
export const FREE_ACTION_TYPES = new Set<string>(['notify.desktop']);

function isGatingEnabled(): boolean {
  const v = process.env[GATING_ENV];
  return v === '1' || v === 'true';
}

function parseTier(input: string): Tier | null {
  const t = input.trim().toLowerCase();
  if (t === 'free') return 'free';
  if (t === 'pro') return 'pro';
  if (t === 'pro+' || t === 'pro_plus' || t === 'pro-plus') return 'pro_plus';
  return null;
}

export function getEntitlement(): Entitlement {
  if (!isGatingEnabled()) {
    return {
      tier: 'pro_plus',
      valid_until_ms: null,
      source: 'gating_disabled',
      message: null,
    };
  }

  const envKey = process.env[LICENSE_ENV];
  if (envKey) {
    const tier = parseTier(envKey);
    if (tier) {
      return { tier, valid_until_ms: null, source: 'env', message: null };
    }
  }

  try {
    const raw = readFileSync(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw) as { tier?: string; valid_until_ms?: number };
    const tier = parseTier(parsed.tier ?? '');
    if (tier) {
      const exp = parsed.valid_until_ms ?? null;
      if (exp !== null && exp < Date.now()) {
        return {
          tier: 'free',
          valid_until_ms: exp,
          source: 'expired_fallback',
          message: `License expired at ${new Date(exp).toISOString()}. Falling back to Free.`,
        };
      }
      return {
        tier,
        valid_until_ms: exp,
        source: 'config_file',
        message: null,
      };
    }
  } catch {
    // Missing / invalid file — fall through to Free default.
  }

  return {
    tier: 'free',
    valid_until_ms: null,
    source: 'free_default',
    message: null,
  };
}

export function clampDaysToEntitlement(days: number, tier: Tier): number {
  const cap = HISTORY_CAP[tier];
  if (cap === null) return days;
  return Math.min(days, cap);
}

export function isProTier(tier: Tier): boolean {
  return tier === 'pro' || tier === 'pro_plus';
}

export function isProPlusTier(tier: Tier): boolean {
  return tier === 'pro_plus';
}
