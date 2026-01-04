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

// Get or set username
let username = localStorage.getItem('tankGameUsername');
if (!username) {
  username = `Player_${playerId.substr(7, 6)}`;
  localStorage.setItem('tankGameUsername', username);
}

let currentGameCode = null;
let isHost = false;
let playersInGame = {};

// Last game data
let lastGameData = null;

// Fetch last game on page load
async function fetchLastGame() {
  try {
    const response = await fetch(`/api/player/${playerId}/lastGame`);
    const data = await response.json();
    
    if (data.success && data.lastGame) {
      lastGameData = data.lastGame;
      // Show the last game button
      const lastGameBtn = document.getElementById('lastGameBtn');
      if (lastGameBtn) {
        lastGameBtn.style.display = 'inline-block';
      }
    }
  } catch (error) {
    console.error('Error fetching last game:', error);
  }
}

// Format timestamp to readable date
function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

// Display last game modal
function showLastGameModal() {
  if (!lastGameData) return;
  
  const modal = document.getElementById('lastGameModal');
  
  // Populate modal with data
  document.getElementById('lgGameMode').textContent = lastGameData.gameMode || 'Unknown';
  document.getElementById('lgResult').textContent = lastGameData.result === 'win' ? '🏆 Victory' : '💀 Defeat';
  document.getElementById('lgResult').style.color = lastGameData.result === 'win' ? '#4caf50' : '#f44336';
  document.getElementById('lgReason').textContent = lastGameData.reason || 'Game ended';
  document.getElementById('lgTimestamp').textContent = formatTimestamp(lastGameData.timestamp);
  document.getElementById('lgKills').textContent = lastGameData.kills || 0;
  document.getElementById('lgDeaths').textContent = lastGameData.deaths || 0;
  document.getElementById('lgScore').textContent = lastGameData.score || 0;
  document.getElementById('lgHealth').textContent = lastGameData.health || 0;
  
  modal.classList.remove('hidden');
}

// Update username display
function updateUsernameDisplay() {
  const displayElement = document.getElementById('playerNameDisplay');
  if (displayElement) {
    displayElement.textContent = username;
  }
}

// Load and apply saved game settings
function loadLastGameSettings() {
  const savedSettings = localStorage.getItem('tankGameLastSettings');
  if (savedSettings) {
    try {
      const settings = JSON.parse(savedSettings);
      
      // Apply settings to form elements
      if (settings.tankSpeed !== undefined) {
        document.getElementById('tankSpeed').value = settings.tankSpeed;
      }
      if (settings.melodyChoice) {
        document.getElementById('melodyChoice').value = settings.melodyChoice;
      }
      if (settings.debugMode !== undefined) {
        document.getElementById('debugMode').checked = settings.debugMode;
      }
      if (settings.weaponsEnabled !== undefined) {
        document.getElementById('weaponsEnabled').checked = settings.weaponsEnabled;
      }
      if (settings.powerupsEnabled !== undefined) {
        document.getElementById('powerupsEnabled').checked = settings.powerupsEnabled;
      }
      if (settings.limitedAmmo !== undefined) {
        document.getElementById('limitedAmmo').checked = settings.limitedAmmo;
      }
      if (settings.gameMode) {
        document.getElementById('gameMode').value = settings.gameMode;
        // Update game mode display (AI/team settings visibility)
        updateGameModeDisplay(settings.gameMode);
        // Notify server if we're the host
        if (isHost && currentGameCode) {
          socket.emit('updateGameSettings', { 
            gameCode: currentGameCode, 
            gameMode: settings.gameMode 
          });
        }
      }
      if (settings.aiDifficulty) {
        document.getElementById('aiDifficulty').value = settings.aiDifficulty;
      }
      if (settings.aiCount !== undefined) {
        document.getElementById('aiCount').value = settings.aiCount;
      }
      
      console.log('Loaded last game settings:', settings);
    } catch (e) {
      console.error('Failed to load last game settings:', e);
    }
  }
}

