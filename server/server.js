const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const db = require('./database');
const { version: VERSION } = require('../package.json');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files from client folder
app.use(express.static(path.join(__dirname, '../client')));

// Add body parser middleware
app.use(express.json());

// API route to get game version
app.get('/api/version', (req, res) => {
  res.json({ version: VERSION });
});

// API route to get last game for a player
app.get('/api/player/:playerId/lastGame', async (req, res) => {
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
app.post('/api/player/updateColor', async (req, res) => {
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

// Game state
const players = {};
const projectiles = [];
const obstacles = [];
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
const TANK_SIZE = 20;
const TANK_SPEED = 5;
const TANK_ROTATION_SPEED = 5;
const PROJECTILE_SPEED = 8;
const PROJECTILE_SIZE = 5;
const TANK_MAX_HEALTH = 100;
const UPDATE_RATE = 60; // updates per second

// Weapon types configuration
const WEAPON_TYPES = {
  RAPID_FIRE: { name: 'Rapid Fire', duration: 8000, color: '#ff4444', damage: 7 },
  TRIPLE_SHOT: { name: 'Triple Shot', duration: 10000, color: '#44ff44', damage: 8 },
  LASER: { name: 'Laser', duration: 12000, color: '#4444ff', damage: 15 },
  ROCKETS: { name: 'Rockets', duration: 15000, color: '#ff44ff', damage: 20 }
};

// Power-up types
const POWERUP_TYPES = {
  SPEED_BOOST: { name: 'Speed Boost', duration: 8000, color: '#00d2ff', multiplier: 2.0 }, // Changed from 1.5 to 2.0
  SHIELD: { name: 'Shield', duration: 10000, color: '#a8e6cf' },
  HEALTH: { name: 'Health Pack', duration: 0, color: '#ff6b9d', healAmount: 50 },
  INVINCIBILITY: { name: 'Invincibility', duration: 5000, color: '#ffd93d' },
  AMMO_REFILL: { name: 'Ammo Refill', duration: 0, color: '#ff8c42', ammoRefill: 20 }
}
const GAME_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds
const MAX_PLAYERS = 10;
const MAX_CONCURRENT_GAMES = 5; // Maximum number of games that can run simultaneously

// Game state management
let gameStartTime = null;
let gameState = 'waiting'; // 'waiting', 'running', 'finished'
let gameWinner = null;
const playersReadyToRestart = new Set(); // Track which players are ready to restart

// Lobby management
const lobbies = {}; // { gameCode: { players: {}, host: socketId, state: 'waiting'|'playing'|'finished' } }

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
    color: tank.color || null
  };
}

// Helper function to sanitize all players in a lobby
function sanitizePlayers(players) {
  const sanitized = {};
  Object.keys(players).forEach(playerId => {
    sanitized[playerId] = sanitizeTank(players[playerId]);
  });
  return sanitized;
}

// Obstacle class
class Obstacle {
  constructor(x, y, width, height) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  collidesWith(x, y, size) {
    return x + size > this.x &&
           x - size < this.x + this.width &&
           y + size > this.y &&
           y - size < this.y + this.height;
  }
}

// Generate random obstacles for the map with guaranteed pathways
function generateObstacles() {
  const obsArray = [];
  const numObstacles = Math.random() * 6 + 8; // 8-14 obstacles
  const MIN_GAP = TANK_SIZE * 3; // Minimum gap between obstacles (3x tank width)
  
  for (let i = 0; i < numObstacles; i++) {
    let x, y, width, height, valid;
    let attempts = 0;
    const maxAttempts = 50;
    
    // Keep trying until we find a valid position
    do {
      valid = true;
      attempts++;
      width = Math.random() * 30 + 35; // 35-65 width
      height = Math.random() * 30 + 35; // 35-65 height
      x = Math.random() * (GAME_WIDTH - width);
      y = Math.random() * (GAME_HEIGHT - height);
      
      // Check if too close to edges (keep safe margin)
      if (x < 60 || x + width > GAME_WIDTH - 60 || 
          y < 60 || y + height > GAME_HEIGHT - 60) {
        valid = false;
        continue;
      }
      
      // Check if overlaps with existing obstacles with guaranteed gap
      for (let obs of obsArray) {
        // Check for collision with padding
        if (!(x + width + MIN_GAP < obs.x || x - MIN_GAP > obs.x + obs.width ||
              y + height + MIN_GAP < obs.y || y - MIN_GAP > obs.y + obs.height)) {
          valid = false;
          break;
        }
      }
    } while (!valid && attempts < maxAttempts);
    
    // Only add obstacle if we found a valid position
    if (valid) {
      obsArray.push(new Obstacle(x, y, width, height));
    }
  }
  return obsArray;
}

const generatedObstacles = generateObstacles();

// AI Controller class
class AIController {
  constructor(difficulty = 'medium') {
    this.difficulty = difficulty;
    this.decisionTimer = 0;
    this.decisionInterval = this.getDifficultySettings().decisionInterval;
    this.target = null;
    this.targetPickup = null;
    this.state = 'hunting'; // 'hunting', 'fleeing', 'collecting'
  }
  
  getDifficultySettings() {
    const settings = {
      easy: {
        decisionInterval: 1000, // 1 second between decisions
        aimAccuracy: 0.3, // 30% accuracy
        reactionTime: 500,
        aggressiveness: 0.3,
        pickupPriority: 0.2,
        shootingDelay: 800
      },
      medium: {
        decisionInterval: 500,
        aimAccuracy: 0.65,
        reactionTime: 300,
        aggressiveness: 0.6,
        pickupPriority: 0.5,
        shootingDelay: 400
      },
      hard: {
        decisionInterval: 250,
        aimAccuracy: 0.9,
        reactionTime: 100,
        aggressiveness: 0.9,
        pickupPriority: 0.7,
        shootingDelay: 200
      }
    };
    return settings[this.difficulty] || settings.medium;
  }
  
  update(aiTank, lobby, gameCode, io) {
    if (!aiTank.isAlive) return;
    
    const now = Date.now();
    const settings = this.getDifficultySettings();
    
    // Make decisions at intervals based on difficulty
    if (!this.lastDecisionTime || now - this.lastDecisionTime >= settings.decisionInterval) {
      this.makeDecision(aiTank, lobby);
      this.lastDecisionTime = now;
    }
    
    // Execute current behavior
    switch (this.state) {
      case 'hunting':
        this.hunt(aiTank, lobby, settings);
        break;
      case 'fleeing':
        this.flee(aiTank, lobby, settings);
        break;
      case 'collecting':
        this.collectPickup(aiTank, lobby, settings);
        break;
    }
    
    // Shooting logic
    if (this.target && Math.random() < settings.aggressiveness) {
      this.shoot(aiTank, lobby, gameCode, io, settings);
    }
  }
  
  makeDecision(aiTank, lobby) {
    const settings = this.getDifficultySettings();
    
    // Assess danger
    if (aiTank.health < 30) {
      this.state = 'fleeing';
      return;
    }
    
    // Find nearest enemy (skip teammates in co-op mode)
    let nearestEnemy = null;
    let nearestDistance = Infinity;
    
    Object.values(lobby.gamePlayers).forEach(player => {
      // Skip self and dead players
      if (player.id === aiTank.id || !player.isAlive) return;
      
      // Skip teammates (same team in co-op mode)
      if (aiTank.team && player.team === aiTank.team) return;
      
      const dx = player.x - aiTank.x;
      const dy = player.y - aiTank.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < nearestDistance) {
        nearestDistance = dist;
        nearestEnemy = player;
      }
    });
    
    this.target = nearestEnemy;
    
    // Check for pickups if health/weapons needed
    if (Math.random() < settings.pickupPriority) {
      const nearestPickup = this.findNearestPickup(aiTank, lobby);
      if (nearestPickup && nearestPickup.distance < 200) {
        this.targetPickup = nearestPickup;
        this.state = 'collecting';
        return;
      }
    }
    
    this.state = 'hunting';
  }
  
  hunt(aiTank, lobby, settings) {
    if (!this.target) return;
    
    // Calculate direction to target with some randomness for lower difficulties
    const dx = this.target.x - aiTank.x;
    const dy = this.target.y - aiTank.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance === 0) return;
    
    // Normalize and add noise based on difficulty
    let moveX = dx / distance;
    let moveY = dy / distance;
    
    // Add randomness for lower difficulties
    const noise = (1 - settings.aimAccuracy) * 2;
    moveX += (Math.random() - 0.5) * noise;
    moveY += (Math.random() - 0.5) * noise;
    
    // Apply speed
    const speedMultiplier = lobby.tankSpeed || TANK_SPEED;
    const speed = TANK_SPEED * (speedMultiplier / TANK_SPEED);
    
    // Check for obstacles in path and avoid
    const avoidance = this.avoidObstacles(aiTank, moveX, moveY, lobby.gameObstacles);
    moveX = avoidance.x;
    moveY = avoidance.y;
    
    aiTank.velocityX = moveX * speed;
    aiTank.velocityY = moveY * speed;
    
    // Update rotation to face target
    aiTank.rotation = Math.atan2(dy, dx);
  }
  
  flee(aiTank, lobby, settings) {
    // Find nearest health pickup
    const healthPickup = this.findNearestPickup(aiTank, lobby, 'HEALTH');
    
    if (healthPickup) {
      this.targetPickup = healthPickup;
      this.state = 'collecting';
      return;
    }
    
    // Move away from nearest enemy
    if (this.target) {
      const dx = aiTank.x - this.target.x;
      const dy = aiTank.y - this.target.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance > 0) {
        let moveX = dx / distance;
        let moveY = dy / distance;
        
        // Avoid obstacles
        const avoidance = this.avoidObstacles(aiTank, moveX, moveY, lobby.gameObstacles);
        moveX = avoidance.x;
        moveY = avoidance.y;
        
        const speedMultiplier = lobby.tankSpeed || TANK_SPEED;
        const speed = TANK_SPEED * (speedMultiplier / TANK_SPEED);
        
        aiTank.velocityX = moveX * speed;
        aiTank.velocityY = moveY * speed;
        aiTank.rotation = Math.atan2(moveY, moveX);
      }
    }
  }
  
  collectPickup(aiTank, lobby, settings) {
    if (!this.targetPickup) {
      this.state = 'hunting';
      return;
    }
    
    const dx = this.targetPickup.x - aiTank.x;
    const dy = this.targetPickup.y - aiTank.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance === 0) {
      this.state = 'hunting';
      return;
    }
    
    let moveX = dx / distance;
    let moveY = dy / distance;
    
    // Avoid obstacles
    const avoidance = this.avoidObstacles(aiTank, moveX, moveY, lobby.gameObstacles);
    moveX = avoidance.x;
    moveY = avoidance.y;
    
    const speedMultiplier = lobby.tankSpeed || TANK_SPEED;
    const speed = TANK_SPEED * (speedMultiplier / TANK_SPEED);
    
    aiTank.velocityX = moveX * speed;
    aiTank.velocityY = moveY * speed;
    aiTank.rotation = Math.atan2(dy, dx);
  }
  
  shoot(aiTank, lobby, gameCode, io, settings) {
    if (!this.target) return;
    
    const now = Date.now();
    if (this.lastShot && now - this.lastShot < settings.shootingDelay) return;
    
    // Check limited ammo
    if (lobby.limitedAmmo && aiTank.ammo <= 0) return;
    
    // Calculate distance to target
    const dx = this.target.x - aiTank.x;
    const dy = this.target.y - aiTank.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Only shoot if target is within reasonable range and has line of sight
    if (distance > 400 || !this.hasLineOfSight(aiTank, this.target, lobby.gameObstacles)) return;
    
    // Aim with accuracy based on difficulty
    let targetAngle = Math.atan2(dy, dx);
    const aimError = (1 - settings.aimAccuracy) * Math.PI / 6; // Up to 30 degrees error
    targetAngle += (Math.random() - 0.5) * aimError;
    
    aiTank.rotation = targetAngle;
    
    // Create projectile
    const barrelLength = TANK_SIZE + 5;
    const projectile = new Projectile(
      aiTank.x + Math.cos(aiTank.rotation) * barrelLength,
      aiTank.y + Math.sin(aiTank.rotation) * barrelLength,
      aiTank.rotation,
      aiTank.id,
      aiTank.activeWeapon
    );
    
    lobby.gameProjectiles.push(projectile);
    this.lastShot = now;
    
    // Handle limited ammo
    if (lobby.limitedAmmo) {
      aiTank.ammo--;
    }
    
    // Handle special weapons (triple shot, etc.)
    if (aiTank.activeWeapon === 'TRIPLE_SHOT') {
      const angleOffset = Math.PI / 12; // 15 degrees
      
      const projectile2 = new Projectile(
        aiTank.x + Math.cos(aiTank.rotation - angleOffset) * barrelLength,
        aiTank.y + Math.sin(aiTank.rotation - angleOffset) * barrelLength,
        aiTank.rotation - angleOffset,
        aiTank.id,
        aiTank.activeWeapon
      );
      
      const projectile3 = new Projectile(
        aiTank.x + Math.cos(aiTank.rotation + angleOffset) * barrelLength,
        aiTank.y + Math.sin(aiTank.rotation + angleOffset) * barrelLength,
        aiTank.rotation + angleOffset,
        aiTank.id,
        aiTank.activeWeapon
      );
      
      lobby.gameProjectiles.push(projectile2, projectile3);
    }
  }
  
  findNearestPickup(aiTank, lobby, type = null) {
    let nearest = null;
    let nearestDistance = Infinity;
    
    const checkPickups = (pickups) => {
      pickups.forEach(pickup => {
        if (type && pickup.type !== type) return;
        
        const dx = pickup.x - aiTank.x;
        const dy = pickup.y - aiTank.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < nearestDistance) {
          nearestDistance = dist;
          nearest = { ...pickup, distance: dist };
        }
      });
    };
    
    if (lobby.gameWeapons) checkPickups(lobby.gameWeapons);
    if (lobby.gamePowerups) checkPickups(lobby.gamePowerups);
    
    return nearest;
  }
  
  avoidObstacles(aiTank, moveX, moveY, obstacles) {
    const lookAhead = 40;
    const futureX = aiTank.x + moveX * lookAhead;
    const futureY = aiTank.y + moveY * lookAhead;
    
    for (let obs of obstacles) {
      if (obs.collidesWith(futureX, futureY, TANK_SIZE)) {
        // Turn perpendicular to obstacle
        return { x: -moveY, y: moveX };
      }
    }
    
    return { x: moveX, y: moveY };
  }
  
  hasLineOfSight(from, to, obstacles) {
    const steps = 20;
    const dx = (to.x - from.x) / steps;
    const dy = (to.y - from.y) / steps;
    
    for (let i = 0; i < steps; i++) {
      const x = from.x + dx * i;
      const y = from.y + dy * i;
      
      for (let obs of obstacles) {
        if (obs.collidesWith(x, y, 5)) {
          return false;
        }
      }
    }
    
    return true;
  }
}

