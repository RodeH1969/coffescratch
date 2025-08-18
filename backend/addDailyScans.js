// backend/addDailyScans.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function addDailyScansTable() {
  try {
    console.log('🔄 Creating daily scans tracking table...');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS daily_scans (
        id SERIAL PRIMARY KEY,
        ip_address INET NOT NULL,
        scan_date DATE DEFAULT CURRENT_DATE,
        token VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(ip_address, scan_date)
      )
    `);

    console.log('✅ Daily scan tracking table created successfully!');

  } catch (error) {
    console.error('❌ Error creating table:', error);
  } finally {
    await pool.end();
  }
}

addDailyScansTable();