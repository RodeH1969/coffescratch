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

// UPDATED: Kiosk endpoint with daily scan limits
app.get('/scan', async (req, res) => {
  const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 
    (req.connection.socket ? req.connection.socket.remoteAddress : null) || 
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() || '127.0.0.1';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Check if this IP already got a token today
    const existingToday = await client.query(`
      SELECT token FROM daily_scans 
      WHERE ip_address = $1 AND scan_date = CURRENT_DATE
    `, [clientIP]);

    if (existingToday.rows.length > 0) {
      // IP already got a token today - redirect to existing token
      const existingToken = existingToday.rows[0].token;
      await client.query('COMMIT');
      return res.redirect(302, `/index.html?token=${encodeURIComponent(existingToken)}`);
    }

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

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(410).send('No tokens available. Please try again later.');
    }

    const token = result.rows[0].token;

    // Record this IP's daily scan
    await client.query(`
      INSERT INTO daily_scans (ip_address, token, scan_date)
      VALUES ($1, $2, CURRENT_DATE)
      ON CONFLICT (ip_address, scan_date) DO NOTHING
    `, [clientIP, token]);

    await client.query('COMMIT');
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

// SECRET ADMIN DASHBOARD - Only you know this URL!
app.get('/admin-coffee-dashboard-xyz789', async (req, res) => {
  try {
    // Get all the dashboard data
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE result = 'win') as total_winners,
        COUNT(*) FILTER (WHERE assigned) as assigned,
        COUNT(*) FILTER (WHERE redeemed) as redeemed,
        COUNT(*) FILTER (WHERE NOT assigned AND NOT redeemed) as available
      FROM tokens
    `);

    const lastCustomers = await pool.query(`
      SELECT token, result, assigned_at 
      FROM tokens 
      WHERE assigned = true 
      ORDER BY assigned_at DESC 
      LIMIT 30
    `);

    const recentWinners = await pool.query(`
      SELECT token, assigned_at, redeemed, redeemed_at 
      FROM tokens 
      WHERE result = 'win' AND assigned = true 
      ORDER BY assigned_at DESC 
      LIMIT 10
    `);

    const today = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE assigned_at::date = CURRENT_DATE) as today_assigned,
        COUNT(*) FILTER (WHERE redeemed_at::date = CURRENT_DATE) as today_redeemed,
        COUNT(*) FILTER (WHERE result = 'win' AND assigned_at::date = CURRENT_DATE) as today_winners
      FROM tokens
    `);

    const unredeemed = await pool.query(`
      SELECT token, assigned_at 
      FROM tokens 
      WHERE result = 'win' AND assigned = true AND redeemed = false 
      ORDER BY assigned_at DESC
    `);

    const upcomingTokens = await pool.query(`
      SELECT token, result
      FROM tokens 
      WHERE NOT assigned AND NOT redeemed 
      ORDER BY id LIMIT 20
    `);

    // Get daily scan stats
    const dailyScans = await pool.query(`
      SELECT COUNT(*) as unique_visitors_today
      FROM daily_scans 
      WHERE scan_date = CURRENT_DATE
    `);

    // Function to convert UTC to AEST
    const toAEST = (utcDate) => {
      return new Date(utcDate).toLocaleString('en-AU', {
        timeZone: 'Australia/Brisbane',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    };

    const currentTimeAEST = toAEST(new Date());

    // Generate HTML dashboard
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Coffee Spin Admin Dashboard</title>
  <style>
    body { 
      font-family: Arial, sans-serif; 
      margin: 20px; 
      background: #f5f5f5; 
      line-height: 1.6;
    }
    .container { 
      max-width: 1200px; 
      margin: 0 auto; 
      background: white; 
      padding: 20px; 
      border-radius: 10px; 
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .header { 
      text-align: center; 
      color: #2c3e50; 
      border-bottom: 3px solid #ffd700; 
      padding-bottom: 10px; 
      margin-bottom: 30px;
    }
    .stats-grid { 
      display: grid; 
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
      gap: 20px; 
      margin-bottom: 30px;
    }
    .stat-card { 
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
      color: white; 
      padding: 20px; 
      border-radius: 10px; 
      text-align: center;
    }
    .stat-number { 
      font-size: 2em; 
      font-weight: bold; 
      margin-bottom: 5px;
    }
    .section { 
      background: #f8f9fa; 
      padding: 20px; 
      margin: 20px 0; 
      border-radius: 8px; 
      border-left: 4px solid #ffd700;
    }
    .section h3 { 
      margin-top: 0; 
      color: #2c3e50;
    }
    .token-list { 
      font-family: monospace; 
      background: white; 
      padding: 10px; 
      border-radius: 5px; 
      border: 1px solid #ddd;
      max-height: 400px;
      overflow-y: auto;
    }
    .win { color: #28a745; font-weight: bold; }
    .lose { color: #dc3545; }
    .redeemed { color: #28a745; }
    .unredeemed { color: #ffc107; }
    .refresh-btn {
      background: #ffd700;
      color: #333;
      border: none;
      padding: 10px 20px;
      border-radius: 5px;
      cursor: pointer;
      font-weight: bold;
      margin-bottom: 20px;
    }
    .timestamp { color: #666; font-size: 0.9em; }
    .upcoming-win { background: #d4edda; padding: 2px 4px; border-radius: 3px; }
    .upcoming-lose { background: #f8d7da; padding: 2px 4px; border-radius: 3px; }
    .security-notice { 
      background: #d1ecf1; 
      color: #0c5460; 
      padding: 10px; 
      border-radius: 5px; 
      margin: 10px 0; 
      border-left: 4px solid #bee5eb;
    }
    @media (max-width: 768px) {
      .container { margin: 10px; padding: 15px; }
      .stats-grid { grid-template-columns: 1fr 1fr; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>☕ Coffee Spin Admin Dashboard</h1>
      <p>Last updated: ${currentTimeAEST} AEST</p>
      <button class="refresh-btn" onclick="location.reload()">🔄 Refresh</button>
      <div class="security-notice">
        🔒 <strong>Daily Limit Active:</strong> Each customer can only get 1 token per day (prevents abuse)
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-number">${stats.rows[0].total}</div>
        <div>Total Tokens</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${stats.rows[0].assigned}</div>
        <div>Customers Played</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${stats.rows[0].redeemed}</div>
        <div>Coffee Redeemed</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${stats.rows[0].available}</div>
        <div>Available</div>
      </div>
    </div>

    <div class="section">
      <h3>📅 Today's Activity</h3>
      <div class="token-list">
        <strong>Unique Visitors:</strong> ${dailyScans.rows[0].unique_visitors_today}<br>
        <strong>Customers Played:</strong> ${today.rows[0].today_assigned}<br>
        <strong>Winners Today:</strong> ${today.rows[0].today_winners}<br>
        <strong>Coffee Redeemed:</strong> ${today.rows[0].today_redeemed}
      </div>
    </div>

    <div class="section">
      <h3>👥 Last 30 Customers</h3>
      <div class="token-list">
        ${lastCustomers.rows.length === 0 ? 'No customers yet!' : 
          lastCustomers.rows.map((row, i) => {
            const time = toAEST(row.assigned_at);
            const winStatus = row.result === 'win' ? 
              '<span class="win">🎉 WIN</span>' : 
              '<span class="lose">❌ LOSE</span>';
            return `${i+1}. ${row.token} - ${winStatus} - <span class="timestamp">${time}</span>`;
          }).join('<br>')
        }
      </div>
    </div>

    <div class="section">
      <h3>🔮 Next 20 Upcoming Tokens</h3>
      <div class="token-list">
        ${upcomingTokens.rows.length === 0 ? 'No tokens available!' :
          upcomingTokens.rows.map((row, i) => {
            const winStatus = row.result === 'win' ? 
              `<span class="upcoming-win">🎉 WINNER</span>` : 
              `<span class="upcoming-lose">❌ lose</span>`;
            return `${i+1}. ${row.token} - ${winStatus}`;
          }).join('<br>')
        }
      </div>
    </div>

    <div class="section">
      <h3>🎉 Recent Winners</h3>
      <div class="token-list">
        ${recentWinners.rows.length === 0 ? 'No winners yet!' :
          recentWinners.rows.map((row, i) => {
            const time = toAEST(row.assigned_at);
            const status = row.redeemed ? 
              `<span class="redeemed">✅ REDEEMED (${toAEST(row.redeemed_at)})</span>` : 
              '<span class="unredeemed">⏳ NOT REDEEMED</span>';
            return `${i+1}. ${row.token} - <span class="timestamp">${time}</span> - ${status}`;
          }).join('<br>')
        }
      </div>
    </div>

    ${unredeemed.rows.length > 0 ? `
    <div class="section" style="border-left-color: #ffc107; background: #fff3cd;">
      <h3>⚠️ Unredeemed Winners (${unredeemed.rows.length})</h3>
      <div class="token-list">
        ${unredeemed.rows.map((row, i) => {
          const time = toAEST(row.assigned_at);
          return `${i+1}. ${row.token} - Won at <span class="timestamp">${time}</span>`;
        }).join('<br>')}
      </div>
    </div>
    ` : ''}

    <div class="section">
      <h3>📊 Win Rate Analysis</h3>
      <div class="token-list">
        <strong>Total Winners:</strong> ${stats.rows[0].total_winners} out of ${stats.rows[0].total} tokens<br>
        <strong>Win Rate:</strong> ${Math.round(stats.rows[0].total_winners/stats.rows[0].total*100)}%<br>
        <strong>Remaining Winners:</strong> ${stats.rows[0].total_winners - stats.rows[0].redeemed} unredeemed
      </div>
    </div>
  </div>
</body>
</html>`;

    res.send(html);

  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).send('Dashboard error');
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
  console.log(`🔒 Admin dashboard: ${BASE_URL}/admin-coffee-dashboard-xyz789`);
});