const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

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
const GAME_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds
const MAX_PLAYERS = 10;

// Game state management
let gameStartTime = null;
let gameState = 'waiting'; // 'waiting', 'running', 'finished'
let gameWinner = null;

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

// Player class
class Tank {
  constructor(id, obstacles) {
    this.id = id;
    let validSpawn = false;
    
    // Keep trying to spawn until we find a position not on an obstacle
    while (!validSpawn) {
      this.x = Math.random() * GAME_WIDTH;
      this.y = Math.random() * GAME_HEIGHT;
      validSpawn = true;
      
      // Check if spawn position collides with any obstacle
      for (let obs of obstacles) {
        if (obs.collidesWith(this.x, this.y, TANK_SIZE)) {
          validSpawn = false;
          break;
        }
      }
    }
    
    this.rotation = 0;
    this.health = TANK_MAX_HEALTH;
    this.velocityX = 0;
    this.velocityY = 0;
    this.score = 0;
    this.kills = 0;
    this.livesRemaining = 3;
    this.isAlive = true; // false = spectating (can't move/shoot but visible)
  }
}

// Projectile class
class Projectile {
  constructor(x, y, rotation, playerId) {
    this.x = x;
    this.y = y;
    this.rotation = rotation;
    this.playerId = playerId;
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

// Check win conditions
function checkWinConditions() {
  if (gameState !== 'running') return false;
  
  // Check if only 1 player alive (early win condition)
  if (Object.keys(players).length > 1) {
    const alivePlayers = Object.values(players).filter(p => p.isAlive);
    if (alivePlayers.length === 1) {
      gameState = 'finished';
      gameWinner = alivePlayers[0].id;
      
      io.emit('gameEnded', {
        winner: gameWinner,
        reason: 'Last player standing!',
        survivors: 1,
        topKills: alivePlayers[0].kills
      });
      
      return true;
    }
  }
  
  // Check if time limit reached (5 minutes)
  if (gameStartTime && Date.now() - gameStartTime >= GAME_DURATION) {
    gameState = 'finished';
    
    // Find winner by most kills
    const allPlayers = Object.values(players);
    let topPlayer = null;
    let topKills = -1;
    
    for (let player of allPlayers) {
      if (player.kills > topKills) {
        topKills = player.kills;
        topPlayer = player;
      }
    }
    
    gameWinner = topPlayer ? topPlayer.id : null;
    
    io.emit('gameEnded', {
      winner: gameWinner,
      reason: 'Time limit reached! Winner has most kills.',
      survivors: allPlayers.length,
      topKills: topKills
    });
    
    return true;
  }
  
  return false;
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // Create new tank for player (pass obstacles to ensure valid spawn)
  const tank = new Tank(socket.id, generatedObstacles);
  players[socket.id] = tank;

  // Reset game if it was finished and we're starting fresh
  if (gameState === 'finished') {
    gameState = 'waiting';
    gameStartTime = null;
    gameWinner = null;
    projectiles.length = 0;
    
    // Reset all existing players' status for the new game
    Object.values(players).forEach(player => {
      player.isAlive = true;
      player.health = TANK_MAX_HEALTH;
      player.score = 0;
      player.kills = 0;
      player.livesRemaining = 3;
      player.velocityX = 0;
      player.velocityY = 0;
    });
    
    console.log('Game reset from finished state');
  }

  // Start game if first player joins (only if not already running)
  if (Object.keys(players).length === 1 && gameState === 'waiting') {
    gameStartTime = Date.now();
    gameState = 'running';
    io.emit('gameStarted', {
      startTime: gameStartTime,
      gameDuration: GAME_DURATION
    });
    console.log('Game started with first player');
  }

  // Send initial game state to new player
  socket.emit('init', {
    playerId: socket.id,
    players: players,
    gameWidth: GAME_WIDTH,
    gameHeight: GAME_HEIGHT,
    obstacles: generatedObstacles,
    gameStartTime: gameStartTime,
    gameDuration: GAME_DURATION
  });
  
  console.log(`Player ${socket.id} initialized. Total players: ${Object.keys(players).length}, Game state: ${gameState}`);

  // Notify other players of new player
  socket.broadcast.emit('playerJoined', {
    playerId: socket.id,
    tank: tank
  });

  // Handle player movement
  socket.on('move', (data) => {
    if (players[socket.id] && players[socket.id].isAlive) {
      players[socket.id].velocityX = data.velocityX;
      players[socket.id].velocityY = data.velocityY;
    }
  });

  // Handle tank rotation
  socket.on('rotate', (data) => {
    if (players[socket.id]) {
      players[socket.id].rotation = data.rotation;
    }
  });

  // Handle shooting
  socket.on('shoot', (data) => {
    if (players[socket.id]) {
      const tank = players[socket.id];
      const projectile = new Projectile(
        tank.x + Math.cos(tank.rotation) * TANK_SIZE,
        tank.y + Math.sin(tank.rotation) * TANK_SIZE,
        tank.rotation,
        socket.id
      );
      projectiles.push(projectile);
      io.emit('projectileCreated', {
        x: projectile.x,
        y: projectile.y,
        rotation: projectile.rotation
      });
    }
  });

  // Handle player disconnect
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    delete players[socket.id];
    socket.broadcast.emit('playerLeft', { playerId: socket.id });
    
    // Reset game if all players disconnect
    if (Object.keys(players).length === 0) {
      gameState = 'waiting';
      gameStartTime = null;
      gameWinner = null;
      projectiles.length = 0;
      console.log('All players disconnected. Game reset.');
    }
  });
});

