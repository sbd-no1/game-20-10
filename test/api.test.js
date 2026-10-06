'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { encodePNG } = require('../lib/png');
const { createApp } = require('../server');

let server, baseUrl, femaleDir, maleDir, thumbDir, dataFile;

function writePng(file, w, h) {
  const data = Buffer.alloc(w * h * 4, 180);
  fs.writeFileSync(file, encodePNG({ width: w, height: h, data }));
}

before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-'));
  femaleDir = path.join(dir, 'characters', 'female');
  maleDir = path.join(dir, 'characters', 'male');
  thumbDir = path.join(dir, 'characters', 'thumbs');
  dataFile = path.join(dir, 'data', 'scores.json');
  fs.mkdirSync(femaleDir, { recursive: true });
  fs.mkdirSync(maleDir, { recursive: true });
  // Female = playable characters.
  writePng(path.join(femaleDir, 'giangnl3.png'), 300, 200);
  writePng(path.join(femaleDir, 'yenhtk1.png'), 300, 200);
  // Male = flower givers.
  writePng(path.join(maleDir, 'ason.png'), 300, 200);
  writePng(path.join(maleDir, 'vupn.png'), 300, 200);

  server = createApp({ femaleDir, maleDir, thumbsDir: thumbDir, dataFile });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(() => server && server.close());

async function get(p) {
  const res = await fetch(baseUrl + p);
  return { status: res.status, body: await res.json().catch(() => null) };
}
async function post(p, obj) {
  const res = await fetch(baseUrl + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

test('GET / trả về trang game', async () => {
  const res = await fetch(baseUrl + '/');
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.ok(html.includes('DEADLINE RUN'));
});

test('GET /api/characters liệt kê nhân vật nữ', async () => {
  const { status, body } = await get('/api/characters');
  assert.equal(status, 200);
  assert.deepEqual(body.map((c) => c.id).sort(), ['giangnl3', 'yenhtk1']);
  assert.ok(body[0].url.startsWith('/characters/thumbs/female/'));
});

test('GET /api/males liệt kê nhân vật nam', async () => {
  const { status, body } = await get('/api/males');
  assert.equal(status, 200);
  assert.deepEqual(body.map((c) => c.id).sort(), ['ason', 'vupn']);
  assert.ok(body[0].url.startsWith('/characters/thumbs/male/'));
});

test('thumbnail nữ phục vụ được qua HTTP', async () => {
  const res = await fetch(baseUrl + '/characters/thumbs/female/giangnl3.png');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
});

test('thumbnail nam phục vụ được qua HTTP', async () => {
  const res = await fetch(baseUrl + '/characters/thumbs/male/ason.png');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
});

test('POST hợp lệ trả về best/isNewRecord/rank', async () => {
  const { status, body } = await post('/api/scores', { name: 'giangnl3', score: 500 });
  assert.equal(status, 200);
  assert.equal(body.best, 500);
  assert.equal(body.isNewRecord, true);
  assert.equal(body.rank, 1);
});

test('tên khớp ảnh nữ không phân biệt hoa thường', async () => {
  const { status, body } = await post('/api/scores', { name: 'YenHTK1', score: 300 });
  assert.equal(status, 200);
  assert.equal(body.best, 300);
});

test('tên trùng nhân vật nam không được chơi', async () => {
  const { status } = await post('/api/scores', { name: 'ason', score: 100 });
  assert.equal(status, 400);
});

test('điểm thấp hơn không phá kỷ lục', async () => {
  await post('/api/scores', { name: 'yenhtk1', score: 800 });
  const { body } = await post('/api/scores', { name: 'yenhtk1', score: 100 });
  assert.equal(body.best, 800);
  assert.equal(body.isNewRecord, false);
});

test('từ chối tên rỗng', async () => {
  const { status } = await post('/api/scores', { name: '', score: 100 });
  assert.equal(status, 400);
});

test('từ chối tên quá dài', async () => {
  const { status } = await post('/api/scores', { name: 'x'.repeat(26), score: 100 });
  assert.equal(status, 400);
});

test('từ chối tên không có ảnh tương ứng', async () => {
  const { status, body } = await post('/api/scores', { name: 'KhongCoAnh', score: 100 });
  assert.equal(status, 400);
  assert.ok(/nhân vật/i.test(body.error));
});

test('từ chối điểm âm', async () => {
  const { status } = await post('/api/scores', { name: 'giangnl3', score: -5 });
  assert.equal(status, 400);
});

test('từ chối điểm quá lớn', async () => {
  const { status } = await post('/api/scores', { name: 'giangnl3', score: 999999 });
  assert.equal(status, 400);
});

test('từ chối điểm không nguyên', async () => {
  const { status } = await post('/api/scores', { name: 'giangnl3', score: 1.5 });
  assert.equal(status, 400);
});

test('gotFlower cộng dồn vào flowers và leaderboard', async () => {
  await post('/api/scores', { name: 'giangnl3', score: 400, gotFlower: true });
  const { body } = await post('/api/scores', { name: 'giangnl3', score: 200, gotFlower: true });
  assert.ok(body.flowers >= 2);
  const lb = await get('/api/leaderboard?limit=50');
  const row = lb.body.find((r) => r.name === 'giangnl3');
  assert.ok(row && row.flowers >= 2);
});

test('GET /api/leaderboard kèm url nữ và sắp giảm dần', async () => {
  const { status, body } = await get('/api/leaderboard?limit=5');
  assert.equal(status, 200);
  assert.ok(Array.isArray(body));
  for (let i = 1; i < body.length; i++) assert.ok(body[i - 1].score >= body[i].score);
  if (body.length) assert.ok(body[0].url.startsWith('/characters/thumbs/female/'));
});
