// backend/migrateTokens.js
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function migrateTokens() {
  try {
    console.log('🔄 Reading existing tokenStore.json...');
    const oldTokens = JSON.parse(fs.readFileSync('backend/tokenStore.json', 'utf8'));
    console.log(`📊 Found ${oldTokens.length} existing tokens`);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      let insertedCount = 0;
      for (const token of oldTokens) {
        const result = await client.query(`
          INSERT INTO tokens (token, result, redeemed, assigned, assigned_at, redeemed_at)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (token) DO NOTHING
          RETURNING id
        `, [
          token.token,
          token.result,
          token.redeemed,
          token.assigned,
          token.assignedAt || null,
          token.redeemedAt || null
        ]);
        
        if (result.rows.length > 0) {
          insertedCount++;
        }
      }

      await client.query('COMMIT');
      console.log(`✅ Migration complete! Inserted ${insertedCount} tokens`);
      
      // Show final stats
      const stats = await client.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE result = 'win') as winners,
          COUNT(*) FILTER (WHERE assigned) as assigned,
          COUNT(*) FILTER (WHERE redeemed) as redeemed,
          COUNT(*) FILTER (WHERE NOT assigned AND NOT redeemed) as available
        FROM tokens
      `);
      
      const { total, winners, assigned, redeemed, available } = stats.rows[0];
      console.log(`📊 Final stats: ${total} total, ${winners} winners, ${available} available for play`);
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await pool.end();
  }
}

migrateTokens();