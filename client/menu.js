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

// Get or set tank color
let tankColor = localStorage.getItem('tankColor');
// tankColor can be null (default), or a hex color string

let currentGameCode = null;
let isHost = false;
let playersInGame = {};
let currentGameMode = 'ai_solo'; // Track current game mode
let isAuthenticated = false;

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

// Check authentication status
async function checkAuth() {
  try {
    const response = await fetch('/api/user');
    const data = await response.json();
    
    const loginBtn = document.getElementById('loginBtn');
    const changeNameBtn = document.getElementById('changeNameBtn');
    const playerNameDisplay = document.getElementById('playerNameDisplay');
    
    if (data.authenticated) {
      // User is logged in
      playerId = data.user.id;
      username = data.user.username;
      localStorage.setItem('tankGamePlayerId', playerId);
      isAuthenticated = true;

      playerNameDisplay.textContent = username;
      playerNameDisplay.style.color = '#4caf50'; // Green for signed-in users (theme)
      loginBtn.textContent = (typeof langManager !== 'undefined') ? langManager.t('logout') : 'Logout';
      loginBtn.onclick = () => window.location.href = '/logout';
      
      // Allow using the same change-name modal for authenticated users
      changeNameBtn.style.display = 'inline-block';
    } else {
      // Not logged in
      isAuthenticated = false;

      playerNameDisplay.textContent = username || 'Guest';
      playerNameDisplay.style.color = 'white'; // Default color for anonymous users
      loginBtn.textContent = (typeof langManager !== 'undefined') ? langManager.t('loginWithGoogle') : 'Login with Google';
      loginBtn.onclick = () => window.location.href = '/auth/google';
      changeNameBtn.style.display = 'inline-block';
    }
  } catch (error) {
    console.error('Error checking auth:', error);
  }
}

// Update auth button text when language changes
window.addEventListener('languageChange', () => {
  try {
    const loginBtn = document.getElementById('loginBtn');
    if (!loginBtn) return;
    if (isAuthenticated) {
      loginBtn.textContent = (typeof langManager !== 'undefined') ? langManager.t('logout') : 'Logout';
    } else {
      loginBtn.textContent = (typeof langManager !== 'undefined') ? langManager.t('loginWithGoogle') : 'Login with Google';
    }
  } catch (e) {
    console.error('Failed to update login button on language change', e);
  }
});

// Advanced settings toggle behavior
function initAdvancedToggles() {
  document.querySelectorAll('.advanced-toggle').forEach(btn => {
    const adv = btn.nextElementSibling;
    if (!adv || !adv.classList.contains('advanced-settings')) return;
    // initialize aria state
    btn.setAttribute('aria-expanded', adv.classList.contains('hidden') ? 'false' : 'true');
    adv.setAttribute('aria-hidden', adv.classList.contains('hidden') ? 'true' : 'false');
    btn.addEventListener('click', () => {
      const isHidden = adv.classList.toggle('hidden');
      btn.setAttribute('aria-expanded', String(!isHidden));
      adv.setAttribute('aria-hidden', String(isHidden));
    });
  });
}

// Initialize when DOM content loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initAdvancedToggles();
  });
} else {
  initAdvancedToggles();
}

