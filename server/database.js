const { Pool } = require('pg');
const crypto = require('crypto');
require('dotenv').config();

// Max player name length (keep in sync with server)
const MAX_NAME_LENGTH = 15;

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Helper to generate guest player names
function genGuestName() {
  return `Player_${crypto.randomInt(100000, 999999)}`;
}

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
        google_id VARCHAR(255) UNIQUE,
        email VARCHAR(255),
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

    // Create monthly_stats table for monthly leaderboard
    await client.query(`
      CREATE TABLE IF NOT EXISTS monthly_stats (
        id SERIAL PRIMARY KEY,
        player_id VARCHAR(50) REFERENCES players(id) ON DELETE CASCADE,
        month VARCHAR(7) NOT NULL,
        games_played INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        kills INTEGER DEFAULT 0,
        deaths INTEGER DEFAULT 0,
        total_score INTEGER DEFAULT 0,
        highest_kills INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(player_id, month)
      )
    `);

    // Add new columns if they don't exist (for migration)
    await client.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE`);
    await client.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS email VARCHAR(255)`);

    // Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_players_username ON players(username)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_players_google_id ON players(google_id)
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
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_monthly_stats_month ON monthly_stats(month)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_monthly_stats_player_month ON monthly_stats(player_id, month)
    `);

    // Drop and recreate single_player_stats table with correct schema
    await client.query(`DROP TABLE IF EXISTS single_player_stats CASCADE`);
    console.log('🗑️  Dropped old single_player_stats table');
    
    await client.query(`
      CREATE TABLE single_player_stats (
        id SERIAL PRIMARY KEY,
        player_id VARCHAR(50) REFERENCES players(id) ON DELETE CASCADE,
        mode VARCHAR(20) NOT NULL,
        difficulty VARCHAR(10) NOT NULL,
        won BOOLEAN NOT NULL,
        time_seconds INTEGER NOT NULL,
        kills INTEGER DEFAULT 0,
        score INTEGER DEFAULT 0,
        health INTEGER DEFAULT 0,
        campaign VARCHAR(30),
        enemies_killed INTEGER,
        waves_completed INTEGER,
        targets_destroyed INTEGER,
        timestamp BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Created new single_player_stats table');

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sp_stats_player ON single_player_stats(player_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sp_stats_mode ON single_player_stats(mode)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sp_stats_timestamp ON single_player_stats(timestamp DESC)
    `);

    // Create global_chat_messages table
    await client.query(`
      CREATE TABLE IF NOT EXISTS global_chat_messages (
        id VARCHAR(50) PRIMARY KEY,
        player_id VARCHAR(50),
        player_name VARCHAR(100) NOT NULL,
        message TEXT NOT NULL,
        timestamp BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_timestamp ON global_chat_messages(timestamp DESC)
    `);

    console.log('✅ Database tables initialized successfully');
  } catch (err) {
    console.error('❌ Database initialization error:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Save single player game record
async function saveSinglePlayerGame(playerId, gameData) {
  const client = await pool.connect();
  try {
    console.log('💾 Inserting into database:', {
      playerId,
      mode: gameData.mode,
      difficulty: gameData.difficulty,
      won: gameData.won,
      time: gameData.time
    });
    
    await client.query(`
      INSERT INTO single_player_stats (
        player_id, mode, difficulty, won, time_seconds, kills, score, health,
        campaign, enemies_killed, waves_completed, targets_destroyed, timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
      playerId,
      gameData.mode,
      gameData.difficulty || 'normal',
      gameData.won,
      gameData.time,
      gameData.kills,
      gameData.score,
      gameData.health,
      gameData.campaign || null,
      gameData.enemiesKilled || null,
      gameData.wavesCompleted || null,
      gameData.targetsDestroyed || null,
      Date.now()
    ]);
    
    console.log(`✅ Saved single player game for ${playerId}: ${gameData.mode} - ${gameData.won ? 'Won' : 'Lost'}`);
  } catch (err) {
    console.error('❌ Error saving single player game:', err);
    console.error('Game data:', gameData);
    throw err;
  } finally {
    client.release();
  }
}

