// RailWire - rail news aggregator. Zero dependencies. Run: node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const TTL = 10 * 60 * 1000;

const gnews = (q, region = 'en-SG', gl = 'SG', ceid = 'SG:en') =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:14d')}&hl=${region}&gl=${gl}&ceid=${ceid}`;

// category: mrt | lrt | hsr | metro | intercity | industry
const FEEDS = [
  // Targeted searches (Google News)
  { name: 'Google News', cat: 'mrt', region: 'Singapore', url: gnews('Singapore MRT') },
  { name: 'Google News', cat: 'mrt', region: 'Malaysia', url: gnews('MRT Malaysia Klang Valley', 'en-MY', 'MY', 'MY:en') },
  { name: 'Google News', cat: 'lrt', region: 'Singapore', url: gnews('Singapore LRT Sengkang Punggol') },
  { name: 'Google News', cat: 'lrt', region: 'Malaysia', url: gnews('LRT Malaysia Rapid KL', 'en-MY', 'MY', 'MY:en') },
  { name: 'Google News', cat: 'metro', region: 'Hong Kong', url: gnews('MTR Hong Kong', 'en-HK', 'HK', 'HK:en') },
  { name: 'Google News', cat: 'hsr', region: 'Southeast Asia', url: gnews('Kuala Lumpur Singapore high speed rail') },
  { name: 'Google News', cat: 'hsr', region: 'Global', url: gnews('high-speed rail', 'en-US', 'US', 'US:en') },
  { name: 'Google News', cat: 'hsr', region: 'Asia', url: gnews('Shinkansen OR "China high-speed railway" OR Whoosh OR KTX') },
  { name: 'Google News', cat: 'hsr', region: 'Europe', url: gnews('TGV OR ICE OR Eurostar OR "high-speed train" Europe', 'en-GB', 'GB', 'GB:en') },
  { name: 'Google News', cat: 'metro', region: 'Global', url: gnews('metro subway opening OR delay OR extension', 'en-US', 'US', 'US:en') },
  { name: 'Google News', cat: 'intercity', region: 'Malaysia', url: gnews('KTM ETS Malaysia train', 'en-MY', 'MY', 'MY:en') },
  { name: 'Google News', cat: 'intercity', region: 'Global', url: gnews('passenger rail Amtrak OR "Network Rail" OR "Deutsche Bahn" OR "Indian Railways"', 'en-US', 'US', 'US:en') },
  // Trade press
  { name: 'Railway Gazette', cat: 'industry', region: 'Global', url: 'https://www.railwaygazette.com/rss' },
  { name: 'Railway Technology', cat: 'industry', region: 'Global', url: 'https://www.railway-technology.com/feed/' },
  { name: 'CNA', cat: 'mrt', region: 'Singapore', url: 'https://www.channelnewsasia.com/rssfeeds/8395986' },
];

