const { Pool } = require('pg');
require('dotenv').config();

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Connection event handlers
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL pool error:', err);
});

// Initialize database tables
async function initDatabase() {
  const client = await pool.connect();
  try {
    // Create players table
    await client.query(`
      CREATE TABLE IF NOT EXISTS players (
        id VARCHAR(50) PRIMARY KEY,
        username VARCHAR(100) NOT NULL,
        tank_color VARCHAR(7),
        games_played INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        kills INTEGER DEFAULT 0,
        deaths INTEGER DEFAULT 0,
        total_score INTEGER DEFAULT 0,
        highest_kills INTEGER DEFAULT 0,
        last_played BIGINT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create game_history table
    await client.query(`
      CREATE TABLE IF NOT EXISTS game_history (
        id SERIAL PRIMARY KEY,
        player_id VARCHAR(50) REFERENCES players(id) ON DELETE CASCADE,
        game_id VARCHAR(10) NOT NULL,
        timestamp BIGINT NOT NULL,
        result VARCHAR(10) NOT NULL,
        kills INTEGER DEFAULT 0,
        deaths INTEGER DEFAULT 0,
        score INTEGER DEFAULT 0,
        health INTEGER DEFAULT 0,
        game_mode VARCHAR(20),
        reason TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_players_username ON players(username)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_players_wins ON players(wins DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_players_kills ON players(kills DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_game_history_player ON game_history(player_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_game_history_timestamp ON game_history(timestamp DESC)
    `);

    console.log('✅ Database tables initialized successfully');
  } catch (err) {
    console.error('❌ Database initialization error:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Get or create player profile
async function getPlayer(playerId, username) {
  const client = await pool.connect();
  try {
    // Check if player exists
    let result = await client.query('SELECT * FROM players WHERE id = $1', [playerId]);
    
    if (result.rows.length === 0) {
      // Create new player
      const defaultUsername = username || `Player_${playerId.substr(0, 6)}`;
      await client.query(`
        INSERT INTO players (id, username, tank_color, games_played, wins, kills, deaths, total_score, highest_kills, last_played)
        VALUES ($1, $2, NULL, 0, 0, 0, 0, 0, 0, $3)
      `, [playerId, defaultUsername, Date.now()]);
      
      result = await client.query('SELECT * FROM players WHERE id = $1', [playerId]);
    } else if (username && username !== result.rows[0].username) {
      // Update username if provided and different
      await client.query('UPDATE players SET username = $1, updated_at = NOW() WHERE id = $2', [username, playerId]);
      result = await client.query('SELECT * FROM players WHERE id = $1', [playerId]);
    }
    
    // Transform to match current format
    const player = result.rows[0];
    return {
      id: player.id,
      username: player.username,
      tankColor: player.tank_color,
      stats: {
        gamesPlayed: player.games_played,
        wins: player.wins,
        kills: player.kills,
        deaths: player.deaths,
        totalScore: player.total_score,
        highestKills: player.highest_kills,
        lastPlayed: player.last_played
      }
    };
  } catch (err) {
    console.error('Error in getPlayer:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Update player stats after a game
async function updatePlayerStats(playerId, gameStats) {
  const client = await pool.connect();
  try {
    // First, ensure player exists
    let result = await client.query('SELECT * FROM players WHERE id = $1', [playerId]);
    
    if (result.rows.length === 0) {
      // Create player if doesn't exist
      await client.query(`
        INSERT INTO players (id, username, tank_color, games_played, wins, kills, deaths, total_score, highest_kills, last_played)
        VALUES ($1, $2, NULL, 0, 0, 0, 0, 0, 0, $3)
      `, [playerId, `Player_${playerId.substr(0, 6)}`, Date.now()]);
      result = await client.query('SELECT * FROM players WHERE id = $1', [playerId]);
    }
    
    const player = result.rows[0];
    
    // Calculate new values
    const newGamesPlayed = player.games_played + 1;
    const newKills = player.kills + (gameStats.kills || 0);
    const newDeaths = player.deaths + (gameStats.deaths || 0);
    const newScore = player.total_score + (gameStats.score || 0);
    const newWins = player.wins + (gameStats.isWinner ? 1 : 0);
    const newHighestKills = Math.max(player.highest_kills, gameStats.kills || 0);
    
    // Update player stats
    await client.query(`
      UPDATE players 
      SET games_played = $1, wins = $2, kills = $3, deaths = $4, 
          total_score = $5, highest_kills = $6, last_played = $7, updated_at = NOW()
      WHERE id = $8
    `, [newGamesPlayed, newWins, newKills, newDeaths, newScore, newHighestKills, Date.now(), playerId]);
    
    // Get updated player
    result = await client.query('SELECT * FROM players WHERE id = $1', [playerId]);
    const updatedPlayer = result.rows[0];
    
    return {
      id: updatedPlayer.id,
      username: updatedPlayer.username,
      tankColor: updatedPlayer.tank_color,
      stats: {
        gamesPlayed: updatedPlayer.games_played,
        wins: updatedPlayer.wins,
        kills: updatedPlayer.kills,
        deaths: updatedPlayer.deaths,
        totalScore: updatedPlayer.total_score,
        highestKills: updatedPlayer.highest_kills,
        lastPlayed: updatedPlayer.last_played
      }
    };
  } catch (err) {
    console.error('Error in updatePlayerStats:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Get leaderboard (top players)
async function getLeaderboard(sortBy = 'wins', limit = 50) {
  const client = await pool.connect();
  try {
    let orderBy;
    switch (sortBy) {
      case 'wins':
        orderBy = 'wins DESC';
        break;
      case 'kills':
        orderBy = 'kills DESC';
        break;
      case 'score':
        orderBy = 'total_score DESC';
        break;
      case 'winRate':
        orderBy = 'CASE WHEN games_played > 0 THEN CAST(wins AS FLOAT) / games_played ELSE 0 END DESC';
        break;
      case 'kd':
        orderBy = 'CASE WHEN deaths > 0 THEN CAST(kills AS FLOAT) / deaths ELSE kills END DESC';
        break;
      default:
        orderBy = 'wins DESC';
    }
    
    const result = await client.query(`
      SELECT * FROM players 
      WHERE games_played > 0
      ORDER BY ${orderBy}
      LIMIT $1
    `, [limit]);
    
    // Transform to match current format
    return result.rows.map(player => ({
      id: player.id,
      username: player.username,
      tankColor: player.tank_color,
      stats: {
        gamesPlayed: player.games_played,
        wins: player.wins,
        kills: player.kills,
        deaths: player.deaths,
        totalScore: player.total_score,
        highestKills: player.highest_kills,
        lastPlayed: player.last_played
      }
    }));
  } catch (err) {
    console.error('Error in getLeaderboard:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Get player rank
async function getPlayerRank(playerId, sortBy = 'wins') {
  const client = await pool.connect();
  try {
    let orderBy;
    switch (sortBy) {
      case 'wins':
        orderBy = 'wins DESC';
        break;
      case 'kills':
        orderBy = 'kills DESC';
        break;
      case 'score':
        orderBy = 'total_score DESC';
        break;
      case 'winRate':
        orderBy = 'CASE WHEN games_played > 0 THEN CAST(wins AS FLOAT) / games_played ELSE 0 END DESC';
        break;
      case 'kd':
        orderBy = 'CASE WHEN deaths > 0 THEN CAST(kills AS FLOAT) / deaths ELSE kills END DESC';
        break;
      default:
        orderBy = 'wins DESC';
    }
    
    const result = await client.query(`
      WITH ranked_players AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY ${orderBy}) as rank
        FROM players
        WHERE games_played > 0
      )
      SELECT rank FROM ranked_players WHERE id = $1
    `, [playerId]);
    
    return result.rows.length > 0 ? result.rows[0].rank : null;
  } catch (err) {
    console.error('Error in getPlayerRank:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Save individual game record for a player
async function saveGameRecord(playerId, gameRecord) {
  const client = await pool.connect();
  try {
    // First, ensure player exists
    let result = await client.query('SELECT * FROM players WHERE id = $1', [playerId]);
    
    if (result.rows.length === 0) {
      // Create player if doesn't exist
      await client.query(`
        INSERT INTO players (id, username, tank_color, games_played, wins, kills, deaths, total_score, highest_kills, last_played)
        VALUES ($1, $2, NULL, 0, 0, 0, 0, 0, 0, $3)
      `, [playerId, `Player_${playerId.substr(0, 6)}`, Date.now()]);
    }
    
    // Insert game record
    await client.query(`
      INSERT INTO game_history (player_id, game_id, timestamp, result, kills, deaths, score, health, game_mode, reason)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      playerId,
      gameRecord.gameId,
      gameRecord.timestamp || Date.now(),
      gameRecord.result,
      gameRecord.kills || 0,
      gameRecord.deaths || 0,
      gameRecord.score || 0,
      gameRecord.health || 0,
      gameRecord.gameMode || 'multiplayer',
      gameRecord.reason || 'Game ended'
    ]);
    
    // Get player with updated info
    result = await client.query('SELECT * FROM players WHERE id = $1', [playerId]);
    const player = result.rows[0];
    
    return {
      id: player.id,
      username: player.username,
      tankColor: player.tank_color,
      stats: {
        gamesPlayed: player.games_played,
        wins: player.wins,
        kills: player.kills,
        deaths: player.deaths,
        totalScore: player.total_score,
        highestKills: player.highest_kills,
        lastPlayed: player.last_played
      }
    };
  } catch (err) {
    console.error('Error in saveGameRecord:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Get the last game played by a player
async function getLastGame(playerId) {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT * FROM game_history 
      WHERE player_id = $1 
      ORDER BY timestamp DESC 
      LIMIT 1
    `, [playerId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const game = result.rows[0];
    return {
      gameId: game.game_id,
      timestamp: game.timestamp,
      result: game.result,
      kills: game.kills,
      deaths: game.deaths,
      score: game.score,
      health: game.health,
      gameMode: game.game_mode,
      reason: game.reason
    };
  } catch (err) {
    console.error('Error in getLastGame:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Update player tank color preference
async function updatePlayerColor(playerId, color) {
  const client = await pool.connect();
  try {
    // Check if player exists
    let result = await client.query('SELECT * FROM players WHERE id = $1', [playerId]);
    
    if (result.rows.length === 0) {
      // Create player if doesn't exist
      await client.query(`
        INSERT INTO players (id, username, tank_color, games_played, wins, kills, deaths, total_score, highest_kills, last_played)
        VALUES ($1, $2, $3, 0, 0, 0, 0, 0, 0, $4)
      `, [playerId, `Player_${playerId.substr(0, 6)}`, color, Date.now()]);
    } else {
      // Update color
      await client.query('UPDATE players SET tank_color = $1, updated_at = NOW() WHERE id = $2', [color, playerId]);
    }
    
    // Get updated player
    result = await client.query('SELECT * FROM players WHERE id = $1', [playerId]);
    const player = result.rows[0];
    
    return {
      id: player.id,
      username: player.username,
      tankColor: player.tank_color,
      stats: {
        gamesPlayed: player.games_played,
        wins: player.wins,
        kills: player.kills,
        deaths: player.deaths,
        totalScore: player.total_score,
        highestKills: player.highest_kills,
        lastPlayed: player.last_played
      }
    };
  } catch (err) {
    console.error('Error in updatePlayerColor:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Graceful shutdown
async function closePool() {
  await pool.end();
  console.log('PostgreSQL connection pool closed');
}

module.exports = {
  initDatabase,
  getPlayer,
  updatePlayerStats,
  getLeaderboard,
  getPlayerRank,
  saveGameRecord,
  getLastGame,
  updatePlayerColor,
  closePool
};