// Helper function to find valid spawn position (not on obstacles or other tanks)
function findValidSpawnPosition(obstacles, existingTanks, excludeTankId = null) {
  const MIN_DISTANCE_BETWEEN_TANKS = TANK_SIZE * 3; // Minimum distance between tanks
  let validSpawn = false;
  let x, y;
  let attempts = 0;
  const maxAttempts = 100;
  
  while (!validSpawn && attempts < maxAttempts) {
    x = Math.random() * GAME_WIDTH;
    y = Math.random() * GAME_HEIGHT;
    validSpawn = true;
    
    // Check collision with obstacles
    if (obstacles) {
      for (let obs of obstacles) {
        if (obs.collidesWith(x, y, TANK_SIZE)) {
          validSpawn = false;
          break;
        }
      }
    }
    
    // Check distance from other tanks
    if (validSpawn && existingTanks) {
      for (let tankId in existingTanks) {
        // Skip the tank we're spawning (for respawn case)
        if (tankId === excludeTankId) continue;
        
        const otherTank = existingTanks[tankId];
        const dx = otherTank.x - x;
        const dy = otherTank.y - y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < MIN_DISTANCE_BETWEEN_TANKS) {
          validSpawn = false;
          break;
        }
      }
    }
    
    attempts++;
  }
  
  return { x, y, valid: validSpawn };
}

// Player class
class Tank {
  constructor(id, obstacles, isAI = false, aiDifficulty = 'medium', persistentPlayerId = null, username = null, team = null, color = null) {
    this.id = id; // Socket ID for real-time communication
    this.persistentPlayerId = persistentPlayerId || id; // Persistent player ID for stats
    this.username = username || `Player_${id.substr(0, 6)}`;
    this.color = color; // Custom tank color (null = use default green/red)
    this.isAI = isAI;
    this.team = team; // 'human' or 'ai' for co-op mode, null for free-for-all
    
    // AI-specific properties
    if (isAI) {
      this.aiController = new AIController(aiDifficulty);
      this.aiDifficulty = aiDifficulty;
    }
    
    // Find valid spawn position (not on obstacles, away from other tanks)
    // Note: existingTanks is not available during construction, so only check obstacles
    const spawnPos = findValidSpawnPosition(obstacles, null, null);
    this.x = spawnPos.x;
    this.y = spawnPos.y;
    
    this.rotation = 0;
    this.turretRotation = 0; // Separate rotation for turret (aiming)
    this.health = TANK_MAX_HEALTH;
    this.velocityX = 0;
    this.velocityY = 0;
    this.score = 0;
    this.kills = 0;
    this.livesRemaining = 3;
    this.isAlive = true; // false = spectating (can't move/shoot but visible)
    this.ammo = 20; // Limited ammo mode
    this.lastAmmoRegen = Date.now();
  }
}

// Projectile class
class Projectile {
  constructor(x, y, rotation, playerId, weaponType = null) {
    this.x = x;
    this.y = y;
    this.rotation = rotation;
    this.playerId = playerId;
    this.weaponType = weaponType; // Type of weapon used (RAPID_FIRE, TRIPLE_SHOT, etc.)
    this.velocityX = Math.cos(rotation) * PROJECTILE_SPEED;
    this.velocityY = Math.sin(rotation) * PROJECTILE_SPEED;
  }

  update() {
    this.x += this.velocityX;
    this.y += this.velocityY;
  }

  isOutOfBounds() {
    return this.x < 0 || this.x > GAME_WIDTH || this.y < 0 || this.y > GAME_HEIGHT;
  }
}

