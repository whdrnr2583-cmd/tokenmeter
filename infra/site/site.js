// Replace with your deployed Workers URL (or set to '/api' if proxied).
const API_BASE = window.TOKEN_METER_API ?? 'https://api.tokenmeter.dev';

document.getElementById('year').textContent = String(new Date().getFullYear());

const form = document.getElementById('waitlist');
const status = document.getElementById('waitlist-status');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = new FormData(form).get('email');
  if (!email || typeof email !== 'string') return;
  const button = form.querySelector('button');
  button.disabled = true;
  status.textContent = 'Saving…';
  try {
    const res = await fetch(`${API_BASE}/v1/waitlist`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, source: 'landing' }),
    });
    if (res.ok) {
      status.textContent = "You're on the list. We'll email you when the beta opens.";
      form.reset();
    } else {
      status.textContent = 'Could not save your email. Try again in a moment.';
    }
  } catch {
    status.textContent = 'Network error. Try again in a moment.';
  } finally {
    button.disabled = false;
  }
});