// Keep toggle label updated on language change
window.addEventListener('languageChange', () => {
  try {
    document.querySelectorAll('.advanced-toggle').forEach(btn => {
      if (typeof langManager !== 'undefined') btn.textContent = langManager.t('advancedSettings');
    });
  } catch (e) { console.error(e); }
});

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
  
  // Fetch game version
  fetch('/api/version')
    .then(res => res.json())
    .then(data => {
      const versionEl = document.getElementById('gameVersion');
      if (versionEl) versionEl.textContent = data.version;
    })
    .catch(err => console.error('Failed to fetch version:', err));
  
  // Fetch last game
  fetchLastGame();
  
  // Check authentication
  checkAuth();
  
  const urlParams = new URLSearchParams(window.location.search);
  const rejoinCode = urlParams.get('rejoin');
  const oldSocketId = urlParams.get('oldSocketId');
  
  if (rejoinCode) {
    // Wait for socket to connect before rejoining
    socket.on('connect', () => {
      // Register our persistent playerId with the server for ownership checks
      socket.emit('registerPlayer', { playerId });
      console.log('Auto-rejoining game:', rejoinCode);
      socket.emit('rejoinLobby', { 
        gameCode: rejoinCode, 
        oldSocketId: oldSocketId,
        playerId: playerId,
        username: username,
        tankColor: tankColor
      });
      
      // Clear the URL parameters
      window.history.replaceState({}, document.title, '/menu.html');
    });
  } else {
    // Request game browser status when page loads
    socket.on('connect', () => {
      // Register our persistent playerId with the server for ownership checks
      socket.emit('registerPlayer', { playerId });
      socket.emit('requestGameBrowserStatus');
      // enable global chat by default when on menu
      if (!currentGameCode) enableGlobalChat();
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

// Chat elements
const chatInput = document.getElementById('chatInput');
const chatSendBtn = document.getElementById('chatSendBtn');
const chatMessages = document.getElementById('chatMessages');
const lobbyChatHint = document.getElementById('lobbyChatHint');

function appendChatMessage({ id=null, playerName, message, timestamp, self=false }) {
  if (!chatMessages) return;
  const el = document.createElement('div');
  el.style.marginBottom = '6px';
  if (id) el.setAttribute('data-msg-id', id);

  const left = document.createElement('span');
  left.style.color = '#b2dfdb';
  left.style.fontWeight = '600';
  left.textContent = playerName || 'Anon';

  const colon = document.createTextNode(': ');

  const msg = document.createElement('span');
  msg.style.color = '#e0f7fa';
  msg.innerHTML = escapeHtml(message || '');

  const right = document.createElement('div');
  right.style.cssText = 'float:right; display:flex; gap:8px; align-items:center;';

  const time = document.createElement('small');
  time.style.color = '#90a4ae';
  time.textContent = new Date(timestamp || Date.now()).toLocaleTimeString();

  // Delete by double-click with confirmation (disable right-click)
  right.appendChild(time);

  el.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    if (!id) return;
    const ok = confirm('Delete this message?');
    if (!ok) return;
    const scope = currentGameCode ? 'lobby' : 'global';
    const payload = { id, scope };
    if (scope === 'lobby') payload.gameCode = currentGameCode;
    socket.emit('deleteChatMessage', payload);
  });

  // Prevent right-click context menu on messages (no right-click delete)
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });

  el.appendChild(left);
  el.appendChild(colon);
  el.appendChild(msg);
  el.appendChild(right);

  if (self) el.style.opacity = '0.9';
  chatMessages.appendChild(el);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function enableLobbyChat(code) {
  if (chatInput) chatInput.disabled = false;
  if (chatSendBtn) chatSendBtn.disabled = false;
  if (lobbyChatHint) lobbyChatHint.textContent = `Chatting in: ${code}`;
  const title = document.getElementById('chatTitle');
  if (title) title.textContent = `Lobby Chat (${code})`;
  // focus input for convenience
  if (chatMessages) chatMessages.style.height = '160px';
  if (chatInput) chatInput.focus();
}

function disableLobbyChat() {
  if (chatInput) {
    chatInput.value = '';
    chatInput.disabled = true;
  }
  if (chatSendBtn) chatSendBtn.disabled = true;
  if (lobbyChatHint) lobbyChatHint.textContent = 'Join a lobby to chat with players';
  if (chatMessages) chatMessages.innerHTML = '';
  const title = document.getElementById('chatTitle');
  if (title) title.textContent = 'Main Chat Board';
}

function enableGlobalChat() {
  if (chatInput) chatInput.disabled = false;
  if (chatSendBtn) chatSendBtn.disabled = false;
  if (lobbyChatHint) lobbyChatHint.textContent = 'Global Chat (menu)';
  const title = document.getElementById('chatTitle');
  if (title) title.textContent = 'Main Chat Board';
  if (chatMessages) chatMessages.style.height = '320px';
  if (chatInput) chatInput.focus();
}

