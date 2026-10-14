// Checkout assist: one step at a time, injected into the live page.
// Clicks Add to Cart / Checkout / Continue, and STOPS at the final "Place Order"
// button so you confirm the purchase yourself. Also stops at CAPTCHAs, waiting
// rooms and purchase-limit messages and hands control back to you.
globalThis.cardCartStep = function (stage, opts = {}) {
  const ADD_RE = /^(add to (cart|bag)|pre-?order( now)?|buy (it )?now)$/i;
  const NEXT_RE = /^(check ?out|proceed to checkout|secure checkout|checkout now|go to cart|view cart|view cart (&|and) check ?out|continue to (shipping|delivery|payment)( method)?|continue to checkout)$/i;
  const FINAL_RE = /^(place (your )?order|pay now|complete (order|purchase)|submit order|confirm (and|&) pay|place order and pay)$/i;

  const text = (document.body && document.body.innerText) || '';
  if (document.querySelector('iframe[src*="hcaptcha"], iframe[src*="recaptcha"], iframe[src*="challenges.cloudflare"], .g-recaptcha, .h-captcha, .cf-turnstile')) {
    return { action: 'stop', reason: 'CAPTCHA on the page - solve it yourself' };
  }
  if (/queue-it/i.test(location.host) || /you are now in line|you're in line|waiting room|estimated wait time/i.test(text.slice(0, 4000))) {
    return { action: 'stop', reason: 'Waiting room - stay on this tab, do not refresh' };
  }
  if (/purchase limit|limit \d+ per (customer|household|order)|exceeds? the (maximum|limit)/i.test(text)) {
    return { action: 'stop', reason: 'Store shows a purchase limit message' };
  }
  if (/enter (the |your )?(\d-digit )?code|verification code|we (sent|texted) (you )?a code/i.test(text.slice(0, 6000))) {
    return { action: 'stop', reason: 'Store wants a verification code - enter it yourself' };
  }

  const visible = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const enabled = (el) => !el.disabled && el.getAttribute('aria-disabled') !== 'true' && !/\bdisabled\b/i.test(el.getAttribute('class') || '');
  const label = (el) => (el.innerText || el.value || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
  const els = [...document.querySelectorAll('button, input[type="submit"], input[type="button"], a, [role="button"]')]
    .filter((el) => visible(el) && enabled(el) && label(el).length <= 60);
  const find = (re) => els.find((el) => re.test(label(el)));

  const final = find(FINAL_RE);
  if (final) {
    if (opts.clickFinal) {
      // Full Auto-Buy: only click if the total still matches what the background just approved.
      const now = cardOrderSummary();
      if (now.total !== opts.clickFinal.total) return { action: 'stop', reason: `Total changed to $${now.total} - not clicking` };
      final.scrollIntoView({ block: 'center' });
      final.click();
      return { action: 'bought', reason: `Clicked "${label(final)}"` };
    }
    final.scrollIntoView({ block: 'center' });
    final.style.outline = '5px solid #d92d20';
    final.style.outlineOffset = '4px';
    final.focus();
    return { action: 'final', reason: `Ready - click "${label(final)}" to buy`, summary: cardOrderSummary() };
  }
  if (stage === 'add') {
    const add = find(ADD_RE);
    if (add) { add.click(); return { action: 'clicked', reason: `Clicked "${label(add)}"` }; }
  }
  // Cart page / cart drawer: prefer a one-tap wallet button if the store shows one.
  // Shop Pay buttons often live inside shadow DOM, so search through open shadow roots.
  // (PayPal/Apple Pay/Google Pay buttons are locked frames or need your real tap, so they're skipped.)
  if (stage === 'checkout' && opts.preferExpress) {
    const EXPRESS_RE = /^((buy|check ?out|pay) with )?shop ?pay$/i;
    const deep = [];
    const walk = (root) => {
      for (const el of root.querySelectorAll('*')) {
        if (el.matches('button, a, [role="button"]')) deep.push(el);
        if (el.shadowRoot) walk(el.shadowRoot);
      }
    };
    walk(document);
    const exp = deep.find((el) => visible(el) && enabled(el) && EXPRESS_RE.test(label(el)));
    if (exp) {
      exp.click();
      return { action: 'express', label: 'Shop Pay', reason: 'Clicked Shop Pay' };
    }
  }
  const next = find(NEXT_RE);
  if (next) { next.click(); return { action: 'clicked', reason: `Clicked "${label(next)}"` }; }
  return { action: 'none', reason: 'No next button found' };
};

// Reads the checkout's order summary: grand total, item quantities and the summary text.
// Anything it can't read comes back null, and Full Auto-Buy treats null as "don't click".
globalThis.cardOrderSummary = function () {
  const box = document.querySelector('[aria-label*="order summary" i], #order-summary, [data-order-summary], .order-summary')
    || [...document.querySelectorAll('section, aside, div')].find((el) => /^\s*order summary/i.test(el.innerText || '') && (el.innerText || '').length < 4000)
    || document.querySelector('main') || document.body;
  const text = ((box && box.innerText) || '').replace(/ /g, ' ');
  const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);

  // Grand total: lines starting "Total" / "Order total" / "Estimated total" (not "Subtotal"),
  // with the amount on the same line or the next two. Highest amount wins, to stay conservative.
  const totals = [];
  lines.forEach((line, i) => {
    if (!/^(order |estimated |grand )?total\b/i.test(line)) return;
    const m = [line, lines[i + 1] || '', lines[i + 2] || ''].join(' ').match(/\$\s?([\d,]+(?:\.\d{2})?)/);
    if (m) totals.push(Number(m[1].replace(/,/g, '')));
  });

  const quantities = [...text.matchAll(/\bquantity\s*:?\s*(\d+)/gi)].map((m) => Number(m[1]));
  return {
    total: totals.length ? Math.max(...totals) : null,
    quantities,
    text: text.slice(0, 4000).toLowerCase(),
    checkoutUrl: /checkout/i.test(location.pathname + location.host),
  };
};
