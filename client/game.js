const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const socket = io();

// Get game code from URL
const urlParams = new URLSearchParams(window.location.search);
const gameCode = urlParams.get('code');
const wasHost = urlParams.get('wasHost') === 'true';

// Redirect to menu if no game code
if (!gameCode) {
  window.location.href = '/menu.html';
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
  gameFinished: false,
  countdownActive: false,
  countdownValue: 0,
  myTeam: null,
  gameMode: null
};

const keys = {};
let mouseAngle = 0;
let selectedMelody = 'battle'; // Default melody

// Mobile controls state
let isMobile = false;
let touchControls = {
  joystickActive: false,
  joystickCenter: { x: 0, y: 0 },
  joystickPosition: { x: 0, y: 0 },
  joystickBase: null,
  joystickHandle: null,
  fireButton: null,
  // Aim joystick (right side)
  aimJoystickActive: false,
  aimJoystickCenter: { x: 0, y: 0 },
  aimJoystickPosition: { x: 0, y: 0 },
  aimJoystickBase: null,
  aimJoystickHandle: null,
  aimLastAngle: 0,
  aimLastFire: 0,
  autoFireEnabled: false,
  lastTouchAngle: 0
};

// Canvas scaling for responsive design
let canvasScale = 1;
let canvasOffset = { x: 0, y: 0 };

// Get persistent player ID
let persistentPlayerId = localStorage.getItem('tankGamePlayerId');
let username = null; // Will be fetched from server

// Detect if device is mobile/touch-enabled
function detectMobile() {
  return ('ontouchstart' in window) ||
         (navigator.maxTouchPoints > 0) ||
         (navigator.msMaxTouchPoints > 0) ||
         (window.innerWidth <= 768);
}

// Update canvas scaling for responsive design
function updateCanvasScale() {
  if (isMobile && window.innerWidth >= window.innerHeight) {
    // Landscape mobile: fill screen
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  } else {
    // Desktop or portrait: fixed size
    canvas.width = 800;
    canvas.height = 600;
  }
}

// Convert screen coordinates to canvas coordinates
function screenToCanvas(x, y) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (x - rect.left) * (800 / rect.width),
    y: (y - rect.top) * (600 / rect.height)
  };
}

// Initialize mobile controls
function initMobileControls() {
  isMobile = detectMobile();
  console.log('Mobile device detected:', isMobile);

  if (isMobile) {
    // Show mobile controls
    const mobileControls = document.getElementById('mobileControls');
    if (mobileControls) {
      mobileControls.style.display = 'block';
    }

    // Get control elements
    touchControls.joystickBase = document.getElementById('joystickBase');
    touchControls.joystickHandle = document.getElementById('joystickHandle');
    touchControls.aimJoystickBase = document.getElementById('aimJoystickBase');
    touchControls.aimJoystickHandle = document.getElementById('aimJoystickHandle');
    touchControls.fireButton = document.getElementById('fireButton');

    // Initialize joystick
    initJoystick();

    // Initialize aim joystick and fire behavior
    initAimJoystick();
    // Initialize fire button (no-op if missing)
    initFireButton();

    // Initialize auto-fire toggle
    initAutoFireToggle();

    // Update canvas scale initially
    updateCanvasScale();

    // Update canvas scale on resize
    window.addEventListener('resize', updateCanvasScale);
    window.addEventListener('orientationchange', () => {
      setTimeout(updateCanvasScale, 100);
    });
    // Enforce landscape mode: try lock and show overlay if portrait
    enforceLandscapeMode();
  }
}

// Check and enforce landscape mode on mobile: try Screen Orientation API lock, otherwise show overlay
function enforceLandscapeMode() {
  const overlay = document.getElementById('rotateOverlay');
  const mobileControls = document.getElementById('mobileControls');

  function isLandscape() {
    return window.innerWidth >= window.innerHeight;
  }

  function showOverlay() {
    if (overlay) overlay.classList.remove('hidden');
    if (mobileControls) mobileControls.style.display = 'none';
  }

  function hideOverlay() {
    if (overlay) overlay.classList.add('hidden');
    if (mobileControls) mobileControls.style.display = 'block';
    updateCanvasScale();
  }

  // Try to lock orientation where supported (mostly Android/Chrome)
  if (screen.orientation && screen.orientation.lock) {
    screen.orientation.lock('landscape').catch(() => {
      // Lock may fail (iOS Safari or insecure context); fall back to overlay
    });
  }

  // Initial check
  if (!isLandscape()) showOverlay(); else hideOverlay();

  // Listen for changes
  window.addEventListener('orientationchange', () => {
    setTimeout(() => { if (!isLandscape()) showOverlay(); else hideOverlay(); }, 120);
  });
  window.addEventListener('resize', () => { if (!isLandscape()) showOverlay(); else hideOverlay(); });
}