// Check win conditions for a specific lobby
async function checkWinConditions(gameCode) {
  if (!gameCode || !lobbies[gameCode]) return false;
  
  const lobby = lobbies[gameCode];
  if (lobby.state !== 'playing') return false;
  
  // Check if only 1 player alive (early win condition)
  // For co-op mode, check if one team is eliminated
  if (lobby.gameMode === 'ai_coop') {
    const aliveHumans = Object.values(lobby.gamePlayers).filter(p => p.team === 'human' && p.isAlive);
    const aliveAI = Object.values(lobby.gamePlayers).filter(p => p.team === 'ai' && p.isAlive);
    
    // Don't end game if no humans have joined yet (they're still loading)
    const totalHumans = Object.values(lobby.gamePlayers).filter(p => p.team === 'human').length;
    if (totalHumans === 0) {
      return false; // Wait for human players to join
    }
    
    if (aliveHumans.length === 0 || aliveAI.length === 0) {
      lobby.state = 'waiting';
      const humanTeamWon = aliveHumans.length > 0;
      lobby.gameWinner = humanTeamWon ? 'HUMAN_TEAM' : 'AI_TEAM';
      
      // Save stats for all human players (co-op: all humans share win/loss)
      const reason = humanTeamWon ? 'Human team eliminated all AI bots!' : 'AI team eliminated all humans!';
      await saveGameStats(gameCode, lobby.gameWinner, reason);
      
      lobby.players = {};
      if (lobby.gameSocketIds) {
        lobby.gameSocketIds.clear();
      }
      
      io.to(gameCode).emit('gameEnded', {
        winner: lobby.gameWinner,
        reason: humanTeamWon ? 'Human team eliminated all AI bots!' : 'AI team eliminated all humans!',
        survivors: humanTeamWon ? aliveHumans.length : aliveAI.length,
        topKills: humanTeamWon ? Math.max(...aliveHumans.map(p => p.kills)) : 0,
        returnToMenu: true
      });
      
      broadcastGameBrowserStatus();
      return true;
    }
  } else if (lobby.gameMode === 'team_pvp') {
    // Team vs Team PvP: check if one team is eliminated
    const aliveRedTeam = Object.values(lobby.gamePlayers).filter(p => p.team === 'team_a' && p.isAlive);
    const aliveBlueTeam = Object.values(lobby.gamePlayers).filter(p => p.team === 'team_b' && p.isAlive);
    
    // Don't end game if teams haven't fully loaded
    const totalRedTeam = Object.values(lobby.gamePlayers).filter(p => p.team === 'team_a').length;
    const totalBlueTeam = Object.values(lobby.gamePlayers).filter(p => p.team === 'team_b').length;
    if (totalRedTeam === 0 || totalBlueTeam === 0) {
      return false; // Wait for both teams to join
    }
    
    if (aliveRedTeam.length === 0 || aliveBlueTeam.length === 0) {
      lobby.state = 'waiting';
      const redTeamWon = aliveRedTeam.length > 0;
      lobby.gameWinner = redTeamWon ? 'TEAM_A' : 'TEAM_B';
      
      // Save stats for all players
      const reason = redTeamWon ? 'Team A eliminated all Team B players!' : 'Team B eliminated all Team A players!';
      await saveGameStats(gameCode, lobby.gameWinner, reason);
      
      lobby.players = {};
      if (lobby.gameSocketIds) {
        lobby.gameSocketIds.clear();
      }
      
      io.to(gameCode).emit('gameEnded', {
        winner: lobby.gameWinner,
        reason: redTeamWon ? 'Team A eliminated all Team B players!' : 'Team B eliminated all Team A players!',
        survivors: redTeamWon ? aliveRedTeam.length : aliveBlueTeam.length,
        topKills: redTeamWon ? Math.max(...aliveRedTeam.map(p => p.kills)) : Math.max(...aliveBlueTeam.map(p => p.kills)),
        returnToMenu: true
      });
      
      broadcastGameBrowserStatus();
      return true;
    }
  } else {
    // Regular free-for-all mode
    // Count human players (exclude AI)
    const humanPlayers = Object.values(lobby.gamePlayers).filter(p => !p.isAI);
    const aliveHumanPlayers = humanPlayers.filter(p => p.isAlive);
    
    // End game if:
    // 1. Multiple human players started, and only 1 alive remains
    // 2. OR if there are multiple players total and only 1 alive (could be AI)
    const shouldEndGame = (humanPlayers.length > 1 && aliveHumanPlayers.length === 1) ||
                          (Object.keys(lobby.gamePlayers).length > 1 && 
                           Object.values(lobby.gamePlayers).filter(p => p.isAlive).length === 1);
    
    if (shouldEndGame) {
      const alivePlayers = Object.values(lobby.gamePlayers).filter(p => p.isAlive);
      if (alivePlayers.length === 1) {
        lobby.state = 'waiting'; // Reset to waiting so players can start new game
        lobby.gameWinner = alivePlayers[0].id;
      
        // Save player stats
        await saveGameStats(gameCode, lobby.gameWinner, 'Last player standing!');
        
        // Clear old player socket IDs - they will rejoin with new IDs
        lobby.players = {};
        // Keep the hostGameSocketId so we can identify the host when they rejoin
        // Clear the game socket IDs set for next game
        if (lobby.gameSocketIds) {
          lobby.gameSocketIds.clear();
        }
        
        io.to(gameCode).emit('gameEnded', {
          winner: lobby.gameWinner,
          reason: 'Last player standing!',
          survivors: 1,
          topKills: alivePlayers[0].kills,
          returnToMenu: true
        });
        
        // Broadcast game browser status update
        broadcastGameBrowserStatus();
        
        return true;
      }
    }
  }
  
  // Check if time limit reached (5 minutes)
  if (lobby.gameStartTime && Date.now() - lobby.gameStartTime >= GAME_DURATION) {
    lobby.state = 'waiting';
    
    // Find winner by most kills
    const allPlayers = Object.values(lobby.gamePlayers);
    let topPlayer = null;
    let topKills = -1;
    
    for (let player of allPlayers) {
      if (player.kills > topKills) {
        topKills = player.kills;
        topPlayer = player;
      }
    }
    
    lobby.gameWinner = topPlayer ? topPlayer.id : null;
    
    // Save player stats
    await saveGameStats(gameCode, lobby.gameWinner, 'Time limit reached! Winner has most kills.');
    
    // Clear old player socket IDs - they will rejoin with new IDs
    lobby.players = {};
    // Keep the hostGameSocketId so we can identify the host when they rejoin
    // Clear the game socket IDs set for next game
    if (lobby.gameSocketIds) {
      lobby.gameSocketIds.clear();
    }
    
    io.to(gameCode).emit('gameEnded', {
      winner: lobby.gameWinner,
      reason: 'Time limit reached! Winner has most kills.',
      survivors: allPlayers.length,
      topKills: topKills,
      returnToMenu: true
    });
    
    // Broadcast game browser status update
    broadcastGameBrowserStatus();
    
    return true;
  }
  
  return false;
}

// Save player stats after game ends
async function saveGameStats(gameCode, winnerId, gameEndReason = 'Game ended') {
  const lobby = lobbies[gameCode];
  if (!lobby || !lobby.gamePlayers) return;
  
  // Get game mode from lobby settings
  const gameMode = lobby.gameMode || 'ai_solo';
  
  // Save stats for all players (excluding AI)
  const players = Object.values(lobby.gamePlayers).filter(p => !p.isAI);
  
  for (const player of players) {
    try {
      // Calculate deaths (3 lives - remaining lives)
      const deaths = 3 - player.livesRemaining + (player.isAlive ? 0 : 1);
      
      // For team-based modes, check if player's team won
      let isWinner = false;
      if (winnerId === 'HUMAN_TEAM') {
        isWinner = player.team === 'human';
      } else if (winnerId === 'AI_TEAM') {
        isWinner = false; // Humans never win when AI team wins
      } else if (winnerId === 'TEAM_A') {
        isWinner = player.team === 'team_a';
      } else if (winnerId === 'TEAM_B') {
        isWinner = player.team === 'team_b';
      } else {
        isWinner = player.id === winnerId;
      }
      
      // Use persistent player ID for stats
      await db.updatePlayerStats(player.persistentPlayerId, {
        kills: player.kills || 0,
        deaths: deaths,
        score: player.score || 0,
        isWinner: isWinner
      });
      
      // Save individual game record
      await db.saveGameRecord(player.persistentPlayerId, {
        gameId: gameCode,
        timestamp: Date.now(),
        result: isWinner ? 'win' : 'loss',
        kills: player.kills || 0,
        deaths: deaths,
        score: player.score || 0,
        health: player.health || 0,
        gameMode: gameMode,
        reason: gameEndReason
      });
      
      console.log(`Saved stats for player ${player.username} (${player.persistentPlayerId}): ${player.kills} kills, ${deaths} deaths, score: ${player.score}, winner: ${isWinner}`);
    } catch (error) {
      console.error(`Error saving stats for player ${player.persistentPlayerId}:`, error);
    }
  }
}


