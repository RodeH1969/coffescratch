// backend/testDb.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: "postgresql://coffee_scratch_db_user:pkyxfdK7BgJwyL0Fpqajw7PqxjiTWZMq@dpg-d2e14vjuibrs738i3330-a.singapore-postgres.render.com/coffee_scratch_db",
  ssl: { rejectUnauthorized: false }
});

async function testConnection() {
  try {
    console.log('🔄 Testing database connection...');
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time, version() as db_version');
    console.log('✅ Database connected successfully!');
    console.log('🕒 Current database time:', result.rows[0].current_time);
    console.log('🗄️  Database version:', result.rows[0].db_version.split(' ')[0]);
    client.release();
    
    console.log('🔧 Testing table creation...');
    await pool.query('CREATE TABLE IF NOT EXISTS test_connection (id SERIAL, created_at TIMESTAMP DEFAULT NOW())');
    await pool.query('INSERT INTO test_connection DEFAULT VALUES');
    const testResult = await pool.query('SELECT COUNT(*) as count FROM test_connection');
    console.log(`📝 Test table has ${testResult.rows[0].count} rows`);
    await pool.query('DROP TABLE test_connection');
    console.log('🧹 Cleaned up test table');
    
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
  } finally {
    await pool.end();
  }
}

testConnection();