// Initialize virtual joystick
function initJoystick() {
  const joystickBase = touchControls.joystickBase;
  const joystickHandle = touchControls.joystickHandle;

  if (!joystickBase || !joystickHandle) return;

  let isDragging = false;
  let startPos = { x: 0, y: 0 };

  function handleStart(e) {
    e.preventDefault();
    isDragging = true;
    touchControls.joystickActive = true;

    const rect = joystickBase.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    touchControls.joystickCenter = { x: centerX, y: centerY };
    touchControls.joystickPosition = { x: centerX, y: centerY };

    updateJoystickPosition(e);
  }

  function handleMove(e) {
    if (!isDragging) return;
    e.preventDefault();
    updateJoystickPosition(e);
  }

  function handleEnd(e) {
    if (!isDragging) return;
    e.preventDefault();
    isDragging = false;
    touchControls.joystickActive = false;

    // Reset joystick handle position
    joystickHandle.style.transform = 'translate(-50%, -50%)';
    touchControls.joystickPosition = { ...touchControls.joystickCenter };
  }

  function updateJoystickPosition(e) {
    const touch = e.touches ? e.touches[0] : e;
    const rect = joystickBase.getBoundingClientRect();
    const maxDistance = rect.width / 2 - 20; // Leave some margin

    let deltaX = touch.clientX - touchControls.joystickCenter.x;
    let deltaY = touch.clientY - touchControls.joystickCenter.y;

    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    if (distance > maxDistance) {
      deltaX = (deltaX / distance) * maxDistance;
      deltaY = (deltaY / distance) * maxDistance;
    }

    touchControls.joystickPosition.x = touchControls.joystickCenter.x + deltaX;
    touchControls.joystickPosition.y = touchControls.joystickCenter.y + deltaY;

    // Update visual handle position
    const handleX = (deltaX / maxDistance) * 30; // 30px max movement
    const handleY = (deltaY / maxDistance) * 30;
    joystickHandle.style.transform = `translate(calc(-50% + ${handleX}px), calc(-50% + ${handleY}px))`;
  }

  // Touch events
  joystickBase.addEventListener('touchstart', handleStart, { passive: false });
  joystickBase.addEventListener('touchmove', handleMove, { passive: false });
  joystickBase.addEventListener('touchend', handleEnd, { passive: false });
  joystickBase.addEventListener('touchcancel', handleEnd, { passive: false });

  // Mouse events for testing on desktop
  joystickBase.addEventListener('mousedown', handleStart);
  document.addEventListener('mousemove', handleMove);
  document.addEventListener('mouseup', handleEnd);
}

// Initialize fire button
function initFireButton() {
  const fireButton = touchControls.fireButton;
  if (!fireButton) return;

  function handleFire() {
    if (gameState.countdownActive || gameState.gameFinished) return;
    playShootSound();
    socket.emit('shoot', {});
  }

  fireButton.addEventListener('touchstart', (e) => {
    e.preventDefault();
    handleFire();
  });

  fireButton.addEventListener('mousedown', handleFire);
}

// Initialize auto-fire toggle
function initAutoFireToggle() {
  const checkbox = document.getElementById('autoFireCheckbox');
  if (checkbox) {
    checkbox.addEventListener('change', (e) => {
      touchControls.autoFireEnabled = e.target.checked;
    });
  }
}

