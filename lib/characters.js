'use strict';
// Scan a character folder for PNG files and build downscaled thumbnails.
// Characters are split into two groups:
//   female -> playable characters, matched to the typed player name
//   male   -> characters shown giving flowers on the end screen
const fs = require('fs');
const path = require('path');
const { decodePNG, encodePNG, resizeRGBA } = require('./png');

const THUMB_MAX = 384;
const ID_RE = /^[a-zA-Z0-9_-]+$/;

// List valid characters in a single directory: PNG files with a safe id.
function listCharacters(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return [];
  }
  const list = [];
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    if (path.extname(ent.name).toLowerCase() !== '.png') continue;
    const id = path.basename(ent.name, path.extname(ent.name));
    if (!ID_RE.test(id)) continue;
    list.push({ id, file: path.join(dir, ent.name) });
  }
  list.sort((a, b) => a.id.localeCompare(b.id));
  return list;
}

// Locate a group folder. Prefer characters/<group>, fall back to <group> at
// the project root so it works whether or not the folders were moved.
function resolveGroupDir(root, group) {
  const inside = path.join(root, 'characters', group);
  if (fs.existsSync(inside)) return inside;
  const atRoot = path.join(root, group);
  if (fs.existsSync(atRoot)) return atRoot;
  return inside; // default (may not exist yet)
}

function getThumbPath(thumbsDir, id) {
  return path.join(thumbsDir, `${id}.png`);
}

// Fit within THUMB_MAX while preserving aspect ratio.
function fitSize(w, h) {
  const scale = Math.min(1, THUMB_MAX / Math.max(w, h));
  return {
    w: Math.max(1, Math.round(w * scale)),
    h: Math.max(1, Math.round(h * scale)),
  };
}

// Build a thumbnail for one source file if missing or stale. Returns thumb path.
function buildThumbnail(srcFile, thumbFile) {
  let regenerate = true;
  try {
    const srcStat = fs.statSync(srcFile);
    const thumbStat = fs.statSync(thumbFile);
    regenerate = srcStat.mtimeMs > thumbStat.mtimeMs;
  } catch (e) {
    regenerate = true;
  }
  if (!regenerate) return thumbFile;

  const buf = fs.readFileSync(srcFile);
  const img = decodePNG(buf);
  const { w, h } = fitSize(img.width, img.height);
  const resized = w === img.width && h === img.height ? img : resizeRGBA(img, w, h);
  const out = encodePNG(resized);
  fs.writeFileSync(thumbFile, out);
  return thumbFile;
}

// Build thumbnails for every character in a source dir into a thumb dir.
// Errors on one file don't stop the rest.
function buildThumbnails(srcDir, thumbsDir) {
  fs.mkdirSync(thumbsDir, { recursive: true });
  const results = [];
  for (const c of listCharacters(srcDir)) {
    const thumbFile = getThumbPath(thumbsDir, c.id);
    try {
      buildThumbnail(c.file, thumbFile);
      results.push({ id: c.id, ok: true });
    } catch (e) {
      results.push({ id: c.id, ok: false, error: e.message });
      console.error(`Thumbnail lỗi cho ${c.id}: ${e.message}`);
    }
  }
  return results;
}

module.exports = {
  listCharacters,
  resolveGroupDir,
  getThumbPath,
  buildThumbnail,
  buildThumbnails,
  THUMB_MAX,
};
