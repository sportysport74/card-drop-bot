// Card Drop Watcher background worker.
// Checks each watched page on a jittered timer and alerts on changes.
// Auto-cart walks checkout up to the final button. Full Auto-Buy (off by default) clicks
// that button too, but only after the price, item and quantity checks below all pass.
importScripts('presets.js');

const DEFAULT_SETTINGS = {
  ntfyServer: 'https://ntfy.sh',
  ntfyTopic: '',
  minSec: 45,
  maxSec: 90,
  sound: true,
  openTab: true,
  preferExpress: true,
  autoBuy: false,
  maxPrice: 0,
  paused: false,
};
const HOST_GAP_MS = 10000; // never hit the same store twice within 10s (outside a drop window)
const MAX_BACKOFF = 16;    // failures back off up to 16x the normal interval
const BAD = ['blocked', 'ratelimited', 'error'];

// Drop-time speed-up for a watch with a drop time (not raffles):
// normal 45-90s -> warm (from 2 min before) every 10-15s
// -> strike (15s before to 60s after) every 3-5s -> normal again.
// "Too many requests" or a bot check at any point drops straight back to normal backoff.
const WARM_MS = 2 * 60000;
const STRIKE_BEFORE_MS = 15000;
const STRIKE_AFTER_MS = 60000;
const PHASE = {
  warm: { sec: [10, 15], hostGap: 8000 },
  strike: { sec: [3, 5], hostGap: 2500 },
};
const ALARM_MIN_MS = 30000; // Chrome won't fire alarms sooner than this, so short waits use a timer too

const hostLast = new Map();
const running = new Set();
const timers = new Map();
const rand = (a, b) => a + Math.random() * (b - a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hostOf = (url) => new URL(url).hostname.replace(/^www\./, '');

// ---------- storage (all writes go through one queue so updates never clobber each other)

async function load() {
  const s = await chrome.storage.local.get(['settings', 'watches']);
  return { settings: { ...DEFAULT_SETTINGS, ...(s.settings || {}) }, watches: s.watches || [] };
}

let chain = Promise.resolve();
function mutate(fn) {
  const p = chain.then(async () => {
    const s = await load();
    const out = await fn(s);
    await chrome.storage.local.set({ settings: s.settings, watches: s.watches });
    return out;
  });
  chain = p.catch(() => {});
  return p;
}

// ---------- scheduling

chrome.runtime.onInstalled.addListener(async () => {
  await mutate((s) => {
    if (!s.settings.ntfyTopic) s.settings.ntfyTopic = 'card-drops-' + crypto.randomUUID().slice(0, 13).replace('-', '');
  });
  await rescheduleAll();
});
chrome.runtime.onStartup.addListener(rescheduleAll);

async function rescheduleAll() {
  await chrome.alarms.clearAll();
  const { settings, watches } = await load();
  let when = Date.now() + 5000;
  for (const w of watches) {
    scheduleDrop(w);
    if (settings.paused || w.paused) continue;
    chrome.alarms.create('w:' + w.id, { when });
    when += rand(4000, 9000); // stagger the first round too
  }
  await updateBadge(watches);
}

function dropPhase(w, now = Date.now()) {
  if (!w.dropTime || w.raffle || w.kind === 'search' || w.stock === 'in') return 'normal';
  const t = now - w.dropTime;
  if (t >= -STRIKE_BEFORE_MS && t <= STRIKE_AFTER_MS) return 'strike';
  if (t >= -WARM_MS && t < -STRIKE_BEFORE_MS) return 'warm';
  return 'normal';
}

function nextDelayMs(w, settings) {
  const phase = dropPhase(w);
  const pushedBack = w.status === 'ratelimited' || w.status === 'blocked';
  if (phase !== 'normal' && !pushedBack) {
    const [a, b] = PHASE[phase].sec;
    let ms = rand(a, b) * 1000 * 2 ** Math.min(w.failures || 0, 3); // timeouts/errors ease off a little
    // Don't let a warm-mode wait run past the start of strike mode.
    if (phase === 'warm') ms = Math.min(ms, Math.max(500, w.dropTime - STRIKE_BEFORE_MS - Date.now() + rand(0, 500)));
    return ms;
  }
  let mult = 2 ** Math.min(w.failures || 0, Math.log2(MAX_BACKOFF));
  if (w.status === 'ratelimited') mult = Math.max(mult, 8);
  return rand(settings.minSec, settings.maxSec) * 1000 * mult;
}

// Schedules the next check. Alarms survive the worker being shut down, but can't fire
// sooner than 30s, so short waits also get a timer (each check touches storage, which
// keeps the worker awake between them).
function scheduleCheck(id, when) {
  chrome.alarms.create('w:' + id, { when });
  clearTimeout(timers.get(id));
  timers.delete(id);
  const ms = when - Date.now();
  if (ms < ALARM_MIN_MS) timers.set(id, setTimeout(() => { timers.delete(id); runCheck(id); }, Math.max(0, ms)));
}

function cancelCheck(id) {
  chrome.alarms.clear('w:' + id);
  clearTimeout(timers.get(id));
  timers.delete(id);
}

function scheduleDrop(w) {
  for (const p of ['d10:', 'd5:', 'd2:', 'r:']) chrome.alarms.clear(p + w.id);
  if (!w.dropTime) return;
  for (const min of [10, 5]) {
    const when = w.dropTime - min * 60000;
    if (when > Date.now()) chrome.alarms.create(`d${min}:${w.id}`, { when });
  }
  // Wake up for warm mode even if the normal wait (or a backoff) would sleep through it.
  const ramp = w.dropTime - WARM_MS;
  if (!w.raffle && w.kind !== 'search' && ramp > Date.now()) chrome.alarms.create('r:' + w.id, { when: ramp });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  const i = alarm.name.indexOf(':');
  const kind = alarm.name.slice(0, i);
  const id = alarm.name.slice(i + 1);
  if (kind === 'w' || kind === 'r') runCheck(id);
  else if (kind === 'd10') dropReminder(id, 10);
  else if (kind === 'd5' || kind === 'd2') dropReminder(id, 5);
});

