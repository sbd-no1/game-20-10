'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createScoreStore } = require('../lib/scoreStore');

function tmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deadline-'));
  return path.join(dir, 'scores.json');
}

test('điểm thấp hơn không ghi đè điểm cao hơn', async () => {
  const store = createScoreStore(tmpFile());
  await store.submit('An', 'thanhhv6', 500);
  const r = await store.submit('An', 'thanhhv6', 300);
  assert.equal(r.best, 500);
  assert.equal(r.isNewRecord, false);
});

test('điểm cao hơn ghi đè và báo kỷ lục mới', async () => {
  const store = createScoreStore(tmpFile());
  await store.submit('An', 'thanhhv6', 300);
  const r = await store.submit('An', 'thanhhv6', 800);
  assert.equal(r.best, 800);
  assert.equal(r.isNewRecord, true);
});

test('tên phân biệt hoa thường', async () => {
  const store = createScoreStore(tmpFile());
  await store.submit('Thanh', 'thanhhv6', 100);
  await store.submit('thanh', 'thanhhv6', 200);
  const top = await store.top(10);
  assert.equal(top.length, 2);
});

test('tên được trim hai đầu', async () => {
  const file = tmpFile();
  const store = createScoreStore(file);
  await store.submit('  An  ', 'thanhhv6', 100);
  const top = await store.top(10);
  assert.equal(top[0].name, 'An');
});

test('top sắp xếp giảm dần', async () => {
  const store = createScoreStore(tmpFile());
  await store.submit('A', 'x', 100);
  await store.submit('B', 'x', 900);
  await store.submit('C', 'x', 500);
  const top = await store.top(10);
  assert.deepEqual(top.map((r) => r.name), ['B', 'C', 'A']);
});

test('50 submit đồng thời không mất dữ liệu', async () => {
  const file = tmpFile();
  const store = createScoreStore(file);
  const jobs = [];
  for (let i = 0; i < 50; i++) jobs.push(store.submit('P' + i, 'x', i + 1));
  await Promise.all(jobs);
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(Object.keys(saved).length, 50);
});

test('dữ liệu còn nguyên sau khi tạo store mới', async () => {
  const file = tmpFile();
  const s1 = createScoreStore(file);
  await s1.submit('An', 'thanhhv6', 700);
  const s2 = createScoreStore(file);
  const top = await s2.top(10);
  assert.equal(top[0].score, 700);
});

test('file hỏng được backup và bắt đầu lại', async () => {
  const file = tmpFile();
  fs.writeFileSync(file, '{not valid json');
  const store = createScoreStore(file);
  const r = await store.submit('An', 'thanhhv6', 100);
  assert.equal(r.best, 100);
});

test('nhận hoa được cộng dồn qua các ván', async () => {
  const store = createScoreStore(tmpFile());
  let r = await store.submit('An', 'thanhhv6', 500, true);
  assert.equal(r.flowers, 1);
  r = await store.submit('An', 'thanhhv6', 300, true); // điểm thấp hơn vẫn đếm hoa
  assert.equal(r.flowers, 2);
  assert.equal(r.best, 500);
});

test('không nhận hoa thì flowers = 0', async () => {
  const store = createScoreStore(tmpFile());
  const r = await store.submit('An', 'thanhhv6', 500, false);
  assert.equal(r.flowers, 0);
});

test('flowers được giữ qua khi tạo store mới', async () => {
  const file = tmpFile();
  const s1 = createScoreStore(file);
  await s1.submit('An', 'thanhhv6', 500, true);
  const s2 = createScoreStore(file);
  const top = await s2.top(10);
  assert.equal(top[0].flowers, 1);
});
