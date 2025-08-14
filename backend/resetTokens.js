// backend/resetTokens.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function resetAllTokens() {
  try {
    console.log('🔄 Resetting all tokens to unassigned/unredeemed state...');

    const result = await pool.query(`
      UPDATE tokens 
      SET 
        assigned = FALSE,
        redeemed = FALSE,
        assigned_at = NULL,
        redeemed_at = NULL
      WHERE assigned = TRUE OR redeemed = TRUE
    `);

    console.log(`✅ Reset complete! ${result.rowCount} tokens were reset.`);
    
    // Show current stats
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE result = 'win') as winners,
        COUNT(*) FILTER (WHERE assigned) as assigned,
        COUNT(*) FILTER (WHERE redeemed) as redeemed,
        COUNT(*) FILTER (WHERE NOT assigned AND NOT redeemed) as available
      FROM tokens
    `);
    
    const { total, winners, assigned, redeemed, available } = stats.rows[0];
    console.log(`📊 Current stats: ${total} total, ${winners} winners, ${available} available`);
    console.log(`🎯 Next token assignment will start from the beginning again!`);

  } catch (error) {
    console.error('❌ Reset failed:', error);
  } finally {
    await pool.end();
  }
}

resetAllTokens();