// ---------- checking

async function runCheck(id, force = false) {
  if (running.has(id)) return;
  running.add(id);
  try {
    const { settings, watches } = await load();
    const w = watches.find((x) => x.id === id);
    if (!w || (!force && (settings.paused || w.paused))) return;

    const host = hostOf(w.url);
    const phase = dropPhase(w);
    const hostGap = phase === 'normal' ? HOST_GAP_MS : PHASE[phase].hostGap;
    const gap = Date.now() - (hostLast.get(host) || 0);
    if (gap < hostGap) {
      scheduleCheck(id, Date.now() + hostGap - gap + (phase === 'normal' ? rand(2000, 8000) : rand(100, 400)));
      return;
    }
    hostLast.set(host, Date.now());

    let result;
    try {
      result = w.mode === 'tab' ? await checkViaTab(w) : await checkViaFetch(w);
    } catch (e) {
      result = { status: 'error', reason: String((e && e.message) || e).slice(0, 120) };
    }

    const alerts = await mutate((s) => {
      const cur = s.watches.find((x) => x.id === id);
      if (!cur) return [];
      const out = applyResult(cur, result);
      if (!s.settings.paused && !cur.paused) {
        const delay = nextDelayMs(cur, s.settings);
        cur.nextCheck = Date.now() + delay;
        scheduleCheck(id, cur.nextCheck);
      }
      return out;
    });
    const fresh = await load();
    await updateBadge(fresh.watches);
    for (const a of alerts) {
      if (a.autoCart) {
        await fireAlert({ ...a, open: false }, fresh.settings);
        await assistCheckout(a.url, fresh.settings, a.variantId, a.watchId);
      } else {
        await fireAlert(a, fresh.settings);
      }
    }
  } finally {
    running.delete(id);
  }
}

