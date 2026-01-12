const crypto = require('crypto');

// Generate guest player name
function genGuestName() {
  return `Player_${crypto.randomInt(100000, 999999)}`;
}

// Input validation helpers
function sanitizeUsername(name) {
  if (!name || typeof name !== 'string') return null;
  const trimmed = name.trim().replace(/[<>"'&]/g, '');
  const MAX_NAME_LENGTH = 15;
  return trimmed.length >= 2 && trimmed.length <= MAX_NAME_LENGTH ? trimmed : null;
}

function sanitizeGameCode(code) {
  if (!code || typeof code !== 'string') return null;
  const upper = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return upper.length === 6 ? upper : null;
}

// Helper to generate unique message IDs
function genMessageId() {
  return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
}

function generateGameCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluded similar looking chars
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Helper function to sanitize tank data (remove circular references from AI controllers)
function sanitizeTank(tank) {
  return {
    id: tank.id,
    x: tank.x,
    y: tank.y,
    rotation: tank.rotation,
    turretRotation: tank.turretRotation,
    health: tank.health,
    velocityX: tank.velocityX,
    velocityY: tank.velocityY,
    score: tank.score,
    kills: tank.kills,
    livesRemaining: tank.livesRemaining,
    isAlive: tank.isAlive,
    ammo: tank.ammo,
    activeWeapon: tank.activeWeapon,
    activePowerup: tank.activePowerup,
    isAI: tank.isAI || false,
    aiDifficulty: tank.aiDifficulty || null,
    team: tank.team || null,
    username: tank.username,
    color: tank.color || null,
  };
}

// Helper function to sanitize all players in a lobby
function sanitizePlayers(players) {
  const sanitized = {};
  for (const playerId in players) {
    sanitized[playerId] = sanitizeTank(players[playerId]);
  }
  return sanitized;
}

// Helper to track significant player changes for delta broadcasting
function hasSignificantChange(oldData, newData, threshold = 0.5) {
  if (!oldData || !newData) return true;
  return (
    Math.abs(oldData.x - newData.x) > threshold ||
    Math.abs(oldData.y - newData.y) > threshold ||
    oldData.health !== newData.health ||
    oldData.isAlive !== newData.isAlive ||
    oldData.score !== newData.score
  );
}

module.exports = {
  genGuestName,
  sanitizeUsername,
  sanitizeGameCode,
  genMessageId,
  generateGameCode,
  sanitizeTank,
  sanitizePlayers,
  hasSignificantChange,
};
