const socket = io();

// Generate or retrieve persistent player ID
let playerId = localStorage.getItem('tankGamePlayerId');
if (!playerId) {
  playerId = 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  localStorage.setItem('tankGamePlayerId', playerId);
  console.log('Generated new player ID:', playerId);
} else {
  console.log('Using existing player ID:', playerId);
}

let currentGameCode = null;
let isHost = false;
let playersInLobby = {};

// Check if returning from a finished game and auto-rejoin
window.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const rejoinCode = urlParams.get('rejoin');
  const oldSocketId = urlParams.get('oldSocketId');
  
  if (rejoinCode) {
    // Wait for socket to connect before rejoining
    socket.on('connect', () => {
      console.log('Auto-rejoining lobby:', rejoinCode);
      socket.emit('rejoinLobby', { 
        gameCode: rejoinCode, 
        oldSocketId: oldSocketId,
        playerId: playerId
      });
      
      // Clear the URL parameters
      window.history.replaceState({}, document.title, '/lobby.html');
    });
  } else {
    // Request lobby status when page loads
    socket.on('connect', () => {
      socket.emit('requestLobbyStatus');
    });
  }
});

// Request lobby status every 5 seconds when on main menu
setInterval(() => {
  if (lobbyMenu && !lobbyMenu.classList.contains('hidden')) {
    socket.emit('requestLobbyStatus');
  }
}, 5000);

// DOM Elements
const lobbyMenu = document.getElementById('lobbyMenu');
const waitingRoom = document.getElementById('waitingRoom');
const createGameBtn = document.getElementById('createGameBtn');
const startGameBtn = document.getElementById('startGameBtn');
const leaveLobbyBtn = document.getElementById('leaveLobbyBtn');
const gameCodeDisplay = document.getElementById('gameCode');
const playerCountDisplay = document.getElementById('playerCount');
const playersListElement = document.getElementById('playersList');
const hostControls = document.getElementById('hostControls');
const playerWaiting = document.getElementById('playerWaiting');
const errorMessage = document.getElementById('errorMessage');
const statusMessage = document.getElementById('statusMessage');
const gameModeSelect = document.getElementById('gameMode');
const aiSettings = document.getElementById('aiSettings');

// Create new game
createGameBtn.addEventListener('click', () => {
  socket.emit('createGame', { playerId: playerId });
});

// Toggle AI settings visibility based on game mode
if (gameModeSelect) {
  gameModeSelect.addEventListener('change', () => {
    const gameMode = gameModeSelect.value;
    if (gameMode !== 'multiplayer') {
      aiSettings.style.display = 'block';
    } else {
      aiSettings.style.display = 'none';
    }
  });
}

// Start game (host only)
startGameBtn.addEventListener('click', () => {
  if (isHost && currentGameCode) {
    const tankSpeed = parseInt(document.getElementById('tankSpeed').value);
    const melodyChoice = document.getElementById('melodyChoice').value;
    const debugMode = document.getElementById('debugMode').checked;
    const weaponsEnabled = document.getElementById('weaponsEnabled').checked;
    const powerupsEnabled = document.getElementById('powerupsEnabled').checked;
    const limitedAmmo = document.getElementById('limitedAmmo').checked;
    const gameMode = document.getElementById('gameMode').value;
    const aiDifficulty = document.getElementById('aiDifficulty').value;
    const aiCount = parseInt(document.getElementById('aiCount').value);
    
    socket.emit('startGame', { 
      gameCode: currentGameCode, 
      tankSpeed: tankSpeed,
      melody: melodyChoice,
      debugMode: debugMode,
      weaponsEnabled: weaponsEnabled,
      powerupsEnabled: powerupsEnabled,
      limitedAmmo: limitedAmmo,
      gameMode: gameMode,
      aiDifficulty: aiDifficulty,
      aiCount: aiCount
    });
  }
});

// Leave lobby
leaveLobbyBtn.addEventListener('click', () => {
  if (currentGameCode) {
    socket.emit('leaveLobby', { gameCode: currentGameCode });
    resetLobby();
  }
});

// Socket event handlers
socket.on('gameCreated', (data) => {
  currentGameCode = data.gameCode;
  isHost = true;
  playersInLobby = data.players;
  
  showWaitingRoom();
  gameCodeDisplay.textContent = currentGameCode;
  updatePlayersList();
  
  hostControls.classList.remove('hidden');
  playerWaiting.classList.add('hidden');
  
  showStatus(`Game created! Share code: ${currentGameCode}`);
});

socket.on('gameJoined', (data) => {
  currentGameCode = data.gameCode;
  playersInLobby = data.players;
  
  // Check if this player is the host
  isHost = playersInLobby[socket.id]?.isHost || false;
  
  showWaitingRoom();
  gameCodeDisplay.textContent = currentGameCode;
  updatePlayersList();
  
  // Show appropriate controls based on host status
  if (isHost) {
    hostControls.classList.remove('hidden');
    playerWaiting.classList.add('hidden');
    showStatus('Welcome back! You are the host.');
  } else {
    hostControls.classList.add('hidden');
    playerWaiting.classList.remove('hidden');
    showStatus('Successfully joined game!');
  }
});