// Broadcast game browser status to all clients
function broadcastGameBrowserStatus() {
  const playingGames = Object.values(lobbies).filter(l => l.state === 'playing').length;
  const waitingLobbies = Object.values(lobbies).filter(l => l.state === 'waiting').length;
  
  const gamesList = Object.keys(lobbies).map(code => ({
    code: code,
    state: lobbies[code].state,
    playerCount: Object.keys(lobbies[code].players).length
  }));
  
  io.emit('gameBrowserStatus', {
    playing: playingGames,
    waiting: waitingLobbies,
    games: gamesList
  });
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);
  
  // Send game browser status when requested
  socket.on('requestGameBrowserStatus', () => {
    const playingGames = Object.values(lobbies).filter(l => l.state === 'playing').length;
    const waitingLobbies = Object.values(lobbies).filter(l => l.state === 'waiting').length;
    
    const gamesList = Object.keys(lobbies).map(code => ({
      code: code,
      state: lobbies[code].state,
      playerCount: Object.keys(lobbies[code].players).length
    }));
    
    socket.emit('gameBrowserStatus', {
      playing: playingGames,
      waiting: waitingLobbies,
      games: gamesList
    });
  });
  
  // Lobby event handlers
  socket.on('createGame', async (data) => {
    const playerId = data?.playerId || socket.id; // Fallback to socket ID if no player ID
    const username = data?.username || `Player_${playerId.substr(0, 6)}`;
    const tankColor = data?.tankColor || null;
    
    // Register/update player in database
    await db.getPlayer(playerId, username);
    
    // Check if we've reached the maximum number of concurrent games
    const activeGames = Object.values(lobbies).filter(lobby => lobby.state === 'playing').length;
    if (activeGames >= MAX_CONCURRENT_GAMES) {
      socket.emit('lobbyError', { 
        message: `Server is at capacity! Maximum ${MAX_CONCURRENT_GAMES} games can run at the same time. Please wait for a game to finish.` 
      });
      return;
    }
    
    const gameCode = generateGameCode();
    lobbies[gameCode] = {
      players: {},
      host: socket.id,
      originalHost: socket.id,
      originalHostPlayerId: playerId, // Store persistent player ID
      state: 'waiting',
      gameStartTime: null,
      gameWinner: null,
      gameMode: 'ai_solo', // Default game mode
      // Per-lobby game state
      gamePlayers: {}, // In-game player tanks
      gameProjectiles: [],
      gameObstacles: [],
      playersReadyToRestart: new Set()
    };
    
    lobbies[gameCode].players[socket.id] = {
      id: socket.id,
      playerId: playerId,
      username: username,
      tankColor: tankColor,
      isHost: true
    };
    
    socket.join(gameCode);
    socket.gameCode = gameCode;
    
    socket.emit('gameCreated', {
      gameCode: gameCode,
      players: lobbies[gameCode].players,
      gameMode: lobbies[gameCode].gameMode
    });
    
    // Broadcast game browser status update to all connected clients
    broadcastGameBrowserStatus();
    
    console.log(`Game ${gameCode} created by ${username} (${socket.id})`);
  });
  
  socket.on('joinGame', (data) => {
    const gameCode = data.gameCode.toUpperCase();
    const playerId = data?.playerId || socket.id; // Fallback to socket ID if no player ID
    const username = data?.username || `Player_${playerId.substr(0, 6)}`;
    const tankColor = data?.tankColor || null;
    
    if (!lobbies[gameCode]) {
      socket.emit('lobbyError', { message: 'Game not found!' });
      return;
    }
    
    if (lobbies[gameCode].state === 'playing') {
      socket.emit('gameAlreadyStarted');
      return;
    }
    
    if (Object.keys(lobbies[gameCode].players).length >= MAX_PLAYERS) {
      socket.emit('lobbyError', { message: 'Game is full!' });
      return;
    }
    
    lobbies[gameCode].players[socket.id] = {
      id: socket.id,
      playerId: playerId,
      username: username,
      tankColor: tankColor,
      isHost: false
    };
    
    socket.join(gameCode);
    socket.gameCode = gameCode;
    
    socket.emit('gameJoined', {
      gameCode: gameCode,
      players: lobbies[gameCode].players,
      gameMode: lobbies[gameCode].gameMode || 'ai_solo'
    });
    
    // Notify other players in game
    socket.to(gameCode).emit('playerJoinedGame', {
      playerId: socket.id,
      players: lobbies[gameCode].players
    });
    
    console.log(`Player ${socket.id} joined game ${gameCode}`);
  });
  
  socket.on('rejoinLobby', (data) => {
    const gameCode = data.gameCode.toUpperCase();
    
    if (!lobbies[gameCode]) {
      socket.emit('lobbyError', { message: 'Game not found!' });
      return;
    }
    
    console.log(`\n=== REJOIN DEBUG ===`);
    console.log(`Player ${socket.id} rejoining game ${gameCode}`);
    console.log(`Old socket ID: ${data.oldSocketId}`);
    console.log(`Player ID: ${data.playerId}`);
    console.log(`Current hostGameSocketId: ${lobbies[gameCode].hostGameSocketId}`);
    console.log(`Current hostGamePlayerId: ${lobbies[gameCode].hostGamePlayerId}`);
    console.log(`Current originalHost: ${lobbies[gameCode].originalHost}`);
    console.log(`Current originalHostPlayerId: ${lobbies[gameCode].originalHostPlayerId}`);
    console.log(`Current host: ${lobbies[gameCode].host}`);
    console.log(`Current players:`, Object.keys(lobbies[gameCode].players));
    
    // Check if this player was the host by comparing their persistent player ID
    // Check both originalHostPlayerId (lobby creation) and hostGamePlayerId (last game host)
    const wasHost = data.playerId && (
      lobbies[gameCode].originalHostPlayerId === data.playerId ||
      lobbies[gameCode].hostGamePlayerId === data.playerId
    );
    
    console.log(`Was this player the host? ${wasHost}`);
    
    // Save old player data (including team) before removing
    let oldPlayerData = null;
    if (data.oldSocketId && lobbies[gameCode].players[data.oldSocketId]) {
      oldPlayerData = lobbies[gameCode].players[data.oldSocketId];
      delete lobbies[gameCode].players[data.oldSocketId];
      console.log(`Removed old socket ID ${data.oldSocketId} from game ${gameCode}, saved team: ${oldPlayerData.team}`);
    }
    
    // If old host rejoins, maintain host status and update originalHost
    if (wasHost) {
      // Remove host status from all other players
      Object.keys(lobbies[gameCode].players).forEach(playerId => {
        lobbies[gameCode].players[playerId].isHost = false;
      });
      
      lobbies[gameCode].host = socket.id;
      lobbies[gameCode].originalHost = socket.id;
      lobbies[gameCode].hostGameSocketId = null; // Reset for next game
      lobbies[gameCode].hostGamePlayerId = null; // Reset for next game
      console.log(`Original host ${socket.id} reclaimed host status in game ${gameCode}`);
    } else if (Object.keys(lobbies[gameCode].players).length === 0 && !lobbies[gameCode].hostGamePlayerId) {
      // Only assign host to first rejoiner if there's NO hostGamePlayerId set
      // (meaning no one was ever the host in the game)
      lobbies[gameCode].host = socket.id;
      lobbies[gameCode].originalHost = socket.id;
      lobbies[gameCode].originalHostPlayerId = data.playerId; // Update for future rejoins
      console.log(`First player ${socket.id} rejoining empty game ${gameCode}, assigning as host`);
    } else if (Object.keys(lobbies[gameCode].players).length === 0 && lobbies[gameCode].hostGamePlayerId) {
      // If game is empty but hostGamePlayerId exists, keep waiting for the original host
      // Don't assign anyone as host yet
      console.log(`Game ${gameCode} waiting for original host (playerId: ${lobbies[gameCode].hostGamePlayerId}) to rejoin`);
    }
    
    const isHost = lobbies[gameCode].host === socket.id;
    
    console.log(`Final host assignment: ${lobbies[gameCode].host}`);
    console.log(`Is ${socket.id} the host? ${isHost}`);
    console.log(`=== END REJOIN DEBUG ===\n`);
    
    // Restore old player data including team if available
    lobbies[gameCode].players[socket.id] = {
      id: socket.id,
      playerId: data.playerId,
      username: data.username || (oldPlayerData?.username) || `Player_${socket.id.substr(0, 6)}`,
      tankColor: data.tankColor || (oldPlayerData?.tankColor) || null,
      isHost: isHost,
      team: oldPlayerData?.team || null // Preserve team from old data
    };
    
    console.log(`Player ${socket.id} rejoined with team: ${lobbies[gameCode].players[socket.id].team}, color: ${lobbies[gameCode].players[socket.id].tankColor}`);
    
    socket.join(gameCode);
    socket.gameCode = gameCode;
    
    socket.emit('gameJoined', {
      gameCode: gameCode,
      players: lobbies[gameCode].players,
      gameMode: lobbies[gameCode].gameMode || 'ai_solo'
    });
    
    // Notify ALL players in game (including the rejoining player)
    // This ensures everyone has the correct host status
    io.to(gameCode).emit('playerJoinedGame', {
      playerId: socket.id,
      players: lobbies[gameCode].players
    });
    
    console.log(`Player ${socket.id} rejoined game ${gameCode}${isHost ? ' as host' : ''} (was original host: ${wasHost})`);
  });
  
  socket.on('startGame', (data) => {
    const gameCode = data.gameCode;
    const tankSpeed = data.tankSpeed || TANK_SPEED; // Default if not provided
    const melody = data.melody || 'battle'; // Default melody
    const debugMode = data.debugMode || false; // Debug mode for one-hit kills
    const gameMode = data.gameMode || 'ai_solo';
    const aiDifficulty = data.aiDifficulty || 'medium';
    const aiCount = data.aiCount || 3;
    
    if (!lobbies[gameCode] || lobbies[gameCode].host !== socket.id) {
      socket.emit('lobbyError', { message: 'Only host can start the game!' });
      return;
    }
    
    if (lobbies[gameCode].state !== 'waiting') {
      socket.emit('lobbyError', { message: 'Game already started!' });
      return;
    }
    
    // Check if multiplayer mode requires at least 2 players
    const playerCount = Object.keys(lobbies[gameCode].players).length;
    if (gameMode === 'multiplayer' && playerCount < 2) {
      socket.emit('lobbyError', { 
        message: 'Multiplayer mode requires at least 2 players! Use "Solo vs AI" mode to play alone.' 
      });
      return;
    }
    
    // Check if Team PvP mode has players on both teams
    if (gameMode === 'team_pvp') {
      const redTeam = Object.values(lobbies[gameCode].players).filter(p => p.team === 'team_a');
      const blueTeam = Object.values(lobbies[gameCode].players).filter(p => p.team === 'team_b');
      
      if (redTeam.length === 0 || blueTeam.length === 0) {
        socket.emit('lobbyError', {
          message: 'Team PvP requires at least one player on each team!'
        });
        return;
      }
    }
    
    // Check if we've reached the maximum number of concurrent games
    const activeGames = Object.values(lobbies).filter(lobby => lobby.state === 'playing').length;
    if (activeGames >= MAX_CONCURRENT_GAMES) {
      socket.emit('lobbyError', { 
        message: `Server is at capacity! Maximum ${MAX_CONCURRENT_GAMES} games can run at the same time. Please try again later.` 
      });
      return;
    }
    
    // Change lobby state to playing
    lobbies[gameCode].state = 'playing';
    lobbies[gameCode].gameStartTime = Date.now();
    lobbies[gameCode].tankSpeed = tankSpeed; // Store tank speed setting
    lobbies[gameCode].melody = melody; // Store melody setting
    lobbies[gameCode].debugMode = debugMode; // Store debug mode flag
    lobbies[gameCode].weaponsEnabled = data.weaponsEnabled !== false; // Default true
    lobbies[gameCode].powerupsEnabled = data.powerupsEnabled !== false; // Default true
    lobbies[gameCode].limitedAmmo = data.limitedAmmo || false; // Limited ammo mode
    lobbies[gameCode].gameMode = gameMode; // Store game mode
    lobbies[gameCode].aiDifficulty = aiDifficulty; // Store AI difficulty
    
    // Initialize game state for this lobby
    lobbies[gameCode].gameObstacles = generateObstacles();
    lobbies[gameCode].gamePlayers = {};
    lobbies[gameCode].gameProjectiles = [];
    lobbies[gameCode].gameWeapons = []; // Special weapon pickups
    lobbies[gameCode].gamePowerups = []; // Power-up pickups
    lobbies[gameCode].lastWeaponSpawn = Date.now();
    lobbies[gameCode].lastPowerupSpawn = Date.now();
    
    // Spawn AI tanks based on game mode
    let numAI = 0; // Initialize outside the if block
    if (gameMode === 'ai_solo' || gameMode === 'ai_coop' || gameMode === 'ai_mixed') {
      numAI = Math.min(Math.max(1, aiCount), 9); // Clamp between 1-9
      
      console.log(`\n=== SPAWNING AI FOR GAME MODE: ${gameMode} ===`);
      
      for (let i = 0; i < numAI; i++) {
        const aiId = `ai_${gameCode}_${i}`;
        // Set team: 'ai' for co-op mode, null for solo/mixed modes
        const aiTeam = gameMode === 'ai_coop' ? 'ai' : null;
        const aiTank = new Tank(aiId, lobbies[gameCode].gameObstacles, true, aiDifficulty, null, null, aiTeam);
        lobbies[gameCode].gamePlayers[aiId] = aiTank;
        console.log(`Spawned AI ${aiId} with team: ${aiTeam}, difficulty: ${aiDifficulty}`);
      }
      
      console.log(`Spawned ${numAI} AI tanks with difficulty ${aiDifficulty} for game ${gameCode}`);
    }
    
    // Notify all players in the lobby
    io.to(gameCode).emit('gameStarting', {
      startTime: lobbies[gameCode].gameStartTime,
      gameDuration: GAME_DURATION,
      tankSpeed: tankSpeed,
      melody: melody
    });
    
    // Start countdown after a short delay to let players load
    setTimeout(() => {
      if (lobbies[gameCode] && lobbies[gameCode].state === 'playing') {
        lobbies[gameCode].countdownActive = true; // Set countdown flag
        let countdownValue = 3;
        const countdownInterval = setInterval(() => {
          if (!lobbies[gameCode] || lobbies[gameCode].state !== 'playing') {
            clearInterval(countdownInterval);
            return;
          }
          
          io.to(gameCode).emit('countdown', { count: countdownValue });
          
          if (countdownValue === 0) {
            clearInterval(countdownInterval);
            lobbies[gameCode].countdownActive = false; // Countdown finished
          }
          
          countdownValue--;
        }, 1000);
      }
    }, 1000);
    
    // Broadcast game browser status update
    broadcastGameBrowserStatus();
    
    console.log(`Game ${gameCode} started with settings:`, {
      tankSpeed,
      melody,
      debugMode: debugMode || false,
      weapons: lobbies[gameCode].weaponsEnabled,
      powerups: lobbies[gameCode].powerupsEnabled,
      gameMode: gameMode,
      aiCount: numAI
    });
  });
  
  socket.on('leaveGame', (data) => {
    const gameCode = data.gameCode;
    
    if (!lobbies[gameCode]) return;
    
    const wasHost = lobbies[gameCode].host === socket.id;
    delete lobbies[gameCode].players[socket.id];
    socket.leave(gameCode);
    
    if (Object.keys(lobbies[gameCode].players).length === 0) {
      // Delete game session if empty
      delete lobbies[gameCode];
      console.log(`Game ${gameCode} deleted (empty)`);
      broadcastGameBrowserStatus();
    } else if (wasHost) {
      // Assign new host
      const newHost = Object.keys(lobbies[gameCode].players)[0];
      lobbies[gameCode].host = newHost;
      lobbies[gameCode].players[newHost].isHost = true;
      
      io.to(gameCode).emit('playerLeftGame', {
        playerId: socket.id,
        players: lobbies[gameCode].players,
        newHost: newHost
      });
      
      console.log(`New host for ${gameCode}: ${newHost}`);
    } else {
      io.to(gameCode).emit('playerLeftGame', {
        playerId: socket.id,
        players: lobbies[gameCode].players
      });
    }
  });

  // Team selection for Team vs Team PvP
  socket.on('changeTeam', (data) => {
    const { gameCode, team } = data;
    
    if (!gameCode || !lobbies[gameCode]) {
      socket.emit('teamError', { message: 'Invalid lobby' });
      return;
    }
    
    const lobby = lobbies[gameCode];
    
    if (lobby.state !== 'waiting') {
      socket.emit('teamError', { message: 'Cannot change teams while game is in progress' });
      return;
    }
    
    if (team !== 'team_a' && team !== 'team_b') {
      socket.emit('teamError', { message: 'Invalid team' });
      return;
    }
    
    if (lobby.players[socket.id]) {
      lobby.players[socket.id].team = team;
      
      io.to(gameCode).emit('teamChanged', {
        playerId: socket.id,
        team: team,
        players: lobby.players
      });
      
      console.log(`Player ${socket.id} changed to ${team} in game ${gameCode}`);
    }
  });

  // Handle player color changes in lobby
  socket.on('updatePlayerColor', (data) => {
    const { gameCode, color } = data;
    
    if (!gameCode || !lobbies[gameCode]) {
      return;
    }
    
    const lobby = lobbies[gameCode];
    
    if (lobby.players[socket.id]) {
      lobby.players[socket.id].tankColor = color;
      
      // Broadcast to all players in lobby
      io.to(gameCode).emit('playerColorChanged', {
        playerId: socket.id,
        color: color,
        players: lobby.players
      });
      
      console.log(`Player ${socket.id} changed color to ${color || 'default'} in game ${gameCode}`);
    }
  });

  // Handle game settings changes (host only)
  socket.on('updateGameSettings', (data) => {
    const { gameCode, gameMode } = data;
    
    if (!gameCode || !lobbies[gameCode]) {
      socket.emit('lobbyError', { message: 'Invalid lobby' });
      return;
    }
    
    const lobby = lobbies[gameCode];
    
    // Only host can change settings
    if (lobby.host !== socket.id) {
      socket.emit('gameError', { message: 'Only host can change game settings' });
      return;
    }
    
    if (lobby.state !== 'waiting') {
      socket.emit('gameError', { message: 'Cannot change settings while game is in progress' });
      return;
    }
    
    // Update game mode
    if (gameMode !== undefined) {
      lobby.gameMode = gameMode;
      
      // Broadcast to all players in the game
      io.to(gameCode).emit('gameSettingsUpdated', {
        gameMode: gameMode
      });
      
      console.log(`Game mode changed to ${gameMode} in game ${gameCode}`);
    }
  });

  // Team chat for Team vs Team PvP
  socket.on('teamChatMessage', (data) => {
    const { message, team } = data;
    const gameCode = socket.gameCode;
    
    if (!gameCode || !lobbies[gameCode]) {
      return;
    }
    
    const lobby = lobbies[gameCode];
    const player = lobby.players[socket.id];
    
    if (!player || player.team !== team) {
      return;
    }
    
    // Broadcast to all players on the same team
    Object.keys(lobby.players).forEach(playerId => {
      if (lobby.players[playerId].team === team && lobby.gameSocketIds && lobby.gameSocketIds.has(playerId)) {
        io.to(playerId).emit('teamChatMessage', {
          playerName: player.username,
          message: message,
          team: team
        });
      }
    });
  });

  // Game initialization - validate player is from a valid lobby
  socket.on('initGame', async (data) => {
    const gameCode = data.gameCode;
    const persistentPlayerId = data.playerId || socket.id;
    const username = data.username || `Player_${socket.id.substr(0, 6)}`;
    
    // Register/update player in database
    await db.getPlayer(persistentPlayerId, username);
    
    console.log(`InitGame called by ${socket.id} for game ${gameCode}`);
    console.log(`Lobby exists: ${!!lobbies[gameCode]}, State: ${lobbies[gameCode]?.state}`);
    
    if (!gameCode || !lobbies[gameCode]) {
      console.log(`Game ${gameCode} not found, redirecting to menu`);
      socket.emit('redirectToMenu');
      return;
    }
    
    if (lobbies[gameCode].state !== 'playing') {
      console.log(`Game ${gameCode} state is ${lobbies[gameCode].state}, not playing. Redirecting.`);
      socket.emit('redirectToMenu');
      return;
    }
    
    // Store gameCode in socket for future events
    socket.gameCode = gameCode;
    socket.join(gameCode);
    
    // Track game socket IDs - initialize if not exists
    if (!lobbies[gameCode].gameSocketIds) {
      lobbies[gameCode].gameSocketIds = new Set();
    }
    lobbies[gameCode].gameSocketIds.add(socket.id);
    
    // Track if this player was the original host from the lobby
    if (data.wasHost && !lobbies[gameCode].hostGameSocketId) {
      lobbies[gameCode].hostGameSocketId = socket.id;
      lobbies[gameCode].hostGamePlayerId = persistentPlayerId; // Store persistent player ID
      console.log(`Host game socket ID set to ${socket.id}, playerId: ${persistentPlayerId} (was lobby host)`);
    }
    
    // Create new tank for player if not exists
    const lobby = lobbies[gameCode];
    if (!lobby.gamePlayers[socket.id]) {
      // Check if this player already has a tank with a different socket ID (reconnection after refresh)
      let existingTank = null;
      let oldSocketId = null;
      
      if (persistentPlayerId) {
        for (const [socketId, tank] of Object.entries(lobby.gamePlayers)) {
          if (tank.persistentPlayerId === persistentPlayerId) {
            existingTank = tank;
            oldSocketId = socketId;
            break;
          }
        }
      }
      
      if (existingTank && oldSocketId) {
        // Reconnection: reassign existing tank to new socket ID
        console.log(`Reconnecting player ${username} (${persistentPlayerId}): ${oldSocketId} -> ${socket.id}`);
        existingTank.id = socket.id; // Update tank's socket ID
        lobby.gamePlayers[socket.id] = existingTank;
        delete lobby.gamePlayers[oldSocketId]; // Remove old socket ID reference
        console.log(`Reconnected tank for player ${username}, preserving health: ${existingTank.health}, isAlive: ${existingTank.isAlive}`);
      } else {
        // New player joining: create new tank
        // Determine player team based on game mode
        let playerTeam = null;
        if (lobby.gameMode === 'ai_coop' || lobby.gameMode === 'ai_mixed') {
          playerTeam = 'human';
        } else if (lobby.gameMode === 'team_pvp') {
          // Get team from lobby player data - use current socket.id first, then search by persistentPlayerId
          let lobbyPlayer = lobby.players[socket.id];
          if (!lobbyPlayer && persistentPlayerId) {
            // Search for player by persistentPlayerId if socket.id doesn't match
            lobbyPlayer = Object.values(lobby.players).find(p => p.playerId === persistentPlayerId);
          }
          playerTeam = lobbyPlayer?.team || 'team_a';
          console.log(`Team assignment for ${username}: found lobby player with team ${lobbyPlayer?.team}, assigned ${playerTeam}`);
        }
        
        // Get player's tank color from lobby player data
        let lobbyPlayer = lobby.players[socket.id];
        if (!lobbyPlayer && persistentPlayerId) {
          lobbyPlayer = Object.values(lobby.players).find(p => p.playerId === persistentPlayerId);
        }
        const playerColor = lobbyPlayer?.tankColor || null;
        
        const tank = new Tank(socket.id, lobby.gameObstacles, false, 'medium', persistentPlayerId, username, playerTeam, playerColor);
        lobby.gamePlayers[socket.id] = tank;
        console.log(`Created NEW tank for player ${username} (${socket.id}), team: ${playerTeam}, color: ${playerColor}, gameMode: ${lobby.gameMode}, isAlive: ${tank.isAlive}`);
      }
    }

    // Send initial game state to new player
    socket.emit('init', {
      playerId: socket.id,
      players: sanitizePlayers(lobby.gamePlayers),
      gameWidth: GAME_WIDTH,
      gameHeight: GAME_HEIGHT,
      obstacles: lobby.gameObstacles,
      weapons: lobby.gameWeapons || [],
      powerups: lobby.gamePowerups || [],
      gameStartTime: lobby.gameStartTime,
      gameDuration: GAME_DURATION,
      melody: lobbies[gameCode].melody || 'battle'
    });
    
    console.log(`Player ${socket.id} initialized for game ${socket.gameCode}. Total players: ${Object.keys(lobby.gamePlayers).length}`);

    // Notify other players of new player
    socket.to(socket.gameCode).emit('playerJoined', {
      playerId: socket.id,
      tank: sanitizeTank(lobby.gamePlayers[socket.id])
    });
  });

  // Handle player movement
  socket.on('move', (data) => {
    const gameCode = socket.gameCode;
    if (!gameCode || !lobbies[gameCode]) return;
    
    const lobby = lobbies[gameCode];
    if (lobby.gamePlayers[socket.id]) {
      if (lobby.gamePlayers[socket.id].isAlive) {
        const player = lobby.gamePlayers[socket.id];
        let speedMultiplier = lobby.tankSpeed ? (lobby.tankSpeed / TANK_SPEED) : 1;
        
        // Apply Speed Boost powerup if active
        if (player.activePowerup === 'SPEED_BOOST') {
          speedMultiplier *= POWERUP_TYPES.SPEED_BOOST.multiplier;
        }
        
        player.velocityX = data.velocityX * speedMultiplier;
        player.velocityY = data.velocityY * speedMultiplier;
        
        // Update base rotation based on movement direction
        if (data.velocityX !== 0 || data.velocityY !== 0) {
          player.rotation = Math.atan2(data.velocityY, data.velocityX);
        }
      } else {
        console.log(`Player ${socket.id} tried to move but isAlive is false`);
      }
    } else {
      console.log(`Move event from ${socket.id} but player not found in lobby players`);
    }
  });

  // Handle turret rotation (aiming)
  socket.on('rotate', (data) => {
    const gameCode = socket.gameCode;
    if (!gameCode || !lobbies[gameCode]) return;
    
    const lobby = lobbies[gameCode];
    if (lobby.gamePlayers[socket.id]) {
      lobby.gamePlayers[socket.id].turretRotation = data.rotation;
    }
  });

  // Handle shooting
  socket.on('shoot', (data) => {
    const gameCode = socket.gameCode;
    if (!gameCode || !lobbies[gameCode]) return;
    
    const lobby = lobbies[gameCode];
    if (lobby.gamePlayers[socket.id]) {
      const tank = lobby.gamePlayers[socket.id];
      
      // Prevent spectating players from shooting
      if (!tank.isAlive) {
        return; // Dead/spectating players can't shoot
      }
      
      // Check ammo in limited ammo mode
      if (lobby.limitedAmmo) {
        if (tank.ammo <= 0) {
          return; // No ammo, can't shoot
        }
        tank.ammo -= 1; // Consume ammo
      }
      
      const weaponType = tank.activeWeapon || null;
      const barrelLength = TANK_SIZE;
      const shootRotation = tank.turretRotation; // Use turret rotation for shooting
      
      // Create main projectile
      const projectile = new Projectile(
        tank.x + Math.cos(shootRotation) * barrelLength,
        tank.y + Math.sin(shootRotation) * barrelLength,
        shootRotation,
        socket.id,
        weaponType
      );
      lobby.gameProjectiles.push(projectile);
      
      // Handle TRIPLE_SHOT - create 2 additional projectiles at angles
      if (weaponType === 'TRIPLE_SHOT') {
        const angleOffset = Math.PI / 12; // 15 degrees
        
        const projectile2 = new Projectile(
          tank.x + Math.cos(shootRotation - angleOffset) * barrelLength,
          tank.y + Math.sin(shootRotation - angleOffset) * barrelLength,
          shootRotation - angleOffset,
          socket.id,
          weaponType
        );
        
        const projectile3 = new Projectile(
          tank.x + Math.cos(shootRotation + angleOffset) * barrelLength,
          tank.y + Math.sin(shootRotation + angleOffset) * barrelLength,
          shootRotation + angleOffset,
          socket.id,
          weaponType
        );
        
        lobby.gameProjectiles.push(projectile2, projectile3);
      }
      
      io.to(gameCode).emit('projectileCreated', {
        x: projectile.x,
        y: projectile.y,
        rotation: projectile.rotation,
        weaponType: weaponType
      });
    }
  });

  // Handle restart request
  socket.on('requestRestart', () => {
    const gameCode = socket.gameCode;
    if (!gameCode || !lobbies[gameCode]) {
      console.log('No valid game code for restart');
      return;
    }
    
    const lobby = lobbies[gameCode];
    
    if (lobby.state === 'finished' || lobby.state === 'waiting') {
      // Use per-lobby playersReadyToRestart
      if (!lobby.playersReadyToRestart) {
        lobby.playersReadyToRestart = new Set();
      }
      
      lobby.playersReadyToRestart.add(socket.id);
      
      // Count players currently in the lobby
      const currentPlayers = Object.keys(lobby.players);
      const readyPlayers = Array.from(lobby.playersReadyToRestart).filter(id => currentPlayers.includes(id));
      
      console.log(`Player ${socket.id} ready to restart. ${readyPlayers.length}/${currentPlayers.length} ready`);
      
      // Broadcast ready count to all players in this game
      io.to(gameCode).emit('restartProgress', {
        ready: readyPlayers.length,
        total: currentPlayers.length
      });
      
      // Check if all current players are ready
      if (readyPlayers.length >= currentPlayers.length && currentPlayers.length > 0) {
        console.log('All players ready! Restarting game...');
        
        // Clear the ready set
        lobby.playersReadyToRestart.clear();
        
        // Reset lobby state
        lobby.state = 'playing';
        lobby.gameStartTime = Date.now();
        lobby.gameWinner = null;
        
        // IMPORTANT: Maintain host tracking across restart
        // The lobby.players should still be intact from when they were in the waiting room
        // Ensure the host is still marked correctly
        // DON'T clear hostGameSocketId and hostGamePlayerId - we need them for rejoin after next game end
        console.log(`Maintaining host status during restart. Host: ${lobby.host}, Original Host: ${lobby.originalHost}`);
        console.log(`Keeping hostGamePlayerId: ${lobby.hostGamePlayerId} for next game end/rejoin`);
        
        // Clear projectiles for this lobby
        if (lobby.gameProjectiles) {
          lobby.gameProjectiles.length = 0;
        } else {
          lobby.gameProjectiles = [];
        }
        
        // Clear weapons and powerups for restart
        if (lobby.gameWeapons) {
          lobby.gameWeapons.length = 0;
        }
        if (lobby.gamePowerups) {
          lobby.gamePowerups.length = 0;
        }
        
        // Count AI bots and human players
        const humanPlayers = Object.values(lobby.gamePlayers || {}).filter(p => !p.isAI);
        const aiBots = Object.values(lobby.gamePlayers || {}).filter(p => p.isAI);
        
        console.log(`Restart: Found ${humanPlayers.length} human players and ${aiBots.length} AI bots`);
        
        // Reset all players' status for the new game
        Object.values(lobby.gamePlayers || {}).forEach(player => {
          player.isAlive = true;
          player.health = TANK_MAX_HEALTH;
          player.score = 0;
          player.kills = 0;
          player.deaths = 0;
          player.livesRemaining = 3;
          player.velocityX = 0;
          player.velocityY = 0;
          player.activeWeapon = null;
          player.activePowerup = null;
          player.ammo = lobby.limitedAmmo ? 20 : Infinity;
          
          // Respawn at random valid location (not on obstacles or other tanks)
          const respawnPos = findValidSpawnPosition(lobby.gameObstacles, lobby.gamePlayers, player.id);
          player.x = respawnPos.x;
          player.y = respawnPos.y;
        });
        
        // Generate new obstacles for the new game
        lobby.gameObstacles = generateObstacles();
        
        // Send updated game state with reset players to all clients
        io.to(gameCode).emit('gameRestarted', {
          startTime: lobby.gameStartTime,
          gameDuration: GAME_DURATION,
          players: sanitizePlayers(lobby.gamePlayers),
          obstacles: lobby.gameObstacles
        });
        
        console.log(`Game ${gameCode} restarted!`);
      }
    }
  });

  // Stats socket handlers
  socket.on('updateUsername', async (data) => {
    try {
      await db.getPlayer(data.playerId, data.username);
      console.log(`Username updated: ${data.username} (${data.playerId})`);
    } catch (error) {
      console.error('Error updating username:', error);
    }
  });

  socket.on('getPersonalStats', async (data) => {
    try {
      const player = await db.getPlayer(data.playerId);
      const sortBy = 'wins'; // Default sort
      const rank = await db.getPlayerRank(data.playerId, sortBy);
      
      socket.emit('personalStats', {
        ...player,
        rank: rank
      });
    } catch (error) {
      console.error('Error getting personal stats:', error);
      socket.emit('personalStats', null);
    }
  });

  socket.on('getLeaderboard', async (data) => {
    try {
      const sortBy = data.sortBy || 'wins';
      const leaderboard = await db.getLeaderboard(sortBy, 50);
      socket.emit('leaderboard', leaderboard);
    } catch (error) {
      console.error('Error getting leaderboard:', error);
      socket.emit('leaderboard', []);
    }
  });

  // Handle player disconnect
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    
    const gameCode = socket.gameCode;
    console.log(`Disconnect - gameCode: ${gameCode}, has lobby: ${!!(gameCode && lobbies[gameCode])}, lobby state: ${lobbies[gameCode]?.state}`);
    
    // Handle lobby cleanup
    if (gameCode && lobbies[gameCode]) {
      const wasInLobby = lobbies[gameCode].players[socket.id];
      
      // Only delete from gamePlayers if game is NOT in playing state (to allow page transitions)
      // If playing, keep them in gamePlayers as they're just transitioning to game.html
      if (lobbies[gameCode].state !== 'playing') {
        console.log(`Deleting ${socket.id} from gamePlayers (state: ${lobbies[gameCode].state})`);
        delete lobbies[gameCode].gamePlayers[socket.id];
        if (lobbies[gameCode].playersReadyToRestart) {
          lobbies[gameCode].playersReadyToRestart.delete(socket.id);
        }
      } else {
        console.log(`Keeping ${socket.id} in gamePlayers during page transition (state: ${lobbies[gameCode].state})`);
      }
      
      // Only handle lobby cleanup if game is NOT playing (waiting state)
      // If playing, players are just transitioning to game page with new socket IDs
      if (wasInLobby && lobbies[gameCode].state === 'waiting') {
        const wasHost = lobbies[gameCode].host === socket.id;
        delete lobbies[gameCode].players[socket.id];
        
        if (Object.keys(lobbies[gameCode].players).length === 0) {
          // Delete game session if empty
          delete lobbies[gameCode];
          console.log(`Game ${gameCode} deleted (empty)`);
        } else if (wasHost) {
          // Assign new host if in waiting state
          const newHost = Object.keys(lobbies[gameCode].players)[0];
          lobbies[gameCode].host = newHost;
          lobbies[gameCode].players[newHost].isHost = true;
          
          io.to(gameCode).emit('playerLeftGame', {
            playerId: socket.id,
            players: lobbies[gameCode].players,
            newHost: newHost
          });
          
          console.log(`New host for ${gameCode}: ${newHost}`);
        } else {
          // Just notify about player leaving
          io.to(gameCode).emit('playerLeftGame', {
            playerId: socket.id,
            players: lobbies[gameCode].players
          });
        }
      } else if (wasInLobby && lobbies[gameCode].state === 'playing') {
        // Player left during active game - DON'T remove from game session players list
        // They might be transitioning back to menu after game ends
        console.log(`Player ${socket.id} disconnected during active game ${gameCode}.`);
      } else if (wasInLobby && lobbies[gameCode].state === 'finished') {
        // Game is finished, player might be transitioning back to menu
        console.log(`Player ${socket.id} disconnected from finished game ${gameCode}.`);
      }
    }
    
    // Broadcast to all
    socket.broadcast.emit('playerLeft', { playerId: socket.id });
    
    // Clean up if all players disconnect from an active game
    // But don't reset if there's an active lobby in playing state (players transitioning)
    if (Object.keys(players).length === 0) {
      // Check if any lobby is in playing state (players might be transitioning)
      const hasActiveLobby = Object.values(lobbies).some(lobby => lobby.state === 'playing');
      
      if (!hasActiveLobby) {
        gameState = 'waiting';
        gameStartTime = null;
        gameWinner = null;
        projectiles.length = 0;
        playersReadyToRestart.clear();
        console.log('All players disconnected and no active lobbies. Game reset.');
      } else {
        console.log('All players disconnected but active lobby exists. Waiting for reconnections...');
      }
    }
  });
});

