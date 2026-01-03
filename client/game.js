const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const socket = io();

// Get game code from URL
const urlParams = new URLSearchParams(window.location.search);
const gameCode = urlParams.get('code');

// Redirect to lobby if no game code
if (!gameCode) {
  window.location.href = '/lobby.html';
}

let gameState = {
  playerId: null,
  players: {},
  projectiles: [],
  gameWidth: 800,
  gameHeight: 600,
  explosions: [],
  obstacles: [],
  gameStartTime: null,
  gameDuration: null,
  gameFinished: false
};

const keys = {};
let mouseAngle = 0;

// Initialize game when connected
socket.on('connect', () => {
  console.log('Connected to server, initializing game with code:', gameCode);
  socket.emit('initGame', { gameCode: gameCode });
});

// Handle redirect to lobby if game not valid
socket.on('redirectToLobby', () => {
  alert('Game session not found or has not started yet.');
  window.location.href = '/lobby.html';
});


// Audio context and music
let audioContext = null;
let backgroundMusicOscillators = [];
let musicPlaying = false;

// Initialize audio context
function initAudio() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioContext;
}

// Start background music using Web Audio API
function startBackgroundMusic() {
  try {
    const ctx = initAudio();
    // Resume audio context if suspended
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    if (musicPlaying) return;
    
    musicPlaying = true;
    
    // Create a more upbeat battle theme melody
    const notes = [
      261.63, 293.66, 329.63, 392.00, // C4, D4, E4, G4
      349.23, 329.63, 293.66, 261.63  // F4, E4, D4, C4
    ];
    let noteIndex = 0;
    
    function playNote() {
      if (!musicPlaying) return;
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = 'triangle'; // Warmer sound
      osc.frequency.value = notes[noteIndex];
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.03, ctx.currentTime + 0.3);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
      
      backgroundMusicOscillators.push(osc);
      
      noteIndex = (noteIndex + 1) % notes.length;
      
      if (musicPlaying) {
        setTimeout(playNote, 300); // Faster tempo
      }
    }
    
    playNote();
  } catch (e) {
    console.log('Audio not supported');
  }
}

// Stop background music
function stopBackgroundMusic() {
  musicPlaying = false;
  backgroundMusicOscillators.forEach(osc => {
    try {
      osc.stop();
    } catch (e) {
      // Already stopped
    }
  });
  backgroundMusicOscillators = [];
}

// Constants
const TANK_SIZE = 20;
const PROJECTILE_SIZE = 5;

// Explosion class
class Explosion {
  constructor(x, y, size = 'small') {
    this.x = x;
    this.y = y;
    this.size = size;
    this.maxRadius = size === 'big' ? 60 : 30;
    this.currentRadius = 0;
    this.maxAge = size === 'big' ? 30 : 20; // frames
    this.age = 0;
  }

  update() {
    this.age++;
    this.currentRadius = (this.age / this.maxAge) * this.maxRadius;
  }

  isAlive() {
    return this.age < this.maxAge;
  }

