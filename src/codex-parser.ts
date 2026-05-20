import { readFileSync } from 'node:fs';
import type { TokenEvent } from './types.js';
import { estimateUsd } from './pricing.js';

interface CodexLastTokenUsage {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
  reasoning_output_tokens?: number;
  total_tokens?: number;
}

interface CodexEntry {
  timestamp?: string;
  type?: string;
  payload?: {
    id?: string;
    cwd?: string;
    model_provider?: string;
    base_instructions?: { text?: string };
    type?: string;
    info?: {
      last_token_usage?: CodexLastTokenUsage;
      total_token_usage?: CodexLastTokenUsage;
    } | null;
  };
}

// Extract model from base_instructions like "based on GPT-5" or "GPT-5-Codex"
function extractModel(instructionText: string): string {
  const m = /based on\s+([A-Za-z0-9\-]+)/i.exec(instructionText);
  if (m && m[1]) return m[1].toLowerCase().replace(/[.,;:!?]+$/, '');
  if (/gpt-5-codex/i.test(instructionText)) return 'gpt-5-codex';
  if (/gpt-5-mini/i.test(instructionText)) return 'gpt-5-mini';
  if (/gpt-5/i.test(instructionText)) return 'gpt-5';
  if (/gpt-4o-mini/i.test(instructionText)) return 'gpt-4o-mini';
  if (/gpt-4o/i.test(instructionText)) return 'gpt-4o';
  return 'gpt-5';
}

export interface ParseCodexResult {
  tokens: TokenEvent[];
}

export function parseCodexSession(filePath: string): ParseCodexResult {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  let sessionId = '';
  let cwd = 'unknown';
  let model = 'gpt-5';
  const tokens: TokenEvent[] = [];

  // First pass: read session_meta (always early in file).
  for (const line of lines.slice(0, 5)) {
    if (!line) continue;
    let entry: CodexEntry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.type === 'session_meta' && entry.payload) {
      sessionId = entry.payload.id ?? '';
      cwd = entry.payload.cwd ?? cwd;
      if (entry.payload.base_instructions?.text) {
        model = extractModel(entry.payload.base_instructions.text);
      }
      break;
    }
  }

  if (!sessionId) return { tokens };

  // Second pass: token_count events. Use last_token_usage as per-turn delta.
  for (const line of lines) {
    if (!line) continue;
    let entry: CodexEntry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.type !== 'event_msg') continue;
    if (entry.payload?.type !== 'token_count') continue;
    const info = entry.payload.info;
    if (!info || !info.last_token_usage) continue;
    const u = info.last_token_usage;
    const input = u.input_tokens ?? 0;
    const cacheRead = u.cached_input_tokens ?? 0;
    const output = u.output_tokens ?? 0;
    const reasoning = u.reasoning_output_tokens ?? 0;
    // Codex reports input_tokens including cached. Subtract to get fresh input.
    const freshInput = Math.max(0, input - cacheRead);
    // Reasoning tokens billed as output by OpenAI.
    const totalOutput = output + reasoning;
    if (freshInput + totalOutput + cacheRead === 0) continue;

    const ts = entry.timestamp ? Date.parse(entry.timestamp) : Date.now();
    if (Number.isNaN(ts)) continue;

    // Synthesize a stable request_id so the (session_id, ts, request_id, model)
    // unique index can dedupe re-ingested rows.
    const synthRequestId = `codex-${sessionId.slice(-12)}-${ts}-${totalOutput}`;
    tokens.push({
      ts,
      source: 'codex',
      source_kind: 'cloud',
      model,
      project: cwd,
      session_id: sessionId,
      request_id: synthRequestId,
      input_tokens: freshInput,
      output_tokens: totalOutput,
      cache_read_tokens: cacheRead,
      cache_write_tokens: 0,
      total_duration_ms: null,
      tps: null,
      usd_estimate: estimateUsd({
        model,
        input: freshInput,
        output: totalOutput,
        cacheRead,
        cacheWrite: 0,
      }),
    });
  }

  return { tokens };
}