// Initialize right-side aim joystick (controls turret direction and firing)
function initAimJoystick() {
  const base = touchControls.aimJoystickBase;
  const handle = touchControls.aimJoystickHandle;
  if (!base || !handle) return;

  let isAiming = false;

  function aimStart(e) {
    e.preventDefault();
    isAiming = true;
    touchControls.aimJoystickActive = true;

    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    touchControls.aimJoystickCenter = { x: cx, y: cy };
    touchControls.aimJoystickPosition = { x: cx, y: cy };

    updateAim(e);
  }

  function aimMove(e) {
    if (!isAiming) return;
    e.preventDefault();
    updateAim(e);
  }

  function aimEnd(e) {
    if (!isAiming) return;
    e.preventDefault();
    isAiming = false;
    touchControls.aimJoystickActive = false;
    handle.style.transform = 'translate(-50%, -50%)';
    touchControls.aimJoystickPosition = { ...touchControls.aimJoystickCenter };
  }

  function updateAim(e) {
    const touch = e.touches ? e.touches[0] : e;
    const rect = base.getBoundingClientRect();
    const maxDistance = rect.width / 2 - 12;

    let dx = touch.clientX - touchControls.aimJoystickCenter.x;
    let dy = touch.clientY - touchControls.aimJoystickCenter.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > maxDistance) {
      dx = (dx / dist) * maxDistance;
      dy = (dy / dist) * maxDistance;
    }

    touchControls.aimJoystickPosition.x = touchControls.aimJoystickCenter.x + dx;
    touchControls.aimJoystickPosition.y = touchControls.aimJoystickCenter.y + dy;

    const handleX = (dx / maxDistance) * 30;
    const handleY = (dy / maxDistance) * 30;
    handle.style.transform = `translate(calc(-50% + ${handleX}px), calc(-50% + ${handleY}px))`;

    // Calculate angle and emit rotate
    const angle = Math.atan2(dy, dx);
    touchControls.aimLastAngle = angle;
    socket.emit('rotate', { rotation: angle });

    // If pushed outward enough, fire
    if (dist > 18) {
      const now = Date.now();
      const fireInterval = touchControls.autoFireEnabled ? 200 : 300; // faster if auto-fire
      if (!touchControls.aimLastFire || now - touchControls.aimLastFire > fireInterval) {
        playShootSound();
        socket.emit('shoot', {});
        touchControls.aimLastFire = now;
      }
    }
  }

  base.addEventListener('touchstart', aimStart, { passive: false });
  base.addEventListener('touchmove', aimMove, { passive: false });
  base.addEventListener('touchend', aimEnd, { passive: false });
  base.addEventListener('touchcancel', aimEnd, { passive: false });

  // mouse events for desktop testing
  base.addEventListener('mousedown', aimStart);
  document.addEventListener('mousemove', aimMove);
  document.addEventListener('mouseup', aimEnd);
}

// Get movement from joystick
function getJoystickMovement() {
  if (!touchControls.joystickActive) return { x: 0, y: 0 };

  const deltaX = touchControls.joystickPosition.x - touchControls.joystickCenter.x;
  const deltaY = touchControls.joystickPosition.y - touchControls.joystickCenter.y;

  const maxDistance = 50; // Maximum joystick movement in pixels
  const normalizedX = Math.max(-1, Math.min(1, deltaX / maxDistance));
  const normalizedY = Math.max(-1, Math.min(1, deltaY / maxDistance));

  return { x: normalizedX, y: normalizedY };
}

// Initialize game when connected
socket.on('connect', async () => {
  console.log('Connected to server, initializing game with code:', gameCode, 'wasHost:', wasHost);
  
  // Fetch username from server
  try {
    const response = await fetch(`/api/player/${persistentPlayerId}`);
    const data = await response.json();
    if (data.success && data.player) {
      username = data.player.username;
    }
  } catch (err) {
    console.error('Error fetching username:', err);
  }
  
  socket.emit('initGame', { 
    gameCode: gameCode, 
    wasHost: wasHost,
    playerId: persistentPlayerId,
    username: username
  });
});

// Handle redirect to menu if game not valid
socket.on('redirectToMenu', () => {
  alert('Game session not found or has not started yet.');
  window.location.href = '/menu.html';
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
  
  // Get my team info
  const myTank = gameState.players[gameState.playerId];
  if (myTank && myTank.team) {
    gameState.myTeam = myTank.team;
    gameState.gameMode = myTank.team === 'team_a' || myTank.team === 'team_b' ? 'team_pvp' : 
                         myTank.team === 'human' || myTank.team === 'ai' ? 'ai_coop' : null;
    
    // Show team display
    const teamDisplay = document.getElementById('teamDisplay');
    if (teamDisplay && gameState.gameMode === 'team_pvp') {
      teamDisplay.style.display = 'block';
      if (gameState.myTeam === 'team_a') {
        teamDisplay.textContent = '⚡ TEAM A';
        teamDisplay.style.color = '#ff8844';
      } else if (gameState.myTeam === 'team_b') {
        teamDisplay.textContent = '🛡️ TEAM B';
        teamDisplay.style.color = '#44aaff';
      }
      
      // Show team chat
      const chatContainer = document.getElementById('chatContainer');
      if (chatContainer) {
        chatContainer.style.display = 'block';
      }
    }
  }
  
  console.log('Connected with ID:', data.playerId, 'Team:', gameState.myTeam);
  console.log('Players:', Object.keys(gameState.players).length);
  console.log('Melody:', selectedMelody);
  updatePlayerCount();
  startBackgroundMusic();
});

