'use strict';
// 20/10 Deadline Run - LAN game server (Node core only, no npm deps)
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { listCharacters, resolveGroupDir, buildThumbnails } = require('./lib/characters');
const { createScoreStore } = require('./lib/scoreStore');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const THUMBS_DIR = path.join(ROOT, 'characters', 'thumbs');
const DATA_FILE = path.join(ROOT, 'data', 'scores.json');
const PORT = Number(process.env.PORT) || 3000;
const MAX_SCORE = 30000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendText(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

// Serve a file from a directory, guarding against path traversal.
function serveStatic(res, baseDir, relPath, { cache } = {}) {
  const safeRel = path
    .normalize(decodeURIComponent(relPath))
    .replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = path.join(baseDir, safeRel);
  if (!filePath.startsWith(baseDir)) {
    return sendText(res, 403, 'Forbidden');
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return sendText(res, 404, 'Not found');
    const ext = path.extname(filePath).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
    if (cache) headers['Cache-Control'] = cache;
    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  });
}

function readBody(req, limitBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limitBytes) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function toThumbUrl(group, id) {
  return `/characters/thumbs/${group}/${id}.png`;
}

function createApp(options = {}) {
  // Playable (female) and flower-giver (male) source folders.
  const femaleDir = options.femaleDir || resolveGroupDir(ROOT, 'female');
  const maleDir = options.maleDir || resolveGroupDir(ROOT, 'male');
  const thumbsDir = options.thumbsDir || THUMBS_DIR;
  const femaleThumbs = path.join(thumbsDir, 'female');
  const maleThumbs = path.join(thumbsDir, 'male');
  const store = options.store || createScoreStore(options.dataFile || DATA_FILE);

  // Resolve a player name to a female character id (case-insensitive).
  function resolveCharacterId(name) {
    const key = String(name || '').trim().toLowerCase();
    if (!key) return null;
    const match = listCharacters(femaleDir).find((c) => c.id.toLowerCase() === key);
    return match ? match.id : null;
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const pathname = url.pathname;

      // --- API: playable (female) characters ---
      if (req.method === 'GET' && pathname === '/api/characters') {
        const list = listCharacters(femaleDir).map((c) => ({
          id: c.id,
          url: toThumbUrl('female', c.id),
        }));
        return sendJson(res, 200, list);
      }

      // --- API: male characters (flower givers) ---
      if (req.method === 'GET' && pathname === '/api/males') {
        const list = listCharacters(maleDir).map((c) => ({
          id: c.id,
          url: toThumbUrl('male', c.id),
        }));
        return sendJson(res, 200, list);
      }

      // --- API: leaderboard ---
      if (req.method === 'GET' && pathname === '/api/leaderboard') {
        let limit = parseInt(url.searchParams.get('limit') || '10', 10);
        if (!Number.isFinite(limit)) limit = 10;
        limit = Math.min(50, Math.max(1, limit));
        const rows = (await store.top(limit)).map((r) => ({
          name: r.name,
          score: r.score,
          characterId: r.characterId,
          flowers: r.flowers || 0,
          lucky: !!r.lucky,
          url: toThumbUrl('female', r.characterId),
          updatedAt: r.updatedAt,
        }));
        return sendJson(res, 200, rows);
      }

      // --- API: lucky draw status (còn suất giải may mắn không) ---
      if (req.method === 'GET' && pathname === '/api/lucky') {
        const { winners, full } = await store.getLucky();
        // taken = đã đủ 3 người (không còn suất). winners = danh sách đã trúng.
        return sendJson(res, 200, { taken: full, winners });
      }

      // --- API: claim lucky draw (nhận giải may mắn) ---
      if (req.method === 'POST' && pathname === '/api/lucky') {
        let raw;
        try {
          raw = await readBody(req, 2048);
        } catch (e) {
          return sendJson(res, 413, { error: 'Payload too large' });
        }
        let body;
        try {
          body = JSON.parse(raw || '{}');
        } catch (e) {
          return sendJson(res, 400, { error: 'Invalid JSON' });
        }
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (name.length < 1 || name.length > 25) {
          return sendJson(res, 400, { error: 'name phải dài 1-25 ký tự' });
        }
        // Tên phải khớp một nhân vật (giống submit score).
        const characterId = resolveCharacterId(name);
        if (!characterId) {
          return sendJson(res, 400, { error: 'Chưa có nhân vật cho tên này' });
        }
        const result = await store.claimLucky(characterId);
        return sendJson(res, 200, result);
      }

      // --- API: submit score ---
      if (req.method === 'POST' && pathname === '/api/scores') {
        let raw;
        try {
          raw = await readBody(req, 2048);
        } catch (e) {
          return sendJson(res, 413, { error: 'Payload too large' });
        }
        let body;
        try {
          body = JSON.parse(raw || '{}');
        } catch (e) {
          return sendJson(res, 400, { error: 'Invalid JSON' });
        }
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        const score = body.score;
        if (name.length < 1 || name.length > 25) {
          return sendJson(res, 400, { error: 'name phải dài 1-25 ký tự' });
        }
        // Character is derived from the name (case-insensitive), never trusted
        // from the client. No matching PNG means the name can't play.
        const characterId = resolveCharacterId(name);
        if (!characterId) {
          return sendJson(res, 400, { error: 'Chưa có nhân vật cho tên này' });
        }
        if (
          typeof score !== 'number' ||
          !Number.isInteger(score) ||
          score < 0 ||
          score > MAX_SCORE
        ) {
          return sendJson(res, 400, { error: `score phải là số nguyên 0-${MAX_SCORE}` });
        }
        const gotFlower = body.gotFlower === true;
        // Lưu điểm theo characterId (id file ảnh) để mọi cách gõ hoa/thường
        // của cùng một tên gộp về một người duy nhất.
        const result = await store.submit(characterId, characterId, score, gotFlower);
        return sendJson(res, 200, result);
      }

      // --- Static: thumbnails (female/ and male/ subfolders) ---
      if (req.method === 'GET' && pathname.startsWith('/characters/thumbs/')) {
        const rel = pathname.slice('/characters/thumbs/'.length);
        return serveStatic(res, thumbsDir, rel, { cache: 'public, max-age=3600' });
      }

      // --- Static: game files ---
      if (req.method === 'GET') {
        const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
        // Game files (HTML/JS) must not be cached so updates show immediately.
        return serveStatic(res, PUBLIC_DIR, rel, { cache: 'no-cache' });
      }

      return sendText(res, 404, 'Not found');
    } catch (err) {
      console.error('Request error:', err);
      if (!res.headersSent) sendText(res, 500, 'Internal error');
    }
  });

  server.on('listening', () => {
    try {
      buildThumbnails(femaleDir, femaleThumbs);
      buildThumbnails(maleDir, maleThumbs);
    } catch (e) {
      console.error('Không tạo được thumbnail:', e.message);
    }
  });

  return server;
}

function lanAddresses() {
  const nets = os.networkInterfaces();
  const addrs = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) addrs.push(net.address);
    }
  }
  return addrs;
}

if (require.main === module) {
  const server = createApp();
  server.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('  🌸 20/10 DEADLINE RUN đang chạy!');
    console.log('');
    console.log(`  Máy này:     http://localhost:${PORT}`);
    for (const ip of lanAddresses()) {
      console.log(`  Trong LAN:   http://${ip}:${PORT}`);
    }
    console.log('');
    console.log('  Gửi link "Trong LAN" cho đồng nghiệp cùng mạng để chơi.');
    console.log('  Nhấn Ctrl+C để dừng.');
    console.log('');
  });
}

module.exports = { createApp };