function detectOpts(w) {
  if (w.kind !== 'search') return { kind: 'product' };
  return { kind: 'search', matchers: PRESETS, globalExclude: GLOBAL_EXCLUDE, requireAny: REQUIRE_ANY };
}

// Lightweight check: one HTML request (no images, scripts or analytics), parsed offscreen.
async function checkViaFetch(w) {
  let notShopify = false;
  if (w.kind !== 'search' && w.shopify !== false && /\/products\/[^/?#]+/.test(new URL(w.url).pathname)) {
    const s = await shopifyCheck(w.url);
    if (s) return s;
    notShopify = true;
  }
  const res = await fetch(w.url, { credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(30000) });
  if (res.status === 429) return { status: 'ratelimited', reason: 'Store said "too many requests" - slowing down' };
  const html = await res.text();
  const r = await parseOffscreen(html, res.url || w.url, detectOpts(w));
  if (notShopify) r.shopify = false;
  if (res.status >= 400 && r.status !== 'blocked') return { status: 'error', reason: `HTTP ${res.status}` };
  return r;
}

// Shopify stores publish each product's stock at /products/<handle>.js. It's small and
// exact, and gives the variant ID, so auto-cart can use the store's cart link directly.
async function shopifyCheck(url) {
  const u = new URL(url);
  const handle = u.pathname.match(/\/products\/([^/?#]+)/)[1];
  const wanted = u.searchParams.get('variant');
  try {
    const res = await fetch(`${u.origin}/products/${handle}.js`, { credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (res.status === 429) return { status: 'ratelimited', reason: 'Store said "too many requests" - slowing down' };
    if (!res.ok || !/json|javascript/i.test(res.headers.get('content-type') || '')) return null;
    const p = await res.json();
    if (!p || !Array.isArray(p.variants) || !p.variants.length) return null;
    const v = p.variants.find((x) => String(x.id) === wanted) || p.variants.find((x) => x.available) || p.variants[0];
    return {
      status: v.available ? 'in' : 'out',
      reason: v.available ? 'Store data says available' : 'Store data says sold out',
      shopify: true,
      variantId: v.id,
    };
  } catch (e) {
    return null;
  }
}

// Fallback for pages fetch can't read: reload one pinned background tab and read the live page.
async function checkViaTab(w) {
  let tab = w.tabId ? await chrome.tabs.get(w.tabId).catch(() => null) : null;
  if (tab) {
    const loaded = waitForLoad(tab.id);
    await chrome.tabs.update(tab.id, { url: w.url });
    await loaded;
  } else {
    tab = await chrome.tabs.create({ url: w.url, active: false, pinned: true });
    await mutate((s) => {
      const cur = s.watches.find((x) => x.id === w.id);
      if (cur) cur.tabId = tab.id;
    });
    await waitForLoad(tab.id);
  }
  await sleep(rand(2500, 4000)); // let JavaScript-built content render
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['detect.js'] });
  const [inj] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (opts) => cardWatchDetect(document, opts, location.href),
    args: [detectOpts(w)],
  });
  return (inj && inj.result) || { status: 'error', reason: 'Could not read the page' };
}

function waitForLoad(tabId, timeout = 45000) {
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timer); chrome.tabs.onUpdated.removeListener(fn); resolve(); };
    const fn = (id, info) => { if (id === tabId && info.status === 'complete') done(); };
    const timer = setTimeout(done, timeout);
    chrome.tabs.onUpdated.addListener(fn);
  });
}

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['DOM_PARSER', 'AUDIO_PLAYBACK'],
      justification: 'Read stock status from fetched product pages and play the drop alarm.',
    });
  } catch (e) {
    if (!/single offscreen/i.test(String(e))) throw e;
  }
}

