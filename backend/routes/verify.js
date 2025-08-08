// backend/routes/verify.js

const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const tokenFile = path.join(__dirname, '../tokenStore.json');

// Load token store
function loadTokens() {
  return JSON.parse(fs.readFileSync(tokenFile, 'utf-8'));
}

// Save token store
function saveTokens(tokens) {
  fs.writeFileSync(tokenFile, JSON.stringify(tokens, null, 2));
}

router.post('/', (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ success: false, message: 'No token provided.' });
  }

  const tokens = loadTokens();
  const entry = tokens.find(t => t.token === token);

  if (!entry) {
    return res.status(404).json({ success: false, message: 'Token not found.' });
  }

  if (entry.redeemed) {
    return res.status(409).json({ success: false, message: 'Token already redeemed.' });
  }

  // Mark as redeemed
  entry.redeemed = true;
  saveTokens(tokens);

  res.json({
    success: true,
    message: entry.result === 'win' ? '✅ Valid winner token!' : '❌ Not a winning token.',
    result: entry.result,
    redeemed: entry.redeemed
  });
});

module.exports = router;
