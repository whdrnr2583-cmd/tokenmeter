// Static landing — no backend wiring during beta (PMF gate).
// Waitlist is handled entirely by the embedded Tally form (data-tally-src).
// When Pro launches, swap the Tally embed for the Polar checkout button.

document.getElementById('year').textContent = String(new Date().getFullYear());

// Tally embed loader. The iframe carries data-tally-src; this script swaps it
// into src once the page is ready so the embed lazy-loads predictably.
(function loadTally() {
  const frames = document.querySelectorAll('iframe[data-tally-src]');
  frames.forEach((f) => {
    if (!f.getAttribute('src')) f.setAttribute('src', f.getAttribute('data-tally-src'));
  });
})();