async function parseOffscreen(html, url, opts) {
  await ensureOffscreen();
  return chrome.runtime.sendMessage({ target: 'offscreen', type: 'parse', html, url, opts });
}

// Update a watch with a check result. Returns the alerts to send.
function applyResult(w, r) {
  const alerts = [];
  const bad = BAD.includes(r.status);
  w.lastCheck = Date.now();
  w.status = r.status;
  w.reason = r.reason || '';
  w.failures = bad ? (w.failures || 0) + 1 : 0;
  if ('shopify' in r) w.shopify = r.shopify;
  if (r.variantId) w.variantId = r.variantId;

  if (w.kind === 'search') {
    if (!bad && r.status === 'ok') {
      const seen = new Set(w.seen || []);
      const fresh = (r.listings || []).filter((l) => !seen.has(l.href));
      // The first successful check only records what's already listed.
      if (w.seeded) {
        for (const l of fresh.slice(0, 3)) {
          alerts.push({ title: `NEW LISTING: ${l.product}`, message: `${hostOf(w.url)}: ${l.title}`, url: l.href });
        }
        if (fresh.length > 3) alerts.push({ title: `${fresh.length - 3} more new listings`, message: w.label, url: w.url });
      }
      w.seen = [...seen, ...fresh.map((l) => l.href)].slice(-500);
      w.seeded = true;
      w.matches = (r.listings || []).length;
    }
  } else if (r.status === 'in' || r.status === 'out') {
    if (r.status === 'in' && w.stock !== 'in') {
      alerts.push(w.raffle
        ? { title: `RAFFLE OPEN: ${w.label}`, message: `${hostOf(w.url)} - go enter the raffle now. The bot won't cart raffle drops.`, url: w.url }
        : { title: `IN STOCK: ${w.label}`, message: `${hostOf(w.url)} - ${r.reason}. GO!`, url: w.url, autoCart: !!w.autoCart, watchId: w.id, variantId: w.shopify ? w.variantId : null });
    }
    w.stock = r.status;
  }

  // Auto mode: if a plain fetch can't see stock twice in a row, switch to a background tab.
  if (w.mode !== 'tab' && (r.status === 'blocked' || r.status === 'unknown')) {
    w.fetchMisses = (w.fetchMisses || 0) + 1;
    if (w.fetchMisses >= 2) {
      w.mode = 'tab';
      w.failures = 0;
      w.reason += ' - switched to tab mode';
    }
  } else if (!bad) {
    w.fetchMisses = 0;
  }

  // In tab mode a bot check means the real browser got challenged: ask the human, once.
  if (w.mode === 'tab' && r.status === 'blocked' && w.failures === 1) {
    alerts.push({
      title: `${hostOf(w.url)} wants you to verify`,
      message: 'Click here and complete the check in the pinned tab so watching can continue.',
      url: w.url, desktopOnly: true, sound: false, open: false,
    });
  }
  return alerts;
}

// ---------- checkout assist (stops before the final "Place Order" click)

