const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const PLAYERS_FILE = path.join(DATA_DIR, 'players.json');

// Ensure data directory exists
async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

// Load player stats from file
async function loadPlayers() {
  try {
    await ensureDataDir();
    const data = await fs.readFile(PLAYERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // If file doesn't exist, return empty players object
    return { players: {} };
  }
}

// Save player stats to file
async function savePlayers(data) {
  try {
    await ensureDataDir();
    await fs.writeFile(PLAYERS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving player data:', error);
  }
}

// Get or create player profile
async function getPlayer(playerId, username) {
  const data = await loadPlayers();
  
  if (!data.players[playerId]) {
    data.players[playerId] = {
      id: playerId,
      username: username || `Player_${playerId.substr(0, 6)}`,
      stats: {
        gamesPlayed: 0,
        wins: 0,
        kills: 0,
        deaths: 0,
        totalScore: 0,
        highestKills: 0,
        lastPlayed: Date.now()
      }
    };
  } else if (username && username !== data.players[playerId].username) {
    // Update username if provided and different
    data.players[playerId].username = username;
  }
  
  // Save the data to file
  await savePlayers(data);
  
  return data.players[playerId];
}

// Update player stats after a game
async function updatePlayerStats(playerId, gameStats) {
  const data = await loadPlayers();
  let player = data.players[playerId];
  
  // Create player if doesn't exist
  if (!player) {
    data.players[playerId] = {
      id: playerId,
      username: `Player_${playerId.substr(0, 6)}`,
      stats: {
        gamesPlayed: 0,
        wins: 0,
        kills: 0,
        deaths: 0,
        totalScore: 0,
        highestKills: 0,
        lastPlayed: Date.now()
      }
    };
    player = data.players[playerId];
  }
  
  player.stats.gamesPlayed += 1;
  player.stats.kills += gameStats.kills || 0;
  player.stats.deaths += gameStats.deaths || 0;
  player.stats.totalScore += gameStats.score || 0;
  player.stats.lastPlayed = Date.now();
  
  if (gameStats.isWinner) {
    player.stats.wins += 1;
  }
  
  if (gameStats.kills > player.stats.highestKills) {
    player.stats.highestKills = gameStats.kills;
  }
  
  await savePlayers(data);
  return player;
}

// Get leaderboard (top players)
async function getLeaderboard(sortBy = 'wins', limit = 50) {
  const data = await loadPlayers();
  const players = Object.values(data.players);
  
  // Sort players
  players.sort((a, b) => {
    switch (sortBy) {
      case 'wins':
        return b.stats.wins - a.stats.wins;
      case 'kills':
        return b.stats.kills - a.stats.kills;
      case 'score':
        return b.stats.totalScore - a.stats.totalScore;
      case 'winRate':
        const aRate = a.stats.gamesPlayed > 0 ? a.stats.wins / a.stats.gamesPlayed : 0;
        const bRate = b.stats.gamesPlayed > 0 ? b.stats.wins / b.stats.gamesPlayed : 0;
        return bRate - aRate;
      case 'kd':
        const aKD = a.stats.deaths > 0 ? a.stats.kills / a.stats.deaths : a.stats.kills;
        const bKD = b.stats.deaths > 0 ? b.stats.kills / b.stats.deaths : b.stats.kills;
        return bKD - aKD;
      default:
        return b.stats.wins - a.stats.wins;
    }
  });
  
  return players.slice(0, limit);
}

// Get player rank
async function getPlayerRank(playerId, sortBy = 'wins') {
  const leaderboard = await getLeaderboard(sortBy, 1000);
  const rank = leaderboard.findIndex(p => p.id === playerId);
  return rank >= 0 ? rank + 1 : null;
}

// Save individual game record for a player
async function saveGameRecord(playerId, gameRecord) {
  const data = await loadPlayers();
  let player = data.players[playerId];
  
  // Create player if doesn't exist
  if (!player) {
    player = {
      id: playerId,
      username: `Player_${playerId.substr(0, 6)}`,
      stats: {
        gamesPlayed: 0,
        wins: 0,
        kills: 0,
        deaths: 0,
        totalScore: 0,
        highestKills: 0,
        lastPlayed: Date.now()
      },
      gameHistory: []
    };
    data.players[playerId] = player;
  }
  
  // Initialize gameHistory if it doesn't exist
  if (!player.gameHistory) {
    player.gameHistory = [];
  }
  
  // Add new game record
  player.gameHistory.unshift({
    gameId: gameRecord.gameId,
    timestamp: gameRecord.timestamp || Date.now(),
    result: gameRecord.result, // 'win' or 'loss'
    kills: gameRecord.kills || 0,
    deaths: gameRecord.deaths || 0,
    score: gameRecord.score || 0,
    health: gameRecord.health || 0,
    gameMode: gameRecord.gameMode || 'multiplayer',
    reason: gameRecord.reason || 'Game ended'
  });
  
  // Keep only last 10 games
  if (player.gameHistory.length > 10) {
    player.gameHistory = player.gameHistory.slice(0, 10);
  }
  
  await savePlayers(data);
  return player;
}

// Get the last game played by a player
async function getLastGame(playerId) {
  const data = await loadPlayers();
  const player = data.players[playerId];
  
  if (!player || !player.gameHistory || player.gameHistory.length === 0) {
    return null;
  }
  
  return player.gameHistory[0];
}

module.exports = {
  loadPlayers,
  savePlayers,
  getPlayer,
  updatePlayerStats,
  getLeaderboard,
  getPlayerRank,
  saveGameRecord,
  getLastGame
};