// Check if returning from a finished game and auto-rejoin
window.addEventListener('DOMContentLoaded', () => {
  updateUsernameDisplay();
  
  // Fetch last game
  fetchLastGame();
  
  const urlParams = new URLSearchParams(window.location.search);
  const rejoinCode = urlParams.get('rejoin');
  const oldSocketId = urlParams.get('oldSocketId');
  
  if (rejoinCode) {
    // Wait for socket to connect before rejoining
    socket.on('connect', () => {
      console.log('Auto-rejoining game:', rejoinCode);
      socket.emit('rejoinLobby', { 
        gameCode: rejoinCode, 
        oldSocketId: oldSocketId,
        playerId: playerId,
        username: username
      });
      
      // Clear the URL parameters
      window.history.replaceState({}, document.title, '/menu.html');
    });
  } else {
    // Request game browser status when page loads
    socket.on('connect', () => {
      socket.emit('requestGameBrowserStatus');
    });
  }
});

// Request game browser status every 5 seconds when on main menu
setInterval(() => {
  if (menuView && !menuView.classList.contains('hidden')) {
    socket.emit('requestGameBrowserStatus');
  }
}, 5000);

// DOM Elements
const menuView = document.getElementById('menuView');
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

// Username modal elements
const usernameModal = document.getElementById('usernameModal');
const usernameInput = document.getElementById('usernameInput');
const saveUsernameBtn = document.getElementById('saveUsernameBtn');
const cancelUsernameBtn = document.getElementById('cancelUsernameBtn');
const changeNameBtn = document.getElementById('changeNameBtn');

// Username modal handlers
changeNameBtn.addEventListener('click', () => {
  usernameInput.value = username;
  usernameModal.classList.remove('hidden');
  usernameInput.focus();
});

cancelUsernameBtn.addEventListener('click', () => {
  usernameModal.classList.add('hidden');
});

saveUsernameBtn.addEventListener('click', () => {
  const newName = usernameInput.value.trim();
  if (newName && newName.length >= 2) {
    username = newName;
    localStorage.setItem('tankGameUsername', username);
    updateUsernameDisplay();
    usernameModal.classList.add('hidden');
    // Notify server of name change
    socket.emit('updateUsername', { playerId, username });
    showStatus('Username updated!');
  } else {
    showError('Username must be at least 2 characters');
  }
});

usernameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    saveUsernameBtn.click();
  }
});

// Create new game
createGameBtn.addEventListener('click', () => {
  socket.emit('createGame', { playerId: playerId, username: username });
});

// Team selection elements
const teamSettings = document.getElementById('teamSettings');

// Toggle AI settings and team settings visibility based on game mode
if (gameModeSelect) {
  gameModeSelect.addEventListener('change', () => {
    const gameMode = gameModeSelect.value;
    updateGameModeDisplay(gameMode);
    
    // Notify server of game mode change (host only)
    if (isHost && currentGameCode) {
      socket.emit('updateGameSettings', { 
        gameCode: currentGameCode, 
        gameMode: gameMode 
      });
    }
  });
}

// Function to update game mode display for all players
function updateGameModeDisplay(gameMode) {
  if (gameMode !== 'multiplayer' && gameMode !== 'team_pvp') {
    if (aiSettings) aiSettings.style.display = 'block';
    if (teamSettings) teamSettings.style.display = 'none';
  } else if (gameMode === 'team_pvp') {
    if (aiSettings) aiSettings.style.display = 'none';
    if (teamSettings) teamSettings.style.display = 'block';
  } else {
    if (aiSettings) aiSettings.style.display = 'none';
    if (teamSettings) teamSettings.style.display = 'none';
  }
}
const joinRedTeamBtn = document.getElementById('joinRedTeam');
const joinBlueTeamBtn = document.getElementById('joinBlueTeam');
const redTeamCount = document.getElementById('redTeamCount');
const blueTeamCount = document.getElementById('blueTeamCount');
const teamValidation = document.getElementById('teamValidation');

// Team selection handlers
if (joinRedTeamBtn) {
  joinRedTeamBtn.addEventListener('click', () => {
    if (currentGameCode) {
      socket.emit('changeTeam', { gameCode: currentGameCode, team: 'team_a' });
    }
  });
}

if (joinBlueTeamBtn) {
  joinBlueTeamBtn.addEventListener('click', () => {
    if (currentGameCode) {
      socket.emit('changeTeam', { gameCode: currentGameCode, team: 'team_b' });
    }
  });
}