// Spawn weapon pickup
function spawnWeapon(gameCode) {
  const lobby = lobbies[gameCode];
  if (!lobby || !lobby.weaponsEnabled) return;
  
  const weaponTypes = Object.keys(WEAPON_TYPES);
  const randomType = weaponTypes[Math.floor(Math.random() * weaponTypes.length)];
  const weaponInfo = WEAPON_TYPES[randomType];
  
  const weapon = {
    id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
    type: randomType,
    x: Math.random() * (GAME_WIDTH - 60) + 30,
    y: Math.random() * (GAME_HEIGHT - 60) + 30,
    size: 25,
    color: weaponInfo.color,
    name: weaponInfo.name
  };
  
  lobby.gameWeapons.push(weapon);
  io.to(gameCode).emit('weaponSpawned', weapon);
}

// Spawn powerup pickup
function spawnPowerup(gameCode) {
  const lobby = lobbies[gameCode];
  if (!lobby || !lobby.powerupsEnabled) return;
  
  const powerupTypes = Object.keys(POWERUP_TYPES);
  const randomType = powerupTypes[Math.floor(Math.random() * powerupTypes.length)];
  const powerupInfo = POWERUP_TYPES[randomType];
  
  const powerup = {
    id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
    type: randomType,
    x: Math.random() * (GAME_WIDTH - 60) + 30,
    y: Math.random() * (GAME_HEIGHT - 60) + 30,
    size: 20,
    color: powerupInfo.color,
    name: powerupInfo.name
  };
  
  lobby.gamePowerups.push(powerup);
  io.to(gameCode).emit('powerupSpawned', powerup);
}

