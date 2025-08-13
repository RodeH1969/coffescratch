// backend/index.js
const express = require('express');
const path = require('path');
const QRCode = require('qrcode');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const BASE_URL = process.env.BASE_URL || 'http://localhost:' + PORT;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Test database connection
pool.on('connect', () => {
  console.log('🗄️  Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('💥 Database connection error:', err);
});

// Middleware
app.use(express.static(PUBLIC_DIR));
app.use(express.json());

// Health check
app.get('/healthz', (_, res) => res.send('ok'));

// Kiosk endpoint: allocate next unassigned token and redirect to /spin with it
app.get('/scan', async (req, res) => {
  const client = await pool.connect();
  try {
    // Use a transaction to prevent race conditions
    await client.query('BEGIN');
    
    // Find and claim the next available token
    const result = await client.query(`
      UPDATE tokens 
      SET assigned = TRUE, assigned_at = CURRENT_TIMESTAMP 
      WHERE id = (
        SELECT id FROM tokens 
        WHERE NOT assigned AND NOT redeemed 
        ORDER BY id LIMIT 1 
        FOR UPDATE SKIP LOCKED
      )
      RETURNING token
    `);

    await client.query('COMMIT');

    if (result.rows.length === 0) {
      return res.status(410).send('No tokens available. Please try again later.');
    }

    const token = result.rows[0].token;
    return res.redirect(302, `/index.html?token=${encodeURIComponent(token)}`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in /scan:', error);
    return res.status(500).send('Server error.');
  } finally {
    client.release();
  }
});

// Token status endpoint
app.get('/api/token/:token', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT token, result, redeemed, redeemed_at, assigned, assigned_at FROM tokens WHERE token = $1',
      [req.params.token]
    );

    if (rows.length === 0) {
      return res.json({ valid: false });
    }

    const token = rows[0];
    return res.json({
      valid: true,
      token: token.token,
      result: token.result,
      redeemed: token.redeemed,
      redeemedAt: token.redeemed_at,
      assigned: token.assigned,
      assignedAt: token.assigned_at
    });

  } catch (error) {
    console.error('Error getting token status:', error);
    return res.status(500).json({ valid: false, error: 'server_error' });
  }
});

// Legacy verify endpoint (for the verify.html page)
app.post('/api/verify', async (req, res) => {
  const { token } = req.body;
  
  if (!token) {
    return res.json({ success: false, message: 'No token provided' });
  }

  try {
    const result = await pool.query(`
      UPDATE tokens 
      SET redeemed = TRUE, redeemed_at = CURRENT_TIMESTAMP 
      WHERE token = $1 AND NOT redeemed
      RETURNING result, redeemed_at
    `, [token]);

    if (result.rows.length === 0) {
      // Check if token exists but is already redeemed
      const existing = await pool.query('SELECT redeemed, redeemed_at FROM tokens WHERE token = $1', [token]);
      
      if (existing.rows.length === 0) {
        return res.json({ success: false, message: 'Invalid token' });
      } else {
        return res.json({ success: false, message: 'Token already redeemed' });
      }
    }

    return res.json({ success: true, redeemedAt: result.rows[0].redeemed_at });

  } catch (error) {
    console.error('Error redeeming token:', error);
    return res.json({ success: false, message: 'Server error' });
  }
});

// Printable QR for counter sticker
app.get('/qr/sticker', async (req, res) => {
  try {
    const kioskUrl = `${BASE_URL.replace(/\/$/, '')}/scan`;
    const png = await QRCode.toBuffer(kioskUrl, { type: 'png', width: 1024, margin: 2 });
    res.setHeader('Content-Type', 'image/png');
    res.send(png);
  } catch (error) {
    console.error('QR generation error:', error);
    res.status(500).send('QR generation failed.');
  }
});

// Debug endpoint  
app.get('/debug', (req, res) => {
  res.json({
    BASE_URL: process.env.BASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL ? 'SET' : 'NOT SET'
  });
});

// Admin stats endpoint (optional)
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE assigned) as assigned,
        COUNT(*) FILTER (WHERE redeemed) as redeemed,
        COUNT(*) FILTER (WHERE result = 'win') as winners,
        COUNT(*) FILTER (WHERE NOT assigned AND NOT redeemed) as available
      FROM tokens
    `);

    res.json(stats.rows[0]);
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'server_error' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running at ${BASE_URL}`);
  console.log(`🗄️  Database: ${process.env.DATABASE_URL ? 'Connected' : 'Not configured'}`);
});