async function assistCheckout(url, settings, variantId, watchId) {
  // Shopify: the store's cart link (/cart/<variant>:1) adds 1 and opens checkout in one step,
  // skipping the product page, which is often the slowest page during a drop.
  const startUrl = variantId ? new URL(`/cart/${variantId}:1`, url).href : url;
  const tab = await chrome.tabs.create({ url: startUrl, active: true });
  chrome.windows.update(tab.windowId, { focused: true, drawAttention: true });
  await waitForLoad(tab.id);
  const deadline = Date.now() + 90000;
  let stage = variantId ? 'checkout' : 'add';
  let result = { action: 'none', reason: 'Page did not respond' };
  let lastClick = '';
  let triedCartPage = !!variantId;
  let express = '';

  for (let step = 0; step < 8 && Date.now() < deadline; step++) {
    await sleep(1200);
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['cart.js'] });
      const [inj] = await chrome.scripting.executeScript({
        target: { tabId: tab.id }, func: (s, o) => cardCartStep(s, o),
        args: [stage, { preferExpress: settings.preferExpress !== false && !express }],
      });
      result = (inj && inj.result) || result;
    } catch (e) {
      result = { action: 'none', reason: String((e && e.message) || e).slice(0, 100) };
    }
    if (result.action === 'final' || result.action === 'stop') break;
    if (result.action === 'express') {
      express = result.label;
      stage = 'checkout';
      await settle(tab.id);
      continue;
    }
    if (result.action === 'clicked') {
      if (result.reason === lastClick && stage !== 'add') break; // same button twice: we're going in circles
      lastClick = result.reason;
      stage = 'checkout';
      await settle(tab.id);
      continue;
    }
    // Nothing clickable: after adding, try the store's cart page once (works on most shops).
    if (stage === 'checkout' && !triedCartPage) {
      triedCartPage = true;
      const loaded = waitForLoad(tab.id, 20000);
      await chrome.tabs.update(tab.id, { url: new URL('/cart', url).href });
      await loaded;
      continue;
    }
    break;
  }

  await chrome.tabs.update(tab.id, { active: true });
  const t = await chrome.tabs.get(tab.id);
  chrome.windows.update(t.windowId, { focused: true, drawAttention: true });

  if (result.action === 'final' && settings.autoBuy && watchId) {
    const buy = await autoBuy(tab.id, result.summary, settings, watchId);
    if (buy.alert) return fireAlert({ ...buy.alert, url: buy.alert.url || t.url || url, open: false }, settings);
    result.reason = `${buy.reason}. ${result.reason}`; // checks failed: fall back to "one click left"
  }

  const done = result.action === 'final';
  let message = result.reason;
  if (!done && express && result.action === 'none') message = `Opened ${express} - confirm the payment in that window`;
  await fireAlert({
    title: done ? 'ONE CLICK LEFT - finish checkout NOW' : 'Take over checkout NOW',
    message,
    url: t.url || url,
    open: false,
  }, settings);
}

// ---------- Full Auto-Buy (off by default; clicks the final button only if every check passes)

const BUY_EXCLUDE = ['break', 'case', 'pack', 'spot'];

// Words from the watch name that must all appear in the checkout's order summary.
function nameWords(label) {
  return [...new Set((label || '').toLowerCase().match(/[a-z0-9]{3,}/g) || [])];
}

// Returns null if it's safe to click, or the reason not to.
function buyBlocker(w, s, settings, cartQty) {
  const max = Number(settings.maxPrice) || 0;
  if (!w) return 'Watch was removed';
  if (w.boughtAt) return 'Already bought once on this watch';
  if (max <= 0) return 'Auto-Buy needs a max price - set one in Settings';
  if (!s) return "Couldn't read the order summary";
  if (!s.checkoutUrl) return "Not on a checkout page";
  if (s.total == null) return "Couldn't read the order total";
  if (s.total > max) return `Total $${s.total} is over your $${max} limit - manual review required`;
  const missing = nameWords(w.label).filter((word) => !s.text.includes(word));
  if (missing.length) return `Order summary doesn't mention "${missing.join('", "')}" - wrong item?`;
  const label = w.label.toLowerCase();
  const bad = BUY_EXCLUDE.filter((word) => !label.includes(word) && new RegExp(`\\b${word}s?\\b`).test(s.text));
  if (bad.length) return `Order summary mentions "${bad.join('", "')}" - wrong item?`;
  const qty = s.quantities.length ? s.quantities : cartQty;
  if (!qty || !qty.length) return "Couldn't read the quantity";
  if (qty.length !== 1 || qty[0] !== 1) return `Quantity is ${qty.join(' + ')}, not exactly 1`;
  return null;
}