// Countdown event
socket.on('countdown', (data) => {
  gameState.countdownActive = true;
  gameState.countdownValue = data.count;
  
  if (data.count === 0) {
    gameState.countdownActive = false;
  }
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

socket.on('gameRestarted', (data) => {
  console.log('Game restarted!', data);
  
  // Reset game state
  gameState.gameStartTime = data.startTime;
  gameState.gameDuration = data.gameDuration;
  gameState.gameFinished = false;
  gameState.players = data.players;
  gameState.projectiles = [];
  gameState.weapons = [];
  gameState.powerups = [];
  gameState.obstacles = data.obstacles || [];
  
  // Hide finish screen
  const finishScreen = document.getElementById('finishScreen');
  if (finishScreen) {
    finishScreen.classList.add('hidden');
  }
  
  // Re-enable restart button
  const restartBtn = document.getElementById('restartBtn');
  if (restartBtn) {
    restartBtn.textContent = 'Restart Game';
    restartBtn.disabled = false;
  }
  
  // Restart background music
  startBackgroundMusic();
  
  updatePlayerCount();
  console.log('Game restarted! Players:', Object.keys(gameState.players).length);
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
  
  if (data.returnToMenu) {
    // Show results briefly then return to menu with game code
    showFinishScreen(data);
    setTimeout(() => {
      window.location.href = `/menu.html?rejoin=${gameCode}&oldSocketId=${socket.id}`;
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

// Mouse movement for aiming (desktop)
canvas.addEventListener('mousemove', (e) => {
  if (isMobile) return; // Skip mouse events on mobile

  const canvasCoords = screenToCanvas(e.clientX, e.clientY);

  if (gameState.players[gameState.playerId]) {
    const tank = gameState.players[gameState.playerId];
    const dx = canvasCoords.x - tank.x;
    const dy = canvasCoords.y - tank.y;
    mouseAngle = Math.atan2(dy, dx);
    socket.emit('rotate', { rotation: mouseAngle });
  }
});

// Touch movement for aiming (mobile)
canvas.addEventListener('touchmove', (e) => {
  if (!isMobile) return;
  e.preventDefault();

  if (e.touches.length > 0) {
    const touch = e.touches[0];
    const canvasCoords = screenToCanvas(touch.clientX, touch.clientY);

    if (gameState.players[gameState.playerId]) {
      const tank = gameState.players[gameState.playerId];
      const dx = canvasCoords.x - tank.x;
      const dy = canvasCoords.y - tank.y;
      touchControls.lastTouchAngle = Math.atan2(dy, dx);
      socket.emit('rotate', { rotation: touchControls.lastTouchAngle });
    }
  }
});

// Canvas click to shoot (desktop)
canvas.addEventListener('click', () => {
  if (isMobile || gameState.countdownActive || gameState.gameFinished) return;
  playShootSound();
  socket.emit('shoot', {});
});

// Touch start for aiming initialization (mobile)
canvas.addEventListener('touchstart', (e) => {
  if (!isMobile) return;
  e.preventDefault();

  if (e.touches.length > 0) {
    const touch = e.touches[0];
    const canvasCoords = screenToCanvas(touch.clientX, touch.clientY);

    if (gameState.players[gameState.playerId]) {
      const tank = gameState.players[gameState.playerId];
      const dx = canvasCoords.x - tank.x;
      const dy = canvasCoords.y - tank.y;
      touchControls.lastTouchAngle = Math.atan2(dy, dx);
      socket.emit('rotate', { rotation: touchControls.lastTouchAngle });
    }
  }
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

    // Only allow movement if player is alive (not spectating) and countdown is finished
    if (myTank.isAlive && !gameState.countdownActive) {
      // Keyboard movement (desktop)
      if (!isMobile) {
        if (keys['ArrowUp'] || keys['w'] || keys['W']) velocityY -= 5;
        if (keys['ArrowDown'] || keys['s'] || keys['S']) velocityY += 5;
        if (keys['ArrowLeft'] || keys['a'] || keys['A']) velocityX -= 5;
        if (keys['ArrowRight'] || keys['d'] || keys['D']) velocityX += 5;
      } else {
        // Joystick movement (mobile)
        const joystickMovement = getJoystickMovement();
        velocityX = joystickMovement.x * 5;
        velocityY = joystickMovement.y * 5;
      }

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

    // Handle auto-fire for mobile
    if (isMobile && touchControls.autoFireEnabled && myTank.isAlive && !gameState.countdownActive && !gameState.gameFinished) {
      // Auto-fire at a reasonable rate (every 200ms)
      const now = Date.now();
      if (!window.lastAutoFire || now - window.lastAutoFire > 200) {
        playShootSound();
        socket.emit('shoot', {});
        window.lastAutoFire = now;
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

  // Scale to fit screen (stretch game world to fill canvas) if needed
  const needsScale = canvas.width !== 800 || canvas.height !== 600;
  if (needsScale) {
    ctx.save();
    ctx.scale(canvas.width / 800, canvas.height / 600);
  }

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
  
  // Restore scale if applied
  if (needsScale) {
    ctx.restore();
  }
  
  // Draw countdown overlay (after restore, in screen coordinates)
  if (gameState.countdownActive && gameState.countdownValue > 0) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.font = 'bold 120px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Pulsing effect
    const pulse = Math.sin(Date.now() / 100) * 0.1 + 0.9;
    const size = 120 * pulse;
    ctx.font = `bold ${size}px Arial`;
    
    // Outline
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 8;
    ctx.strokeText(gameState.countdownValue, canvas.width / 2, canvas.height / 2);
    
    // Fill
    ctx.fillStyle = gameState.countdownValue <= 1 ? '#00ff00' : '#ffff00';
    ctx.fillText(gameState.countdownValue, canvas.width / 2, canvas.height / 2);
    
    // "GET READY" text
    ctx.font = 'bold 40px Arial';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    ctx.strokeText('GET READY!', canvas.width / 2, canvas.height / 2 - 100);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('GET READY!', canvas.width / 2, canvas.height / 2 - 100);
  }

  requestAnimationFrame(gameLoop);
}

function drawTank(tank, isPlayer) {
  const x = tank.x;
  const y = tank.y;
  const rotation = tank.rotation;

  // Aim guidance: show a cone/line around the player's tank when aim joystick is active
  try {
    if (isPlayer && touchControls.aimJoystickActive && typeof touchControls.aimLastAngle === 'number') {
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#00d2ff';
      const guideRadius = (typeof TANK_SIZE !== 'undefined' ? TANK_SIZE : 20) * 4;
      const angle = touchControls.aimLastAngle;
      const spread = Math.PI / 12; // ~15 degrees cone

      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, guideRadius, angle - spread, angle + spread);
      ctx.closePath();
      ctx.fill();

      // Draw direction line
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(angle) * guideRadius, y + Math.sin(angle) * guideRadius);
      ctx.stroke();
      ctx.restore();
    }
  } catch (e) {
    // fail-safe: don't block rendering if guidance code errors
    console.error('Aim guidance error', e);
  }
  
  // Check if this is an AI tank
  const isAI = tank.isAI || (tank.id && tank.id.startsWith('ai_'));
  
  // Determine tank color based on team, player status, and custom color
  let tankColor;
  if (isPlayer) {
    // Player's own tank - use custom color if set, otherwise default green
    tankColor = tank.color || '#44ff44';
  } else if (isAI) {
    // AI bots always stay red for easy identification
    tankColor = '#ff0000';
  } else if (gameState.gameMode === 'team_pvp') {
    // Team PvP mode: force team colors regardless of custom colors
    if (tank.team === gameState.myTeam) {
      tankColor = '#4444ff'; // Blue for teammates
    } else {
      tankColor = '#ff4444'; // Red for enemy team
    }
  } else if (tank.team === 'human') {
    // Co-op mode: force blue for human teammates
    tankColor = '#0088ff';
  } else if (tank.team === 'ai') {
    // Co-op mode: force red for AI enemies
    tankColor = '#ff0000';
  } else {
    // Free-for-all: use custom color if set, otherwise default red
    tankColor = tank.color || '#ff0000';
  }
  
  const isSpectating = !tank.isAlive;
  const opacity = isSpectating ? 0.5 : 1;
  
  if (isSpectating) {
    tankColor = '#888888';
  }
  
  // Draw powerup effects BEFORE the tank
  if (tank.activePowerup && !isSpectating) {
    const time = Date.now() / 1000;
    
    if (tank.activePowerup === 'SHIELD') {
      // Draw pulsing shield circle
      const pulse = Math.sin(time * 4) * 0.2 + 0.8;
      ctx.strokeStyle = '#44ffff';
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.6 * pulse;
      ctx.beginPath();
      ctx.arc(x, y, TANK_SIZE + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = opacity;
      
      // Draw shield hexagon pattern
      ctx.strokeStyle = '#44ffff';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.4 * pulse;
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI / 3) + time;
        const x1 = x + Math.cos(angle) * (TANK_SIZE + 6);
        const y1 = y + Math.sin(angle) * (TANK_SIZE + 6);
        const x2 = x + Math.cos(angle + Math.PI / 3) * (TANK_SIZE + 6);
        const y2 = y + Math.sin(angle + Math.PI / 3) * (TANK_SIZE + 6);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.globalAlpha = opacity;
    }
    
    if (tank.activePowerup === 'SPEED_BOOST') {
      // Draw speed trail effect
      const trailCount = 3;
      for (let i = 0; i < trailCount; i++) {
        const offset = -15 - (i * 10);
        const alpha = 0.3 - (i * 0.1);
        ctx.fillStyle = '#ffff44';
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(
          x + Math.cos(rotation + Math.PI) * offset,
          y + Math.sin(rotation + Math.PI) * offset,
          TANK_SIZE * 0.7,
          0, Math.PI * 2
        );
        ctx.fill();
      }
      ctx.globalAlpha = opacity;
      
      // Draw speed lines around tank
      ctx.strokeStyle = '#ffff44';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.5;
      for (let i = 0; i < 4; i++) {
        const angle = rotation + Math.PI + (i * Math.PI / 2) + (time * 2);
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(angle) * TANK_SIZE, y + Math.sin(angle) * TANK_SIZE);
        ctx.lineTo(x + Math.cos(angle) * (TANK_SIZE + 15), y + Math.sin(angle) * (TANK_SIZE + 15));
        ctx.stroke();
      }
      ctx.globalAlpha = opacity;
    }
    
    if (tank.activePowerup === 'INVINCIBILITY') {
      // Draw sparkling star effect
      const sparkleCount = 8;
      for (let i = 0; i < sparkleCount; i++) {
        const angle = (i / sparkleCount) * Math.PI * 2 + time * 3;
        const dist = TANK_SIZE + 10 + Math.sin(time * 5 + i) * 5;
        const sparkleX = x + Math.cos(angle) * dist;
        const sparkleY = y + Math.sin(angle) * dist;
        const sparkleSize = 3 + Math.sin(time * 4 + i) * 2;
        
        ctx.fillStyle = '#ff8844';
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.arc(sparkleX, sparkleY, sparkleSize, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = opacity;
      
      // Draw glow around tank
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#ff8844';
      ctx.strokeStyle = '#ff8844';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(x, y, TANK_SIZE + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = opacity;
    }
  }

  // Draw tank with separate base and turret rotation
  const baseRotation = tank.rotation || 0;
  const turretRotation = tank.turretRotation !== undefined ? tank.turretRotation : tank.rotation || 0;
  
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = opacity;
  
  // === Draw tank base (body and tracks) ===
  ctx.save();
  ctx.rotate(baseRotation);
  
  // Draw tank tracks (darker)
  const trackWidth = TANK_SIZE * 0.6;
  const trackHeight = TANK_SIZE * 1.8;
  const trackOffset = TANK_SIZE * 0.7;
  
  ctx.fillStyle = isSpectating ? '#444444' : (isPlayer ? '#1a5c1a' : (tankColor === '#4ecdc4' ? '#2a7a7a' : '#7a5a2a'));
  
  // Left track
  ctx.fillRect(-trackWidth/2 - trackOffset, -trackHeight/2, trackWidth, trackHeight);
  // Right track
  ctx.fillRect(-trackWidth/2 + trackOffset, -trackHeight/2, trackWidth, trackHeight);
  
  // Track details (treads)
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.lineWidth = 2;
  for (let i = -trackHeight/2; i < trackHeight/2; i += 6) {
    ctx.beginPath();
    ctx.moveTo(-trackWidth/2 - trackOffset, i);
    ctx.lineTo(-trackWidth/2 - trackOffset + trackWidth, i);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(-trackWidth/2 + trackOffset, i);
    ctx.lineTo(-trackWidth/2 + trackOffset + trackWidth, i);
    ctx.stroke();
  }
  
  // Draw main tank body (hull)
  const bodyWidth = TANK_SIZE * 1.6;
  const bodyHeight = TANK_SIZE * 1.4;
  
  ctx.fillStyle = tankColor;
  ctx.fillRect(-bodyWidth/2, -bodyHeight/2, bodyWidth, bodyHeight);
  
  // Body outline
  ctx.strokeStyle = isSpectating ? '#222222' : 'rgba(0, 0, 0, 0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(-bodyWidth/2, -bodyHeight/2, bodyWidth, bodyHeight);
  
  ctx.restore(); // End base rotation
  
  // === Draw turret (independently rotated) ===
  ctx.save();
  ctx.rotate(turretRotation);
  
  // Draw turret (smaller circle on top)
  const turretRadius = TANK_SIZE * 0.7;
  ctx.fillStyle = tankColor;
  ctx.beginPath();
  ctx.arc(0, 0, turretRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = isSpectating ? '#222222' : 'rgba(0, 0, 0, 0.5)';
  ctx.lineWidth = 2;
  ctx.stroke();
  
  // Draw barrel
  const barrelLength = TANK_SIZE + 10;
  const barrelWidth = 6;
  ctx.fillStyle = isSpectating ? '#333333' : (isPlayer ? '#0d3d0d' : (tankColor === '#4ecdc4' ? '#1a5050' : '#4d3a1a'));
  ctx.fillRect(0, -barrelWidth/2, barrelLength, barrelWidth);
  
  // Barrel outline
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, -barrelWidth/2, barrelLength, barrelWidth);
  
  // Barrel tip (darker)
  ctx.fillStyle = '#222222';
  ctx.fillRect(barrelLength - 3, -barrelWidth/2 - 1, 3, barrelWidth + 2);
  
  ctx.restore(); // End turret rotation
  
  ctx.restore(); // End translation
  ctx.globalAlpha = opacity;

  // Draw health bar
  const healthPercent = tank.health / 100;
  ctx.fillStyle = '#333';
  ctx.fillRect(x - TANK_SIZE, y + TANK_SIZE + 5, TANK_SIZE * 2, 5);
  ctx.fillStyle = healthPercent > 0.5 ? '#00ff00' : healthPercent > 0.25 ? '#ffff00' : '#ff0000';
  ctx.fillRect(x - TANK_SIZE, y + TANK_SIZE + 5, TANK_SIZE * 2 * healthPercent, 5);
  
  // Draw player name above tank (but not for AI or spectating)
  if (!isAI && !isSpectating) {
    ctx.globalAlpha = 1;
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = isPlayer ? '#00ff00' : '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    
    const displayName = isPlayer ? 'You' : (tank.username || 'Player');
    
    // Draw text outline for better visibility
    ctx.strokeText(displayName, x, y - TANK_SIZE - 8);
    ctx.fillText(displayName, x, y - TANK_SIZE - 8);
  }
  
  // Draw "SPECTATING" label if dead
  if (isSpectating) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#888888';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('SPECTATING', x, y - TANK_SIZE - 5);
  }
  
  // Draw "BOT" label for AI tanks
  if (isAI && !isSpectating) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ff9900';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🤖 BOT', x, y - TANK_SIZE - 5);
    
    // Draw AI difficulty indicator
    if (tank.aiDifficulty) {
      ctx.font = '8px Arial';
      ctx.fillStyle = '#ffcc66';
      ctx.fillText(tank.aiDifficulty.toUpperCase(), x, y - TANK_SIZE - 15);
    }
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
  
  // Different symbols for different powerup types
  let symbol = '⚡';
  if (powerup.type === 'HEALTH') symbol = '❤️';
  else if (powerup.type === 'SPEED_BOOST') symbol = '⚡';
  else if (powerup.type === 'SHIELD') symbol = '🛡️';
  else if (powerup.type === 'INVINCIBILITY') symbol = '✨';
  else if (powerup.type === 'AMMO_REFILL') symbol = '📦';
  
  ctx.fillText(symbol, 0, 0);
  
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
  const myTank = gameState.players[gameState.playerId];
  let isPlayerWinner = data.winner === gameState.playerId;
  
  // Check for team-based wins (co-op mode and PvP mode)
  if (myTank && myTank.team && (data.winner === 'HUMAN_TEAM' || data.winner === 'AI_TEAM' || data.winner === 'TEAM_A' || data.winner === 'TEAM_B')) {
    isPlayerWinner = (myTank.team === 'human' && data.winner === 'HUMAN_TEAM') || 
                     (myTank.team === 'ai' && data.winner === 'AI_TEAM') ||
                     (myTank.team === 'team_a' && data.winner === 'TEAM_A') ||
                     (myTank.team === 'team_b' && data.winner === 'TEAM_B');
  }
  
  // Set title based on result
  if (isPlayerWinner) {
    finishTitle.textContent = myTank && myTank.team ? '🎉 YOUR TEAM WINS! 🎉' : '🎉 YOU WIN! 🎉';
  } else {
    finishTitle.textContent = 'GAME OVER';
  }
  finishTitle.style.color = isPlayerWinner ? '#ffff00' : '#ff6600';
  
  // Set reason
  finishReason.textContent = data.reason;
  
  // Set status
  if (isPlayerWinner) {
    finishStatus.textContent = myTank && myTank.team ? '✨ Victory! Your team dominated! ✨' : '✨ Congratulations, Champion! ✨';
    finishStatus.style.color = '#ffff00';
  } else {
    finishStatus.textContent = 'Better luck next time!';
    finishStatus.style.color = '#ff6600';
  }

  // Display stats
  if (myTank) {
    finishStats.innerHTML = `
      <p>Your Score: <span>${myTank.score}</span></p>
      <p>Your Kills: <span>${myTank.kills}</span></p>
      <p>Your Health: <span>${Math.max(0, Math.round(myTank.health))}</span></p>
      <p>Total Players: <span>${data.survivors || Object.keys(gameState.players).length}</span></p>
    `;
  }

  // Hide restart button if returning to menu
  const restartBtn = document.getElementById('restartBtn');
  if (data.returnToMenu && restartBtn) {
    restartBtn.style.display = 'none';
  }

  // Show the finish screen
  finishScreen.classList.remove('hidden');
}

// Team chat handlers
const chatInput = document.getElementById('chatInput');
const chatMessages = document.getElementById('chatMessages');
const toggleChatBtn = document.getElementById('toggleChatBtn');
const chatContainer = document.getElementById('chatContainer');

if (toggleChatBtn && chatContainer) {
  toggleChatBtn.addEventListener('click', () => {
    chatMessages.style.display = chatMessages.style.display === 'none' ? 'block' : 'none';
    toggleChatBtn.textContent = chatMessages.style.display === 'none' ? '💬' : '✖';
  });
}

if (chatInput) {
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && chatInput.value.trim()) {
      socket.emit('teamChatMessage', {
        message: chatInput.value.trim(),
        team: gameState.myTeam
      });
      chatInput.value = '';
    }
  });
}

socket.on('teamChatMessage', (data) => {
  if (chatMessages && gameState.gameMode === 'team_pvp') {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-message';
    msgDiv.style.backgroundColor = data.team === 'team_a' ? 'rgba(255, 136, 68, 0.2)' : 'rgba(68, 170, 255, 0.2)';
    msgDiv.style.padding = '5px 8px';
    msgDiv.style.marginBottom = '4px';
    msgDiv.style.borderRadius = '4px';
    msgDiv.textContent = `${data.playerName}: ${data.message}`;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
});

// Setup finish screen button handlers
document.getElementById('statsLink').addEventListener('click', (e) => {
  e.preventDefault();
  window.location.href = `/stats.html?gameCode=${gameCode}&oldSocketId=${socket.id}`;
});

document.getElementById('restartBtn').addEventListener('click', () => {
  socket.emit('requestRestart');
  document.getElementById('restartBtn').textContent = 'Waiting for other players...';
  document.getElementById('restartBtn').disabled = true;
});

document.getElementById('closeBtn').addEventListener('click', () => {
  window.location.href = `/menu.html?rejoin=${gameCode}&oldSocketId=${socket.id}`;
});

// Initialize mobile controls
initMobileControls();

// Start game loop
gameLoop();
