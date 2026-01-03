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

// Check win conditions for a specific lobby
function checkWinConditions(gameCode) {
  if (!gameCode || !lobbies[gameCode]) return false;
  
  const lobby = lobbies[gameCode];
  if (lobby.state !== 'playing') return false;
  
  // Check if only 1 player alive (early win condition)
  if (Object.keys(lobby.gamePlayers).length > 1) {
    const alivePlayers = Object.values(lobby.gamePlayers).filter(p => p.isAlive);
    if (alivePlayers.length === 1) {
      lobby.state = 'waiting'; // Reset to waiting so players can start new game
      lobby.gameWinner = alivePlayers[0].id;
      
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
        returnToLobby: true
      });
      
      // Broadcast lobby status update
      broadcastLobbyStatus();
      
      return true;
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
      returnToLobby: true
    });
    
    // Broadcast lobby status update
    broadcastLobbyStatus();
    
    return true;
  }
  
  return false;
}

// Broadcast lobby status to all clients
function broadcastLobbyStatus() {
  const playingGames = Object.values(lobbies).filter(l => l.state === 'playing').length;
  const waitingRooms = Object.values(lobbies).filter(l => l.state === 'waiting').length;
  
  const lobbiesList = Object.keys(lobbies).map(code => ({
    code: code,
    state: lobbies[code].state,
    playerCount: Object.keys(lobbies[code].players).length
  }));
  
  io.emit('lobbyStatus', {
    playing: playingGames,
    waiting: waitingRooms,
    lobbies: lobbiesList
  });
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);
  
  // Send lobby status when requested
  socket.on('requestLobbyStatus', () => {
    const playingGames = Object.values(lobbies).filter(l => l.state === 'playing').length;
    const waitingRooms = Object.values(lobbies).filter(l => l.state === 'waiting').length;
    
    const lobbiesList = Object.keys(lobbies).map(code => ({
      code: code,
      state: lobbies[code].state,
      playerCount: Object.keys(lobbies[code].players).length
    }));
    
    socket.emit('lobbyStatus', {
      playing: playingGames,
      waiting: waitingRooms,
      lobbies: lobbiesList
    });
  });
  
  // Lobby event handlers
  socket.on('createGame', () => {
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
      state: 'waiting',
      gameStartTime: null,
      gameWinner: null,
      // Per-lobby game state
      gamePlayers: {}, // In-game player tanks
      gameProjectiles: [],
      gameObstacles: [],
      playersReadyToRestart: new Set()
    };
    
    lobbies[gameCode].players[socket.id] = {
      id: socket.id,
      isHost: true
    };
    
    socket.join(gameCode);
    socket.gameCode = gameCode;
    
    socket.emit('gameCreated', {
      gameCode: gameCode,
      players: lobbies[gameCode].players
    });
    
    // Broadcast lobby status update to all connected clients
    broadcastLobbyStatus();
    
    console.log(`Game ${gameCode} created by ${socket.id}`);
  });
  
  socket.on('joinGame', (data) => {
    const gameCode = data.gameCode.toUpperCase();
    
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
      isHost: false
    };
    
    socket.join(gameCode);
    socket.gameCode = gameCode;
    
    socket.emit('gameJoined', {
      gameCode: gameCode,
      players: lobbies[gameCode].players
    });
    
    // Notify other players in lobby
    socket.to(gameCode).emit('playerJoinedLobby', {
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
    
    // Check if this player was the host by comparing oldSocketId with hostGameSocketId
    const wasHost = data.oldSocketId && 
                    lobbies[gameCode].hostGameSocketId === data.oldSocketId;
    
    // Remove old socket ID from players list if it exists
    if (data.oldSocketId && lobbies[gameCode].players[data.oldSocketId]) {
      delete lobbies[gameCode].players[data.oldSocketId];
      console.log(`Removed old socket ID ${data.oldSocketId} from lobby ${gameCode}`);
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
      console.log(`Original host ${socket.id} reclaimed host status in lobby ${gameCode}`);
    } else if (Object.keys(lobbies[gameCode].players).length === 0) {
      // If lobby is empty (all old entries), first person becomes host
      lobbies[gameCode].host = socket.id;
      lobbies[gameCode].originalHost = socket.id;
      console.log(`First player ${socket.id} rejoining empty lobby ${gameCode}, assigning as host`);
    }
    
    const isHost = lobbies[gameCode].host === socket.id;
    
    lobbies[gameCode].players[socket.id] = {
      id: socket.id,
      isHost: isHost
    };
    
    socket.join(gameCode);
    socket.gameCode = gameCode;
    
    socket.emit('gameJoined', {
      gameCode: gameCode,
      players: lobbies[gameCode].players
    });
    
    // Notify ALL players in lobby (including the rejoining player)
    // This ensures everyone has the correct host status
    io.to(gameCode).emit('playerJoinedLobby', {
      playerId: socket.id,
      players: lobbies[gameCode].players
    });
    
    console.log(`Player ${socket.id} rejoined game ${gameCode}${isHost ? ' as host' : ''} (was original host: ${wasHost})`);
  });
  
  socket.on('startGame', (data) => {
    const gameCode = data.gameCode;
    const tankSpeed = data.tankSpeed || TANK_SPEED; // Default if not provided
    const melody = data.melody || 'battle'; // Default melody
    
    if (!lobbies[gameCode] || lobbies[gameCode].host !== socket.id) {
      socket.emit('lobbyError', { message: 'Only host can start the game!' });
      return;
    }
    
    if (lobbies[gameCode].state !== 'waiting') {
      socket.emit('lobbyError', { message: 'Game already started!' });
      return;
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
    
    // Initialize game state for this lobby
    lobbies[gameCode].gameObstacles = generateObstacles();
    lobbies[gameCode].gamePlayers = {};
    lobbies[gameCode].gameProjectiles = [];
    
    // Notify all players in the lobby
    io.to(gameCode).emit('gameStarting', {
      startTime: lobbies[gameCode].gameStartTime,
      gameDuration: GAME_DURATION,
      tankSpeed: tankSpeed,
      melody: melody
    });
    
    // Broadcast lobby status update
    broadcastLobbyStatus();
    
    console.log(`Game ${gameCode} started by host ${socket.id} with tank speed: ${tankSpeed}, melody: ${melody}`);
  });
  
  socket.on('leaveLobby', (data) => {
    const gameCode = data.gameCode;
    
    if (!lobbies[gameCode]) return;
    
    const wasHost = lobbies[gameCode].host === socket.id;
    delete lobbies[gameCode].players[socket.id];
    socket.leave(gameCode);
    
    if (Object.keys(lobbies[gameCode].players).length === 0) {
      // Delete lobby if empty
      delete lobbies[gameCode];
      console.log(`Lobby ${gameCode} deleted (empty)`);
      broadcastLobbyStatus();
    } else if (wasHost) {
      // Assign new host
      const newHost = Object.keys(lobbies[gameCode].players)[0];
      lobbies[gameCode].host = newHost;
      lobbies[gameCode].players[newHost].isHost = true;
      
      io.to(gameCode).emit('playerLeftLobby', {
        playerId: socket.id,
        players: lobbies[gameCode].players,
        newHost: newHost
      });
      
      console.log(`New host for ${gameCode}: ${newHost}`);
    } else {
      io.to(gameCode).emit('playerLeftLobby', {
        playerId: socket.id,
        players: lobbies[gameCode].players
      });
    }
  });

  // Game initialization - validate player is from a valid lobby
  socket.on('initGame', (data) => {
    const gameCode = data.gameCode;
    
    console.log(`InitGame called by ${socket.id} for game ${gameCode}`);
    console.log(`Lobby exists: ${!!lobbies[gameCode]}, State: ${lobbies[gameCode]?.state}`);
    
    if (!gameCode || !lobbies[gameCode]) {
      console.log(`Lobby ${gameCode} not found, redirecting to lobby`);
      socket.emit('redirectToLobby');
      return;
    }
    
    if (lobbies[gameCode].state !== 'playing') {
      console.log(`Game ${gameCode} state is ${lobbies[gameCode].state}, not playing. Redirecting.`);
      socket.emit('redirectToLobby');
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
    
    // Track if this player was the host in the lobby (first player to join game)
    if (!lobbies[gameCode].hostGameSocketId && lobbies[gameCode].originalHost) {
      lobbies[gameCode].hostGameSocketId = socket.id;
      console.log(`Host game socket ID set to ${socket.id}`);
    }
    
    // Create new tank for player if not exists
    const lobby = lobbies[gameCode];
    if (!lobby.gamePlayers[socket.id]) {
      const tank = new Tank(socket.id, lobby.gameObstacles);
      lobby.gamePlayers[socket.id] = tank;
      console.log(`Created tank for player ${socket.id}, isAlive: ${tank.isAlive}`);
    }

    // Send initial game state to new player
    socket.emit('init', {
      playerId: socket.id,
      players: lobby.gamePlayers,
      gameWidth: GAME_WIDTH,
      gameHeight: GAME_HEIGHT,
      obstacles: lobby.gameObstacles,
      gameStartTime: lobby.gameStartTime,
      gameDuration: GAME_DURATION,
      melody: lobbies[gameCode].melody || 'battle'
    });
    
    console.log(`Player ${socket.id} initialized for game ${socket.gameCode}. Total players: ${Object.keys(lobby.gamePlayers).length}`);

    // Notify other players of new player
    socket.to(socket.gameCode).emit('playerJoined', {
      playerId: socket.id,
      tank: players[socket.id]
    });
  });

  // Handle player movement
  socket.on('move', (data) => {
    const gameCode = socket.gameCode;
    if (!gameCode || !lobbies[gameCode]) return;
    
    const lobby = lobbies[gameCode];
    if (lobby.gamePlayers[socket.id]) {
      if (lobby.gamePlayers[socket.id].isAlive) {
        const speedMultiplier = lobby.tankSpeed ? (lobby.tankSpeed / TANK_SPEED) : 1;
        lobby.gamePlayers[socket.id].velocityX = data.velocityX * speedMultiplier;
        lobby.gamePlayers[socket.id].velocityY = data.velocityY * speedMultiplier;
      } else {
        console.log(`Player ${socket.id} tried to move but isAlive is false`);
      }
    } else {
      console.log(`Move event from ${socket.id} but player not found in lobby players`);
    }
  });

  // Handle tank rotation
  socket.on('rotate', (data) => {
    const gameCode = socket.gameCode;
    if (!gameCode || !lobbies[gameCode]) return;
    
    const lobby = lobbies[gameCode];
    if (lobby.gamePlayers[socket.id]) {
      lobby.gamePlayers[socket.id].rotation = data.rotation;
    }
  });

  // Handle shooting
  socket.on('shoot', (data) => {
    const gameCode = socket.gameCode;
    if (!gameCode || !lobbies[gameCode]) return;
    
    const lobby = lobbies[gameCode];
    if (lobby.gamePlayers[socket.id]) {
      const tank = lobby.gamePlayers[socket.id];
      const projectile = new Projectile(
        tank.x + Math.cos(tank.rotation) * TANK_SIZE,
        tank.y + Math.sin(tank.rotation) * TANK_SIZE,
        tank.rotation,
        socket.id
      );
      lobby.gameProjectiles.push(projectile);
      io.to(gameCode).emit('projectileCreated', {
        x: projectile.x,
        y: projectile.y,
        rotation: projectile.rotation
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
    
    if (gameState === 'finished' || lobbies[gameCode].state === 'finished') {
      playersReadyToRestart.add(socket.id);
      
      // Count players currently in the game
      const currentPlayers = Object.keys(players);
      const readyPlayers = Array.from(playersReadyToRestart).filter(id => currentPlayers.includes(id));
      
      console.log(`Player ${socket.id} ready to restart. ${readyPlayers.length}/${currentPlayers.length} ready`);
      
      // Broadcast ready count to all players in this game
      io.to(gameCode).emit('restartProgress', {
        ready: readyPlayers.length,
        total: currentPlayers.length
      });
      
      // Check if all current players are ready
      if (readyPlayers.length >= currentPlayers.length && currentPlayers.length > 0) {
        console.log('All players ready! Restarting game...');
        
        // Reset game state
        gameState = 'running';
        gameStartTime = null;
        gameWinner = null;
        projectiles.length = 0;
        playersReadyToRestart.clear();
        lobbies[gameCode].state = 'playing';
        lobbies[gameCode].gameStartTime = Date.now();
        
        // Reset all players' status for the new game
        Object.values(players).forEach(player => {
          player.isAlive = true;
          player.health = TANK_MAX_HEALTH;
          player.score = 0;
          player.kills = 0;
          player.livesRemaining = 3;
          player.velocityX = 0;
          player.velocityY = 0;
          
          // Respawn at random valid location
          let validSpawn = false;
          while (!validSpawn) {
            player.x = Math.random() * GAME_WIDTH;
            player.y = Math.random() * GAME_HEIGHT;
            validSpawn = true;
            
            for (let obs of generatedObstacles) {
              if (obs.collidesWith(player.x, player.y, TANK_SIZE)) {
                validSpawn = false;
                break;
              }
            }
          }
        });
        
        // Start new game
        gameStartTime = Date.now();
        gameState = 'running';
        
        // Send updated game state with reset players to all clients
        io.to(gameCode).emit('gameStarted', {
          startTime: gameStartTime,
          gameDuration: GAME_DURATION,
          players: players // Send updated player data
        });
        console.log('New game started!');
      }
    }
  });

  // Handle player disconnect
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    
    const gameCode = socket.gameCode;
    
    // Remove from lobby game players if in a game
    if (gameCode && lobbies[gameCode]) {
      delete lobbies[gameCode].gamePlayers[socket.id];
      if (lobbies[gameCode].playersReadyToRestart) {
        lobbies[gameCode].playersReadyToRestart.delete(socket.id);
      }
    }
    
    // Handle lobby cleanup
    if (gameCode && lobbies[gameCode]) {
      const wasInLobby = lobbies[gameCode].players[socket.id];
      
      // Only handle lobby cleanup if game is NOT playing (waiting state)
      // If playing, players are just transitioning to game page with new socket IDs
      if (wasInLobby && lobbies[gameCode].state === 'waiting') {
        const wasHost = lobbies[gameCode].host === socket.id;
        delete lobbies[gameCode].players[socket.id];
        
        if (Object.keys(lobbies[gameCode].players).length === 0) {
          // Delete lobby if empty
          delete lobbies[gameCode];
          console.log(`Lobby ${gameCode} deleted (empty)`);
        } else if (wasHost) {
          // Assign new host if in waiting state
          const newHost = Object.keys(lobbies[gameCode].players)[0];
          lobbies[gameCode].host = newHost;
          lobbies[gameCode].players[newHost].isHost = true;
          
          io.to(gameCode).emit('playerLeftLobby', {
            playerId: socket.id,
            players: lobbies[gameCode].players,
            newHost: newHost
          });
          
          console.log(`New host for ${gameCode}: ${newHost}`);
        } else {
          // Just notify about player leaving
          io.to(gameCode).emit('playerLeftLobby', {
            playerId: socket.id,
            players: lobbies[gameCode].players
          });
        }
      } else if (wasInLobby && lobbies[gameCode].state === 'playing') {
        // Player left during active game - DON'T remove from lobby players list
        // They might be transitioning back to lobby after game ends
        console.log(`Player ${socket.id} disconnected during active game in lobby ${gameCode}.`);
      } else if (wasInLobby && lobbies[gameCode].state === 'finished') {
        // Game is finished, player might be transitioning back to lobby
        console.log(`Player ${socket.id} disconnected from finished game in lobby ${gameCode}.`);
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

// Game loop - update game state for each lobby
setInterval(() => {
  // Process each lobby separately
  Object.keys(lobbies).forEach(gameCode => {
    const lobby = lobbies[gameCode];
    
    // Skip if not playing
    if (lobby.state !== 'playing') return;
    
    // Check win conditions for this lobby
    checkWinConditions(gameCode);
    if (lobby.state === 'finished') return;
    
    // Update player positions for this lobby
    Object.keys(lobby.gamePlayers).forEach(playerId => {
      const tank = lobby.gamePlayers[playerId];
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
        const dx = lobby.gameProjectiles[i].x - tank.x;
        const dy = lobby.gameProjectiles[i].y - tank.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < TANK_SIZE + PROJECTILE_SIZE && lobby.gameProjectiles[i].playerId !== playerId) {
          hitTank = true;
          const killerPlayerId = lobby.gameProjectiles[i].playerId;
          const hitX = lobby.gameProjectiles[i].x;
          const hitY = lobby.gameProjectiles[i].y;
          
          tank.health -= 10;
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
                for (let obs of lobby.gameObstacles) {
                  if (obs.collidesWith(tank.x, tank.y, TANK_SIZE)) {
                    validRespawn = false;
                    break;
                  }
                }
              }
              
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
          }        }
      });
    }

    // Broadcast game state to all clients in this lobby
    io.to(gameCode).emit('gameState', {
      players: lobby.gamePlayers,
      projectiles: lobby.gameProjectiles.map(p => ({ x: p.x, y: p.y, rotation: p.rotation }))
    });
  }); // End of lobbies forEach
}, 1000 / UPDATE_RATE);

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Local network access: http://192.168.1.114:${PORT}`);
});