function disableGlobalChat() {
  if (chatInput) {
    chatInput.value = '';
    chatInput.disabled = true;
  }
  if (chatSendBtn) chatSendBtn.disabled = true;
  if (lobbyChatHint) lobbyChatHint.textContent = 'Join a lobby to chat with players';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Username modal elements
const usernameModal = document.getElementById('usernameModal');
const usernameInput = document.getElementById('usernameInput');
const saveUsernameBtn = document.getElementById('saveUsernameBtn');
const cancelUsernameBtn = document.getElementById('cancelUsernameBtn');
const changeNameBtn = document.getElementById('changeNameBtn');
const usernameModalError = document.getElementById('usernameModalError');

// Global error handler: show banner and attempt to restore UI
function showGlobalError(msg) {
  console.error('Global UI error:', msg);
  let b = document.getElementById('globalErrorBanner');
  if (!b) {
    b = document.createElement('div');
    b.id = 'globalErrorBanner';
    b.className = 'global-error-banner';
    document.body.appendChild(b);
  }
  b.textContent = typeof msg === 'string' ? msg : 'An unexpected error occurred';
  b.style.display = 'block';
  // try to reveal main UI so user can still interact
  try { menuView && menuView.classList.remove('hidden'); } catch(e){}
  try { waitingRoom && waitingRoom.classList.add('hidden'); } catch(e){}
}

window.addEventListener('error', (e) => {
  const msg = (e && e.error && e.error.stack) ? e.error.stack : (e && e.message ? e.message : 'Unhandled error');
  showGlobalError(msg);
});

window.addEventListener('unhandledrejection', (e) => {
  const reason = e && e.reason;
  const msg = reason && reason.stack ? reason.stack : (reason ? String(reason) : 'Unhandled Promise rejection');
  showGlobalError(msg);
});

function showUsernameModalError(message) {
  if (!usernameModalError) {
    showError(message);
    return;
  }
  usernameModalError.textContent = message;
  usernameModalError.classList.remove('hidden');
  setTimeout(() => {
    usernameModalError.classList.add('hidden');
  }, 5000);
}

// Username modal handlers
changeNameBtn.addEventListener('click', () => {
  usernameInput.value = username;
  usernameModal.classList.remove('hidden');
  usernameInput.focus();
});

// Language toggle initialization
(function initLangToggle() {
  const btn = document.getElementById('langToggleBtn');
  if (!btn || typeof langManager === 'undefined') return;
  const LANGS = ['en', 'th'];
  const LABEL = { en: 'EN', th: 'TH' };

  function current() {
    return langManager.getCurrentLanguage ? langManager.getCurrentLanguage() : (localStorage.getItem('gameLanguage') || 'th');
  }

  function set(lang) {
    if (!langManager.setLanguage) return;
    langManager.setLanguage(lang);
    btn.setAttribute('aria-pressed', String(lang !== 'en'));
    const opposite = (lang === 'en') ? 'th' : 'en';
    btn.textContent = LABEL[opposite] || opposite.toUpperCase();
    window.dispatchEvent(new CustomEvent('languageChange', { detail: { lang } }));
  }

  btn.addEventListener('click', () => {
    const next = current() === LANGS[0] ? LANGS[1] : LANGS[0];
    set(next);
  });

  // initialize
  set(current());
})();

cancelUsernameBtn.addEventListener('click', () => {
  usernameModal.classList.add('hidden');
});

saveUsernameBtn.addEventListener('click', () => {
  const newName = usernameInput.value.trim();
  if (newName && newName.length >= 2) {
    if (isAuthenticated) {
      // Authenticated users: call server API to change name
      (async () => {
        try {
          const resp = await fetch('/api/change-name', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newName })
          });
          const result = await resp.json();
          if (result.success) {
            username = result.name;
            updateUsernameDisplay();
            usernameModal.classList.add('hidden');
            showStatus('Username updated!');
          } else {
            showUsernameModalError(result.error || 'Failed to change name');
          }
        } catch (err) {
          console.error('Error changing name for auth user', err);
          showUsernameModalError('Error changing name');
        }
      })();
    } else {
      // Anonymous users: ask server to update (server will check uniqueness)
      socket.emit('updateUsername', { playerId, username: newName }, (resp) => {
        if (resp && resp.success) {
          username = resp.name || newName;
          localStorage.setItem('tankGameUsername', username);
          updateUsernameDisplay();
          usernameModal.classList.add('hidden');
          showStatus('Username updated!');
        } else {
          showUsernameModalError(resp && resp.error ? resp.error : 'Failed to update username');
        }
      });
    }
  } else {
    showUsernameModalError('Username must be at least 2 characters');
  }
});

usernameInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    saveUsernameBtn.click();
  }
});

