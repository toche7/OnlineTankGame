// Check if there's data for last month
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkLastMonth() {
  const client = await pool.connect();
  try {
    console.log('Checking for last month data (2025-12)...\n');
    
    // Check monthly_stats for December 2025
    const monthlyResult = await client.query(`
      SELECT 
        p.username,
        ms.month,
        ms.games_played,
        ms.wins,
        ms.kills,
        ms.deaths
      FROM monthly_stats ms
      JOIN players p ON ms.player_id = p.id
      WHERE ms.month = '2025-12'
      ORDER BY ms.wins DESC
      LIMIT 20
    `);
    
    console.log(`Found ${monthlyResult.rows.length} players with stats in December 2025:`);
    if (monthlyResult.rows.length > 0) {
      console.table(monthlyResult.rows);
    } else {
      console.log('No data for December 2025 in monthly_stats table.');
    }
    
    // Check if there are any games in game_history from December 2025
    const gamesResult = await client.query(`
      SELECT 
        COUNT(*) as game_count,
        COUNT(DISTINCT player_id) as player_count
      FROM game_history
      WHERE TO_CHAR(TO_TIMESTAMP(timestamp / 1000), 'YYYY-MM') = '2025-12'
    `);
    
    console.log('\nGame history for December 2025:');
    console.log(`- Total games: ${gamesResult.rows[0].game_count}`);
    console.log(`- Unique players: ${gamesResult.rows[0].player_count}`);
    
    // Show all available months
    const monthsResult = await client.query(`
      SELECT 
        month,
        COUNT(*) as player_count,
        SUM(games_played) as total_games
      FROM monthly_stats
      GROUP BY month
      ORDER BY month DESC
    `);
    
    console.log('\nAll available months in monthly_stats:');
    console.table(monthsResult.rows);
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

checkLastMonth();