  draw(ctx) {
    const progress = this.age / this.maxAge;
    const opacity = Math.max(0, 1 - progress);
    
    ctx.fillStyle = `rgba(255, 100, 0, ${opacity * 0.6})`;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.currentRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(255, 200, 0, ${opacity * 0.4})`;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.currentRadius * 0.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `rgba(255, 100, 0, ${opacity})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.currentRadius, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// Socket events
socket.on('init', (data) => {
  gameState.playerId = data.playerId;
  gameState.players = data.players;
  gameState.gameWidth = data.gameWidth;
  gameState.gameHeight = data.gameHeight;
  gameState.obstacles = data.obstacles || [];
  gameState.gameStartTime = data.gameStartTime;
  gameState.gameDuration = data.gameDuration;
  console.log('Connected with ID:', data.playerId);
  console.log('Players:', Object.keys(gameState.players).length);
  updatePlayerCount();
  startBackgroundMusic();
});

socket.on('playerJoined', (data) => {
  gameState.players[data.playerId] = data.tank;
  updatePlayerCount();
});

socket.on('playerLeft', (data) => {
  delete gameState.players[data.playerId];
  updatePlayerCount();
});

socket.on('gameStarted', (data) => {
  gameState.gameStartTime = data.startTime;
  gameState.gameDuration = data.gameDuration;
  gameState.gameFinished = false;
  
  // Update players with reset data if provided
  if (data.players) {
    gameState.players = data.players;
  }
  
  // Hide finish screen if visible
  const finishScreen = document.getElementById('finishScreen');
  if (finishScreen) {
    finishScreen.classList.add('hidden');
  }
  
  // Re-enable restart button for next game
  const restartBtn = document.getElementById('restartBtn');
  if (restartBtn) {
    restartBtn.textContent = 'Restart Game';
    restartBtn.disabled = false;
  }
  
  // Restart background music
  startBackgroundMusic();
  
  updatePlayerCount();
  console.log('Game started!', 'Players:', Object.keys(gameState.players).length);
});

socket.on('restartProgress', (data) => {
  const restartBtn = document.getElementById('restartBtn');
  if (restartBtn) {
    restartBtn.textContent = `Waiting... (${data.ready}/${data.total} ready)`;
  }
});

socket.on('gameEnded', (data) => {
  gameState.gameFinished = true;
  stopBackgroundMusic();
  showFinishScreen(data);
  console.log('Game ended:', data);
});

socket.on('gameState', (data) => {
  gameState.players = data.players;
  gameState.projectiles = data.projectiles;
});

socket.on('projectileCreated', (data) => {
  // Handled by gameState update
});

socket.on('tankDestroyed', (data) => {
  if (data.livesRemaining !== undefined) {
    console.log(`Player destroyed! Lives remaining: ${data.livesRemaining}`);
  }
  if (data.killerScore && data.killerScore > 0) {
    console.log('Player killed! Score:', data.killerScore);
  }
  if (data.isSpectating) {
    console.log(`Player ${data.playerId} is now spectating`);
  }
});

socket.on('explosion', (data) => {
  const explosion = new Explosion(data.x, data.y, data.size);
  gameState.explosions.push(explosion);
  
  // Play explosion sound effect (Web Audio API)
  playExplosionSound(data.size);
});

// Keyboard input
document.addEventListener('keydown', (e) => {
  keys[e.key] = true;
});

document.addEventListener('keyup', (e) => {
  keys[e.key] = false;
});

// Mouse movement for aiming
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  if (gameState.players[gameState.playerId]) {
    const tank = gameState.players[gameState.playerId];
    const dx = mouseX - tank.x;
    const dy = mouseY - tank.y;
    mouseAngle = Math.atan2(dy, dx);
    socket.emit('rotate', { rotation: mouseAngle });
  }
});

// Canvas click to shoot
canvas.addEventListener('click', () => {
  playShootSound();
  socket.emit('shoot', {});
});

