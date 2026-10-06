'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { encodePNG } = require('../lib/png');
const { listCharacters, buildThumbnails, resolveGroupDir, THUMB_MAX } = require('../lib/characters');
const { decodePNG } = require('../lib/png');

function writePng(file, w, h) {
  const data = Buffer.alloc(w * h * 4, 200);
  fs.writeFileSync(file, encodePNG({ width: w, height: h, data }));
}

function setupDir() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'chars-'));
  const charDir = path.join(base, 'characters');
  const thumbDir = path.join(charDir, 'thumbs');
  fs.mkdirSync(charDir, { recursive: true });
  return { charDir, thumbDir };
}

test('liệt kê đúng các file PNG hợp lệ', () => {
  const { charDir } = setupDir();
  writePng(path.join(charDir, 'alpha.png'), 10, 10);
  writePng(path.join(charDir, 'beta.png'), 10, 10);
  fs.writeFileSync(path.join(charDir, 'notes.txt'), 'ignore me');
  const list = listCharacters(charDir);
  assert.deepEqual(list.map((c) => c.id), ['alpha', 'beta']);
});

test('bỏ qua file có tên không an toàn', () => {
  const { charDir } = setupDir();
  writePng(path.join(charDir, 'ok_name.png'), 8, 8);
  writePng(path.join(charDir, 'bad name!.png'), 8, 8);
  const ids = listCharacters(charDir).map((c) => c.id);
  assert.ok(ids.includes('ok_name'));
  assert.ok(!ids.some((i) => i.includes('bad')));
});

test('thumbnail được tạo và không vượt quá kích thước tối đa', () => {
  const { charDir, thumbDir } = setupDir();
  writePng(path.join(charDir, 'big.png'), 1000, 500);
  buildThumbnails(charDir, thumbDir);
  const thumbFile = path.join(thumbDir, 'big.png');
  assert.ok(fs.existsSync(thumbFile));
  const img = decodePNG(fs.readFileSync(thumbFile));
  assert.ok(img.width <= THUMB_MAX && img.height <= THUMB_MAX);
  assert.equal(img.width, THUMB_MAX); // longest side scaled to max
});

test('thư mục trống trả về mảng rỗng', () => {
  const { charDir } = setupDir();
  assert.deepEqual(listCharacters(charDir), []);
});

test('resolveGroupDir ưu tiên characters/<group>', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'grp-'));
  fs.mkdirSync(path.join(base, 'characters', 'female'), { recursive: true });
  const dir = resolveGroupDir(base, 'female');
  assert.equal(dir, path.join(base, 'characters', 'female'));
});

test('resolveGroupDir fallback về <group> ở gốc', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'grp-'));
  fs.mkdirSync(path.join(base, 'male'), { recursive: true });
  const dir = resolveGroupDir(base, 'male');
  assert.equal(dir, path.join(base, 'male'));
});