// Update team display
function updateTeamDisplay(players) {
  if (!teamSettings || teamSettings.style.display === 'none') return;
  
  let redCount = 0;
  let blueCount = 0;
  
  Object.values(players).forEach(player => {
    if (player.team === 'team_a') redCount++;
    else if (player.team === 'team_b') blueCount++;
  });
  
  if (redTeamCount) redTeamCount.textContent = redCount;
  if (blueTeamCount) blueTeamCount.textContent = blueCount;
  
  // Update validation message for host
  if (isHost && teamValidation) {
    if (redCount === 0 || blueCount === 0) {
      teamValidation.textContent = '⚠️ Both teams need at least 1 player to start!';
      teamValidation.style.color = '#ff9999';
      if (startGameBtn) startGameBtn.disabled = true;
    } else {
      teamValidation.textContent = '✓ Teams ready!';
      teamValidation.style.color = '#99ff99';
      if (startGameBtn) startGameBtn.disabled = false;
    }
  }
  
  // Highlight selected team button
  const myPlayer = players[socket.id];
  if (myPlayer && joinRedTeamBtn && joinBlueTeamBtn) {
    if (myPlayer.team === 'team_a') {
      joinRedTeamBtn.style.opacity = '1';
      joinRedTeamBtn.style.fontWeight = 'bold';
      joinBlueTeamBtn.style.opacity = '0.6';
      joinBlueTeamBtn.style.fontWeight = 'normal';
    } else if (myPlayer.team === 'team_b') {
      joinBlueTeamBtn.style.opacity = '1';
      joinBlueTeamBtn.style.fontWeight = 'bold';
      joinRedTeamBtn.style.opacity = '0.6';
      joinRedTeamBtn.style.fontWeight = 'normal';
    }
  }
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
    
    // Save settings to localStorage for next game
    const gameSettings = {
      tankSpeed,
      melodyChoice,
      debugMode,
      weaponsEnabled,
      powerupsEnabled,
      limitedAmmo,
      gameMode,
      aiDifficulty,
      aiCount
    };
    localStorage.setItem('tankGameLastSettings', JSON.stringify(gameSettings));
    
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

// Leave game
leaveLobbyBtn.addEventListener('click', () => {
  if (currentGameCode) {
    socket.emit('leaveGame', { gameCode: currentGameCode });
    resetMenu();
  }
});

// Last game modal handlers
const lastGameBtn = document.getElementById('lastGameBtn');
const lastGameModal = document.getElementById('lastGameModal');
const closeLastGameBtn = document.getElementById('closeLastGameBtn');

if (lastGameBtn) {
  lastGameBtn.addEventListener('click', (e) => {
    e.preventDefault();
    showLastGameModal();
  });
}

if (closeLastGameBtn) {
  closeLastGameBtn.addEventListener('click', () => {
    lastGameModal.classList.add('hidden');
  });
}

// Close modal when clicking outside
if (lastGameModal) {
  lastGameModal.addEventListener('click', (e) => {
    if (e.target === lastGameModal) {
      lastGameModal.classList.add('hidden');
    }
  });
}

// Socket event handlers
socket.on('gameCreated', (data) => {
  currentGameCode = data.gameCode;
  isHost = true;
  playersInGame = data.players;
  
  showWaitingRoom();
  gameCodeDisplay.textContent = currentGameCode;
  updatePlayersList();
  
  hostControls.classList.remove('hidden');
  playerWaiting.classList.add('hidden');
  
  // Load last game settings
  loadLastGameSettings();
  
  // Set initial game mode visibility
  const initialGameMode = data.gameMode || 'multiplayer';
  updateGameModeDisplay(initialGameMode);
  
  showStatus(`Game created! Share code: ${currentGameCode}`);
});

socket.on('gameJoined', (data) => {
  currentGameCode = data.gameCode;
  playersInGame = data.players;
  
  // Check if this player is the host
  isHost = playersInGame[socket.id]?.isHost || false;
  
  showWaitingRoom();
  gameCodeDisplay.textContent = currentGameCode;
  updatePlayersList();
  
  // Set game mode visibility for all players
  const gameMode = data.gameMode || 'multiplayer';
  updateGameModeDisplay(gameMode);
  
  // Show appropriate controls based on host status
  if (isHost) {
    hostControls.classList.remove('hidden');
    playerWaiting.classList.add('hidden');
    // Load last game settings
    loadLastGameSettings();
    showStatus('Welcome back! You are the host.');
  } else {
    hostControls.classList.add('hidden');
    playerWaiting.classList.remove('hidden');
    showStatus('Successfully joined game!');
  }
});

socket.on('playerJoinedGame', (data) => {
  playersInGame = data.players;
  
  // Check if our host status has changed
  const wasHost = isHost;
  isHost = playersInGame[socket.id]?.isHost || false;
  
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
    // Load last game settings
    loadLastGameSettings();
    showStatus('You are now the host!');
  }
  
  updatePlayersList();
  showStatus(`${data.playerName || 'A player'} joined`);
});