// Create new game
createGameBtn.addEventListener('click', () => {
  socket.emit('createGame', { playerId: playerId, username: username, tankColor: tankColor });
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
  const colorSelectionSection = document.getElementById('colorSelectionSection');
  
  // Store current game mode
  currentGameMode = gameMode || 'ai_solo';
  
  // Show/hide color selection based on game mode
  // Only show for free-for-all modes: multiplayer and ai_solo
  if (colorSelectionSection) {
    if (gameMode === 'multiplayer' || gameMode === 'ai_solo') {
      colorSelectionSection.style.display = 'block';
    } else {
      colorSelectionSection.style.display = 'none';
    }
  }
  
  // Refresh player list to update color indicators
  if (playersInGame && Object.keys(playersInGame).length > 0) {
    updatePlayersList();
  }
  
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
    disableLobbyChat();
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
  const initialGameMode = data.gameMode || 'ai_solo';
  updateGameModeDisplay(initialGameMode);
  
  showStatus(`Game created! Share code: ${currentGameCode}`);
  // Enable lobby chat for this game
  enableLobbyChat(currentGameCode);
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
  const gameMode = data.gameMode || 'ai_solo';
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
  // Enable lobby chat for this game
  enableLobbyChat(currentGameCode);
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

socket.on('lobbyTimedOut', (data) => {
  showError(data.message || 'Lobby timed out due to inactivity.');
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

// Listen for player color changes in lobby
socket.on('playerColorChanged', (data) => {
  playersInGame = data.players;
  updatePlayersList();
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
  disableLobbyChat();

  menuView.classList.remove('hidden');
  waitingRoom.classList.add('hidden');
  // Clear any game code inputs or displays safely
  try {
    if (typeof gameCodeInput !== 'undefined' && gameCodeInput) {
      gameCodeInput.value = '';
    } else if (gameCodeDisplay) {
      gameCodeDisplay.textContent = '-';
    }
  } catch (e) {
    console.warn('Failed to clear game code input/display', e);
  }
  // Ensure main menu global chat is active again
  try { enableGlobalChat(); } catch (e) { /* ignore */ }
  // Request the current global chat history so the menu shows messages immediately
  try { socket && socket.emit && socket.emit('requestGlobalChatHistory'); } catch (e) { /* ignore */ }
}

function updatePlayersList() {
  const playerCount = Object.keys(playersInGame).length;
  playerCountDisplay.textContent = playerCount;
  
  playersListElement.innerHTML = '';
  
  Object.entries(playersInGame).forEach(([id, player], index) => {
    const li = document.createElement('li');
    const hostBadge = player.isHost ? ' 👑 (Host)' : '';
    const youBadge = id === socket.id ? ' (You)' : '';
    
    // Determine color indicator based on game mode and team
    let colorIndicator = '';
    
    // Modes that use custom colors: multiplayer and ai_solo only
    const allowCustomColors = (currentGameMode === 'multiplayer' || currentGameMode === 'ai_solo');
    
    // Only Team vs Team mode shows team colors (orange/blue)
    if (currentGameMode === 'team_pvp' && (player.team === 'team_a' || player.team === 'team_b')) {
      // Team PvP mode: show team color in indicator
      const teamColor = player.team === 'team_a' ? '#ff8844' : '#44aaff';
      colorIndicator = `<span style="display: inline-block; width: 12px; height: 12px; background: ${teamColor}; border: 1px solid rgba(255,255,255,0.5); border-radius: 50%; margin-right: 5px; vertical-align: middle;"></span>`;
    } else if (allowCustomColors && player.tankColor) {
      // Free-for-all mode with custom color selected
      colorIndicator = `<span style="display: inline-block; width: 12px; height: 12px; background: ${player.tankColor}; border: 1px solid rgba(255,255,255,0.5); border-radius: 50%; margin-right: 5px; vertical-align: middle;"></span>`;
    } else {
      // Default green/red split for all other cases (including co-op, ai_mixed)
      colorIndicator = `<span style="display: inline-block; width: 12px; height: 12px; background: linear-gradient(135deg, #44ff44 0%, #44ff44 50%, #ff0000 50%, #ff0000 100%); border: 1px solid rgba(255,255,255,0.5); border-radius: 50%; margin-right: 5px; vertical-align: middle;"></span>`;
    }
    
    // Add team badge (but don't change text color)
    let teamBadge = '';
    const isTeamMode = (currentGameMode === 'team_pvp');
    if (isTeamMode && player.team === 'team_a') {
      teamBadge = ' ⚡';
    } else if (isTeamMode && player.team === 'team_b') {
      teamBadge = ' 🛡️';
    }
    
    li.innerHTML = `${colorIndicator}${player.username || `Player ${index + 1}`}${teamBadge}${hostBadge}${youBadge}`;
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
          ${game.state === 'playing' ? '🎮 Playing' : '⏳ Waiting'}
        </div>
      `;
      
      // Add click handler for lobbies (waiting state)
      if (game.state === 'waiting') {
        gameItem.addEventListener('click', () => {
          const gameCode = game.code;
          socket.emit('joinGame', { gameCode, playerId, username, tankColor });
          showStatus(`Joining game ${gameCode}...`);
        });
      }
      
      activeGamesList.appendChild(gameItem);
    });
  } else {
    activeGamesList.innerHTML = '<p style="text-align: center; color: #90caf9; padding: 10px;">No active games</p>';
  }
});
// Tank color selection
const colorButtons = document.querySelectorAll('.color-btn');

// Set initial selection based on stored color
colorButtons.forEach(btn => {
  const btnColor = btn.getAttribute('data-color');
  const storedColor = tankColor === 'null' ? null : tankColor;
  
  if ((btnColor === 'null' && storedColor === null) || (btnColor === storedColor)) {
    btn.classList.add('selected');
  }
  
  btn.addEventListener('click', () => {
    // Remove selection from all buttons
    colorButtons.forEach(b => b.classList.remove('selected'));
    // Add selection to clicked button
    btn.classList.add('selected');
    
    // Get the color value (handle "null" string)
    const selectedColor = btnColor === 'null' ? null : btnColor;
    tankColor = selectedColor;
    
    // Save to localStorage
    if (selectedColor === null) {
      localStorage.removeItem('tankColor');
    } else {
      localStorage.setItem('tankColor', selectedColor);
    }
    
    // Save to database
    fetch('/api/player/updateColor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, color: selectedColor })
    }).catch(err => console.error('Error updating color:', err));
    
    // If in a lobby, notify other players of color change
    if (currentGameCode) {
      socket.emit('updatePlayerColor', { 
        gameCode: currentGameCode, 
        color: selectedColor 
      });
    }
    
    console.log('Tank color updated:', selectedColor || 'default');
  });
});

// Chat send handlers
function sendChat() {
  if (!chatInput) return;
  const msg = chatInput.value.trim();
  if (!msg) return;
  if (!currentGameCode) {
    // Send to global channel when not in a lobby
    socket.emit('globalChatMessage', { message: msg, playerName: username, playerId: playerId });
    // Wait for server echo to render the message (avoid duplicates)
    chatInput.value = '';
    return;
  }
  // Emit to server - server will broadcast to the lobby room
  socket.emit('lobbyChatMessage', { message: msg });
  // Wait for server echo to render the message (avoid duplicates)
  chatInput.value = '';
}

if (chatSendBtn) chatSendBtn.addEventListener('click', sendChat);
if (chatInput) chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChat(); });

// Receive lobby chat messages
socket.on('lobbyChatMessage', (data) => {
  try {
    if (!data) return;
    appendChatMessage({ id: data.id || null, playerName: data.playerName || 'Anon', message: data.message || '', timestamp: data.timestamp || Date.now() });
  } catch (e) { console.error('Failed to render chat message', e); }
});

// Receive global chat messages
socket.on('globalChatMessage', (data) => {
  try {
    // Ignore global messages while inside a lobby
    if (currentGameCode) return;
    if (!data) return;
    appendChatMessage({ id: data.id || null, playerName: data.playerName || 'Anon', message: data.message || '', timestamp: data.timestamp || Date.now() });
  } catch (e) { console.error('Failed to render global chat message', e); }
});

// Receive global chat history
socket.on('globalChatHistory', (data) => {
  try {
    // Don't render global history if we are currently inside a lobby
    if (currentGameCode) return;
    if (!data || !Array.isArray(data.history)) return;
    if (chatMessages) chatMessages.innerHTML = '';
    data.history.forEach(msg => {
      appendChatMessage({ id: msg.id || null, playerName: msg.playerName || 'Anon', message: msg.message || '', timestamp: msg.timestamp || Date.now() });
    });
  } catch (e) { console.error('Failed to render global chat history', e); }
});

// Receive lobby chat history
socket.on('lobbyChatHistory', (data) => {
  try {
    if (!data || !Array.isArray(data.history)) return;
    if (chatMessages) chatMessages.innerHTML = '';
    data.history.forEach(msg => {
      appendChatMessage({ id: msg.id || null, playerName: msg.playerName || 'Anon', message: msg.message || '', timestamp: msg.timestamp || Date.now() });
    });
  } catch (e) { console.error('Failed to render lobby chat history', e); }
});

// Handle message deletion notifications
socket.on('chatMessageDeleted', (data) => {
  try {
    if (!data || !data.id) return;
    const id = data.id;
    // find and remove any element with matching data-msg-id
    const el = chatMessages && chatMessages.querySelector(`[data-msg-id="${id}"]`);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  } catch (e) { console.error('Failed to apply chat deletion', e); }
});