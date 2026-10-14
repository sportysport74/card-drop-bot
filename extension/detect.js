// Stock detector shared by both check modes:
//  - fetch mode: runs in offscreen.html on HTML parsed with DOMParser
//  - tab mode:   injected into the live page with chrome.scripting
// Returns { status: 'in' | 'out' | 'unknown' | 'blocked' | 'ok', reason, listings? }
globalThis.cardWatchDetect = function (doc, opts, baseUrl) {
  const BLOCK_RE = /just a moment|attention required|access denied|verify you are (a )?human|are you a robot|pardon our interruption|request unsuccessful|press (&|and) hold/i;
  const BUY_RE = /^(add to (cart|bag)|buy (it )?now|pre-?order( now)?|add to cart - .*)$/i;
  const OUT_RE = /\b(sold out|out of stock|coming soon|notify me|currently unavailable|no longer available)\b/i;

  function pageText() {
    if (!doc.body) return '';
    if (doc.defaultView) return doc.body.innerText || '';
    // Parsed (not rendered) document: drop scripts so JSON blobs don't count as text.
    const clone = doc.body.cloneNode(true);
    clone.querySelectorAll('script,style,noscript,template').forEach((n) => n.remove());
    return clone.textContent.replace(/\s+/g, ' ');
  }

  function availabilityValues() {
    const found = [];
    const visit = (node) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) return node.forEach(visit);
      if (typeof node.availability === 'string') found.push(node.availability);
      for (const k of ['@graph', 'offers', 'hasVariant', 'mainEntity']) if (node[k]) visit(node[k]);
    };
    doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
      try { visit(JSON.parse(s.textContent)); } catch (e) { /* bad JSON-LD, ignore */ }
    });
    doc.querySelectorAll('[itemprop="availability"]').forEach((el) => found.push(el.getAttribute('href') || el.getAttribute('content') || ''));
    doc.querySelectorAll('meta[property="product:availability"], meta[property="og:availability"]').forEach((m) => found.push(m.content || ''));
    return found.map((v) => v.toLowerCase().replace(/[^a-z]/g, '')).filter(Boolean);
  }

  function buyButtons() {
    let enabled = 0, disabled = 0;
    const els = doc.querySelectorAll('button, input[type="submit"], input[type="button"], a[role="button"]');
    for (const el of els) {
      const label = (el.textContent || el.value || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
      if (label.length > 60 || !BUY_RE.test(label)) continue;
      const off = el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true' || /\bdisabled\b/i.test(el.getAttribute('class') || '');
      if (off) disabled++; else enabled++;
    }
    return { enabled, disabled };
  }

  const text = pageText();
  if (BLOCK_RE.test(doc.title || '') || (text.length < 3000 && BLOCK_RE.test(text))) {
    return { status: 'blocked', reason: 'Site showed a bot check page' };
  }

  if (opts.kind === 'search') {
    const listings = new Map();
    const links = doc.querySelectorAll('a[href]');
    for (const a of links) {
      const title = (a.textContent || a.getAttribute('title') || a.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
      if (title.length < 12 || title.length > 250) continue;
      const t = ` ${title.toLowerCase()} `;
      if (opts.requireAny.length && !opts.requireAny.some((w) => t.includes(w))) continue;
      if (opts.globalExclude.some((w) => t.includes(w))) continue;
      const product = opts.matchers.find((m) => m.match.every((w) => t.includes(w)) && !(m.exclude || []).some((w) => t.includes(w)));
      if (!product) continue;
      let href;
      try { href = new URL(a.getAttribute('href'), baseUrl).href.split('#')[0]; } catch (e) { continue; }
      if (!listings.has(href)) listings.set(href, { href, title, product: product.name });
    }
    if (links.length < 15) return { status: 'unknown', reason: 'Page has almost no links (probably built by JavaScript)', listings: [] };
    return { status: 'ok', reason: `${listings.size} matching listings`, listings: [...listings.values()] };
  }

  const avail = availabilityValues();
  if (avail.some((v) => /outofstock|soldout|discontinued|instoreonly|^oos$/.test(v))
      && !avail.some((v) => /instock|preorder|presale|limitedavailability|onlineonly|backorder/.test(v))) {
    return { status: 'out', reason: 'Listed as out of stock' };
  }
  if (avail.some((v) => /instock|preorder|presale|limitedavailability|onlineonly|backorder/.test(v))) {
    return { status: 'in', reason: 'Listed as in stock' };
  }
  const btn = buyButtons();
  if (btn.enabled) return { status: 'in', reason: 'Add to Cart button is live' };
  if (btn.disabled) return { status: 'out', reason: 'Add to Cart button is disabled' };
  if (OUT_RE.test(text)) return { status: 'out', reason: `Page says "${text.match(OUT_RE)[0]}"` };
  return { status: 'unknown', reason: 'No stock info found on page' };
};
