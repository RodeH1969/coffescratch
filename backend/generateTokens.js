// backend/generateTokens.js
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const STORE = path.join(__dirname, 'tokenStore.json');

function loadStore() {
  if (!fs.existsSync(STORE)) return [];
  return JSON.parse(fs.readFileSync(STORE, 'utf8'));
}

function saveStore(data) {
  fs.writeFileSync(STORE, JSON.stringify(data, null, 2));
}

/**
 * Make a batch with evenly distributed winners.
 * Example: size=150, winners=30  →  one winner in each block of 5.
 */
function makeBatch(batchNumber, size = 100, winners = 20) {
  if (size % winners !== 0) {
    throw new Error('For even distribution, size must be divisible by winners (e.g., 150/30=5).');
  }
  const blockSize = size / winners; // e.g. 5
  const winnerIdxs = [];

  for (let b = 0; b < winners; b++) {
    const start = b * blockSize;
    const offset = Math.floor(Math.random() * blockSize); // 0..(blockSize-1)
    winnerIdxs.push(start + offset);
  }

  const batch = [];
  for (let i = 0; i < size; i++) {
    const isWin = winnerIdxs.includes(i);
    // token format: <batch>_<8-hex from UUID>
    const token = `${batchNumber}_${uuidv4().split('-')[1].toUpperCase()}`;
    batch.push({
      token,
      result: isWin ? 'win' : 'lose',
      redeemed: false,
      assigned: false,
      assignedAt: null,
      redeemedAt: null
    });
  }
  return batch;
}

function nextBatchNumber(all) {
  // infer next batch number from existing tokens
  let max = 0;
  for (const t of all) {
    const [b] = t.token.split('_');
    const n = parseInt(b, 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return max + 1;
}

(function main() {
  const sizeArg = parseInt(process.argv[2] || '100', 10);
  const winnersArg = parseInt(process.argv[3] || '20', 10);

  const store = loadStore();
  const batchNo = nextBatchNumber(store);
  const batch = makeBatch(batchNo, sizeArg, winnersArg);
  const updated = store.concat(batch);
  saveStore(updated);

  console.log(`✅ Batch ${batchNo} (${sizeArg} tokens, ${winnersArg} wins) appended to ${STORE}`);
})();
