const $ = (s) => document.querySelector(s);
const send = (msg) => chrome.runtime.sendMessage(msg);
let state = { settings: {}, watches: [] };

function ago(t) {
  if (!t) return 'never';
  const s = Math.round((Date.now() - t) / 1000);
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`;
}
function until(t) {
  const s = Math.max(0, Math.round((t - Date.now()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  const h = Math.floor(s / 3600);
  return h < 48 ? `${h}h ${Math.floor((s % 3600) / 60)}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
}
function flash(el, text) { el.textContent = text; setTimeout(() => { if (el.textContent === text) el.textContent = ''; }, 5000); }

function chip(w) {
  if (w.status === 'blocked') return ['Blocked', 'bad'];
  if (w.status === 'ratelimited') return ['Slowed down', 'bad'];
  if (w.status === 'error') return ['Error', 'bad'];
  if (!w.lastCheck) return ['Checking...', ''];
  if (w.kind === 'search') return w.status === 'unknown' ? ["Can't read", 'warn'] : [`${w.matches || 0} matches`, ''];
  if (w.stock === 'in' && w.status === 'in') return ['IN STOCK', 'in'];
  if (w.status === 'out') return ['Not available', ''];
  return ["Can't tell", 'warn'];
}

function render() {
  const { settings, watches } = state;
  $('#pause-all').textContent = settings.paused ? 'Resume all' : 'Pause all';
  $('#count').textContent = watches.length ? `(${watches.length})` : '';
  $('#empty').hidden = watches.length > 0;
  const list = $('#watches');
  list.replaceChildren(...watches.map((w) => {
    const li = document.createElement('li');
    const [label, cls] = chip(w);
    if (cls === 'in') li.className = 'live';
    li.innerHTML = `
      <div class="top"><a class="name" target="_blank"></a><span class="chip ${cls}"></span></div>
      <div class="meta"></div>
      <div class="actions">
        <button class="small" data-act="check">Check now</button>
        <button class="small" data-act="pause">${w.paused ? 'Resume' : 'Pause'}</button>
        <button class="small" data-act="mode" title="Fetch = light background request. Tab = reloads a pinned tab (for sites that need it).">Mode: ${w.mode === 'tab' ? 'tab' : 'fetch'}</button>
        ${w.kind === 'search' ? '' : `<button class="small${w.autoCart ? ' on' : ''}" data-act="cart" title="${state.settings.autoBuy ? 'When it goes live: add to cart, go through checkout and (Full Auto-Buy is ON) click Place Order if the price, item and quantity checks pass.' : 'When it goes live: open the page, add to cart and go through checkout, stopping at the final Place Order button for you to click.'}">Auto-cart: ${w.autoCart ? 'ON' : 'off'}</button>`}
        ${w.kind === 'search' ? '' : '<button class="small" data-act="login" title="Opens the store account page in the background to check you are signed in. Runs automatically 10 min before a drop time.">Check sign-in</button>'}
        <button class="small" data-act="remove">Remove</button>
      </div>`;
    const a = li.querySelector('.name');
    a.textContent = w.label;
    a.href = w.url;
    a.title = w.url;
    li.querySelector('.chip').textContent = label;
    li.querySelector('.meta').dataset.id = w.id;
    li.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => act(w, b.dataset.act, b)));
    return li;
  }));
  renderTimes();
}

function renderTimes() {
  for (const el of document.querySelectorAll('.meta[data-id]')) {
    const w = state.watches.find((x) => x.id === el.dataset.id);
    if (!w) continue;
    const host = new URL(w.url).hostname.replace(/^www\./, '');
    const parts = [w.shopify ? `${host} (fast cart)` : host, `checked ${ago(w.lastCheck)}`];
    if (!w.paused && !state.settings.paused && w.nextCheck > Date.now()) parts.push(`next in ${until(w.nextCheck)}`);
    if (w.paused) parts.push('paused');
    el.textContent = parts.join(' · ');
    if (w.reason) el.textContent += ` · ${w.reason}`;
    if (w.boughtAt) {
      const d = document.createElement('div');
      d.className = 'bought';
      d.textContent = `Auto-bought ${ago(w.boughtAt)} for $${w.boughtTotal}. Turn Auto-cart on to re-arm.`;
      el.append(d);
    }
    if (w.dropTime && w.dropTime > Date.now()) {
      const d = document.createElement('div');
      d.className = 'drop';
      d.textContent = `Drops in ${until(w.dropTime)} (${new Date(w.dropTime).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })})`;
      el.append(d);
    }
  }
}