// Game loop - update game state for each lobby
setInterval(() => {
  // Process each lobby separately
  Object.keys(lobbies).forEach(gameCode => {
    const lobby = lobbies[gameCode];
    
    // Skip if not playing
    if (lobby.state !== 'playing') return;
    
    const now = Date.now();
    
    // Spawn weapons every 15-25 seconds
    if (lobby.weaponsEnabled && lobby.lastWeaponSpawn && now - lobby.lastWeaponSpawn > 15000 + Math.random() * 10000) {
      if (lobby.gameWeapons && lobby.gameWeapons.length < 3) {
        spawnWeapon(gameCode);
        lobby.lastWeaponSpawn = now;
      }
    }
    
    // Spawn powerups every 10-20 seconds  
    if (lobby.powerupsEnabled && lobby.lastPowerupSpawn && now - lobby.lastPowerupSpawn > 10000 + Math.random() * 10000) {
      if (lobby.gamePowerups && lobby.gamePowerups.length < 4) {
        spawnPowerup(gameCode);
        lobby.lastPowerupSpawn = now;
      }
    }
    
    // Check for pickups
    Object.keys(lobby.gamePlayers).forEach(playerId => {
      const player = lobby.gamePlayers[playerId];
      if (!player.isAlive) return;
      
      // Check weapon collision
      if (lobby.gameWeapons) {
        for (let i = lobby.gameWeapons.length - 1; i >= 0; i--) {
          const weapon = lobby.gameWeapons[i];
          const dx = player.x - weapon.x;
          const dy = player.y - weapon.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance < TANK_SIZE + weapon.size) {
            player.activeWeapon = weapon.type;
            player.weaponEndTime = now + WEAPON_TYPES[weapon.type].duration;
            lobby.gameWeapons.splice(i, 1);
            io.to(gameCode).emit('weaponPickup', { playerId, weapon: weapon.type });
            break;
          }
        }
      }
      
      // Check powerup collision
      if (lobby.gamePowerups) {
        for (let i = lobby.gamePowerups.length - 1; i >= 0; i--) {
          const powerup = lobby.gamePowerups[i];
          const dx = player.x - powerup.x;
          const dy = player.y - powerup.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance < TANK_SIZE + powerup.size) {
            if (powerup.type === 'HEALTH') {
              player.health = Math.min(TANK_MAX_HEALTH, player.health + POWERUP_TYPES.HEALTH.healAmount);
            } else if (powerup.type === 'AMMO_REFILL') {
              player.ammo = 20; // Refill ammo to max
              player.lastAmmoRegen = Date.now();
            } else {
              player.activePowerup = powerup.type;
              player.powerupEndTime = now + POWERUP_TYPES[powerup.type].duration;
            }
            lobby.gamePowerups.splice(i, 1);
            io.to(gameCode).emit('powerupPickup', { playerId, powerup: powerup.type });
            break;
          }
        }
      }
      
      // Clear expired effects
      if (player.activeWeapon && player.weaponEndTime && now > player.weaponEndTime) {
        player.activeWeapon = null;
        io.to(gameCode).emit('weaponExpired', { playerId });
      }
      if (player.activePowerup && player.powerupEndTime && now > player.powerupEndTime) {
        player.activePowerup = null;
        io.to(gameCode).emit('powerupExpired', { playerId });
      }
      
      // Ammo regeneration in limited ammo mode (1 bullet per 3 seconds)
      if (lobby.limitedAmmo && player.isAlive && player.ammo < 20) {
        if (now - player.lastAmmoRegen >= 3000) {
          player.ammo = Math.min(20, player.ammo + 1);
          player.lastAmmoRegen = now;
        }
      }
    });
    
    // Update AI players (skip during countdown)
    if (!lobby.countdownActive) {
      Object.keys(lobby.gamePlayers).forEach(playerId => {
        const tank = lobby.gamePlayers[playerId];
        if (tank.isAI && tank.aiController) {
          tank.aiController.update(tank, lobby, gameCode, io);
        }
      });
    }
    
    // Check win conditions for this lobby
    checkWinConditions(gameCode);
    if (lobby.state === 'finished') return;
    
    // Update player positions for this lobby
    Object.keys(lobby.gamePlayers).forEach(playerId => {
      const tank = lobby.gamePlayers[playerId];
      
      // Skip updates for dead/spectating tanks
      if (!tank.isAlive) return;
      
      const newX = tank.x + tank.velocityX;
      const newY = tank.y + tank.velocityY;

      // Check collision with obstacles
      let colliding = false;
      for (let obs of lobby.gameObstacles) {
        if (obs.collidesWith(newX, newY, TANK_SIZE)) {
          colliding = true;
          break;
        }
      }

      // Check collision with other tanks
      if (!colliding) {
        for (let otherPlayerId of Object.keys(lobby.gamePlayers)) {
          if (otherPlayerId !== playerId) {
            const otherTank = lobby.gamePlayers[otherPlayerId];
            
            // Skip collision check with dead/spectating tanks
            if (!otherTank.isAlive) continue;
            
            const dx = newX - otherTank.x;
            const dy = newY - otherTank.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Tanks collide if distance is less than 2x tank size
            if (distance < TANK_SIZE * 2) {
              colliding = true;
              break;
            }
          }
        }
      }

      if (!colliding) {
        tank.x = newX;
        tank.y = newY;
      }

      // Wrap around edges
      if (tank.x < 0) tank.x = GAME_WIDTH;
      if (tank.x > GAME_WIDTH) tank.x = 0;
      if (tank.y < 0) tank.y = GAME_HEIGHT;
      if (tank.y > GAME_HEIGHT) tank.y = 0;
    });

    // Update projectiles for this lobby
    for (let i = lobby.gameProjectiles.length - 1; i >= 0; i--) {
      lobby.gameProjectiles[i].update();

      if (lobby.gameProjectiles[i].isOutOfBounds()) {
        lobby.gameProjectiles.splice(i, 1);
        continue;
      }

      // Check collision with obstacles
      let hitObstacle = false;
      for (let obs of lobby.gameObstacles) {
        if (obs.collidesWith(lobby.gameProjectiles[i].x, lobby.gameProjectiles[i].y, PROJECTILE_SIZE)) {
          hitObstacle = true;
          const hitX = lobby.gameProjectiles[i].x;
          const hitY = lobby.gameProjectiles[i].y;
          lobby.gameProjectiles.splice(i, 1);
          io.to(gameCode).emit('explosion', {
            x: hitX,
            y: hitY,
            size: 'small'
          });
          break;
        }
      }

      if (hitObstacle) continue;

      // Check collision with tanks
      let hitTank = false;
      Object.keys(lobby.gamePlayers).forEach(playerId => {
        if (hitTank) return; // Already hit a tank
        
        const tank = lobby.gamePlayers[playerId];
        
        // Skip collision check with dead/spectating tanks
        if (!tank.isAlive) return;
        
        const dx = lobby.gameProjectiles[i].x - tank.x;
        const dy = lobby.gameProjectiles[i].y - tank.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Get shooter tank to check teams
        const shooterTank = lobby.gamePlayers[lobby.gameProjectiles[i].playerId];
        
        // Check friendly fire: skip if same team (co-op mode)
        const isFriendlyFire = shooterTank && tank.team && shooterTank.team === tank.team;
        
        if (i < lobby.gameProjectiles.length && shooterTank && tank.team) {
          console.log(`Projectile check: shooter ${shooterTank.id} (team: ${shooterTank.team}) -> target ${tank.id} (team: ${tank.team}), friendlyFire: ${isFriendlyFire}`);
        }

        if (distance < TANK_SIZE + PROJECTILE_SIZE && lobby.gameProjectiles[i].playerId !== playerId && !isFriendlyFire) {
          hitTank = true;
          const killerPlayerId = lobby.gameProjectiles[i].playerId;
          const hitX = lobby.gameProjectiles[i].x;
          const hitY = lobby.gameProjectiles[i].y;
          
          // Check if tank has invincibility - completely block damage
          if (tank.activePowerup === 'INVINCIBILITY') {
            lobby.gameProjectiles.splice(i, 1);
            
            // Broadcast invincibility deflection effect
            io.to(gameCode).emit('explosion', {
              x: hitX,
              y: hitY,
              size: 'small'
            });
            
            io.to(gameCode).emit('powerupBlocked', {
              playerId: playerId,
              powerupType: 'INVINCIBILITY'
            });
            
            return; // Skip damage completely
          }
          
          // Calculate damage based on weapon type and debug mode
          let damage;
          if (lobby.debugMode) {
            damage = 999; // One-hit kill in debug mode
          } else {
            // Get weapon damage or use default 10
            const projectileWeaponType = lobby.gameProjectiles[i].weaponType;
            if (projectileWeaponType && WEAPON_TYPES[projectileWeaponType]) {
              damage = WEAPON_TYPES[projectileWeaponType].damage;
            } else {
              damage = 10; // Default damage for normal bullets
            }
          }
          
          // Check if tank has shield - reduce damage by 50%
          if (tank.activePowerup === 'SHIELD') {
            damage = Math.ceil(damage * 0.5);
            io.to(gameCode).emit('shieldAbsorbed', {
              playerId: playerId,
              damageReduced: damage
            });
          }
          
          tank.health -= damage;
          lobby.gameProjectiles.splice(i, 1);

          // Broadcast hit explosion (small)
          io.to(gameCode).emit('explosion', {
            x: hitX,
            y: hitY,
            size: 'small'
          });

          if (tank.health <= 0) {
            // Award points to killer
            const killerTank = lobby.gamePlayers[killerPlayerId];
            if (killerTank) {
              killerTank.score += 100;
              killerTank.kills += 1;
            }

            // Decrease lives
            tank.livesRemaining -= 1;
            
            if (tank.livesRemaining <= 0) {
              // Mark as spectating (can't move/shoot but stays visible)
              tank.isAlive = false;
              
              io.to(gameCode).emit('tankDestroyed', {
                playerId: playerId,
                livesRemaining: 0,
                killerScore: killerTank ? killerTank.score : 0,
                isSpectating: true
              });
            } else {
              // Respawn destroyed tank at a valid location (not on obstacles or other tanks)
              tank.health = TANK_MAX_HEALTH;
              tank.ammo = 20; // Reset ammo on respawn
              tank.lastAmmoRegen = Date.now();
              const destroyX = tank.x;
              const destroyY = tank.y;
              
              // Find valid respawn position away from obstacles and other tanks
              const respawnPos = findValidSpawnPosition(lobby.gameObstacles, lobby.gamePlayers, tank.id);
              tank.x = respawnPos.x;
              tank.y = respawnPos.y;
              
              // Broadcast destruction explosion (big) at original position
              io.to(gameCode).emit('explosion', {
                x: destroyX,
                y: destroyY,
                size: 'big'
              });
              
              io.to(gameCode).emit('tankDestroyed', {
                playerId: playerId,
                livesRemaining: tank.livesRemaining,
                killerScore: killerTank ? killerTank.score : 0
              });
            }
          }
        }
      });
    }

    // Broadcast game state to all clients in this lobby
    io.to(gameCode).emit('gameState', {
      players: sanitizePlayers(lobby.gamePlayers),
      projectiles: lobby.gameProjectiles.map(p => ({ x: p.x, y: p.y, rotation: p.rotation, weaponType: p.weaponType })),
      weapons: lobby.gameWeapons,
      powerups: lobby.gamePowerups
    });
  }); // End of lobbies forEach
}, 1000 / UPDATE_RATE);

const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n========================================`);
  console.log(`🎮 Cannon Clash Server v${VERSION}`);
  console.log(`========================================`);
  console.log(`Port: ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  if (process.env.RAILWAY_ENVIRONMENT) {
    console.log(`Platform: Railway`);
  } else {
    console.log(`Local access: http://localhost:${PORT}`);
  }
});
