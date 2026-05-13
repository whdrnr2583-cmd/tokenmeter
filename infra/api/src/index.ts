import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Env = {
  DB: D1Database;
  POLAR_WEBHOOK_SECRET?: string;
  RESEND_API_KEY?: string;
  APP_NAME: string;
  SITE_URL: string;
};

const app = new Hono<{ Bindings: Env }>();

app.use(
  '*',
  cors({
    origin: (origin) => {
      if (!origin) return '*';
      const allow = ['https://token-meter.dev', 'http://localhost:8765', 'http://127.0.0.1:8765'];
      return allow.includes(origin) ? origin : null;
    },
  }),
);

app.get('/', (c) => c.text(`${c.env.APP_NAME} API ok`));
app.get('/v1/health', (c) => c.json({ ok: true, ts: Date.now() }));

// ---------- Waitlist ----------
app.post('/v1/waitlist', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { email?: unknown; source?: unknown } | null;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const source = typeof body?.source === 'string' ? body.source.slice(0, 50) : null;
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) {
    return c.json({ ok: false, error: 'invalid_email' }, 400);
  }
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO waitlist (email, source, created_at) VALUES (?, ?, ?)`,
  )
    .bind(email, source, Date.now())
    .run();
  return c.json({ ok: true });
});

// ---------- License verify (called by CLI) ----------
app.post('/v1/license/verify', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { key?: unknown } | null;
  const key = typeof body?.key === 'string' ? body.key.trim() : '';
  if (!key.startsWith('tm_') || key.length > 64) {
    return c.json({ valid: false, error: 'invalid_format' }, 400);
  }
  const row = await c.env.DB.prepare(
    `SELECT key, plan, status, expires_at FROM licenses WHERE key = ?`,
  )
    .bind(key)
    .first<{ key: string; plan: string; status: string; expires_at: number | null }>();
  if (!row) return c.json({ valid: false, error: 'not_found' }, 404);
  const expired = row.expires_at !== null && row.expires_at < Date.now();
  const ok = row.status === 'active' && !expired;
  if (ok) {
    await c.env.DB.prepare(`UPDATE licenses SET last_verified_at = ? WHERE key = ?`)
      .bind(Date.now(), key)
      .run();
  }
  return c.json({
    valid: ok,
    plan: row.plan,
    status: row.status,
    expires_at: row.expires_at,
  });
});

// ---------- Polar webhook (subscription lifecycle) ----------
async function verifyPolarSignature(
  rawBody: string,
  signature: string | null,
  secret: string | undefined,
): Promise<boolean> {
  if (!secret) return false;
  if (!signature) return false;
  // Polar uses HMAC-SHA256 hex of body with webhook secret.
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  const expected = [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  // constant-time-ish compare
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

function newLicenseKey(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `tm_live_${hex}`;
}

app.post('/v1/polar/webhook', async (c) => {
  const raw = await c.req.text();
  const sig = c.req.header('webhook-signature') ?? c.req.header('polar-signature') ?? null;
  const valid = await verifyPolarSignature(raw, sig, c.env.POLAR_WEBHOOK_SECRET);
  if (!valid) return c.json({ ok: false, error: 'invalid_signature' }, 401);

  let evt: { id?: string; type?: string; data?: Record<string, unknown> };
  try {
    evt = JSON.parse(raw);
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  if (!evt.id || !evt.type) return c.json({ ok: false, error: 'missing_fields' }, 400);

  // Idempotency: skip if we've seen this event id.
  const existing = await c.env.DB.prepare(`SELECT id FROM webhook_events WHERE id = ?`)
    .bind(evt.id)
    .first();
  if (existing) return c.json({ ok: true, deduped: true });

  await c.env.DB.prepare(
    `INSERT INTO webhook_events (id, type, payload, received_at) VALUES (?, ?, ?, ?)`,
  )
    .bind(evt.id, evt.type, raw, Date.now())
    .run();

  if (evt.type === 'subscription.created' || evt.type === 'subscription.active') {
    const sub = evt.data ?? {};
    const email =
      (sub.customer as { email?: string } | undefined)?.email ??
      (sub as { customer_email?: string }).customer_email ??
      '';
    const subId = String(sub.id ?? '');
    const customerId = String((sub.customer as { id?: string } | undefined)?.id ?? '');
    const productPlan = String((sub.product as { name?: string } | undefined)?.name ?? 'pro').toLowerCase();
    const plan = productPlan.includes('plus') ? 'pro_plus' : productPlan.includes('team') ? 'team' : 'pro';

    if (email && subId) {
      // Reuse existing license for this subscription if present.
      const existingLic = await c.env.DB.prepare(
        `SELECT key FROM licenses WHERE polar_subscription_id = ?`,
      )
        .bind(subId)
        .first<{ key: string }>();
      const key = existingLic?.key ?? newLicenseKey();
      await c.env.DB.prepare(
        `INSERT INTO licenses (key, email, plan, status, polar_subscription_id, polar_customer_id, created_at)
         VALUES (?, ?, ?, 'active', ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET status='active', plan=excluded.plan`,
      )
        .bind(key, email, plan, subId, customerId, Date.now())
        .run();
      // TODO: send key via email (Resend) — out of scope for skeleton.
    }
  } else if (evt.type === 'subscription.canceled' || evt.type === 'subscription.revoked') {
    const subId = String((evt.data as { id?: string } | undefined)?.id ?? '');
    if (subId) {
      await c.env.DB.prepare(`UPDATE licenses SET status='canceled' WHERE polar_subscription_id=?`)
        .bind(subId)
        .run();
    }
  }

  await c.env.DB.prepare(`UPDATE webhook_events SET processed_at=? WHERE id=?`)
    .bind(Date.now(), evt.id)
    .run();

  return c.json({ ok: true });
});

export default app;
