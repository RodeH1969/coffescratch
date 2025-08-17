// backend/deleteAllTokens.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function deleteAllTokens() {
  try {
    console.log('🔄 Deleting ALL tokens from database...');

    const result = await pool.query('DELETE FROM tokens');
    console.log(`✅ Deleted ${result.rowCount} tokens successfully!`);
    
    // Verify empty
    const check = await pool.query('SELECT COUNT(*) as count FROM tokens');
    console.log(`📊 Database now has ${check.rows[0].count} tokens`);
    console.log('🎯 Ready for fresh token generation!');

  } catch (error) {
    console.error('❌ Delete failed:', error);
  } finally {
    await pool.end();
  }
}

deleteAllTokens();