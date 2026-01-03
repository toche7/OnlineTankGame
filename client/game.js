const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const socket = io();

// Get game code from URL
const urlParams = new URLSearchParams(window.location.search);
const gameCode = urlParams.get('code');
const wasHost = urlParams.get('wasHost') === 'true';

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
  weapons: [],
  powerups: [],
  gameStartTime: null,
  gameDuration: null,
  gameFinished: false
};

const keys = {};
let mouseAngle = 0;
let selectedMelody = 'battle'; // Default melody

// Initialize game when connected
socket.on('connect', () => {
  console.log('Connected to server, initializing game with code:', gameCode, 'wasHost:', wasHost);
  socket.emit('initGame', { gameCode: gameCode, wasHost: wasHost });
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

// Melody patterns
const melodies = {
  battle: {
    notes: [261.63, 293.66, 329.63, 392.00, 349.23, 329.63, 293.66, 261.63], // C4, D4, E4, G4, F4, E4, D4, C4
    type: 'triangle',
    tempo: 300,
    volume: 0.08
  },
  classic: {
    notes: [261.63, 329.63, 392.00, 329.63, 261.63, 293.66, 349.23, 293.66], // C-E-G-E-C-D-F-D
    type: 'sine',
    tempo: 400,
    volume: 0.1
  },
  intense: {
    notes: [261.63, 277.18, 293.66, 311.13, 329.63, 349.23, 369.99, 392.00], // Chromatic rise
    type: 'square',
    tempo: 200,
    volume: 0.06
  },
  chill: {
    notes: [261.63, 293.66, 349.23, 392.00, 349.23, 293.66], // C-D-F-G-F-D
    type: 'sine',
    tempo: 500,
    volume: 0.09
  },
  epic: {
    notes: [196.00, 261.63, 329.63, 392.00, 493.88, 392.00, 329.63, 261.63], // G3-C4-E4-G4-B4-G4-E4-C4
    type: 'triangle',
    tempo: 350,
    volume: 0.1
  },
  retro: {
    notes: [523.25, 493.88, 440.00, 392.00, 349.23, 329.63, 293.66, 261.63], // C5 down to C4
    type: 'square',
    tempo: 250,
    volume: 0.07
  }
};

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
    
    // Get selected melody settings
    const melody = melodies[selectedMelody] || melodies.battle;
    const notes = melody.notes;
    const waveType = melody.type;
    const tempo = melody.tempo;
    const volume = melody.volume;
    
    let noteIndex = 0;
    
    function playNote() {
      if (!musicPlaying) return;
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = waveType;
      osc.frequency.value = notes[noteIndex];
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(volume * 0.4, ctx.currentTime + (tempo / 1000));
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + (tempo / 1000));
      
      backgroundMusicOscillators.push(osc);
      
      noteIndex = (noteIndex + 1) % notes.length;
      
      if (musicPlaying) {
        setTimeout(playNote, tempo);
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
  gameState.weapons = data.weapons || [];
  gameState.powerups = data.powerups || [];
  gameState.gameStartTime = data.gameStartTime;
  gameState.gameDuration = data.gameDuration;
  selectedMelody = data.melody || 'battle';
  console.log('Connected with ID:', data.playerId);
  console.log('Players:', Object.keys(gameState.players).length);
  console.log('Melody:', selectedMelody);
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
  
  if (data.returnToLobby) {
    // Show results briefly then return to lobby with game code
    showFinishScreen(data);
    setTimeout(() => {
      window.location.href = `/lobby.html?rejoin=${gameCode}&oldSocketId=${socket.id}`;
    }, 5000); // Show results for 5 seconds
  } else {
    showFinishScreen(data);
  }
  
  console.log('Game ended:', data);
});

socket.on('gameState', (data) => {
  gameState.players = data.players;
  gameState.projectiles = data.projectiles;
  gameState.weapons = data.weapons || [];
  gameState.powerups = data.powerups || [];
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

socket.on('weaponPickup', (data) => {
  console.log(`Player ${data.playerId} picked up weapon: ${data.weapon}`);
  // Show notification
  if (data.playerId === gameState.playerId) {
    showNotification(`Picked up ${data.weapon.replace('_', ' ')}!`, '#ff6b6b');
  }
});

socket.on('powerupPickup', (data) => {
  console.log(`Player ${data.playerId} picked up powerup: ${data.powerup}`);
  // Show notification
  if (data.playerId === gameState.playerId) {
    showNotification(`Picked up ${data.powerup.replace('_', ' ')}!`, '#4ecdc4');
  }
});

socket.on('weaponExpired', (data) => {
  if (data.playerId === gameState.playerId) {
    showNotification('Weapon expired', '#999');
  }
});

socket.on('powerupExpired', (data) => {
  if (data.playerId === gameState.playerId) {
    showNotification('Power-up expired', '#999');
  }
});

function showNotification(message, color) {
  const notification = document.createElement('div');
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 100px;
    left: 50%;
    transform: translateX(-50%);
    background: ${color};
    color: white;
    padding: 10px 20px;
    border-radius: 5px;
    font-weight: bold;
    z-index: 1000;
    animation: fadeOut 2s forwards;
  `;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 2000);
}

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
    
    // Update ammo display if limited ammo mode
    if (myTank.ammo !== undefined) {
      const ammoDisplay = document.getElementById('ammoDisplay');
      ammoDisplay.style.display = 'block';
      document.getElementById('ammo').textContent = myTank.ammo;
    }

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

  // Draw weapons
  if (gameState.weapons) {
    gameState.weapons.forEach(weapon => {
      drawWeapon(weapon);
    });
  }

  // Draw powerups
  if (gameState.powerups) {
    gameState.powerups.forEach(powerup => {
      drawPowerup(powerup);
    });
  }

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
  // Different visuals based on weapon type
  switch(projectile.weaponType) {
    case 'RAPID_FIRE':
      // Small red bullets
      ctx.fillStyle = '#ff4444';
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, PROJECTILE_SIZE * 0.7, 0, Math.PI * 2);
      ctx.fill();
      // Add glow
      ctx.shadowBlur = 5;
      ctx.shadowColor = '#ff4444';
      ctx.fill();
      ctx.shadowBlur = 0;
      break;
      
    case 'TRIPLE_SHOT':
      // Green triangular bullets
      ctx.fillStyle = '#44ff44';
      ctx.strokeStyle = '#22aa22';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const size = PROJECTILE_SIZE;
      ctx.moveTo(projectile.x + size, projectile.y);
      ctx.lineTo(projectile.x - size/2, projectile.y + size);
      ctx.lineTo(projectile.x - size/2, projectile.y - size);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
      
    case 'LASER':
      // Blue elongated laser beam
      ctx.strokeStyle = '#4444ff';
      ctx.lineWidth = 3;
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#4444ff';
      ctx.beginPath();
      const length = 15;
      const angle = projectile.rotation;
      ctx.moveTo(projectile.x - Math.cos(angle) * length/2, projectile.y - Math.sin(angle) * length/2);
      ctx.lineTo(projectile.x + Math.cos(angle) * length/2, projectile.y + Math.sin(angle) * length/2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      break;
      
    case 'ROCKETS':
      // Purple rockets with trail
      ctx.fillStyle = '#ff44ff';
      ctx.strokeStyle = '#aa22aa';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, PROJECTILE_SIZE * 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Add exhaust trail
      ctx.fillStyle = 'rgba(255, 136, 68, 0.5)';
      ctx.beginPath();
      const trailAngle = projectile.rotation + Math.PI;
      ctx.arc(projectile.x + Math.cos(trailAngle) * 8, projectile.y + Math.sin(trailAngle) * 8, 3, 0, Math.PI * 2);
      ctx.fill();
      break;
      
    default:
      // Default yellow bullet
      ctx.fillStyle = '#ffff00';
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, PROJECTILE_SIZE, 0, Math.PI * 2);
      ctx.fill();
  }
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

function drawWeapon(weapon) {
  // Draw weapon pickup
  ctx.save();
  ctx.translate(weapon.x, weapon.y);
  
  // Pulsing effect
  const pulse = Math.sin(Date.now() / 200) * 0.2 + 1;
  ctx.scale(pulse, pulse);
  
  // Draw glow
  ctx.shadowBlur = 15;
  ctx.shadowColor = weapon.color;
  
  // Draw weapon icon
  ctx.fillStyle = weapon.color;
  ctx.beginPath();
  ctx.arc(0, 0, weapon.size, 0, Math.PI * 2);
  ctx.fill();
  
  // Draw weapon symbol
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🎯', 0, 0);
  
  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawPowerup(powerup) {
  // Draw powerup pickup
  ctx.save();
  ctx.translate(powerup.x, powerup.y);
  
  // Rotation effect
  const rotation = (Date.now() / 1000) % (Math.PI * 2);
  ctx.rotate(rotation);
  
  // Draw glow
  ctx.shadowBlur = 12;
  ctx.shadowColor = powerup.color;
  
  // Draw powerup icon
  ctx.fillStyle = powerup.color;
  ctx.beginPath();
  ctx.moveTo(0, -powerup.size);
  ctx.lineTo(powerup.size * 0.7, powerup.size * 0.7);
  ctx.lineTo(-powerup.size, 0);
  ctx.lineTo(powerup.size * 0.7, -powerup.size * 0.7);
  ctx.closePath();
  ctx.fill();
  
  // Draw powerup symbol
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('⚡', 0, 0);
  
  ctx.shadowBlur = 0;
  ctx.restore();
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

  // Hide restart button if returning to lobby
  const restartBtn = document.getElementById('restartBtn');
  if (data.returnToLobby && restartBtn) {
    restartBtn.style.display = 'none';
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
  window.location.href = `/lobby.html?rejoin=${gameCode}&oldSocketId=${socket.id}`;
});

// Start game loop
gameLoop();
