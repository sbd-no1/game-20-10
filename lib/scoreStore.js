'use strict';
// Persistent high-score store. One record per exact (trimmed) name, keeping the
// highest score and the running total of flowers received. Writes are
// serialized through a promise queue and written atomically (temp file +
// rename) so concurrent submits never corrupt the file.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const NAME_MIN = 1;
const NAME_MAX = 25;

function createScoreStore(dataFile) {
  const dir = path.dirname(dataFile);
  let writeChain = Promise.resolve();

  function loadSync() {
    try {
      const raw = fs.readFileSync(dataFile, 'utf8');
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object') return obj;
      return {};
    } catch (e) {
      if (e.code === 'ENOENT') return {};
      // Corrupt file: back it up and start fresh instead of crashing.
      try {
        const backup = `${dataFile}.corrupt-${Date.now()}`;
        fs.copyFileSync(dataFile, backup);
        console.error(`scores.json hỏng, đã backup sang ${backup}`);
      } catch (_) {}
      return {};
    }
  }

  async function atomicWrite(obj) {
    await fsp.mkdir(dir, { recursive: true });
    const tmp = `${dataFile}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await fsp.writeFile(tmp, JSON.stringify(obj, null, 2), 'utf8');
    await fsp.rename(tmp, dataFile);
  }

  // Enqueue a mutation so only one read-modify-write runs at a time.
  function enqueue(fn) {
    const run = writeChain.then(fn, fn);
    // Keep the chain alive even if this task rejects.
    writeChain = run.then(() => undefined, () => undefined);
    return run;
  }

  // Submit a score. Keeps the highest score per name, and accumulates the
  // total number of flowers received across all runs.
  // Returns { best, isNewRecord, rank, flowers }.
  function submit(name, characterId, score, gotFlower) {
    return enqueue(async () => {
      const trimmed = String(name).trim();
      if (trimmed.length < NAME_MIN || trimmed.length > NAME_MAX) {
        throw new Error('name không hợp lệ');
      }
      const data = loadSync();
      const prev = data[trimmed];
      let isNewRecord = false;
      let changed = false;

      const rec = {
        score: prev ? prev.score : -1,
        characterId: prev && prev.characterId ? prev.characterId : characterId,
        flowers: prev && prev.flowers ? prev.flowers : 0,
        updatedAt: prev ? prev.updatedAt : undefined,
      };

      if (score > rec.score) {
        rec.score = score;
        rec.characterId = characterId;
        rec.updatedAt = new Date().toISOString();
        isNewRecord = true;
        changed = true;
      }
      if (gotFlower) {
        rec.flowers += 1;
        changed = true;
      }

      data[trimmed] = rec;
      if (changed) await atomicWrite(data);

      const best = rec.score;
      // Rank among all players by best score (1-based).
      const higher = Object.values(data).filter((r) => r.score > best).length;
      return { best, isNewRecord, rank: higher + 1, flowers: rec.flowers };
    });
  }

  // Return top N players sorted by score desc, then by name for stability.
  function top(limit = 10) {
    return enqueue(async () => {
      const data = loadSync();
      return Object.entries(data)
        .map(([name, r]) => ({
          name,
          score: r.score,
          characterId: r.characterId,
          flowers: r.flowers || 0,
          updatedAt: r.updatedAt,
        }))
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
        .slice(0, limit);
    });
  }

  return { submit, top };
}

module.exports = { createScoreStore };
