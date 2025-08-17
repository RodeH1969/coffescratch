// backend/generateTokens.js
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/**
 * Make a batch with evenly distributed winners.
 * Example: size=150, winners=30 → one winner in each block of 5.
 */
function makeBatch(batchNumber, size = 100, winners = 20) {
  if (size % winners !== 0) {
    throw new Error('For even distribution, size must be divisible by winners (e.g., 150/30=5).');
  }
  
  const blockSize = size / winners;
  const winnerIdxs = [];

  // Randomly place one winner in each block
  for (let b = 0; b < winners; b++) {
    const start = b * blockSize;
    const offset = Math.floor(Math.random() * blockSize);
    winnerIdxs.push(start + offset);
  }

  const batch = [];
  for (let i = 0; i < size; i++) {
    const isWin = winnerIdxs.includes(i);
    // token format: <batch>_<8-hex from UUID>
    const token = `${batchNumber}_${uuidv4().split('-')[1].toUpperCase()}`;
    batch.push({
      token,
      result: isWin ? 'win' : 'lose'
    });
  }
  return batch;
}

async function getNextBatchNumber() {
  try {
    const result = await pool.query(`
      SELECT COALESCE(MAX(CAST(SPLIT_PART(token, '_', 1) AS INTEGER)), 0) + 1 as next_batch
      FROM tokens 
      WHERE token ~ '^[0-9]+_[A-F0-9]{4}$'
    `);
    return result.rows[0].next_batch;
  } catch (error) {
    console.warn('Could not determine batch number, starting from 1:', error.message);
    return 1;
  }
}

async function insertTokens(tokens) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Use batch insert for better performance
    const values = tokens.map((token, index) => 
      `($${index * 2 + 1}, $${index * 2 + 2})`
    ).join(', ');
    
    const params = tokens.flatMap(token => [token.token, token.result]);
    
    const query = `
      INSERT INTO tokens (token, result) 
      VALUES ${values}
      ON CONFLICT (token) DO NOTHING
    `;
    
    const result = await client.query(query, params);
    await client.query('COMMIT');
    
    return result.rowCount;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  const sizeArg = parseInt(process.argv[2] || '100', 10);
  const winnersArg = parseInt(process.argv[3] || '20', 10);
  
  if (sizeArg <= 0 || winnersArg <= 0) {
    console.error('❌ Size and winners must be positive numbers');
    process.exit(1);
  }
  
  if (sizeArg % winnersArg !== 0) {
    console.error(`❌ Size (${sizeArg}) must be divisible by winners (${winnersArg})`);
    console.error('   Example: 140 tokens with 20 winners = 7 tokens per winner block');
    process.exit(1);
  }

  try {
    console.log('🔄 Generating tokens...');
    
    const batchNo = await getNextBatchNumber();
    const tokens = makeBatch(batchNo, sizeArg, winnersArg);
    const inserted = await insertTokens(tokens);
    
    console.log(`✅ Batch ${batchNo}: ${inserted} tokens created (${winnersArg} winners, ${sizeArg - winnersArg} losers)`);
    
    // Show some stats
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE result = 'win') as total_winners,
        COUNT(*) FILTER (WHERE NOT assigned AND NOT redeemed) as available
      FROM tokens
    `);
    
    const { total, total_winners, available } = stats.rows[0];
    console.log(`📊 Database totals: ${total} tokens, ${total_winners} winners, ${available} available`);
    
  } catch (error) {
    console.error('❌ Error generating tokens:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Handle command line usage
if (require.main === module) {
  main();
}