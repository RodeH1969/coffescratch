// backend/setupDatabase.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function setupDatabase() {
  try {
    console.log('🔄 Setting up database...');

    // Create tokens table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tokens (
        id SERIAL PRIMARY KEY,
        token VARCHAR(50) UNIQUE NOT NULL,
        result VARCHAR(10) NOT NULL CHECK (result IN ('win', 'lose')),
        redeemed BOOLEAN DEFAULT FALSE,
        assigned BOOLEAN DEFAULT FALSE,
        assigned_at TIMESTAMP NULL,
        redeemed_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_tokens_assigned_redeemed 
      ON tokens (assigned, redeemed) 
      WHERE NOT assigned AND NOT redeemed
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_tokens_token 
      ON tokens (token)
    `);

    console.log('✅ Database setup complete!');
    
    // Check if we have any tokens
    const { rows } = await pool.query('SELECT COUNT(*) as count FROM tokens');
    console.log(`📊 Current token count: ${rows[0].count}`);
    
    if (rows[0].count === '0') {
      console.log('💡 No tokens found. Run "npm run generate-tokens" to create some.');
    }

  } catch (error) {
    console.error('❌ Database setup failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

setupDatabase();