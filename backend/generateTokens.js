const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const BATCH_SIZE = 100;
const WINNERS_PER_BATCH = 10;
const TOKEN_FILE = path.join(__dirname, 'tokenStore.json');

function loadTokenStore() {
  if (!fs.existsSync(TOKEN_FILE)) return [];
  const data = fs.readFileSync(TOKEN_FILE);
  return JSON.parse(data);
}

function saveTokenStore(store) {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(store, null, 2));
}

function pickEvenlyDistributedWinners(size, count) {
  const winners = new Set();
  const step = Math.floor(size / count);
  for (let i = 0; i < count; i++) {
    const base = i * step;
    const offset = Math.floor(Math.random() * step);
    winners.add(base + offset);
  }
  return winners;
}

function generateBatch(batchNumber) {
  const tokenStore = loadTokenStore();
  const winners = pickEvenlyDistributedWinners(BATCH_SIZE, WINNERS_PER_BATCH);

  for (let i = 0; i < BATCH_SIZE; i++) {
    const token = `${batchNumber}_${uuidv4().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
    const entry = {
      token,
      result: winners.has(i) ? 'win' : 'lose',
      redeemed: false
    };
    tokenStore.push(entry);
  }

  saveTokenStore(tokenStore);
  console.log(`✅ Batch ${batchNumber} saved to ${TOKEN_FILE}`);
}

// Run from command line
const batchArg = process.argv[2];
if (!batchArg || isNaN(parseInt(batchArg))) {
  console.error('❌ Please provide a numeric batch number: node generateTokens.js 3');
  process.exit(1);
}

generateBatch(batchArg);