async function autoBuy(tabId, summary, settings, watchId) {
  // Quantity fallback: if the summary doesn't show "Quantity N", ask the store's cart (Shopify).
  let cartQty = null;
  if (summary && !summary.quantities.length) {
    try {
      const [inj] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => fetch('/cart.js', { credentials: 'include' }).then((r) => r.json()).then((c) => c.items.map((i) => i.quantity)).catch(() => null),
      });
      cartQty = inj && inj.result;
    } catch (e) { /* not Shopify */ }
  }

  // Check and take the one-shot lock in the same storage write, BEFORE clicking,
  // so a hang, refresh or second alert can never click twice.
  let w;
  const blocker = await mutate((s) => {
    w = s.watches.find((x) => x.id === watchId);
    const why = buyBlocker(w, summary, s.settings, cartQty);
    if (why) return why;
    w.boughtAt = Date.now();
    w.boughtTotal = summary.total;
    w.autoCart = false;
    w.paused = true;
    chrome.alarms.clear('w:' + w.id);
    return null;
  });
  if (blocker) {
    if (/over your/.test(blocker)) {
      return { alert: { title: 'PRICE OVER LIMIT - did NOT buy', message: `${w.label}: ${blocker}` } };
    }
    return { reason: `Auto-Buy skipped: ${blocker}` };
  }

  let r;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['cart.js'] });
    const [inj] = await chrome.scripting.executeScript({
      target: { tabId }, func: (o) => cardCartStep('checkout', o), args: [{ clickFinal: { total: summary.total } }],
    });
    r = inj && inj.result;
  } catch (e) {
    r = { action: 'error', reason: String((e && e.message) || e).slice(0, 100) };
  }
  if (!r || r.action !== 'bought') {
    // Nothing was clicked, so release the lock and let the human finish.
    await mutate((s) => {
      const cur = s.watches.find((x) => x.id === watchId);
      if (cur) { delete cur.boughtAt; delete cur.boughtTotal; }
    });
    return { reason: `Auto-Buy stopped: ${(r && r.reason) || 'page changed'}` };
  }

  const outcome = await confirmOrder(tabId);
  const money = `$${summary.total.toFixed(2)}`;
  if (outcome === 'placed') return { alert: { title: `ORDER PLACED: ${w.label}`, message: `${w.label} for ${money}. Check your email for the confirmation.` } };
  if (outcome === 'code') return { alert: { title: 'ENTER THE CODE to finish your order', message: `Clicked ${r.reason.slice(8)} for ${w.label} (${money}) - the store wants a verification code.` } };
  return { alert: { title: 'Auto-Buy clicked - CHECK THE ORDER', message: `${r.reason} for ${w.label} (${money}), but no confirmation page yet. Look at the tab now.` } };
}

// After the click: wait up to ~30s for a thank-you page, a code prompt, or nothing.
async function confirmOrder(tabId) {
  for (let i = 0; i < 15; i++) {
    await sleep(2000);
    try {
      const [inj] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const text = ((document.body && document.body.innerText) || '').slice(0, 6000);
          if (/thank[_-]?you|order[_-]?confirm|\/orders\//i.test(location.pathname) || /thank you for (your )?(order|purchase)|order (is |has been )?(confirmed|placed)|your order number/i.test(text)) return 'placed';
          if (/enter (the |your )?(\d-digit )?code|verification code|we (sent|texted) (you )?a code/i.test(text)) return 'code';
          return null;
        },
      });
      if (inj && inj.result) return inj.result;
    } catch (e) { /* page mid-navigation */ }
  }
  return 'unknown';
}

async function settle(tabId) {
  await sleep(1500);
  const t = await chrome.tabs.get(tabId).catch(() => null);
  if (t && t.status === 'loading') await waitForLoad(tabId, 20000);
}

// ---------- alerts