// Game loop - update game state
setInterval(() => {
  // Check win conditions first
  checkWinConditions();
  
  // Skip updates if game is finished
  if (gameState === 'finished') return;
  // Update player positions
  Object.keys(players).forEach(playerId => {
    const tank = players[playerId];
    const newX = tank.x + tank.velocityX;
    const newY = tank.y + tank.velocityY;

    // Check collision with obstacles
    let colliding = false;
    for (let obs of generatedObstacles) {
      if (obs.collidesWith(newX, newY, TANK_SIZE)) {
        colliding = true;
        break;
      }
    }

    // Check collision with other tanks
    if (!colliding) {
      for (let otherPlayerId of Object.keys(players)) {
        if (otherPlayerId !== playerId) {
          const otherTank = players[otherPlayerId];
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

  // Update projectiles
  for (let i = projectiles.length - 1; i >= 0; i--) {
    projectiles[i].update();

    if (projectiles[i].isOutOfBounds()) {
      projectiles.splice(i, 1);
      continue;
    }

    // Check collision with obstacles
    let hitObstacle = false;
    for (let obs of generatedObstacles) {
      if (obs.collidesWith(projectiles[i].x, projectiles[i].y, PROJECTILE_SIZE)) {
        hitObstacle = true;
        const hitX = projectiles[i].x;
        const hitY = projectiles[i].y;
        projectiles.splice(i, 1);
        io.emit('explosion', {
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
    Object.keys(players).forEach(playerId => {
      if (hitTank) return; // Already hit a tank
      
      const tank = players[playerId];
      const dx = projectiles[i].x - tank.x;
      const dy = projectiles[i].y - tank.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < TANK_SIZE + PROJECTILE_SIZE && projectiles[i].playerId !== playerId) {
        hitTank = true;
        const killerPlayerId = projectiles[i].playerId;
        const hitX = projectiles[i].x;
        const hitY = projectiles[i].y;
        
        tank.health -= 10;
        projectiles.splice(i, 1);

        // Broadcast hit explosion (small)
        io.emit('explosion', {
          x: hitX,
          y: hitY,
          size: 'small'
        });

        if (tank.health <= 0) {
          // Award points to killer
          const killerTank = players[killerPlayerId];
          if (killerTank) {
            killerTank.score += 100;
            killerTank.kills += 1;
          }

          // Decrease lives
          tank.livesRemaining -= 1;
          
          if (tank.livesRemaining <= 0) {
            // Mark as spectating (can't move/shoot but stays visible)
            tank.isAlive = false;
            
            io.emit('tankDestroyed', {
              playerId: playerId,
              livesRemaining: 0,
              killerScore: killerTank ? killerTank.score : 0,
              isSpectating: true
            });
          } else {
            // Respawn destroyed tank at a valid location (not on obstacles)
            tank.health = TANK_MAX_HEALTH;
            const destroyX = tank.x;
            const destroyY = tank.y;
            
            let validRespawn = false;
            while (!validRespawn) {
              tank.x = Math.random() * GAME_WIDTH;
              tank.y = Math.random() * GAME_HEIGHT;
              validRespawn = true;
              
              // Check if respawn position collides with any obstacle
              for (let obs of generatedObstacles) {
                if (obs.collidesWith(tank.x, tank.y, TANK_SIZE)) {
                  validRespawn = false;
                  break;
                }
              }
            }
            
            // Broadcast destruction explosion (big) at original position
            io.emit('explosion', {
              x: destroyX,
              y: destroyY,
              size: 'big'
            });
            
            io.emit('tankDestroyed', {
              playerId: playerId,
              livesRemaining: tank.livesRemaining,
              killerScore: killerTank ? killerTank.score : 0
            });
          }
        }
      }
    });
  }

  // Broadcast game state to all clients (includes all players - both active and spectating)
  io.emit('gameState', {
    players: players,
    projectiles: projectiles.map(p => ({ x: p.x, y: p.y, rotation: p.rotation }))
  });
}, 1000 / UPDATE_RATE);

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
