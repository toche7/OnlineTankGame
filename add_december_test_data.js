// Add test data for December 2025 using top 3 registered players
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function addDecemberTestData() {
  const client = await pool.connect();
  try {
    console.log('Getting top 3 registered players from January 2026...\n');
    
    // Get top 3 registered players from current month
    const playersResult = await client.query(`
      SELECT p.id, p.username
      FROM monthly_stats ms
      JOIN players p ON ms.player_id = p.id
      WHERE ms.month = '2026-01' AND p.google_id IS NOT NULL
      ORDER BY ms.wins DESC
      LIMIT 3
    `);
    
    if (playersResult.rows.length < 3) {
      console.log('Not enough registered players found. Need at least 3 registered players.');
      return;
    }
    
    const players = playersResult.rows;
    console.log('Selected players:');
    players.forEach((p, i) => console.log(`  ${i + 1}. ${p.username} (${p.id})`));
    console.log();
    
    // Wins for each player (3, 2, 1)
    const winsPerPlayer = [3, 2, 1];
    
    // December 2025 timestamp (mid-December)
    const decemberTimestamp = new Date('2025-12-15T12:00:00Z').getTime();
    
    console.log('Creating game history for December 2025...\n');
    
    for (let i = 0; i < players.length; i++) {
      const player = players[i];
      const targetWins = winsPerPlayer[i];
      const totalGames = targetWins + 2; // Each player plays wins + 2 losses
      
      console.log(`Player: ${player.username}`);
      console.log(`  - Games: ${totalGames} (${targetWins} wins, ${totalGames - targetWins} losses)`);
      
      // Create game records
      for (let gameNum = 0; gameNum < totalGames; gameNum++) {
        const isWin = gameNum < targetWins;
        const kills = Math.floor(Math.random() * 5) + 2; // 2-6 kills
        const deaths = Math.floor(Math.random() * 4) + 1; // 1-4 deaths
        const score = kills * 100 + (isWin ? 500 : 0);
        
        // Insert game record with timestamp in December
        await client.query(`
          INSERT INTO game_history (
            player_id, game_id, timestamp, result, kills, deaths, score, health, game_mode, reason
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
          player.id,
          `DEC${i}${gameNum}`, // Unique game ID
          decemberTimestamp + (gameNum * 3600000), // Spread games across December
          isWin ? 'win' : 'loss',
          kills,
          deaths,
          score,
          isWin ? 50 : 0,
          'multiplayer',
          isWin ? 'Victory!' : 'Defeated'
        ]);
      }
    }
    
    console.log('\n✅ Game history created for December 2025');
    
    // Recalculate monthly stats for December
    console.log('\nRecalculating December 2025 stats...\n');
    
    const decemberGames = await client.query(`
      SELECT 
        player_id,
        result,
        kills,
        deaths,
        score
      FROM game_history
      WHERE TO_CHAR(TO_TIMESTAMP(timestamp / 1000), 'YYYY-MM') = '2025-12'
    `);
    
    const monthlyData = {};
    
    for (const game of decemberGames.rows) {
      const key = game.player_id;
      
      if (!monthlyData[key]) {
        monthlyData[key] = {
          player_id: game.player_id,
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
      if (game.result === 'win' || game.result === 'won') {
        data.wins += 1;
      }
      data.kills += game.kills || 0;
      data.deaths += game.deaths || 0;
      data.total_score += game.score || 0;
      data.highest_kills = Math.max(data.highest_kills, game.kills || 0);
    }
    
    // Insert December stats
    for (const data of Object.values(monthlyData)) {
      await client.query(`
        INSERT INTO monthly_stats (
          player_id, month, games_played, wins, kills, deaths, total_score, highest_kills, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (player_id, month)
        DO UPDATE SET
          games_played = $3,
          wins = $4,
          kills = $5,
          deaths = $6,
          total_score = $7,
          highest_kills = $8,
          updated_at = NOW()
      `, [
        data.player_id,
        '2025-12',
        data.games_played,
        data.wins,
        data.kills,
        data.deaths,
        data.total_score,
        data.highest_kills
      ]);
    }
    
    // Show results
    const resultsQuery = await client.query(`
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
    `);
    
    console.log('✅ December 2025 stats created:');
    console.table(resultsQuery.rows);
    
  } catch (err) {
    console.error('❌ Error:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

addDecemberTestData()
  .then(() => {
    console.log('\n✅ December test data created successfully!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Failed to create December test data:', err);
    process.exit(1);
  });