// Get single player stats summary for a player
async function getSinglePlayerStats(playerId) {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT
        COUNT(*) as total_games,
        SUM(CASE WHEN won THEN 1 ELSE 0 END) as wins,
        SUM(kills) as total_kills,
        SUM(score) as total_score,
        AVG(time_seconds) as avg_time,
        MAX(score) as best_score,
        MAX(kills) as best_kills,
        COUNT(DISTINCT mode) as modes_played,
        
        -- Mode-specific stats
        SUM(CASE WHEN mode = 'training' THEN 1 ELSE 0 END) as training_games,
        SUM(CASE WHEN mode = 'timeattack' THEN 1 ELSE 0 END) as timeattack_games,
        SUM(CASE WHEN mode = 'targetpractice' THEN 1 ELSE 0 END) as campaign_games,
        SUM(CASE WHEN mode = 'bossrush' THEN 1 ELSE 0 END) as bossrush_games,
        
        -- Campaign stats
        SUM(CASE WHEN mode = 'targetpractice' AND won THEN 1 ELSE 0 END) as campaigns_won,
        COUNT(DISTINCT campaign) as unique_campaigns,
        
        -- Best times
        MIN(CASE WHEN mode = 'timeattack' AND won THEN time_seconds END) as best_timeattack_time,
        MIN(CASE WHEN mode = 'bossrush' AND won THEN time_seconds END) as best_bossrush_time
      FROM single_player_stats
      WHERE player_id = $1
    `, [playerId]);
    
    return result.rows[0];
  } catch (err) {
    console.error('Error getting single player stats:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Get single player leaderboard
async function getSinglePlayerLeaderboard(mode = null, sortBy = 'wins') {
  const client = await pool.connect();
  try {
    let orderClause;
    switch (sortBy) {
      case 'score':
        orderClause = 'total_score DESC, total_wins DESC';
        break;
      case 'time':
        orderClause = 'best_time ASC NULLS LAST, total_wins DESC';
        break;
      default:
        orderClause = 'total_wins DESC, total_score DESC';
    }
    
    const modeFilter = mode ? 'AND sp.mode = $1' : '';
    const params = mode ? [mode] : [];
    
    const query = `
      SELECT
        p.id,
        p.username,
        p.google_id IS NOT NULL as is_google,
        COUNT(*) as total_games,
        SUM(CASE WHEN sp.won THEN 1 ELSE 0 END) as total_wins,
        SUM(sp.kills) as total_kills,
        SUM(sp.score) as total_score,
        MAX(sp.score) as best_score,
        MIN(CASE WHEN sp.won THEN sp.time_seconds END) as best_time,
        AVG(sp.time_seconds) as avg_time
      FROM players p
      JOIN single_player_stats sp ON p.id = sp.player_id
      WHERE 1=1 ${modeFilter}
      GROUP BY p.id, p.username, p.google_id
      ORDER BY ${orderClause}
      LIMIT 100
    `;
    
    const result = await client.query(query, params);
    return result.rows;
  } catch (err) {
    console.error('Error getting single player leaderboard:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Get current month in YYYY-MM format
function getCurrentMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// Get last month in YYYY-MM format
function getLastMonth() {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const year = lastMonth.getFullYear();
  const month = String(lastMonth.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// Update monthly stats for a player
async function updateMonthlyStats(playerId, gameRecord) {
  const client = await pool.connect();
  try {
    const currentMonth = getCurrentMonth();
    // Fix: Check for 'win' instead of 'won' to match the value saved in saveGameRecord
    const won = (gameRecord.result === 'win' || gameRecord.result === 'won') ? 1 : 0;
    
    // Upsert monthly stats
    await client.query(`
      INSERT INTO monthly_stats (
        player_id, month, games_played, wins, kills, deaths, total_score, highest_kills, updated_at
      ) VALUES ($1, $2, 1, $3, $4, $5, $6, $4, NOW())
      ON CONFLICT (player_id, month)
      DO UPDATE SET
        games_played = monthly_stats.games_played + 1,
        wins = monthly_stats.wins + $3,
        kills = monthly_stats.kills + $4,
        deaths = monthly_stats.deaths + $5,
        total_score = monthly_stats.total_score + $6,
        highest_kills = GREATEST(monthly_stats.highest_kills, $4),
        updated_at = NOW()
    `, [playerId, currentMonth, won, gameRecord.kills, gameRecord.deaths, gameRecord.score]);
  } catch (err) {
    console.error('Error updating monthly stats:', err);
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
          const defaultUsername = username ? String(username).trim().slice(0, MAX_NAME_LENGTH) : genGuestName();
        await client.query(`
          INSERT INTO players (id, google_id, email, username, tank_color, games_played, wins, kills, deaths, total_score, highest_kills, last_played)
          VALUES ($1, NULL, NULL, $2, NULL, 0, 0, 0, 0, 0, 0, $3)
        `, [playerId, defaultUsername, Date.now()]);
      
      result = await client.query('SELECT * FROM players WHERE id = $1', [playerId]);
    } else if (username && username !== result.rows[0].username) {
      // Update username if provided and different (trim and enforce max length)
      const safeUsername = String(username).trim().slice(0, MAX_NAME_LENGTH);
      await client.query('UPDATE players SET username = $1, updated_at = NOW() WHERE id = $2', [safeUsername, playerId]);
      result = await client.query('SELECT * FROM players WHERE id = $1', [playerId]);
    }
    
    // Transform to match current format
    const player = result.rows[0];
    return {
      id: player.id,
      username: player.username,
      tankColor: player.tank_color,
      isGoogle: !!player.google_id,
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
        INSERT INTO players (id, google_id, email, username, tank_color, games_played, wins, kills, deaths, total_score, highest_kills, last_played)
        VALUES ($1, NULL, NULL, $2, NULL, 0, 0, 0, 0, 0, 0, $3)
      `, [playerId, genGuestName(), Date.now()]);
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
async function getLeaderboard(sortBy = 'wins', limit = 100) {
  const client = await pool.connect();
  try {
    // Whitelist valid sort options to prevent SQL injection
    const validSorts = {
      'wins': 'wins DESC',
      'kills': 'kills DESC',
      'score': 'total_score DESC',
      'winRate': 'CASE WHEN games_played > 0 THEN CAST(wins AS FLOAT) / games_played ELSE 0 END DESC',
      'kd': 'CASE WHEN deaths > 0 THEN CAST(kills AS FLOAT) / deaths ELSE kills END DESC'
    };
    
    const orderBy = validSorts[sortBy] || validSorts['wins'];
    
    const result = await client.query(`
      SELECT * FROM players 
      WHERE games_played > 0
      ORDER BY ${orderBy}
      LIMIT $1
    `, [limit]);
    
    // Transform to match current format and include Google login flag
    return result.rows.map(player => ({
      id: player.id,
      username: player.username,
      tankColor: player.tank_color,
      isGoogle: !!player.google_id,
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

// Get leaderboard for logged-in users only
async function getLoggedInLeaderboard(sortBy = 'wins', limit = 50) {
  const client = await pool.connect();
  try {
    const validSorts = {
      'wins': 'wins DESC',
      'kills': 'kills DESC',
      'score': 'total_score DESC',
      'winRate': 'CASE WHEN games_played > 0 THEN CAST(wins AS FLOAT) / games_played ELSE 0 END DESC',
      'kd': 'CASE WHEN deaths > 0 THEN CAST(kills AS FLOAT) / deaths ELSE kills END DESC'
    };
    
    const orderBy = validSorts[sortBy] || validSorts['wins'];
    
    const result = await client.query(`
      SELECT * FROM players 
      WHERE games_played > 0 AND google_id IS NOT NULL
      ORDER BY ${orderBy}
      LIMIT $1
    `, [limit]);
    
    return result.rows.map(player => ({
      id: player.id,
      username: player.username,
      tankColor: player.tank_color,
      isGoogle: true,
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
    console.error('Error in getLoggedInLeaderboard:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Get leaderboard for guest users only
async function getGuestLeaderboard(sortBy = 'wins', limit = 50) {
  const client = await pool.connect();
  try {
    const validSorts = {
      'wins': 'wins DESC',
      'kills': 'kills DESC',
      'score': 'total_score DESC',
      'winRate': 'CASE WHEN games_played > 0 THEN CAST(wins AS FLOAT) / games_played ELSE 0 END DESC',
      'kd': 'CASE WHEN deaths > 0 THEN CAST(kills AS FLOAT) / deaths ELSE kills END DESC'
    };
    
    const orderBy = validSorts[sortBy] || validSorts['wins'];
    
    const result = await client.query(`
      SELECT * FROM players 
      WHERE games_played > 0 AND google_id IS NULL
      ORDER BY ${orderBy}
      LIMIT $1
    `, [limit]);
    
    return result.rows.map(player => ({
      id: player.id,
      username: player.username,
      tankColor: player.tank_color,
      isGoogle: false,
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
    console.error('Error in getGuestLeaderboard:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Get monthly leaderboard for registered players
async function getMonthlyLeaderboard(sortBy = 'wins', limit = 50, month = null) {
  const client = await pool.connect();
  try {
    const targetMonth = month || getCurrentMonth();
    const validSorts = {
      'wins': 'ms.wins DESC, ms.kills DESC, ms.total_score DESC',
      'kills': 'ms.kills DESC, ms.wins DESC, ms.total_score DESC',
      'score': 'ms.total_score DESC, ms.wins DESC, ms.kills DESC',
      'winRate': 'CASE WHEN ms.games_played > 0 THEN CAST(ms.wins AS FLOAT) / ms.games_played ELSE 0 END DESC, ms.wins DESC, ms.kills DESC',
      'kd': 'CASE WHEN ms.deaths > 0 THEN CAST(ms.kills AS FLOAT) / ms.deaths ELSE ms.kills END DESC, ms.kills DESC, ms.wins DESC'
    };
    
    const orderBy = validSorts[sortBy] || validSorts['wins'];
    
    const result = await client.query(`
      SELECT 
        p.id,
        p.username,
        p.tank_color,
        ms.games_played,
        ms.wins,
        ms.kills,
        ms.deaths,
        ms.total_score,
        ms.highest_kills
      FROM monthly_stats ms
      JOIN players p ON ms.player_id = p.id
      WHERE ms.month = $1 AND p.google_id IS NOT NULL AND ms.games_played > 0
      ORDER BY ${orderBy}
      LIMIT $2
    `, [targetMonth, limit]);
    
    return result.rows.map(player => ({
      id: player.id,
      username: player.username,
      tankColor: player.tank_color,
      isGoogle: true,
      stats: {
        gamesPlayed: player.games_played,
        wins: player.wins,
        kills: player.kills,
        deaths: player.deaths,
        totalScore: player.total_score,
        highestKills: player.highest_kills,
        lastPlayed: null
      }
    }));
  } catch (err) {
    console.error('Error in getMonthlyLeaderboard:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Get last month's leaderboard for registered players
async function getLastMonthLeaderboard(sortBy = 'wins', limit = 50) {
  return getMonthlyLeaderboard(sortBy, limit, getLastMonth());
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

// Get player rank based on user type (logged-in or guest)
async function getPlayerRankByType(playerId, sortBy = 'wins') {
  const client = await pool.connect();
  try {
    // First check if player is logged in or guest
    const playerCheck = await client.query(
      'SELECT google_id FROM players WHERE id = $1',
      [playerId]
    );
    
    if (playerCheck.rows.length === 0) {
      return null;
    }
    
    const isLoggedIn = !!playerCheck.rows[0].google_id;
    
    // Use only the primary sort attribute for ranking to match client-side behavior
    let rankBy;
    let orderBy;
    switch (sortBy) {
      case 'wins':
        rankBy = 'wins DESC';
        orderBy = 'wins DESC, kills DESC, total_score DESC';
        break;
      case 'kills':
        rankBy = 'kills DESC';
        orderBy = 'kills DESC, wins DESC, total_score DESC';
        break;
      case 'score':
        rankBy = 'total_score DESC';
        orderBy = 'total_score DESC, wins DESC, kills DESC';
        break;
      case 'winRate':
        rankBy = 'CASE WHEN games_played > 0 THEN CAST(wins AS FLOAT) / games_played ELSE 0 END DESC';
        orderBy = 'CASE WHEN games_played > 0 THEN CAST(wins AS FLOAT) / games_played ELSE 0 END DESC, wins DESC, kills DESC';
        break;
      case 'kd':
        rankBy = 'CASE WHEN deaths > 0 THEN CAST(kills AS FLOAT) / deaths ELSE kills END DESC';
        orderBy = 'CASE WHEN deaths > 0 THEN CAST(kills AS FLOAT) / deaths ELSE kills END DESC, kills DESC, wins DESC';
        break;
      default:
        rankBy = 'wins DESC';
        orderBy = 'wins DESC, kills DESC, total_score DESC';
    }
    
    // Filter by user type
    const typeFilter = isLoggedIn ? 'google_id IS NOT NULL' : 'google_id IS NULL';
    
    const result = await client.query(`
      WITH ranked_players AS (
        SELECT id, RANK() OVER (ORDER BY ${rankBy}) as rank
        FROM players
        WHERE games_played > 0 AND ${typeFilter}
        ORDER BY ${orderBy}
      )
      SELECT rank FROM ranked_players WHERE id = $1
    `, [playerId]);
    
    return result.rows.length > 0 ? result.rows[0].rank : null;
  } catch (err) {
    console.error('Error in getPlayerRankByType:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Get player's monthly rank
async function getPlayerMonthlyRank(playerId, sortBy = 'wins') {
  const client = await pool.connect();
  try {
    const currentMonth = getCurrentMonth();
    
    // Check if player exists and is logged in
    const playerCheck = await client.query(
      'SELECT google_id FROM players WHERE id = $1',
      [playerId]
    );
    
    if (playerCheck.rows.length === 0 || !playerCheck.rows[0].google_id) {
      return null;
    }
    
    // Use only the primary sort attribute for ranking to match client-side behavior
    const validRanks = {
      'wins': 'ms.wins DESC',
      'kills': 'ms.kills DESC',
      'score': 'ms.total_score DESC',
      'winRate': 'CASE WHEN ms.games_played > 0 THEN CAST(ms.wins AS FLOAT) / ms.games_played ELSE 0 END DESC',
      'kd': 'CASE WHEN ms.deaths > 0 THEN CAST(ms.kills AS FLOAT) / ms.deaths ELSE ms.kills END DESC'
    };
    
    const validSorts = {
      'wins': 'ms.wins DESC, ms.kills DESC, ms.total_score DESC',
      'kills': 'ms.kills DESC, ms.wins DESC, ms.total_score DESC',
      'score': 'ms.total_score DESC, ms.wins DESC, ms.kills DESC',
      'winRate': 'CASE WHEN ms.games_played > 0 THEN CAST(ms.wins AS FLOAT) / ms.games_played ELSE 0 END DESC, ms.wins DESC, ms.kills DESC',
      'kd': 'CASE WHEN ms.deaths > 0 THEN CAST(ms.kills AS FLOAT) / ms.deaths ELSE ms.kills END DESC, ms.kills DESC, ms.wins DESC'
    };
    
    const rankBy = validRanks[sortBy] || validRanks['wins'];
    const orderBy = validSorts[sortBy] || validSorts['wins'];
    
    const result = await client.query(`
      WITH ranked_players AS (
        SELECT ms.player_id, RANK() OVER (ORDER BY ${rankBy}) as rank
        FROM monthly_stats ms
        JOIN players p ON ms.player_id = p.id
        WHERE ms.month = $1 AND p.google_id IS NOT NULL AND ms.games_played > 0
        ORDER BY ${orderBy}
      )
      SELECT rank FROM ranked_players WHERE player_id = $2
    `, [currentMonth, playerId]);
    
    return result.rows.length > 0 ? result.rows[0].rank : null;
  } catch (err) {
    console.error('Error in getPlayerMonthlyRank:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Get player's monthly stats
async function getPlayerMonthlyStats(playerId) {
  const client = await pool.connect();
  try {
    const currentMonth = getCurrentMonth();
    const result = await client.query(
      'SELECT * FROM monthly_stats WHERE player_id = $1 AND month = $2',
      [playerId, currentMonth]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0];
    return {
      gamesPlayed: row.games_played,
      wins: row.wins,
      kills: row.kills,
      deaths: row.deaths,
      totalScore: row.total_score,
      highestKills: row.highest_kills
    };
  } catch (err) {
    console.error('Error in getPlayerMonthlyStats:', err);
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
        INSERT INTO players (id, google_id, email, username, tank_color, games_played, wins, kills, deaths, total_score, highest_kills, last_played)
        VALUES ($1, NULL, NULL, $2, NULL, 0, 0, 0, 0, 0, 0, $3)
      `, [playerId, genGuestName(), Date.now()]);
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
    
    // Update monthly stats
    await updateMonthlyStats(playerId, gameRecord);
    
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
          INSERT INTO players (id, google_id, email, username, tank_color, games_played, wins, kills, deaths, total_score, highest_kills, last_played)
          VALUES ($1, NULL, NULL, $2, $3, 0, 0, 0, 0, 0, 0, $4)
        `, [playerId, genGuestName(), color, Date.now()]);
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

// Get player by Google ID
async function getPlayerByGoogleId(googleId) {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM players WHERE google_id = $1', [googleId]);
    if (result.rows.length === 0) {
      return null;
    }
    const player = result.rows[0];
    return {
      id: player.id,
      google_id: player.google_id,
      email: player.email,
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
    console.error('Error in getPlayerByGoogleId:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Return raw DB row for server-side checks
async function getPlayerRaw(playerId) {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM players WHERE id = $1', [playerId]);
    return result.rows.length ? result.rows[0] : null;
  } catch (err) {
    console.error('Error in getPlayerRaw:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Create new player with Google auth
async function createPlayer(playerData) {
  const client = await pool.connect();
  try {
    const safeUsername = playerData.username ? String(playerData.username).trim().slice(0, MAX_NAME_LENGTH) : genGuestName();
    await client.query(`
      INSERT INTO players (id, google_id, email, username, tank_color, games_played, wins, kills, deaths, total_score, highest_kills, last_played)
      VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, $8, $9, $10, $11)
    `, [
      playerData.id,
      playerData.google_id,
      playerData.email,
      safeUsername,
      playerData.stats.gamesPlayed,
      playerData.stats.wins,
      playerData.stats.kills,
      playerData.stats.deaths,
      playerData.stats.totalScore,
      playerData.stats.highestKills,
      playerData.stats.lastPlayed
    ]);
    return await getPlayer(playerData.id);
  } catch (err) {
    console.error('Error in createPlayer:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Update player username
async function updatePlayerUsername(playerId, newUsername) {
  const client = await pool.connect();
  try {
    const safeUsername = newUsername ? String(newUsername).trim().slice(0, MAX_NAME_LENGTH) : newUsername;
    await client.query('UPDATE players SET username = $1, updated_at = NOW() WHERE id = $2', [safeUsername, playerId]);
  } catch (err) {
    console.error('Error updating username:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Check if username is taken by another player
async function isUsernameTaken(username, excludePlayerId) {
  const client = await pool.connect();
  try {
    const safe = username ? String(username).trim().slice(0, MAX_NAME_LENGTH) : username;
    const result = await client.query('SELECT id FROM players WHERE username = $1 AND id != $2', [safe, excludePlayerId]);
    return result.rows.length > 0;
  } catch (err) {
    console.error('Error checking username:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Save global chat message to database
async function saveGlobalChatMessage(messageId, playerId, playerName, message, timestamp) {
  const client = await pool.connect();
  try {
    await client.query(
      'INSERT INTO global_chat_messages (id, player_id, player_name, message, timestamp) VALUES ($1, $2, $3, $4, $5)',
      [messageId, playerId, playerName, message, timestamp]
    );
  } catch (err) {
    console.error('Error saving chat message:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Get recent global chat messages (limit to most recent N messages)
async function getGlobalChatHistory(limit = 200) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT id, player_id AS "playerId", player_name AS "playerName", message, timestamp FROM global_chat_messages ORDER BY timestamp DESC LIMIT $1',
      [limit]
    );
    // Return in chronological order (oldest first)
    return result.rows.reverse();
  } catch (err) {
    console.error('Error loading chat history:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Delete a global chat message by ID
async function deleteGlobalChatMessage(messageId) {
  const client = await pool.connect();
  try {
    await client.query('DELETE FROM global_chat_messages WHERE id = $1', [messageId]);
  } catch (err) {
    console.error('Error deleting chat message:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Clean up old chat messages (keep only recent N messages)
async function cleanOldChatMessages(keepLimit = 200) {
  const client = await pool.connect();
  try {
    // Delete messages beyond the limit
    await client.query(`
      DELETE FROM global_chat_messages
      WHERE id NOT IN (
        SELECT id FROM global_chat_messages
        ORDER BY timestamp DESC
        LIMIT $1
      )
    `, [keepLimit]);
  } catch (err) {
    console.error('Error cleaning old chat messages:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Save global chat message to database
async function saveGlobalChatMessage(messageId, playerId, playerName, message, timestamp) {
  const client = await pool.connect();
  try {
    await client.query(
      'INSERT INTO global_chat_messages (id, player_id, player_name, message, timestamp) VALUES ($1, $2, $3, $4, $5)',
      [messageId, playerId, playerName, message, timestamp]
    );
  } catch (err) {
    console.error('Error saving chat message:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Get recent global chat messages (limit to most recent N messages)
async function getGlobalChatHistory(limit = 200) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT id, player_id AS "playerId", player_name AS "playerName", message, timestamp FROM global_chat_messages ORDER BY timestamp DESC LIMIT $1',
      [limit]
    );
    // Return in chronological order (oldest first)
    return result.rows.reverse();
  } catch (err) {
    console.error('Error loading chat history:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Delete a global chat message by ID
async function deleteGlobalChatMessage(messageId) {
  const client = await pool.connect();
  try {
    await client.query('DELETE FROM global_chat_messages WHERE id = $1', [messageId]);
  } catch (err) {
    console.error('Error deleting chat message:', err);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  initDatabase,
  getPlayer,
  updatePlayerStats,
  getLeaderboard,
  getLoggedInLeaderboard,
  getGuestLeaderboard,
  getMonthlyLeaderboard,
  getLastMonthLeaderboard,
  getPlayerRank,
  getPlayerRankByType,
  getPlayerMonthlyRank,
  getPlayerMonthlyStats,
  saveGameRecord,
  getLastGame,
  updatePlayerColor,
  getPlayerByGoogleId,
  createPlayer,
  updatePlayerUsername,
  isUsernameTaken,
  // Single player functions
  saveSinglePlayerGame,
  getSinglePlayerStats,
  getSinglePlayerLeaderboard,
  // Global chat functions
  saveGlobalChatMessage,
  getGlobalChatHistory,
  deleteGlobalChatMessage,
  cleanOldChatMessages,
  // raw access for server-side checks
  getPlayerRaw,
  closePool
};