async function fireAlert(a, settings) {
  const id = await chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: a.title.slice(0, 100),
    message: a.message.slice(0, 250),
    priority: 2,
    requireInteraction: true,
  });
  await chrome.storage.session.set({ ['n:' + id]: a.url });
  if (a.sound !== false && settings.sound) {
    await ensureOffscreen();
    chrome.runtime.sendMessage({ target: 'offscreen', type: 'alarm' }).catch(() => {});
  }
  if (a.open !== false && settings.openTab && a.url) {
    const tab = await chrome.tabs.create({ url: a.url, active: true });
    chrome.windows.update(tab.windowId, { focused: true, drawAttention: true });
  }
  if (!a.desktopOnly) await sendNtfy(settings, a);
}

async function sendNtfy(settings, a) {
  if (!settings.ntfyTopic) return { ok: false, error: 'No ntfy topic set' };
  try {
    const res = await fetch(settings.ntfyServer.replace(/\/+$/, ''), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: settings.ntfyTopic,
        title: a.title,
        message: a.message,
        priority: 5, // max/urgent: long vibration, can break through Do Not Disturb
        tags: ['rotating_light'],
        click: a.url,
      }),
    });
    return res.ok ? { ok: true } : { ok: false, error: `ntfy HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

chrome.notifications.onClicked.addListener(async (id) => {
  const key = 'n:' + id;
  const url = (await chrome.storage.session.get(key))[key];
  if (url) chrome.tabs.create({ url, active: true });
  chrome.notifications.clear(id);
});

// Opens the store's account page in a background tab to see whether you're signed in.
// A login page or password box = signed out; a "Sign out" link = signed in.
async function sessionCheck(w, settings, reportOk) {
  const origin = new URL(w.url).origin;
  const host = hostOf(w.url);
  const tab = await chrome.tabs.create({ url: origin + '/account', active: false });
  await waitForLoad(tab.id, 30000);
  await sleep(2000);
  let r = { state: 'unsure' };
  try {
    const [inj] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const url = location.href.toLowerCase();
        const text = (document.body && document.body.innerText) || '';
        if (/sign ?out|log ?out/i.test(text)) return { state: 'in' };
        if (/login|log-in|signin|sign-in|sign_in|authentication/.test(url) || document.querySelector('input[type="password"]')) return { state: 'out' };
        return { state: 'unsure' };
      },
    });
    r = (inj && inj.result) || r;
  } catch (e) { /* page we can't read: treat as unsure */ }

  if (r.state === 'in') {
    chrome.tabs.remove(tab.id).catch(() => {});
    if (reportOk) {
      await fireAlert({ title: `Signed in on ${host}`, message: 'Make sure your address and card are saved there too.', url: origin, desktopOnly: true, sound: false, open: false }, settings);
    }
  } else {
    await chrome.tabs.update(tab.id, { active: true });
    await fireAlert({
      title: r.state === 'out' ? `SIGN IN to ${host} NOW` : `Check your ${host} sign-in`,
      message: r.state === 'out'
        ? `You're signed out${w.dropTime ? ' and the drop is coming' : ''}. Sign in and check your saved address and card.`
        : "Couldn't tell if you're signed in. Check the tab that just opened.",
      url: origin + '/account', open: false, sound: r.state === 'out',
    }, settings);
  }
  return r;
}

async function dropReminder(id, min) {
  const { settings, watches } = await load();
  const w = watches.find((x) => x.id === id);
  if (!w) return;
  if (min === 10) await sessionCheck(w, settings, false);
  const soon = min === 5;
  await fireAlert({
    title: `${w.label} ${w.raffle && soon ? 'raffle opens' : 'drops'} in ${min} min`,
    message: !soon ? 'Get to your computer, log in, check your saved card.'
      : w.raffle ? 'Raffle / EQL drop: get on the page and be ready to enter. Speed does not matter here.'
      : "Get in the waiting room / on the page NOW. Once you're in line, don't refresh.",
    url: w.url,
    open: soon,
    sound: soon,
  }, settings);
}

async function updateBadge(watches) {
  const n = watches.filter((w) => w.kind !== 'search' && w.stock === 'in').length;
  await chrome.action.setBadgeBackgroundColor({ color: '#d92d20' });
  await chrome.action.setBadgeText({ text: n ? String(n) : '' });
}

