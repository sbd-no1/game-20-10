'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { decodePNG, encodePNG, resizeRGBA } = require('../lib/png');

// Build a simple RGBA image buffer.
function makeImage(w, h, fill) {
  const data = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = fill[0];
    data[i * 4 + 1] = fill[1];
    data[i * 4 + 2] = fill[2];
    data[i * 4 + 3] = fill[3];
  }
  return { width: w, height: h, data };
}

test('encode rồi decode giữ nguyên kích thước và pixel', () => {
  const img = makeImage(4, 3, [10, 20, 30, 255]);
  const png = encodePNG(img);
  const back = decodePNG(png);
  assert.equal(back.width, 4);
  assert.equal(back.height, 3);
  assert.equal(back.data[0], 10);
  assert.equal(back.data[1], 20);
  assert.equal(back.data[2], 30);
  assert.equal(back.data[3], 255);
});

test('giữ được kênh alpha trong suốt', () => {
  const img = makeImage(2, 2, [255, 0, 0, 0]);
  const back = decodePNG(encodePNG(img));
  assert.equal(back.data[3], 0);
});

test('resize đổi đúng kích thước', () => {
  const img = makeImage(100, 50, [1, 2, 3, 255]);
  const small = resizeRGBA(img, 20, 10);
  assert.equal(small.width, 20);
  assert.equal(small.height, 10);
  assert.equal(small.data.length, 20 * 10 * 4);
});