const decode = s => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
const strip = s => decode(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (xml, t) => {
  const m = xml.match(new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`, 'i'));
  return m ? m[1] : '';
};

function parse(xml, feed) {
  const items = [];
  const re = /<(item|entry)[\s>][\s\S]*?<\/\1>/gi;
  for (const block of xml.match(re) || []) {
    let title = strip(tag(block, 'title'));
    let link = strip(tag(block, 'link'));
    if (!link) { const h = block.match(/<link[^>]*href="([^"]+)"/i); link = h ? decode(h[1]) : ''; }
    const date = new Date(strip(tag(block, 'pubDate') || tag(block, 'published') || tag(block, 'updated') || tag(block, 'dc:date')));
    let desc = strip(tag(block, 'description') || tag(block, 'summary') || tag(block, 'content:encoded'));
    let source = feed.name;
    const src = tag(block, 'source');
    if (src) source = strip(src);
    if (feed.name === 'Google News') { // titles are "Headline - Source"
      const i = title.lastIndexOf(' - ');
      if (i > 0) { source = title.slice(i + 3); title = title.slice(0, i); }
      desc = ''; // description is just a link list
    }
    if (!title || !link || isNaN(date)) continue;
    items.push({ title, link, source, cat: feed.cat, region: feed.region, date: date.toISOString(), summary: desc.slice(0, 280) });
  }
  return items;
}

const RAIL = /\b(rail|railway|train|mrt|lrt|mtr|metro|subway|tram|monorail|shinkansen|tgv|ktm|ets|station|commuter|amtrak|eurostar|locomotive|hsr|maglev|underground)\b/i;

// Kid-safe filter: drop stories about violence, crime, death, accidents, adult topics
const BAD = /\b(kill\w*|dead|death\w*|die[sd]?|dying|fatal\w*|suicid\w*|murder\w*|stab\w*|rape\w*|molest\w*|assault\w*|attack\w*|terror\w*|bomb\w*|shoot\w*|shot|gun\w*|crime\w*|arrest\w*|police|jail\w*|court|charged|convict\w*|sentenced|drug\w*|sex\w*|porn\w*|nude|naked|corpse|bod(?:y|ies)|injur\w*|crash\w*|collision|collid\w*|derail\w*|explo\w*|blast|fire|blaze|riot\w*|harass\w*|abus\w*|accus\w*|misbehav\w*|victim\w*|hostage|war|missile|strike|fraud|scam\w*|steal|stole\w*|theft|thie(?:f|ves)|trespass\w*|tragic\w*|trapped|vandal\w*|gang|cocaine|alcohol|drunk\w*|foreclos\w*|auction)\b/i;

let cache = { at: 0, data: null, status: [] };
let inflight = null;

async function refresh() {
  const status = [];
  const results = await Promise.all(FEEDS.map(async f => {
    try {
      const get = () => fetch(f.url, { headers: { 'User-Agent': 'Mozilla/5.0 RailWire/1.0' }, signal: AbortSignal.timeout(12000) });
      let r = await get();
      if (r.status === 429) { await new Promise(x => setTimeout(x, 2500 + Math.random() * 2000)); r = await get(); }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const items = parse(await r.text(), f);
      status.push({ feed: f.name + ' (' + f.cat + '/' + f.region + ')', ok: true, count: items.length });
      return items;
    } catch (e) {
      status.push({ feed: f.name + ' (' + f.cat + '/' + f.region + ')', ok: false, error: String(e.message || e) });
      return [];
    }
  }));
  // dedupe by link, then by normalised title
  const seen = new Set();
  const out = [];
  for (const it of results.flat().sort((a, b) => b.date.localeCompare(a.date))) {
    const key = it.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
    if (seen.has(it.link) || seen.has(key)) continue;
    if (!RAIL.test(it.title + ' ' + it.summary) || BAD.test(it.title + ' ' + it.summary)) continue;
    seen.add(it.link); seen.add(key);
    out.push(it);
  }
  cache = { at: Date.now(), data: out, status };
}

async function getNews() {
  if (!cache.data || Date.now() - cache.at > TTL) {
    inflight = inflight || refresh().finally(() => (inflight = null));
    if (!cache.data) await inflight;
  }
  return cache;
}

// ---- Story summaries (fetched on demand when a card is clicked) ----
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) RailWire/1.0' };
const sumCache = new Map();

// Google News links are redirects handled by JS; resolve them to the real article URL.
async function resolveGoogle(link) {
  const page = await (await fetch(link, { headers: UA, signal: AbortSignal.timeout(10000) })).text();
  const id = (page.match(/data-n-a-id="([^"]+)"/) || [])[1];
  const ts = (page.match(/data-n-a-ts="([^"]+)"/) || [])[1];
  const sg = (page.match(/data-n-a-sg="([^"]+)"/) || [])[1];
  if (!id || !ts || !sg) throw new Error('no token');
  const inner = JSON.stringify(['garturlreq', [['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1], 'X', 'X', 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0], id, +ts, sg]);
  const body = 'f.req=' + encodeURIComponent(JSON.stringify([[['Fbv4je', inner, null, 'generic']]]));
  const r = await fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
    method: 'POST', headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body, signal: AbortSignal.timeout(10000),
  });
  const txt = await r.text();
  const m = txt.match(/garturlres\\",\\"(https?:[^"\\]+)/);
  if (!m) throw new Error('no url');
  return m[1].replace(/\\u0026/g, '&').replace(/\\u003d/g, '=');
}

const meta = (html, name) => {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i'))
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`, 'i'));
  return m ? strip(m[1]) : '';
};

const kidSafe = text => text.split(/(?<=[.!?])\s+/).filter(s => !BAD.test(s)).join(' ');

async function summarise(link) {
  if (sumCache.has(link)) return sumCache.get(link);
  let url = link;
  try { if (/news\.google\.com/.test(link)) url = await resolveGoogle(link); } catch { url = null; }
  let out = { summary: '', image: '', url: url || link };
  if (url) {
    try {
      const r = await fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(10000) });
      const html = (await r.text()).slice(0, 600000);
      const paras = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map(m => strip(m[1])).filter(p => p.length > 80).slice(0, 3);
      const first = meta(html, 'og:description') || meta(html, 'description');
      let text = [first, ...paras].filter(Boolean).join(' ');
      if (first && paras[0] && paras[0].startsWith(first.slice(0, 40))) text = paras.join(' ');
      out = { summary: kidSafe(text).slice(0, 700), image: meta(html, 'og:image'), url: r.url || url };
    } catch { /* leave empty */ }
  }
  if (!/^https?:/.test(out.image)) out.image = '';
  sumCache.set(link, out);
  return out;
}

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/news') {
    if (url.searchParams.get('force')) cache.at = 0;
    const c = await getNews();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ updated: new Date(c.at).toISOString(), status: c.status, items: c.data }));
  }
  if (url.pathname === '/api/summary') {
    const link = url.searchParams.get('url') || '';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    // only summarise links we served ourselves (avoids being used as an open proxy)
    if (!cache.data || !cache.data.some(i => i.link === link)) return res.end('{}');
    return res.end(JSON.stringify(await summarise(link).catch(() => ({ summary: '', image: '', url: link }))));
  }
  const file = path.join(__dirname, 'public', url.pathname === '/' ? 'index.html' : path.normalize(url.pathname).replace(/^(\.\.[\\/])+/, ''));
  if (!file.startsWith(path.join(__dirname, 'public'))) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(PORT, () => console.log(`RailWire running at http://localhost:${PORT}`));