// Explosion sound effect using Web Audio API
function playExplosionSound(size) {
  try {
    const ctx = initAudio();
    // Resume audio context if suspended
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    const now = ctx.currentTime;

    if (size === 'big') {
      // Big explosion: deeper, longer sound
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.frequency.setValueAtTime(150, now);
      oscillator.frequency.exponentialRampToValueAtTime(50, now + 0.3);
      
      gainNode.gain.setValueAtTime(0.3, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      
      oscillator.start(now);
      oscillator.stop(now + 0.3);
    } else {
      // Small explosion: shorter, higher pitched
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.frequency.setValueAtTime(200, now);
      oscillator.frequency.exponentialRampToValueAtTime(100, now + 0.15);
      
      gainNode.gain.setValueAtTime(0.2, now);
      gainNode.gain.exponentialRampToValueAtValue(0.01, now + 0.15);
      
      oscillator.start(now);
      oscillator.stop(now + 0.15);
    }
  } catch (e) {
    // Audio context not supported, silently fail
  }
}

// Shoot sound effect
function playShootSound() {
  try {
    const ctx = initAudio();
    // Resume audio context if suspended
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    const now = ctx.currentTime;
    
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(400, now);
    oscillator.frequency.exponentialRampToValueAtTime(200, now + 0.1);
    
    gainNode.gain.setValueAtTime(0.15, now);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    
    oscillator.start(now);
    oscillator.stop(now + 0.1);
  } catch (e) {
    // Audio context not supported, silently fail
  }
}

// Game loop
function gameLoop() {
  // Update game timer
  if (gameState.gameStartTime && gameState.gameDuration) {
    const elapsed = Date.now() - gameState.gameStartTime;
    const remaining = Math.max(0, gameState.gameDuration - elapsed);
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    document.getElementById('gameTime').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  // Handle movement input
  const myTank = gameState.players[gameState.playerId];
  if (myTank) {
    let velocityX = 0;
    let velocityY = 0;

    // Only allow movement if player is alive (not spectating)
    if (myTank.isAlive) {
      if (keys['ArrowUp'] || keys['w'] || keys['W']) velocityY -= 5;
      if (keys['ArrowDown'] || keys['s'] || keys['S']) velocityY += 5;
      if (keys['ArrowLeft'] || keys['a'] || keys['A']) velocityX -= 5;
      if (keys['ArrowRight'] || keys['d'] || keys['D']) velocityX += 5;

      if (velocityX !== 0 || velocityY !== 0) {
        socket.emit('move', { velocityX, velocityY });
      } else {
        socket.emit('move', { velocityX: 0, velocityY: 0 });
      }
    } else {
      // Debug: Log once if not alive
      if (!window._loggedNotAlive) {
        console.log('Cannot move - tank isAlive:', myTank.isAlive);
        window._loggedNotAlive = true;
      }
    }

    // Update health display
    document.getElementById('health').textContent = Math.max(0, Math.round(myTank.health));

    // Update lives display
    document.getElementById('lives').textContent = myTank.livesRemaining || 0;

    // Update score and kills display
    document.getElementById('score').textContent = myTank.score;
    document.getElementById('kills').textContent = myTank.kills;
  }

  // Update leaderboard
  updateLeaderboard();

  // Update explosions
  for (let i = gameState.explosions.length - 1; i >= 0; i--) {
    gameState.explosions[i].update();
    if (!gameState.explosions[i].isAlive()) {
      gameState.explosions.splice(i, 1);
    }
  }

  // Clear canvas
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw grid for reference
  drawGrid();

  // Draw obstacles
  gameState.obstacles.forEach(obstacle => {
    drawObstacle(obstacle);
  });

  // Draw all tanks
  Object.keys(gameState.players).forEach(playerId => {
    const tank = gameState.players[playerId];
    drawTank(tank, playerId === gameState.playerId);
  });

  // Draw all projectiles
  gameState.projectiles.forEach(projectile => {
    drawProjectile(projectile);
  });

  // Draw all explosions
  gameState.explosions.forEach(explosion => {
    explosion.draw(ctx);
  });

  requestAnimationFrame(gameLoop);
}

function drawTank(tank, isPlayer) {
  const x = tank.x;
  const y = tank.y;
  const rotation = tank.rotation;
  
  // Determine tank color based on player status
  let tankColor = isPlayer ? '#00ff00' : '#ff0000';
  const isSpectating = !tank.isAlive;
  const opacity = isSpectating ? 0.5 : 1;
  
  if (isSpectating) {
    tankColor = '#888888';
  }

  // Draw tank body
  ctx.fillStyle = tankColor;
  ctx.globalAlpha = opacity;
  ctx.beginPath();
  ctx.arc(x, y, TANK_SIZE, 0, Math.PI * 2);
  ctx.fill();

  // Draw tank barrel
  ctx.strokeStyle = tankColor;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(
    x + Math.cos(rotation) * (TANK_SIZE + 10),
    y + Math.sin(rotation) * (TANK_SIZE + 10)
  );
  ctx.stroke();

  // Draw health bar
  const healthPercent = tank.health / 100;
  ctx.fillStyle = '#333';
  ctx.fillRect(x - TANK_SIZE, y + TANK_SIZE + 5, TANK_SIZE * 2, 5);
  ctx.fillStyle = healthPercent > 0.5 ? '#00ff00' : healthPercent > 0.25 ? '#ffff00' : '#ff0000';
  ctx.fillRect(x - TANK_SIZE, y + TANK_SIZE + 5, TANK_SIZE * 2 * healthPercent, 5);
  
  // Draw "SPECTATING" label if dead
  if (isSpectating) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#888888';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('SPECTATING', x, y - TANK_SIZE - 5);
  }
  
  ctx.globalAlpha = 1; // Reset opacity
}

function drawProjectile(projectile) {
  ctx.fillStyle = '#ffff00';
  ctx.beginPath();
  ctx.arc(projectile.x, projectile.y, PROJECTILE_SIZE, 0, Math.PI * 2);
  ctx.fill();
}

function drawGrid() {
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 1;
  const gridSize = 50;

  for (let x = 0; x < canvas.width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  for (let y = 0; y < canvas.height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

function drawObstacle(obstacle) {
  ctx.fillStyle = '#555';
  ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
  
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 2;
  ctx.strokeRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
}

function updatePlayerCount() {
  document.getElementById('playerCount').textContent = Object.keys(gameState.players).length;
}

function updateLeaderboard() {
  const scoreList = document.getElementById('scoreList');
  const players = Object.values(gameState.players)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  scoreList.innerHTML = players.map((player, index) => {
    const isMe = player.id === gameState.playerId ? ' (You)' : '';
    const topClass = index < 3 ? ` top-${index + 1}` : '';
    return `<li class="${topClass}">${index + 1}. ${player.score} pts${isMe}</li>`;
  }).join('');
}

// Show finish screen with game results
function showFinishScreen(data) {
  const finishScreen = document.getElementById('finishScreen');
  const finishTitle = document.getElementById('finishTitle');
  const finishReason = document.getElementById('finishReason');
  const finishStatus = document.getElementById('finishStatus');
  const finishStats = document.getElementById('finishStats');

  // Determine if player won or lost
  const isPlayerWinner = data.winner === gameState.playerId;
  
  // Set title based on result
  finishTitle.textContent = isPlayerWinner ? '🎉 YOU WIN! 🎉' : 'GAME OVER';
  finishTitle.style.color = isPlayerWinner ? '#ffff00' : '#ff6600';
  
  // Set reason
  finishReason.textContent = data.reason;
  
  // Set status
  if (isPlayerWinner) {
    finishStatus.textContent = '✨ Congratulations, Champion! ✨';
    finishStatus.style.color = '#ffff00';
  } else {
    finishStatus.textContent = 'Better luck next time!';
    finishStatus.style.color = '#ff6600';
  }

  // Display stats
  const myTank = gameState.players[gameState.playerId];
  if (myTank) {
    finishStats.innerHTML = `
      <p>Your Score: <span>${myTank.score}</span></p>
      <p>Your Kills: <span>${myTank.kills}</span></p>
      <p>Your Health: <span>${Math.max(0, Math.round(myTank.health))}</span></p>
      <p>Total Players: <span>${data.survivors || Object.keys(gameState.players).length}</span></p>
    `;
  }

  // Show the finish screen
  finishScreen.classList.remove('hidden');
}

// Setup finish screen button handlers
document.getElementById('restartBtn').addEventListener('click', () => {
  socket.emit('requestRestart');
  document.getElementById('restartBtn').textContent = 'Waiting for other players...';
  document.getElementById('restartBtn').disabled = true;
});

document.getElementById('closeBtn').addEventListener('click', () => {
  window.location.href = '/lobby.html';
});

// Start game loop
gameLoop();
