// Script to recalculate monthly stats from game history
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function fixMonthlyStats() {
  const client = await pool.connect();
  try {
    console.log('Starting monthly stats recalculation...');
    
    // Get all game history records
    const gamesResult = await client.query(`
      SELECT 
        player_id,
        TO_CHAR(TO_TIMESTAMP(timestamp / 1000), 'YYYY-MM') as month,
        result,
        kills,
        deaths,
        score
      FROM game_history
      ORDER BY player_id, month
    `);
    
    console.log(`Found ${gamesResult.rows.length} game records to process`);
    
    // Group by player and month
    const monthlyData = {};
    
    for (const game of gamesResult.rows) {
      const key = `${game.player_id}_${game.month}`;
      
      if (!monthlyData[key]) {
        monthlyData[key] = {
          player_id: game.player_id,
          month: game.month,
          games_played: 0,
          wins: 0,
          kills: 0,
          deaths: 0,
          total_score: 0,
          highest_kills: 0
        };
      }
      
      const data = monthlyData[key];
      data.games_played += 1;
      // Fix: Check for 'win' instead of 'won'
      if (game.result === 'win' || game.result === 'won') {
        data.wins += 1;
      }
      data.kills += game.kills || 0;
      data.deaths += game.deaths || 0;
      data.total_score += game.score || 0;
      data.highest_kills = Math.max(data.highest_kills, game.kills || 0);
    }
    
    console.log(`Processing ${Object.keys(monthlyData).length} monthly records...`);
    
    // Clear existing monthly_stats
    await client.query('DELETE FROM monthly_stats');
    console.log('Cleared existing monthly stats');
    
    // Insert recalculated data
    let inserted = 0;
    for (const data of Object.values(monthlyData)) {
      await client.query(`
        INSERT INTO monthly_stats (
          player_id, month, games_played, wins, kills, deaths, total_score, highest_kills, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      `, [
        data.player_id,
        data.month,
        data.games_played,
        data.wins,
        data.kills,
        data.deaths,
        data.total_score,
        data.highest_kills
      ]);
      inserted++;
    }
    
    console.log(`✅ Successfully recalculated ${inserted} monthly stat records`);
    
    // Show some sample data
    const sampleResult = await client.query(`
      SELECT 
        p.username,
        ms.month,
        ms.games_played,
        ms.wins,
        ms.kills,
        ms.deaths
      FROM monthly_stats ms
      JOIN players p ON ms.player_id = p.id
      ORDER BY ms.month DESC, ms.wins DESC
      LIMIT 10
    `);
    
    console.log('\nSample of recalculated data:');
    console.table(sampleResult.rows);
    
  } catch (err) {
    console.error('❌ Error fixing monthly stats:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

fixMonthlyStats()
  .then(() => {
    console.log('\n✅ Monthly stats fix completed!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Monthly stats fix failed:', err);
    process.exit(1);
  });