async function act(w, action, btn) {
  if (action === 'check') { btn.textContent = 'Checking...'; await send({ type: 'checkNow', id: w.id }); }
  if (action === 'pause') await send({ type: 'updateWatch', id: w.id, patch: { paused: !w.paused } });
  if (action === 'login') {
    btn.textContent = 'Checking...';
    const r = await send({ type: 'sessionCheck', id: w.id });
    btn.textContent = r && r.state === 'in' ? 'Signed in ✓' : r && r.state === 'out' ? 'Signed OUT' : 'Not sure - see tab';
  }
  if (action === 'cart') await send({ type: 'updateWatch', id: w.id, patch: { autoCart: !w.autoCart } });
  if (action === 'mode') await send({ type: 'updateWatch', id: w.id, patch: { mode: w.mode === 'tab' ? 'auto' : 'tab' } });
  if (action === 'remove' && confirm(`Stop watching "${w.label}"?`)) await send({ type: 'removeWatch', id: w.id });
}

async function addWatch(kind) {
  const f = $('#flash');
  let url;
  try { url = new URL($('#url').value.trim()); } catch { return flash(f, 'Enter a valid URL.'); }
  if (url.protocol !== 'https:') return flash(f, 'Only https:// pages can be watched.');
  // Must be called directly from the click so Chrome shows the prompt for new sites.
  const granted = await chrome.permissions.request({ origins: [`${url.origin}/*`] });
  if (!granted) return flash(f, 'Chrome permission is needed to watch this site.');
  const drop = $('#drop-time').value ? new Date($('#drop-time').value).getTime() : null;
  const label = $('#label').value.trim() || url.hostname;
  await send({ type: 'addWatch', url: url.href, label, kind, dropTime: drop });
  $('#drop-time').value = '';
  flash(f, kind === 'search' ? `Watching for new listings of your ${PRESETS.length} products.` : 'Watching. First check running now.');
}

async function load() {
  const s = await chrome.storage.local.get(['settings', 'watches']);
  state = { settings: s.settings || {}, watches: s.watches || [] };
  render();
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && /^https:/.test(tab.url || '')) {
    $('#url').value = tab.url;
    $('#label').value = (tab.title || '').replace(/\s*[|–-]\s*(Topps|Fanatics|Target|Walmart).*$/i, '').slice(0, 80);
  }
  await load();
  const st = state.settings;
  $('#ntfy-topic').value = st.ntfyTopic || '';
  $('#ntfy-server').value = st.ntfyServer || 'https://ntfy.sh';
  $('#min-sec').value = st.minSec || 45;
  $('#max-sec').value = st.maxSec || 90;
  $('#sound').checked = st.sound !== false;
  $('#open-tab').checked = st.openTab !== false;
  $('#express').checked = st.preferExpress !== false;
  $('#auto-buy').checked = !!st.autoBuy;
  $('#max-price').value = st.maxPrice || '';
  $('#auto-buy').addEventListener('change', (e) => {
    if (e.target.checked && !confirm('Full Auto-Buy will place real orders on your saved card without asking you. Turn it on?')) e.target.checked = false;
  });

  $('#add-product').addEventListener('click', () => addWatch('product'));
  $('#add-search').addEventListener('click', () => addWatch('search'));
  $('#pause-all').addEventListener('click', () => send({ type: 'saveSettings', settings: { paused: !state.settings.paused } }));
  $('#save').addEventListener('click', async () => {
    const maxPrice = Number($('#max-price').value) || 0;
    if ($('#auto-buy').checked && maxPrice <= 0) return flash($('#settings-flash'), 'Full Auto-Buy needs a max price.');
    await send({ type: 'saveSettings', settings: {
      autoBuy: $('#auto-buy').checked, maxPrice,
      ntfyTopic: $('#ntfy-topic').value.trim(),
      ntfyServer: $('#ntfy-server').value.trim() || 'https://ntfy.sh',
      minSec: Number($('#min-sec').value), maxSec: Number($('#max-sec').value),
      sound: $('#sound').checked, openTab: $('#open-tab').checked, preferExpress: $('#express').checked,
    } });
    await load();
    $('#min-sec').value = state.settings.minSec;
    $('#max-sec').value = state.settings.maxSec;
    flash($('#settings-flash'), 'Saved.');
  });
  $('#test').addEventListener('click', async () => {
    const r = await send({ type: 'testAlert' });
    flash($('#settings-flash'), r && r.ok ? 'Sent! Check your phone.' : `Phone push failed: ${(r && r.error) || 'unknown'}`);
  });

  chrome.storage.onChanged.addListener(load);
  setInterval(renderTimes, 1000);
}

init();