socket.on('playerJoinedLobby', (data) => {
  playersInLobby = data.players;
  
  // Check if our host status has changed
  const wasHost = isHost;
  isHost = playersInLobby[socket.id]?.isHost || false;
  
  // Update UI if host status changed
  if (wasHost && !isHost) {
    // We lost host status
    hostControls.classList.add('hidden');
    playerWaiting.classList.remove('hidden');
    showStatus('Original host has returned');
  } else if (!wasHost && isHost) {
    // We gained host status
    hostControls.classList.remove('hidden');
    playerWaiting.classList.add('hidden');
    showStatus('You are now the host!');
  }
  
  updatePlayersList();
  showStatus(`${data.playerName || 'A player'} joined the lobby`);
});

socket.on('playerLeftLobby', (data) => {
  playersInLobby = data.players;
  updatePlayersList();
  
  if (data.newHost && data.newHost === socket.id) {
    isHost = true;
    hostControls.classList.remove('hidden');
    playerWaiting.classList.add('hidden');
    showStatus('You are now the host!');
  }
});

socket.on('gameStarting', (data) => {
  showStatus('Game starting...');
  // Give server time to fully initialize game state before navigating
  setTimeout(() => {
    window.location.href = `/game.html?code=${currentGameCode}&wasHost=${isHost}`;
  }, 500);
});

socket.on('lobbyError', (data) => {
  showError(data.message);
});

socket.on('gameAlreadyStarted', () => {
  showError('This game has already started. You cannot join.');
  resetLobby();
});

// Helper functions
function showWaitingRoom() {
  lobbyMenu.classList.add('hidden');
  waitingRoom.classList.remove('hidden');
}

function resetLobby() {
  currentGameCode = null;
  isHost = false;
  playersInLobby = {};
  
  lobbyMenu.classList.remove('hidden');
  waitingRoom.classList.add('hidden');
  gameCodeInput.value = '';
}

function updatePlayersList() {
  const playerCount = Object.keys(playersInLobby).length;
  playerCountDisplay.textContent = playerCount;
  
  playersListElement.innerHTML = '';
  
  Object.entries(playersInLobby).forEach(([id, player], index) => {
    const li = document.createElement('li');
    const hostBadge = player.isHost ? ' 👑 (Host)' : '';
    const youBadge = id === socket.id ? ' (You)' : '';
    li.textContent = `Player ${index + 1}${hostBadge}${youBadge}`;
    playersListElement.appendChild(li);
  });
  
  // Enable start button only if there's at least 1 player (host can play alone for testing)
  if (isHost && startGameBtn) {
    startGameBtn.disabled = playerCount < 1;
    const hint = hostControls.querySelector('.hint');
    if (hint) {
      hint.textContent = playerCount >= 2 
        ? 'Ready to start!' 
        : 'You can start alone or wait for more players...';
    }
  }
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.remove('hidden');
  setTimeout(() => {
    errorMessage.classList.add('hidden');
  }, 5000);
}

function showStatus(message) {
  statusMessage.textContent = message;
  statusMessage.classList.remove('hidden');
  setTimeout(() => {
    statusMessage.classList.add('hidden');
  }, 3000);
}

// Handle lobby status updates
socket.on('lobbyStatus', (data) => {
  document.getElementById('gamesPlaying').textContent = data.playing;
  document.getElementById('roomsWaiting').textContent = data.waiting;
  
  const activeGamesList = document.getElementById('activeGamesList');
  activeGamesList.innerHTML = '';
  
  if (data.lobbies && data.lobbies.length > 0) {
    data.lobbies.forEach(lobby => {
      const gameItem = document.createElement('div');
      gameItem.className = `game-item ${lobby.state}`;
      
      // Only make waiting rooms clickable
      if (lobby.state === 'waiting') {
        gameItem.classList.add('clickable');
        gameItem.style.cursor = 'pointer';
      }
      
      gameItem.innerHTML = `
        <div class="game-item-info">
          <div class="game-item-code">${lobby.code}</div>
          <div class="game-item-status">${lobby.playerCount} player${lobby.playerCount !== 1 ? 's' : ''}</div>
        </div>
        <div class="game-item-badge ${lobby.state}">
          ${lobby.state === 'playing' ? '🎮 Playing' : '⏳ Waiting'}
        </div>
      `;
      
      // Add click handler for waiting rooms
      if (lobby.state === 'waiting') {
        gameItem.addEventListener('click', () => {
          const gameCode = lobby.code;
          socket.emit('joinGame', { gameCode });
          showStatus(`Joining game ${gameCode}...`);
        });
      }
      
      activeGamesList.appendChild(gameItem);
    });
  } else {
    activeGamesList.innerHTML = '<p style="text-align: center; color: #90caf9; padding: 10px;">No active games</p>';
  }
});