socket.on('playerLeftGame', (data) => {
  playersInGame = data.players;
  updatePlayersList();
  
  if (data.newHost && data.newHost === socket.id) {
    isHost = true;
    hostControls.classList.remove('hidden');
    playerWaiting.classList.add('hidden');
    // Load last game settings
    loadLastGameSettings();
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

socket.on('gameError', (data) => {
  showError(data.message);
});

socket.on('gameAlreadyStarted', () => {
  showError('This game has already started. You cannot join.');
  resetMenu();
});

// Team selection socket events
socket.on('teamChanged', (data) => {
  playersInGame = data.players;
  updatePlayersList();
  if (data.playerId === socket.id) {
    showStatus(`You joined ${data.team === 'team_a' ? 'Team A' : 'Team B'}!`);
  }
});

socket.on('teamError', (data) => {
  showError(data.message);
});

// Listen for game settings updates from host
socket.on('gameSettingsUpdated', (data) => {
  if (data.gameMode !== undefined) {
    updateGameModeDisplay(data.gameMode);
  }
});

// Helper functions
function showWaitingRoom() {
  menuView.classList.add('hidden');
  waitingRoom.classList.remove('hidden');
}

function resetMenu() {
  currentGameCode = null;
  isHost = false;
  playersInGame = {};
  
  menuView.classList.remove('hidden');
  waitingRoom.classList.add('hidden');
  gameCodeInput.value = '';
}

function updatePlayersList() {
  const playerCount = Object.keys(playersInGame).length;
  playerCountDisplay.textContent = playerCount;
  
  playersListElement.innerHTML = '';
  
  Object.entries(playersInGame).forEach(([id, player], index) => {
    const li = document.createElement('li');
    const hostBadge = player.isHost ? ' 👑 (Host)' : '';
    const youBadge = id === socket.id ? ' (You)' : '';
    
    // Add team badge for team_pvp mode
    let teamBadge = '';
    if (player.team === 'team_a') {
      teamBadge = ' ⚡';
      li.style.color = '#ff8844';
    } else if (player.team === 'team_b') {
      teamBadge = ' 🛡️';
      li.style.color = '#44aaff';
    }
    
    li.textContent = `${player.username || `Player ${index + 1}`}${teamBadge}${hostBadge}${youBadge}`;
    playersListElement.appendChild(li);
  });
  
  // Update team display if in team mode
  updateTeamDisplay(playersInGame);
  
  // Enable start button logic
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

// Handle game browser status updates
socket.on('gameBrowserStatus', (data) => {
  document.getElementById('gamesPlaying').textContent = data.playing;
  document.getElementById('roomsWaiting').textContent = data.waiting;
  
  const activeGamesList = document.getElementById('activeGamesList');
  activeGamesList.innerHTML = '';
  
  if (data.games && data.games.length > 0) {
    data.games.forEach(game => {
      const gameItem = document.createElement('div');
      gameItem.className = `game-item ${game.state}`;
      
      // Only make lobbies (waiting state) clickable
      if (game.state === 'waiting') {
        gameItem.classList.add('clickable');
        gameItem.style.cursor = 'pointer';
      }
      
      gameItem.innerHTML = `
        <div class="game-item-info">
          <div class="game-item-code">${game.code}</div>
          <div class="game-item-status">${game.playerCount} player${game.playerCount !== 1 ? 's' : ''}</div>
        </div>
        <div class="game-item-badge ${game.state}">
          ${game.state === 'playing' ? '🎮 Playing' : '⏳ Lobby'}
        </div>
      `;
      
      // Add click handler for lobbies (waiting state)
      if (game.state === 'waiting') {
        gameItem.addEventListener('click', () => {
          const gameCode = game.code;
          socket.emit('joinGame', { gameCode, playerId, username });
          showStatus(`Joining game ${gameCode}...`);
        });
      }
      
      activeGamesList.appendChild(gameItem);
    });
  } else {
    activeGamesList.innerHTML = '<p style="text-align: center; color: #90caf9; padding: 10px;">No active games</p>';
  }
});
