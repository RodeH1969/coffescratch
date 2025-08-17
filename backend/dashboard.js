// backend/dashboard.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function showDashboard() {
  try {
    console.log('☕ COFFEE SPIN MANAGEMENT DASHBOARD');
    console.log('=====================================\n');

    // Overall Stats
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE result = 'win') as total_winners,
        COUNT(*) FILTER (WHERE assigned) as assigned,
        COUNT(*) FILTER (WHERE redeemed) as redeemed,
        COUNT(*) FILTER (WHERE NOT assigned AND NOT redeemed) as available
      FROM tokens
    `);
    
    const { total, total_winners, assigned, redeemed, available } = stats.rows[0];
    console.log('📊 OVERALL STATISTICS:');
    console.log(`   Total Tokens: ${total}`);
    console.log(`   Winners: ${total_winners} (${Math.round(total_winners/total*100)}%)`);
    console.log(`   Assigned: ${assigned}`);
    console.log(`   Redeemed: ${redeemed}`);
    console.log(`   Available: ${available}\n`);

    // Last 10 Customers (Assigned Tokens)
    const lastCustomers = await pool.query(`
      SELECT token, result, assigned_at 
      FROM tokens 
      WHERE assigned = true 
      ORDER BY assigned_at DESC 
      LIMIT 10
    `);
    
    console.log('👥 LAST 10 CUSTOMERS:');
    if (lastCustomers.rows.length === 0) {
      console.log('   No customers yet!\n');
    } else {
      lastCustomers.rows.forEach((row, i) => {
        const time = new Date(row.assigned_at).toLocaleString();
        const winStatus = row.result === 'win' ? '🎉 WIN' : '❌ LOSE';
        console.log(`   ${i+1}. ${row.token} - ${winStatus} - ${time}`);
      });
      console.log('');
    }

    // Recent Winners
    const recentWinners = await pool.query(`
      SELECT token, assigned_at, redeemed, redeemed_at 
      FROM tokens 
      WHERE result = 'win' AND assigned = true 
      ORDER BY assigned_at DESC 
      LIMIT 5
    `);
    
    console.log('🎉 RECENT WINNERS:');
    if (recentWinners.rows.length === 0) {
      console.log('   No winners yet!\n');
    } else {
      recentWinners.rows.forEach((row, i) => {
        const time = new Date(row.assigned_at).toLocaleString();
        const status = row.redeemed ? 
          `✅ REDEEMED (${new Date(row.redeemed_at).toLocaleString()})` : 
          '⏳ NOT REDEEMED';
        console.log(`   ${i+1}. ${row.token} - ${time} - ${status}`);
      });
      console.log('');
    }

    // Today's Activity
    const today = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE assigned_at::date = CURRENT_DATE) as today_assigned,
        COUNT(*) FILTER (WHERE redeemed_at::date = CURRENT_DATE) as today_redeemed,
        COUNT(*) FILTER (WHERE result = 'win' AND assigned_at::date = CURRENT_DATE) as today_winners
      FROM tokens
    `);
    
    const { today_assigned, today_redeemed, today_winners } = today.rows[0];
    console.log('📅 TODAY\'S ACTIVITY:');
    console.log(`   Customers Played: ${today_assigned}`);
    console.log(`   Winners: ${today_winners}`);
    console.log(`   Coffee Redeemed: ${today_redeemed}\n`);

    // Unredeemed Winners (Important!)
    const unredeemed = await pool.query(`
      SELECT token, assigned_at 
      FROM tokens 
      WHERE result = 'win' AND assigned = true AND redeemed = false 
      ORDER BY assigned_at DESC
    `);
    
    if (unredeemed.rows.length > 0) {
      console.log('⚠️  UNREDEEMED WINNERS:');
      unredeemed.rows.forEach((row, i) => {
        const time = new Date(row.assigned_at).toLocaleString();
        console.log(`   ${i+1}. ${row.token} - Won at ${time}`);
      });
      console.log('');
    }

    // Next Token Preview
    const nextToken = await pool.query(`
      SELECT token FROM tokens 
      WHERE NOT assigned AND NOT redeemed 
      ORDER BY id LIMIT 1
    `);
    
    if (nextToken.rows.length > 0) {
      console.log('🔮 NEXT CUSTOMER WILL GET:');
      console.log(`   Token: ${nextToken.rows[0].token}\n`);
    }

  } catch (error) {
    console.error('❌ Dashboard error:', error);
  } finally {
    await pool.end();
  }
}

showDashboard();