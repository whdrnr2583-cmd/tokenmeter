export type RuleMetric =
  | 'daily_usd'
  | 'weekly_usd'
  | 'monthly_usd'
  | 'daily_output_tokens'
  | 'daily_cache_write_tokens';

export type RuleOp = '>=' | '>';

export type ActionType = 'notify.desktop' | 'notify.webhook' | 'notify.email';

export interface DesktopActionConfig {
  title?: string;
}

export interface WebhookActionConfig {
  url: string;
}

export interface EmailActionConfig {
  to: string;
}

export type ActionConfig = DesktopActionConfig | WebhookActionConfig | EmailActionConfig;

export interface Rule {
  id: number;
  name: string;
  enabled: number; // 0|1
  metric: RuleMetric;
  op: RuleOp;
  threshold: number;
  action_type: ActionType;
  action_config: string; // JSON string
  cooldown_ms: number;
  last_fired_at: number | null;
  created_at: number;
}

export interface RuleInput {
  name: string;
  enabled: boolean;
  metric: RuleMetric;
  op: RuleOp;
  threshold: number;
  action_type: ActionType;
  action_config: ActionConfig;
  cooldown_ms?: number;
}

export interface RuleFiring {
  id: number;
  rule_id: number;
  fired_at: number;
  metric_value: number;
  action_result: string;
}

export interface FiringPayload {
  rule_id: number;
  rule_name: string;
  fired_at: number;
  metric: RuleMetric;
  metric_value: number;
  threshold: number;
  op: RuleOp;
  window: { label: string; start_ts: number; end_ts: number };
  summary: {
    claude_code_usd: number;
    codex_usd: number;
    events: number;
    top_models: { model: string; usd: number }[];
  };
}
