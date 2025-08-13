// backend/index.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode'); // npm i qrcode
const app = express();

const PORT = process.env.PORT || 3000;
const STORE = path.join(__dirname, 'tokenStore.json');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// If deploying on Render, set BASE_URL to your public hostname.
// Fallback to origin detection by clients if omitted.
const BASE_URL = process.env.BASE_URL || 'http://localhost:' + PORT;

// very simple in-process lock for file writes
let writing = false;
const withStore = (mutator) =>
  new Promise((resolve, reject) => {
    const tryRun = () => {
      if (writing) return setTimeout(tryRun, 10);
      writing = true;
      fs.readFile(STORE, 'utf8', (err, raw) => {
        let data = [];
        if (!err && raw) {
          try { data = JSON.parse(raw); } catch {}
        }
        Promise.resolve(mutator(data))
          .then((result) => {
            fs.writeFile(STORE, JSON.stringify(data, null, 2), (werr) => {
              writing = false;
              if (werr) return reject(werr);
              resolve(result);
            });
          })
          .catch((e) => {
            writing = false;
            reject(e);
          });
      });
    };
    tryRun();
  });

// Serve static
app.use(express.static(PUBLIC_DIR));

// Health
app.get('/healthz', (_, res) => res.send('ok'));

// Kiosk endpoint: allocate next unassigned token and redirect to /spin with it
app.get('/scan', async (req, res) => {
  try {
    const token = await withStore(async (tokens) => {
      const next = tokens.find(t => !t.assigned && !t.redeemed);
      if (!next) return null;
      next.assigned = true;
      next.assignedAt = new Date().toISOString();
      return next.token;
    });

    if (!token) {
      // no tokens left; you can choose to auto-generate a new batch here if you want
      return res.status(410).send('No tokens available. Please try again later.');
    }

    // Redirect to the spin page with the token
    return res.redirect(302, `/spin/index.html?token=${encodeURIComponent(token)}`);
  } catch (e) {
    console.error(e);
    return res.status(500).send('Server error.');
  }
});

// Token status
app.get('/api/token/:token', (req, res) => {
  const raw = fs.existsSync(STORE) ? fs.readFileSync(STORE, 'utf8') : '[]';
  const tokens = JSON.parse(raw);
  const t = tokens.find(x => x.token === req.params.token);
  if (!t) return res.json({ valid: false });
  return res.json({
    valid: true,
    token: t.token,
    result: t.result,
    redeemed: t.redeemed,
    redeemedAt: t.redeemedAt || null,
    assigned: !!t.assigned,
    assignedAt: t.assignedAt || null
  });
});

// Redeem token (barista uses verify QR)
app.post('/api/token/:token/redeem', express.json(), (req, res) => {
  const raw = fs.existsSync(STORE) ? fs.readFileSync(STORE, 'utf8') : '[]';
  const tokens = JSON.parse(raw);
  const idx = tokens.findIndex(x => x.token === req.params.token);
  if (idx === -1) return res.status(404).json({ ok: false, error: 'not_found' });

  if (tokens[idx].redeemed) {
    return res.json({ ok: false, error: 'already_redeemed', redeemedAt: tokens[idx].redeemedAt });
  }

  tokens[idx].redeemed = true;
  tokens[idx].redeemedAt = new Date().toISOString();
  fs.writeFileSync(STORE, JSON.stringify(tokens, null, 2));
  return res.json({ ok: true, redeemedAt: tokens[idx].redeemedAt });
});

// Printable QR for the counter sticker: encodes /scan
app.get('/qr/sticker', async (req, res) => {
  try {
    // If you’ve set BASE_URL env var on Render, this will be that domain:
    // e.g. https://coffescratch.onrender.com/scan
    const kioskUrl = `${BASE_URL.replace(/\/$/, '')}/scan`;
    const png = await QRCode.toBuffer(kioskUrl, { type: 'png', width: 1024, margin: 2 });
    res.setHeader('Content-Type', 'image/png');
    res.send(png);
  } catch (e) {
    console.error(e);
    res.status(500).send('QR generation failed.');
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running at ${BASE_URL}`);
});
