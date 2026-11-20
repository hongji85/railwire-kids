// RailWire - rail news aggregator. Zero dependencies. Run: node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const TTL = 10 * 60 * 1000;

const gnews = (q, region = 'en-SG', gl = 'SG', ceid = 'SG:en') =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:14d')}&hl=${region}&gl=${gl}&ceid=${ceid}`;

// Bing News RSS: gives the real article URL, a description and an image (works well from cloud hosts)
const bing = (q, cc = 'SG', lang = 'en-SG') =>
  `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&setlang=${lang}&cc=${cc}`;

// category: mrt | lrt | hsr | metro | intercity | industry
const FEEDS = [
  // Bing (with summaries + images)
  { name: 'Bing News', bing: true, cat: 'mrt', region: 'Singapore', url: bing('Singapore MRT') },
  { name: 'Bing News', bing: true, cat: 'lrt', region: 'Singapore', url: bing('Singapore LRT Sengkang Punggol') },
  { name: 'Bing News', bing: true, cat: 'mrt', region: 'Malaysia', url: bing('MRT Malaysia Klang Valley', 'MY', 'en-MY') },
  { name: 'Bing News', bing: true, cat: 'lrt', region: 'Malaysia', url: bing('LRT Rapid KL', 'MY', 'en-MY') },
  { name: 'Bing News', bing: true, cat: 'intercity', region: 'Malaysia', url: bing('KTM ETS train Malaysia', 'MY', 'en-MY') },
  { name: 'Bing News', bing: true, cat: 'hsr', region: 'Southeast Asia', url: bing('Kuala Lumpur Singapore high speed rail') },
  { name: 'Bing News', bing: true, cat: 'metro', region: 'Hong Kong', url: bing('MTR Hong Kong', 'HK', 'en-HK') },
  { name: 'Bing News', bing: true, cat: 'hsr', region: 'Asia', url: bing('Shinkansen OR China high-speed railway OR KTX', 'US', 'en-US') },
  { name: 'Bing News', bing: true, cat: 'hsr', region: 'Europe', url: bing('TGV OR Eurostar OR high-speed train Europe', 'GB', 'en-GB') },
  { name: 'Bing News', bing: true, cat: 'hsr', region: 'Global', url: bing('high-speed rail', 'US', 'en-US') },
  { name: 'Bing News', bing: true, cat: 'metro', region: 'Global', url: bing('metro subway new line opening', 'US', 'en-US') },
  { name: 'Bing News', bing: true, cat: 'intercity', region: 'Global', url: bing('passenger trains railway news', 'US', 'en-US') },
{ name: 'Bing News', bing: true, cat: 'mrt', region: 'Singapore', url: bing('Thomson-East Coast Line OR Cross Island Line OR Downtown Line MRT') },
  { name: 'Bing News', bing: true, cat: 'mrt', region: 'Singapore', url: bing('SMRT OR SBS Transit OR LTA rail') },
  { name: 'Bing News', bing: true, cat: 'lrt', region: 'Singapore', url: bing('Jurong Region Line OR Bukit Panjang LRT') },
  { name: 'Bing News', bing: true, cat: 'mrt', region: 'Malaysia', url: bing('MRT Putrajaya Line OR MRT3 Circle Line Malaysia', 'MY', 'en-MY') },
  { name: 'Bing News', bing: true, cat: 'lrt', region: 'Malaysia', url: bing('Kelana Jaya LRT OR Ampang LRT OR Rapid Rail', 'MY', 'en-MY') },
  { name: 'Bing News', bing: true, cat: 'intercity', region: 'Malaysia', url: bing('East Coast Rail Link OR ECRL OR KTMB', 'MY', 'en-MY') },
  { name: 'Bing News', bing: true, cat: 'intercity', region: 'Malaysia', url: bing('Penang LRT OR Johor RTS Link OR Sarawak ART tram', 'MY', 'en-MY') },
  { name: 'Bing News', bing: true, cat: 'hsr', region: 'Southeast Asia', url: bing('Jakarta Bandung Whoosh OR Vietnam high-speed railway OR Thailand high-speed rail') },
  { name: 'Bing News', bing: true, cat: 'metro', region: 'Southeast Asia', url: bing('Bangkok MRT OR Jakarta MRT OR Manila metro OR Ho Chi Minh metro') },
  { name: 'Bing News', bing: true, cat: 'metro', region: 'Hong Kong', url: bing('MTR Corporation line extension OR Tung Chung Line OR Tuen Ma Line', 'HK', 'en-HK') },
  { name: 'Bing News', bing: true, cat: 'hsr', region: 'Asia', url: bing('Japan Shinkansen new train', 'US', 'en-US') },
  { name: 'Bing News', bing: true, cat: 'hsr', region: 'Asia', url: bing('China high-speed railway Fuxing', 'US', 'en-US') },
  { name: 'Bing News', bing: true, cat: 'metro', region: 'Asia', url: bing('Tokyo metro OR Seoul subway OR Delhi Metro OR Mumbai metro', 'US', 'en-US') },
  { name: 'Bing News', bing: true, cat: 'intercity', region: 'Europe', url: bing('Deutsche Bahn OR SNCF OR Network Rail OR Trenitalia', 'GB', 'en-GB') },
  { name: 'Bing News', bing: true, cat: 'metro', region: 'Europe', url: bing('London Underground OR Paris metro OR Elizabeth line', 'GB', 'en-GB') },
  { name: 'Bing News', bing: true, cat: 'intercity', region: 'Global', url: bing('Amtrak OR Brightline OR Via Rail new trains', 'US', 'en-US') },
  { name: 'Bing News', bing: true, cat: 'industry', region: 'Global', url: bing('train manufacturer new trains Alstom OR Siemens Mobility OR Hitachi Rail OR CRRC', 'US', 'en-US') },
  { name: 'Bing News', bing: true, cat: 'metro', region: 'Global', url: bing('light rail OR tram new line opens', 'US', 'en-US') },
  // Targeted searches (Google News)
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
    let image = '';
    if (feed.bing) {
      const u = (link.match(/[?&]url=([^&]+)/) || [])[1];
      if (u) { try { link = decodeURIComponent(u); } catch {} }
      source = strip(tag(block, 'News:Source')) || source;
      image = strip(tag(block, 'News:Image'));
      if (image.startsWith('//')) image = 'https:' + image;
      image = image.replace(/^http:/, 'https:');
    }
    if (!title || !link || isNaN(date)) continue;
    items.push({ title, link, source, cat: feed.cat, region: feed.region, date: date.toISOString(), summary: desc.slice(0, desc.length > 600 ? 600 : desc.length), image });
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
  const seen = new Map();
  const out = [];
  for (const it of results.flat().sort((a, b) => b.date.localeCompare(a.date))) {
    const key = it.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
    if (!RAIL.test(it.title + ' ' + it.summary) || BAD.test(it.title + ' ' + it.summary)) continue;
    const prev = seen.get(it.link) ?? seen.get(key);
    if (prev !== undefined) {
      // same story from two feeds: keep the one that has a summary
      if (!out[prev].summary && it.summary) out[prev] = { ...it, date: out[prev].date > it.date ? out[prev].date : it.date };
      continue;
    }
    seen.set(it.link, out.length); seen.set(key, out.length);
    out.push(it);
  }
  // every story must have a real summary so the popup always has something to show
  const withSummary = out.filter(i => i.summary && i.summary.length > 40);
  cache = { at: Date.now(), data: withSummary, status };
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
    const known = cache.data && cache.data.find(i => i.link === link);
    if (!known) return res.end('{}');
    // feed already gave us a decent kid-safe summary: no need to fetch the article
    if (known.summary && known.summary.length > 60) return res.end(JSON.stringify({ summary: kidSafe(known.summary), image: known.image || '', url: link }));
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
