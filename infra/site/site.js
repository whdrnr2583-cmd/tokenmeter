// Landing interactivity: footer year + native waitlist form.
// The form posts directly to the Token Meter API (CORS allows token-meter.dev),
// replacing the old Tally iframe embed. Endpoint: POST /v1/waitlist {email, source}.

document.getElementById('year').textContent = String(new Date().getFullYear());

const API_BASE = 'https://api.token-meter.dev';
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const form = document.getElementById('waitlist');
if (form) {
  const hint = document.getElementById('waitlist-hint');
  const btn = form.querySelector('button');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.email.value.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      hint.textContent = 'Please enter a valid email address.';
      return;
    }

    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Sending…';

    try {
      const res = await fetch(`${API_BASE}/v1/waitlist`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, source: 'landing_hero' }),
      });
      if (res.ok) {
        form.innerHTML =
          '<p class="hint" style="margin:0">✓ You\'re on the list — we\'ll email new releases and Pro+ early access.</p>';
      } else {
        hint.textContent =
          'Something went wrong — try again, or email hello@token-meter.dev.';
        btn.disabled = false;
        btn.textContent = label;
      }
    } catch {
      hint.textContent =
        'Network error — try again, or email hello@token-meter.dev.';
      btn.disabled = false;
      btn.textContent = label;
    }
  });
}
