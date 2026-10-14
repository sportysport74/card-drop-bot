// Hidden page used by the background worker for things a service worker can't do:
// parse HTML (DOMParser) and play the alarm sound.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.target !== 'offscreen') return;
  if (msg.type === 'parse') {
    const doc = new DOMParser().parseFromString(msg.html, 'text/html');
    sendResponse(cardWatchDetect(doc, msg.opts, msg.url));
  } else if (msg.type === 'alarm') {
    playSiren();
    sendResponse(true);
  }
});

function playSiren() {
  const ctx = new AudioContext();
  const gain = ctx.createGain();
  gain.gain.value = 0.3;
  gain.connect(ctx.destination);
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.connect(gain);
  const t0 = ctx.currentTime;
  for (let i = 0; i < 32; i++) osc.frequency.setValueAtTime(i % 2 ? 660 : 990, t0 + i * 0.25);
  osc.start(t0);
  osc.stop(t0 + 8);
  osc.onended = () => ctx.close();
}