// ---------- messages from the popup

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.target === 'offscreen') return;
  handle(msg).then(sendResponse, (e) => sendResponse({ ok: false, error: String(e) }));
  return true;
});

async function handle(msg) {
  switch (msg.type) {
    case 'addWatch': {
      const w = {
        id: crypto.randomUUID(),
        url: msg.url,
        label: msg.label,
        kind: msg.kind,
        mode: 'auto',
        dropTime: msg.dropTime || null,
        addedAt: Date.now(),
      };
      await mutate((s) => { s.watches.push(w); });
      scheduleDrop(w);
      runCheck(w.id, true);
      return { ok: true };
    }
    case 'removeWatch': {
      let tabId;
      await mutate((s) => {
        tabId = (s.watches.find((x) => x.id === msg.id) || {}).tabId;
        s.watches = s.watches.filter((x) => x.id !== msg.id);
      });
      cancelCheck(msg.id);
      for (const p of ['d10:', 'd5:', 'd2:', 'r:']) chrome.alarms.clear(p + msg.id);
      if (tabId) chrome.tabs.remove(tabId).catch(() => {});
      await updateBadge((await load()).watches);
      return { ok: true };
    }
    case 'sessionCheck': {
      const { settings, watches } = await load();
      const w = watches.find((x) => x.id === msg.id);
      return w ? { ok: true, ...(await sessionCheck(w, settings, true)) } : { ok: false };
    }
    case 'checkNow':
      await runCheck(msg.id, true);
      return { ok: true };
    case 'updateWatch': {
      let w;
      await mutate((s) => {
        w = s.watches.find((x) => x.id === msg.id);
        if (!w) return;
        for (const k of ['paused', 'mode', 'dropTime', 'label', 'autoCart', 'raffle']) if (k in msg.patch) w[k] = msg.patch[k];
        if ('mode' in msg.patch) { w.fetchMisses = 0; w.failures = 0; }
        // Raffle / EQL drops are alert-only: no auto-cart, no fast checking.
        if (w.raffle) w.autoCart = false;
        // Turning Auto-cart back on by hand re-arms a watch that already bought once.
        if (w.autoCart && msg.patch.autoCart) { delete w.boughtAt; delete w.boughtTotal; }
      });
      if (w) {
        scheduleDrop(w);
        if ('paused' in msg.patch || 'mode' in msg.patch || 'raffle' in msg.patch) {
          cancelCheck(w.id);
          if (!w.paused) scheduleCheck(w.id, Date.now() + rand(3000, 8000));
        }
      }
      return { ok: true };
    }
    case 'saveSettings': {
      await mutate((s) => {
        Object.assign(s.settings, msg.settings);
        s.settings.minSec = Math.max(30, Number(s.settings.minSec) || 45);
        s.settings.maxSec = Math.max(s.settings.minSec + 10, Number(s.settings.maxSec) || 90);
        s.settings.maxPrice = Math.max(0, Number(s.settings.maxPrice) || 0);
        if (!s.settings.maxPrice) s.settings.autoBuy = false; // no limit, no Auto-Buy
      });
      if ('paused' in msg.settings) await rescheduleAll();
      return { ok: true };
    }
    case 'testAlert': {
      const { settings } = await load();
      chrome.notifications.create({
        type: 'basic', iconUrl: 'icons/icon128.png', title: 'Test alert',
        message: 'This is what a drop alert looks like.', priority: 2,
      });
      if (settings.sound) {
        await ensureOffscreen();
        chrome.runtime.sendMessage({ target: 'offscreen', type: 'alarm' }).catch(() => {});
      }
      return sendNtfy(settings, { title: 'Test alert: Card Drop Watcher', message: 'If your phone buzzed loud, you are set.', url: 'https://www.topps.com/' });
    }
  }
  return { ok: false, error: 'unknown message' };
}
