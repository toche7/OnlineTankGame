const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const socket = io();

let gameState = {
  playerId: null,
  players: {},
  projectiles: [],
  gameWidth: 800,
  gameHeight: 600,
  explosions: [],
  obstacles: []
};

const keys = {};
let mouseAngle = 0;

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
    if (musicPlaying) return;
    
    musicPlaying = true;
    
    // Create a simple looping background music pattern
    const notes = [130.81, 146.83, 164.81, 174.61]; // C3, D3, E3, F3
    let noteIndex = 0;
    
    function playNote() {
      if (!musicPlaying) return;
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = 'sine';
      osc.frequency.value = notes[noteIndex];
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.4);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
      
      backgroundMusicOscillators.push(osc);
      
      noteIndex = (noteIndex + 1) % notes.length;
      
      if (musicPlaying) {
        setTimeout(playNote, 400);
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
  console.log('Connected with ID:', data.playerId);
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

socket.on('gameState', (data) => {
  gameState.players = data.players;
  gameState.projectiles = data.projectiles;
});

socket.on('projectileCreated', (data) => {
  // Handled by gameState update
});

socket.on('tankDestroyed', (data) => {
  // Tank is respawned on server, just visual feedback
  if (data.killerScore && data.killerScore > 0) {
    console.log('Player killed! Score:', data.killerScore);
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
  // Handle movement input
  const myTank = gameState.players[gameState.playerId];
  if (myTank) {
    let velocityX = 0;
    let velocityY = 0;

    if (keys['ArrowUp'] || keys['w'] || keys['W']) velocityY -= 5;
    if (keys['ArrowDown'] || keys['s'] || keys['S']) velocityY += 5;
    if (keys['ArrowLeft'] || keys['a'] || keys['A']) velocityX -= 5;
    if (keys['ArrowRight'] || keys['d'] || keys['D']) velocityX += 5;

    if (velocityX !== 0 || velocityY !== 0) {
      socket.emit('move', { velocityX, velocityY });
    } else {
      socket.emit('move', { velocityX: 0, velocityY: 0 });
    }

    // Update health display
    document.getElementById('health').textContent = Math.max(0, Math.round(myTank.health));

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

  // Draw tank body
  ctx.fillStyle = isPlayer ? '#00ff00' : '#ff0000';
  ctx.beginPath();
  ctx.arc(x, y, TANK_SIZE, 0, Math.PI * 2);
  ctx.fill();

  // Draw tank barrel
  ctx.strokeStyle = isPlayer ? '#00ff00' : '#ff0000';
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

// Start game loop
gameLoop();
