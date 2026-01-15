const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../database');

const router = express.Router();

// Max player name length
const MAX_NAME_LENGTH = 15;

// Rate limiter for auth operations
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: { error: 'Too many authentication attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Input validation helpers
function sanitizeUsername(name) {
  if (!name || typeof name !== 'string') return null;
  const trimmed = name.trim().replace(/[<>"'&]/g, '');
  return trimmed.length >= 2 && trimmed.length <= MAX_NAME_LENGTH ? trimmed : null;
}

// API route to get player data by playerId
router.get('/player/:playerId', async (req, res) => {
  try {
    const playerId = req.params.playerId;
    const playerData = await db.getPlayer(playerId);

    if (playerData) {
      // Also fetch raw data to check for google_id
      const rawData = await db.getPlayerRaw(playerId);
      const player = {
        ...playerData,
        googleId: rawData?.google_id || null,
      };
      res.json({ success: true, player });
    } else {
      res.json({ success: false, message: 'Player not found' });
    }
  } catch (error) {
    console.error('Error fetching player:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// API route to change player name
router.post('/change-name', authLimiter, async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const { newName } = req.body;
  const sanitized = sanitizeUsername(newName);
  if (!sanitized) {
    return res.status(400).json({
      error: `Name must be between 2 and ${MAX_NAME_LENGTH} characters and contain only valid characters`,
    });
  }
  try {
    // Check if name is already taken
    const isTaken = await db.isUsernameTaken(sanitized, req.user.id);
    if (isTaken) {
      return res.status(409).json({ error: 'Name already in use' });
    }
    // Update name
    await db.updatePlayerUsername(req.user.id, sanitized);
    res.json({ success: true, name: sanitized });
  } catch (err) {
    console.error('Error changing name:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API route to get last game for a player
router.get('/player/:playerId/lastGame', async (req, res) => {
  try {
    const playerId = req.params.playerId;
    const lastGame = await db.getLastGame(playerId);

    if (lastGame) {
      res.json({ success: true, lastGame });
    } else {
      res.json({ success: false, message: 'No games found' });
    }
  } catch (error) {
    console.error('Error fetching last game:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// API route to update player tank color
router.post('/player/updateColor', async (req, res) => {
  try {
    const { playerId, color } = req.body;

    if (!playerId) {
      return res.status(400).json({ success: false, message: 'Player ID required' });
    }

    await db.updatePlayerColor(playerId, color);
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating player color:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// API route to save game record
router.post('/player/saveGame', async (req, res) => {
  try {
    const { playerId, gameRecord } = req.body;
    
    if (!playerId || !gameRecord) {
      return res.status(400).json({ success: false, message: 'Missing playerId or gameRecord' });
    }
    
    const updatedPlayer = await db.saveGameRecord(playerId, gameRecord);
    res.json({ success: true, player: updatedPlayer });
  } catch (error) {
    console.error('Error saving game record:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Single Player Stats Routes

// Save single player game
router.post('/singleplayer/save', async (req, res) => {
  try {
    const { playerId, gameData } = req.body;
    
    console.log('📊 Saving single player game:', { playerId, mode: gameData?.mode, won: gameData?.won });
    
    if (!playerId || !gameData) {
      console.error('❌ Missing data:', { hasPlayerId: !!playerId, hasGameData: !!gameData });
      return res.status(400).json({ success: false, message: 'Missing playerId or gameData' });
    }
    
    await db.saveSinglePlayerGame(playerId, gameData);
    console.log('✅ Single player game saved successfully');
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error saving single player game:', error);
    res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
});

// Get single player stats for a player
router.get('/singleplayer/stats/:playerId', async (req, res) => {
  try {
    const playerId = req.params.playerId;
    const stats = await db.getSinglePlayerStats(playerId);
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Error fetching single player stats:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get single player leaderboard
router.get('/singleplayer/leaderboard', async (req, res) => {
  try {
    const mode = req.query.mode || null;
    const sortBy = req.query.sortBy || 'wins';
    const leaderboard = await db.getSinglePlayerLeaderboard(mode, sortBy);
    res.json({ success: true, leaderboard });
  } catch (error) {
    console.error('Error fetching single player leaderboard:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
