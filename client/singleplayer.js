// Single Player Game Manager
class SinglePlayerManager {
  constructor(gameState, singlePlayerState, canvas, ctx) {
    this.gameState = gameState;
    this.spState = singlePlayerState;
    this.canvas = canvas;
    this.ctx = ctx;
    this.initialized = false;
    this.lastAIUpdate = 0;
    this.aiUpdateInterval = 100; // Update AI every 100ms
    this.difficulty = singlePlayerState.difficulty || 'normal';
    this.mode = singlePlayerState.mode || 'training';
    this.nextProjectileId = 1;
    this.tutorialStep = 0;
    this.tutorialMessages = [];
    this.tutorialCompleted = false;
    
    // Campaign system for Campaign Game
    this.campaigns = [
      { id: 'thai-cambodia', nameKey: 'campaignThaiCambodia', color: '#2E7D32', unlocked: true },
      { id: 'thai-laos', nameKey: 'campaignThaiLaos', color: '#1565C0', unlocked: false },
      { id: 'thai-myanmar', nameKey: 'campaignThaiMyanmar', color: '#6A1B9A', unlocked: false },
      { id: 'thai-malaysia', nameKey: 'campaignThaiMalaysia', color: '#D32F2F', unlocked: false }
    ];
    this.currentCampaign = singlePlayerState.campaign || 'thai-cambodia';
  }

  init() {
    console.log(`Initializing Single Player: ${this.mode} - ${this.difficulty}`);
    
    // Load campaign progress for target practice
    if (this.mode === 'targetpractice') {
      this.loadCampaignProgress();
    }
    
    // Set up player tank
    this.createPlayerTank();
    
    // Initialize based on mode
    switch (this.mode) {
      case 'training':
        this.initTrainingMode();
        break;
      case 'timeattack':
        this.initTimeAttackMode();
        break;
      case 'targetpractice':
        this.initTargetPracticeMode();
        break;
      case 'bossrush':
        this.initBossRushMode();
        break;
      default:
        console.error('Unknown single player mode:', this.mode);
    }
    
    this.initialized = true;
    this.spState.startTime = Date.now();
    
    // Generate obstacles for the map
    this.generateObstacles();
    
    // Show exit button for single player
    this.showExitButton();
  }
  
  generateObstacles() {
    const TANK_SIZE = 20;
    const numObstacles = Math.floor(Math.random() * 6) + 8; // 8-14 obstacles
    const MIN_GAP = TANK_SIZE * 3; // Minimum gap between obstacles
    
    for (let i = 0; i < numObstacles; i++) {
      let x, y, width, height, valid;
      let attempts = 0;
      const maxAttempts = 50;
      
      do {
        valid = true;
        attempts++;
        width = Math.random() * 30 + 35; // 35-65 width
        height = Math.random() * 30 + 35; // 35-65 height
        x = Math.random() * (this.gameState.gameWidth - width);
        y = Math.random() * (this.gameState.gameHeight - height);
        
        // Check if too close to edges
        if (x < 60 || x + width > this.gameState.gameWidth - 60 ||
            y < 60 || y + height > this.gameState.gameHeight - 60) {
          valid = false;
          continue;
        }
        
        // Check if overlaps with center spawn area (avoid blocking player spawn)
        const centerX = this.gameState.gameWidth / 2;
        const centerY = this.gameState.gameHeight / 2;
        const spawnRadius = 100;
        if (Math.abs(x + width/2 - centerX) < spawnRadius && 
            Math.abs(y + height/2 - centerY) < spawnRadius) {
          valid = false;
          continue;
        }
        
        // Check if overlaps with existing obstacles
        for (let obs of this.gameState.obstacles) {
          if (!(x + width + MIN_GAP < obs.x ||
                x - MIN_GAP > obs.x + obs.width ||
                y + height + MIN_GAP < obs.y ||
                y - MIN_GAP > obs.y + obs.height)) {
            valid = false;
            break;
          }
        }
      } while (!valid && attempts < maxAttempts);
      
      if (valid) {
        this.gameState.obstacles.push({ x, y, width, height });
      }
    }
    
    console.log(`Generated ${this.gameState.obstacles.length} obstacles`);
  }

  createPlayerTank() {
    const playerId = this.gameState.playerId;
    const tankColor = localStorage.getItem('tankColor') || '#44ff44';
    
    // In campaign mode, show country name; otherwise show "You"
    const username = this.mode === 'targetpractice' ? '🇹🇭 Thailand' : 'You';
    
    this.gameState.players[playerId] = {
      id: playerId,
      x: this.gameState.gameWidth / 2,
      y: this.gameState.gameHeight / 2,
      rotation: 0,
      turretRotation: 0,
      angle: 0,
      health: 100,
      lives: 3,
      livesRemaining: 3,
      username: username,
      color: tankColor,
      isAlive: true,
      score: 0,
      kills: 0,
      deaths: 0
    };
    
    console.log('Player tank created:', playerId);
  }

  // ============ TRAINING MODE ============
  initTrainingMode() {
    console.log('Training Mode: Learn the basics');
    
    this.tutorialMessages = [
      { step: 0, text: '🎓 Welcome to Training Mode!', duration: 3000 },
      { step: 1, text: '⌨️ Use WASD or Arrow Keys to move', duration: 4000 },
      { step: 2, text: '🖱️ Move mouse to aim your turret', duration: 4000 },
      { step: 3, text: '🔫 Click to shoot', duration: 4000 },
      { step: 4, text: '🎯 Try to hit the target!', duration: 5000 }
    ];
    
    // Track training progress (optional completion after 10 targets)
    this.spState.targetsDestroyed = 0;
    this.spState.trainingGoal = 10;
    
    // Spawn initial training targets (stationary)
    this.spawnTrainingTargets(3);
    
    // Show first tutorial message
    this.showTutorialMessage(0);
  }

  spawnTrainingTargets(count) {
    const padding = 100;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const distance = 200 + Math.random() * 100;
      const x = this.gameState.gameWidth / 2 + Math.cos(angle) * distance;
      const y = this.gameState.gameHeight / 2 + Math.sin(angle) * distance;
      
      this.spawnTarget(x, y, 'moving');
    }
  }

  spawnTarget(x, y, type = 'stationary') {
    const targetId = 'target_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    this.gameState.players[targetId] = {
      id: targetId,
      x: x,
      y: y,
      rotation: Math.random() * Math.PI * 2,
      turretRotation: Math.random() * Math.PI * 2,
      angle: Math.random() * Math.PI * 2,
      health: 50,
      isAI: true,
      isTarget: true,
      targetType: type,
      isAlive: true,
      username: '🎯 Target',
      color: '#ff8800',
      score: 0,
      kills: 0,
      aiState: {
        moveSpeed: type === 'moving' ? 1.5 : 0,
        lastDirectionChange: Date.now(),
        moveAngle: Math.random() * Math.PI * 2
      }
    };
    
    this.spState.aiTanks.push(targetId);
  }

  showExitButton() {
    const exitBtn = document.getElementById('spExitBtn');
    if (exitBtn) {
      exitBtn.style.display = 'block';
      
      // Update button text based on mode
      const modeNames = {
        training: 'Exit Training',
        timeattack: 'Exit Time Attack',
        targetpractice: 'Exit Campaign Game',
        bossrush: 'Exit Boss Rush'
      };
      exitBtn.textContent = '🚪 ' + (modeNames[this.mode] || 'Exit Game');
      
      // Add click handler for both mouse and touch
      this.exitButtonHandler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!this.spState.completed) {
          if (confirm('Exit and return to menu?')) {
            window.location.href = '/menu.html';
          }
        }
      };
      
      // Add both click and touch events
      exitBtn.addEventListener('click', this.exitButtonHandler);
      exitBtn.addEventListener('touchstart', this.exitButtonHandler);
    }
  }
  
  hideExitButton() {
    const exitBtn = document.getElementById('spExitBtn');
    if (exitBtn) {
      exitBtn.style.display = 'none';
      if (this.exitButtonHandler) {
        exitBtn.removeEventListener('click', this.exitButtonHandler);
        exitBtn.removeEventListener('touchstart', this.exitButtonHandler);
      }
    }
  }
  
  showTutorialMessage(step) {
    const message = this.tutorialMessages[step];
    if (!message) return;
    
    this.tutorialStep = step;
    const tutorialDiv = document.getElementById('tutorialMessage');
    if (tutorialDiv) {
      tutorialDiv.textContent = message.text;
      tutorialDiv.style.display = 'block';
      tutorialDiv.style.opacity = '1';
      
      setTimeout(() => {
        if (tutorialDiv) {
          tutorialDiv.style.opacity = '0';
          setTimeout(() => {
            if (tutorialDiv) tutorialDiv.style.display = 'none';
            // Show next message after a delay
            if (step < this.tutorialMessages.length - 1) {
              setTimeout(() => this.showTutorialMessage(step + 1), 1000);
            } else {
              this.tutorialCompleted = true;
              this.spawnMovingTargets(2);
            }
          }, 500);
        }
      }, message.duration);
    }
  }

  spawnMovingTargets(count) {
    for (let i = 0; i < count; i++) {
      const edge = Math.floor(Math.random() * 4);
      let x, y;
      
      switch (edge) {
        case 0: x = Math.random() * this.gameState.gameWidth; y = 50; break;
        case 1: x = this.gameState.gameWidth - 50; y = Math.random() * this.gameState.gameHeight; break;
        case 2: x = Math.random() * this.gameState.gameWidth; y = this.gameState.gameHeight - 50; break;
        case 3: x = 50; y = Math.random() * this.gameState.gameHeight; break;
      }
      
      this.spawnTarget(x, y, 'moving');
    }
  }

  // ============ TIME ATTACK MODE ============
  initTimeAttackMode() {
    console.log('Time Attack Mode: Destroy enemies quickly!');
    this.spState.targetCount = 10;
    this.spState.enemiesDestroyed = 0;
    this.spawnWave(3);
  }

  // ============ CAMPAIGN GAME MODE ============
  initTargetPracticeMode() {
    const campaign = this.getCampaignData(this.currentCampaign);
    console.log(`Campaign Game Mode: ${campaign.name}`);
    
    // New rules: Wave-based defense with manageable enemy count
    this.spState.totalWaves = 3;
    this.spState.currentWave = 1;
    this.spState.enemiesPerWave = 3; // 3 enemies per wave
    this.spState.enemiesKilled = 0;
    this.spState.totalEnemies = this.spState.totalWaves * this.spState.enemiesPerWave; // Total: 9 enemies
    this.spState.hits = 0;
    this.spState.misses = 0;
    this.spState.campaign = this.currentCampaign;
    
    // No ammo limit - unlimited shots for border defense!
    // Hide ammo display
    const ammoDisplay = document.getElementById('ammoDisplay');
    if (ammoDisplay) {
      ammoDisplay.style.display = 'none';
    }
    
    // Spawn first wave
    this.spawnCampaignWave(1);
    
    // Apply campaign theme to canvas
    this.applyCampaignTheme(campaign);
  }
  
  spawnCampaignWave(waveNum) {
    console.log(`Spawning Campaign Wave ${waveNum}/${this.spState.totalWaves}`);
    
    // Spawn enemies with longer delays to avoid overwhelming the player
    for (let i = 0; i < this.spState.enemiesPerWave; i++) {
      setTimeout(() => {
        this.spawnAITank();
      }, i * 1200); // Increased delay from 800ms to 1200ms (1.2 seconds)
    }
  }
  
  getCampaignData(campaignId) {
    const campaign = this.campaigns.find(c => c.id === campaignId) || this.campaigns[0];
    // Add translated name
    if (typeof langManager !== 'undefined' && campaign.nameKey) {
      campaign.name = langManager.t(campaign.nameKey);
    }
    return campaign;
  }
  
  applyCampaignTheme(campaign) {
    // Translate the name before storing
    const translatedCampaign = { ...campaign };
    if (typeof langManager !== 'undefined' && campaign.nameKey) {
      translatedCampaign.name = langManager.t(campaign.nameKey);
    }
    // Store theme color for rendering
    this.gameState.campaignTheme = translatedCampaign;
  }
  
  unlockNextCampaign() {
    const currentIndex = this.campaigns.findIndex(c => c.id === this.currentCampaign);
    if (currentIndex >= 0 && currentIndex < this.campaigns.length - 1) {
      const nextCampaign = this.campaigns[currentIndex + 1];
      nextCampaign.unlocked = true;
      
      // Save to localStorage
      const progress = JSON.parse(localStorage.getItem('targetPracticeProgress') || '{}');
      progress[nextCampaign.id] = true;
      localStorage.setItem('targetPracticeProgress', JSON.stringify(progress));
      
      // Return campaign with translated name
      const campaignWithName = { ...nextCampaign };
      if (typeof langManager !== 'undefined' && nextCampaign.nameKey) {
        campaignWithName.name = langManager.t(nextCampaign.nameKey);
      }
      return campaignWithName;
    }
    return null;
  }
  
  loadCampaignProgress() {
    const progress = JSON.parse(localStorage.getItem('targetPracticeProgress') || '{}');
    this.campaigns.forEach(campaign => {
      if (progress[campaign.id]) {
        campaign.unlocked = true;
      }
    });
  }
  
  getEnemyCountryName() {
    // Return enemy country based on current campaign
    const countryMap = {
      'thai-cambodia': '🇰🇭 Cambodia',
      'thai-laos': '🇱🇦 Laos',
      'thai-myanmar': '🇲🇲 Myanmar',
      'thai-malaysia': '🇲🇾 Malaysia'
    };
    return countryMap[this.currentCampaign] || '🇰🇭 Cambodia';
  }

  // ============ BOSS RUSH MODE ============
  initBossRushMode() {
    console.log('Boss Rush Mode: Face powerful bosses!');
    this.spState.currentWave = 1;
    this.spState.bossesDefeated = 0;
    this.spawnBoss(1);
  }

  spawnWave(count) {
    console.log('Spawning wave with', count, 'enemies');
    for (let i = 0; i < count; i++) {
      setTimeout(() => this.spawnAITank(), i * 500);
    }
  }

  spawnAITank() {
    const aiId = 'ai_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    // Spawn at random edge
    const edge = Math.floor(Math.random() * 4);
    let x, y;
    
    switch (edge) {
      case 0: x = Math.random() * this.gameState.gameWidth; y = 50; break;
      case 1: x = this.gameState.gameWidth - 50; y = Math.random() * this.gameState.gameHeight; break;
      case 2: x = Math.random() * this.gameState.gameWidth; y = this.gameState.gameHeight - 50; break;
      case 3: x = 50; y = Math.random() * this.gameState.gameHeight; break;
    }
    
    const difficulty = this.getDifficultyStats();
    // In campaign mode, show enemy country name; otherwise show generic "Enemy"
    const username = this.mode === 'targetpractice' ? this.getEnemyCountryName() : 'Enemy';
    
    this.gameState.players[aiId] = {
      id: aiId,
      x: x,
      y: y,
      rotation: Math.random() * Math.PI * 2,
      turretRotation: Math.random() * Math.PI * 2,
      angle: Math.random() * Math.PI * 2,
      health: difficulty.aiHealth,
      isAI: true,
      isAlive: true,
      username: username,
      color: '#ff0000',
      score: 0,
      kills: 0,
      aiState: {
        targetX: this.gameState.gameWidth / 2,
        targetY: this.gameState.gameHeight / 2,
        nextActionTime: Date.now() + Math.random() * 1000,
        lastShot: 0,
        moveSpeed: difficulty.aiSpeed,
        shootRange: difficulty.shootRange,
        shootInterval: difficulty.shootInterval,
        accuracy: difficulty.accuracy
      }
    };
    
    this.spState.aiTanks.push(aiId);
  }

  spawnBoss(wave) {
    const bossId = 'boss_' + Date.now();
    const bossHealth = 300 + (wave - 1) * 200;
    
    this.gameState.players[bossId] = {
      id: bossId,
      x: this.gameState.gameWidth / 2,
      y: 100,
      rotation: Math.PI / 2,
      turretRotation: Math.PI / 2,
      angle: Math.PI / 2,
      health: bossHealth,
      maxHealth: bossHealth,
      isBoss: true,
      isAI: true,
      isAlive: true,
      username: `👑 Boss ${wave}`,
      color: '#8800ff',
      score: 0,
      kills: 0,
      size: 40, // Larger than normal tanks
      aiState: {
        phase: 'circle',
        circleAngle: 0,
        circleSpeed: 0.02,
        circleRadius: 200,
        lastShot: 0,
        shootInterval: 800,
        burstCount: 0
      }
    };
    
    this.spState.aiTanks.push(bossId);
    this.spState.bossHealth = bossHealth;
    this.spState.maxBossHealth = bossHealth;
  }

  getDifficultyStats() {
    switch (this.difficulty) {
      case 'easy':
        return {
          aiHealth: 50,
          aiSpeed: 1.5,
          shootRange: 300,
          shootInterval: 2000,
          accuracy: 0.7
        };
      case 'hard':
        return {
          aiHealth: 150,
          aiSpeed: 3,
          shootRange: 500,
          shootInterval: 1000,
          accuracy: 0.95
        };
      default: // normal
        return {
          aiHealth: 100,
          aiSpeed: 2,
          shootRange: 400,
          shootInterval: 1500,
          accuracy: 0.85
        };
    }
  }

  update() {
    if (!this.initialized) return;
    
    const now = Date.now();
    
    // Update AI tanks
    if (now - this.lastAIUpdate > this.aiUpdateInterval) {
      this.updateAI();
      this.lastAIUpdate = now;
    }
    
    // Update projectiles
    this.updateProjectiles();
    
    // Check collisions
    this.checkCollisions();
    
    // Update explosions
    this.updateExplosions();
    
    // Check win/lose conditions
    this.checkGameState();
    
    // Update mode-specific logic
    switch (this.mode) {
      case 'training':
        this.updateTrainingMode();
        break;
      case 'timeattack':
        this.updateTimeAttackMode();
        break;
      case 'bossrush':
        this.updateBossRushMode();
        break;
    }
  }

  updateAI() {
    const playerTank = this.gameState.players[this.gameState.playerId];
    if (!playerTank || !playerTank.isAlive) return;
    
    this.spState.aiTanks.forEach(aiId => {
      const aiTank = this.gameState.players[aiId];
      if (!aiTank || !aiTank.isAlive) return;
      
      if (aiTank.isBoss) {
        this.updateBossAI(aiTank);
      } else if (aiTank.isTarget) {
        this.updateTargetAI(aiTank);
      } else {
        this.updateBasicAI(aiTank, playerTank);
      }
    });
  }

  updateTargetAI(target) {
    if (target.targetType === 'stationary') return;
    
    const now = Date.now();
    const state = target.aiState;
    
    // Change direction occasionally
    if (now - state.lastDirectionChange > 2000) {
      state.moveAngle = Math.random() * Math.PI * 2;
      state.lastDirectionChange = now;
    }
    
    // Move
    const speed = state.moveSpeed || 1.5;
    const newX = target.x + Math.cos(state.moveAngle) * speed;
    const newY = target.y + Math.sin(state.moveAngle) * speed;
    
    // Check obstacle collisions
    let hitObstacle = false;
    for (let obstacle of this.gameState.obstacles) {
      if (newX + 20 > obstacle.x && newX - 20 < obstacle.x + obstacle.width &&
          newY + 20 > obstacle.y && newY - 20 < obstacle.y + obstacle.height) {
        hitObstacle = true;
        break;
      }
    }
    
    if (hitObstacle) {
      // Bounce off obstacle
      state.moveAngle += Math.PI / 2 + (Math.random() - 0.5) * Math.PI / 4;
    } else {
      target.x = newX;
      target.y = newY;
    }
    
    // Bounce off walls
    const margin = 30;
    if (target.x < margin || target.x > this.gameState.gameWidth - margin) {
      state.moveAngle = Math.PI - state.moveAngle;
      target.x = Math.max(margin, Math.min(this.gameState.gameWidth - margin, target.x));
    }
    if (target.y < margin || target.y > this.gameState.gameHeight - margin) {
      state.moveAngle = -state.moveAngle;
      target.y = Math.max(margin, Math.min(this.gameState.gameHeight - margin, target.y));
    }
    
    target.rotation = state.moveAngle;
  }

  updateBasicAI(aiTank, playerTank) {
    const dx = playerTank.x - aiTank.x;
    const dy = playerTank.y - aiTank.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const angleToPlayer = Math.atan2(dy, dx);
    
    const state = aiTank.aiState;
    const now = Date.now();
    
    // Aim turret at player
    aiTank.turretRotation = angleToPlayer;
    
    // Movement behavior
    if (distance > 200) {
      // Approach player
      const speed = state.moveSpeed || 2;
      const newX = aiTank.x + Math.cos(angleToPlayer) * speed;
      const newY = aiTank.y + Math.sin(angleToPlayer) * speed;
      
      // Check obstacle collision
      let canMove = true;
      for (let obstacle of this.gameState.obstacles) {
        if (newX + 20 > obstacle.x && newX - 20 < obstacle.x + obstacle.width &&
            newY + 20 > obstacle.y && newY - 20 < obstacle.y + obstacle.height) {
          canMove = false;
          break;
        }
      }
      
      // Check collision with other tanks
      if (canMove) {
        for (let tankId in this.gameState.players) {
          if (tankId !== aiTank.id) {
            const otherTank = this.gameState.players[tankId];
            if (!otherTank.isAlive) continue;
            
            const dx = newX - otherTank.x;
            const dy = newY - otherTank.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            // Tanks collide if distance is less than 2x tank size (40)
            if (dist < 40) {
              canMove = false;
              break;
            }
          }
        }
      }
      
      if (canMove) {
        aiTank.x = newX;
        aiTank.y = newY;
      } else {
        // Try to move around obstacle
        const perpAngle = angleToPlayer + Math.PI / 2;
        const altX = aiTank.x + Math.cos(perpAngle) * speed;
        const altY = aiTank.y + Math.sin(perpAngle) * speed;
        
        let canMoveAlt = true;
        for (let obstacle of this.gameState.obstacles) {
          if (altX + 20 > obstacle.x && altX - 20 < obstacle.x + obstacle.width &&
              altY + 20 > obstacle.y && altY - 20 < obstacle.y + obstacle.height) {
            canMoveAlt = false;
            break;
          }
        }
        
        if (canMoveAlt) {
          aiTank.x = altX;
          aiTank.y = altY;
        }
      }
      aiTank.rotation = angleToPlayer;
    } else if (distance < 150) {
      // Retreat slightly
      const speed = (state.moveSpeed || 2) * 0.75;
      const newX = aiTank.x - Math.cos(angleToPlayer) * speed;
      const newY = aiTank.y - Math.sin(angleToPlayer) * speed;
      
      // Check obstacle collision
      let canMove = true;
      for (let obstacle of this.gameState.obstacles) {
        if (newX + 20 > obstacle.x && newX - 20 < obstacle.x + obstacle.width &&
            newY + 20 > obstacle.y && newY - 20 < obstacle.y + obstacle.height) {
          canMove = false;
          break;
        }
      }
      
      // Check collision with other tanks
      if (canMove) {
        for (let tankId in this.gameState.players) {
          if (tankId !== aiTank.id) {
            const otherTank = this.gameState.players[tankId];
            if (!otherTank.isAlive) continue;
            
            const dx = newX - otherTank.x;
            const dy = newY - otherTank.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            // Tanks collide if distance is less than 2x tank size (40)
            if (dist < 40) {
              canMove = false;
              break;
            }
          }
        }
      }
      
      if (canMove) {
        aiTank.x = newX;
        aiTank.y = newY;
      }
      aiTank.rotation = angleToPlayer + Math.PI;
    }
    
    // Keep within bounds
    const margin = 30;
    aiTank.x = Math.max(margin, Math.min(this.gameState.gameWidth - margin, aiTank.x));
    aiTank.y = Math.max(margin, Math.min(this.gameState.gameHeight - margin, aiTank.y));
    
    // Shooting
    const shootRange = state.shootRange || 400;
    const shootInterval = state.shootInterval || 1500;
    
    if (distance < shootRange && now - state.lastShot > shootInterval) {
      const accuracy = state.accuracy || 0.85;
      const spread = (1 - accuracy) * 0.5;
      const aimAngle = angleToPlayer + (Math.random() - 0.5) * spread;
      
      this.shootProjectile(aiTank, aimAngle);
      state.lastShot = now;
    }
  }

  updateBossAI(boss) {
    const state = boss.aiState;
    const now = Date.now();
    const playerTank = this.gameState.players[this.gameState.playerId];
    if (!playerTank) return;
    
    // Circular movement pattern
    state.circleAngle += state.circleSpeed;
    const centerX = this.gameState.gameWidth / 2;
    const centerY = this.gameState.gameHeight / 2;
    
    boss.x = centerX + Math.cos(state.circleAngle) * state.circleRadius;
    boss.y = centerY + Math.sin(state.circleAngle) * state.circleRadius;
    boss.rotation = state.circleAngle + Math.PI / 2;
    
    // Aim at player
    const dx = playerTank.x - boss.x;
    const dy = playerTank.y - boss.y;
    boss.turretRotation = Math.atan2(dy, dx);
    
    // Shoot in bursts
    if (now - state.lastShot > state.shootInterval) {
      this.shootProjectile(boss, boss.turretRotation);
      state.lastShot = now;
      state.burstCount++;
      
      // After 3 shots, longer cooldown
      if (state.burstCount >= 3) {
        state.lastShot = now + 1000;
        state.burstCount = 0;
      }
    }
    
    // Update boss health display
    this.spState.bossHealth = boss.health;
  }

  shootProjectile(tank, angle) {
    const projectileSpeed = tank.isBoss ? 10 : 8;
    const damage = tank.isBoss ? 20 : 10;
    const barrelLength = tank.isBoss ? 40 : 20;
    
    const projectile = {
      id: 'proj_' + this.nextProjectileId++,
      x: tank.x + Math.cos(angle) * barrelLength,
      y: tank.y + Math.sin(angle) * barrelLength,
      vx: Math.cos(angle) * projectileSpeed,
      vy: Math.sin(angle) * projectileSpeed,
      ownerId: tank.id,
      damage: damage,
      weaponType: 'default'
    };
    
    this.gameState.projectiles.push(projectile);
  }

  handlePlayerShoot(angle) {
    const playerTank = this.gameState.players[this.gameState.playerId];
    if (!playerTank || !playerTank.isAlive) return;
    
    // Campaign mode has unlimited ammo - no restrictions
    
    const projectile = {
      id: 'proj_' + this.nextProjectileId++,
      x: playerTank.x + Math.cos(angle) * 25,
      y: playerTank.y + Math.sin(angle) * 25,
      vx: Math.cos(angle) * 8,
      vy: Math.sin(angle) * 8,
      ownerId: playerTank.id,
      damage: 10,
      weaponType: 'default'
    };
    
    this.gameState.projectiles.push(projectile);
  }

  updateProjectiles() {
    this.gameState.projectiles = this.gameState.projectiles.filter(proj => {
      const prevX = proj.x;
      const prevY = proj.y;
      proj.x += proj.vx;
      proj.y += proj.vy;
      
      // Check obstacle collisions
      for (let obstacle of this.gameState.obstacles) {
        if (proj.x >= obstacle.x && proj.x <= obstacle.x + obstacle.width &&
            proj.y >= obstacle.y && proj.y <= obstacle.y + obstacle.height) {
          // Projectile hit obstacle - count as miss in target practice
          if (this.mode === 'targetpractice' && proj.ownerId === this.gameState.playerId) {
            this.spState.misses++;
          }
          return false;
        }
      }
      
      // Check if out of bounds
      const outOfBounds = proj.x < 0 || proj.x > this.gameState.gameWidth ||
                          proj.y < 0 || proj.y > this.gameState.gameHeight;
      
      if (outOfBounds) {
        // Count as miss in target practice if player shot
        if (this.mode === 'targetpractice' && proj.ownerId === this.gameState.playerId) {
          this.spState.misses++;
        }
        return false;
      }
      
      return true;
    });
  }

  checkCollisions() {
    const projsToRemove = new Set();
    
    this.gameState.projectiles.forEach(proj => {
      Object.values(this.gameState.players).forEach(tank => {
        if (!tank.isAlive || tank.id === proj.ownerId) return;
        if (projsToRemove.has(proj.id)) return;
        
        const dx = tank.x - proj.x;
        const dy = tank.y - proj.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const tankSize = tank.size || 20;
        
        if (distance < tankSize + 5) {
          // Hit!
          tank.health -= proj.damage;
          projsToRemove.add(proj.id);
          
          // Track hits for target practice
          if (this.mode === 'targetpractice' && proj.ownerId === this.gameState.playerId) {
            this.spState.hits++;
          }
          
          // Create explosion
          this.gameState.explosions.push(new Explosion(proj.x, proj.y, 'small'));
          
          if (tank.health <= 0) {
            this.handleTankDestroyed(tank, proj.ownerId);
          }
        }
      });
    });
    
    // Remove hit projectiles
    this.gameState.projectiles = this.gameState.projectiles.filter(p => !projsToRemove.has(p.id));
    
    // Track misses for target practice
    if (this.mode === 'targetpractice') {
      const missedShots = Array.from(projsToRemove).filter(id => {
        const proj = this.gameState.projectiles.find(p => p.id === id);
        return proj && proj.ownerId === this.gameState.playerId;
      });
      // Misses are calculated when projectiles go out of bounds (already handled in updateProjectiles)
    }
  }

  handleTankDestroyed(tank, killerId) {
    tank.isAlive = false;
    tank.health = 0;
    
    // Create big explosion
    this.gameState.explosions.push(new Explosion(tank.x, tank.y, 'big'));
    
    const killer = this.gameState.players[killerId];
    if (killer) {
      killer.kills++;
      killer.score += tank.isBoss ? 500 : (tank.isTarget ? 100 : 200);
    }
    
    // Handle player death - lives system
    if (tank.id === this.gameState.playerId) {
      tank.livesRemaining -= 1;
      tank.deaths = (tank.deaths || 0) + 1;
      
      if (tank.livesRemaining > 0) {
        // Respawn player after delay
        setTimeout(() => {
          tank.health = 100;
          tank.isAlive = true;
          // Respawn at center
          tank.x = this.gameState.gameWidth / 2;
          tank.y = this.gameState.gameHeight / 2;
          tank.rotation = 0;
          tank.turretRotation = 0;
        }, 3000); // 3 second respawn delay
      } else {
        // Game over - no more lives
        this.completeGame(false);
      }
      return;
    }
    
    // Update single player stats for enemy kills
    if (killerId === this.gameState.playerId) {
      if (tank.isBoss) {
        this.spState.bossesDefeated++;
      } else {
        this.spState.enemiesDestroyed++;
      }
      
      // Campaign mode: track kills
      if (this.mode === 'targetpractice') {
        this.spState.enemiesKilled = (this.spState.enemiesKilled || 0) + 1;
      }
      
      // Track training mode progress
      if (this.mode === 'training' && tank.isTarget) {
        this.spState.targetsDestroyed = (this.spState.targetsDestroyed || 0) + 1;
      }
      
      // Respawn logic for training mode
      if (this.mode === 'training' && this.tutorialCompleted) {
        setTimeout(() => {
          if (tank.isTarget) {
            this.spawnTarget(
              Math.random() * (this.gameState.gameWidth - 100) + 50,
              Math.random() * (this.gameState.gameHeight - 100) + 50,
              Math.random() > 0.5 ? 'moving' : 'stationary'
            );
          }
        }, 2000);
      }
    }
    
    // Remove from AI list
    this.spState.aiTanks = this.spState.aiTanks.filter(id => id !== tank.id);
  }

  updateExplosions() {
    this.gameState.explosions.forEach(exp => exp.update());
    this.gameState.explosions = this.gameState.explosions.filter(exp => exp.isAlive());
  }

  updateTrainingMode() {
    // Check if optional training goal reached
    if (this.spState.targetsDestroyed >= this.spState.trainingGoal && !this.spState.goalAchievedShown) {
      this.spState.goalAchievedShown = true;
      this.showTrainingGoalMessage();
    }
    
    // Continuously spawn new targets after tutorial
    if (this.tutorialCompleted && this.spState.aiTanks.length < 3) {
      const now = Date.now();
      if (!this.spState.nextSpawnTime || now > this.spState.nextSpawnTime) {
        this.spawnMovingTargets(1);
        this.spState.nextSpawnTime = now + 3000;
      }
    }
  }
  
  showTrainingGoalMessage() {
    const tutorialDiv = document.getElementById('tutorialMessage');
    if (tutorialDiv) {
      tutorialDiv.textContent = '🎉 Training Goal Complete! (Click Exit button to finish or continue practicing)';
      tutorialDiv.style.display = 'block';
      tutorialDiv.style.opacity = '1';
      tutorialDiv.style.background = 'rgba(76, 175, 80, 0.95)';
      
      setTimeout(() => {
        if (tutorialDiv) {
          tutorialDiv.style.opacity = '0';
          setTimeout(() => {
            if (tutorialDiv) {
              tutorialDiv.style.display = 'none';
              tutorialDiv.style.background = 'rgba(0,0,0,0.9)';
            }
          }, 500);
        }
      }, 5000);
    }
  }

  updateTimeAttackMode() {
    // Check if wave is complete
    if (this.spState.enemiesDestroyed >= this.spState.targetCount) {
      this.completeGame(true);
    } else if (this.spState.aiTanks.filter(id => this.gameState.players[id]?.isAlive).length === 0) {
      // Spawn next wave
      const waveSize = Math.min(5, 3 + Math.floor(this.spState.enemiesDestroyed / 3));
      this.spawnWave(waveSize);
    }
  }

  updateBossRushMode() {
    // Check if boss is defeated
    if (this.spState.bossesDefeated >= 3) {
      this.completeGame(true);
    } else if (this.spState.aiTanks.length === 0) {
      // Spawn next boss after delay
      const now = Date.now();
      if (!this.spState.nextBossTime) {
        this.spState.nextBossTime = now + 3000;
      } else if (now > this.spState.nextBossTime) {
        this.spState.currentWave++;
        this.spawnBoss(this.spState.currentWave);
        this.spState.nextBossTime = null;
      }
    }
  }

  checkGameState() {
    const playerTank = this.gameState.players[this.gameState.playerId];
    
    // Check player death
    if (playerTank && playerTank.health <= 0 && playerTank.isAlive) {
      playerTank.isAlive = false;
      this.gameState.explosions.push(new Explosion(playerTank.x, playerTank.y, 'big'));
      this.completeGame(false);
    }
    
    // Check target practice completion
    if (this.mode === 'targetpractice') {
      // Campaign mode: Check if all waves completed
      if (this.spState.enemiesKilled >= this.spState.totalEnemies) {
        if (!this.spState.completed) {
          this.completeGame(true);
        }
      } else if (this.spState.aiTanks.length === 0 && this.spState.currentWave < this.spState.totalWaves) {
        // Spawn next wave after delay
        const now = Date.now();
        if (!this.spState.nextWaveTime) {
          this.spState.nextWaveTime = now + 2000;
        } else if (now > this.spState.nextWaveTime) {
          this.spState.currentWave++;
          this.spawnCampaignWave(this.spState.currentWave);
          this.spState.nextWaveTime = null;
        }
      }
    }
  }

  completeGame(won) {
    if (this.spState.completed) return;
    this.spState.completed = true;
    
    // Hide exit button
    this.hideExitButton();
    
    const elapsed = Math.floor((Date.now() - this.spState.startTime) / 1000);
    const playerTank = this.gameState.players[this.gameState.playerId];
    
    console.log('Game completed:', won ? 'Victory' : 'Defeat');
    
    // Calculate final stats
    const stats = {
      mode: this.mode,
      difficulty: this.difficulty,
      won: won,
      time: elapsed,
      kills: playerTank?.kills || 0,
      score: playerTank?.score || 0,
      health: Math.max(0, playerTank?.health || 0)
    };
    
    if (this.mode === 'targetpractice') {
      stats.enemiesKilled = this.spState.enemiesKilled || 0;
      stats.totalEnemies = this.spState.totalEnemies || 0;
      stats.wavesCompleted = this.spState.currentWave || 0;
      stats.totalWaves = this.spState.totalWaves || 3;
      stats.campaign = this.currentCampaign;
      
      // Unlock next campaign if won (completed all waves)
      if (won) {
        const nextCampaign = this.unlockNextCampaign();
        if (nextCampaign) {
          stats.unlockedCampaign = nextCampaign;
        }
      }
    } else if (this.mode === 'training') {
      stats.targetsDestroyed = this.spState.targetsDestroyed || 0;
    }
    
    // Save stats to database
    this.saveSinglePlayerStats(stats).catch(err => {
      console.error('Failed to save single player stats:', err);
    });
    
    // Show completion screen
    setTimeout(() => {
      this.showCompletionScreen(stats);
    }, 1000);
  }

  async saveSinglePlayerStats(stats) {
    try {
      const playerId = localStorage.getItem('tankGamePlayerId');
      if (!playerId) {
        console.warn('No player ID found, skipping stats save');
        return;
      }

      console.log('Saving single player stats:', stats);

      const response = await fetch('/api/singleplayer/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          playerId: playerId,
          gameData: stats
        })
      });

      const data = await response.json();
      if (data.success) {
        console.log('✅ Single player stats saved successfully');
      } else {
        console.error('❌ Failed to save stats:', data.message);
      }
    } catch (error) {
      console.error('❌ Error saving single player stats:', error);
      throw error;
    }
  }

  showCompletionScreen(stats) {
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      background: rgba(0,0,0,0.9);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;
    
    const content = document.createElement('div');
    content.style.cssText = `
      background: #1a1a2e;
      padding: 40px;
      border-radius: 15px;
      text-align: center;
      max-width: 500px;
      color: white;
    `;
    
    const title = stats.won ? '🎉 Victory!' : '💀 Game Over';
    const titleColor = stats.won ? '#4CAF50' : '#f44336';
    
    let statsHTML = `
      <h2 style="color: ${titleColor}; margin-bottom: 20px;">${title}</h2>
      <p style="font-size: 1.2em; margin-bottom: 20px;">${this.getModeName()} - ${this.getDifficultyName()}</p>
    `;
    
    // Show campaign info for Campaign Game
    if (stats.campaign) {
      const campaign = this.getCampaignData(stats.campaign);
      statsHTML += `<p style="color: ${campaign.color}; font-weight: bold; margin-bottom: 15px;">${campaign.name}</p>`;
    }
    
    statsHTML += `
      <div style="text-align: left; margin: 20px 0;">
        <p><strong>Time:</strong> ${Math.floor(stats.time / 60)}:${(stats.time % 60).toString().padStart(2, '0')}</p>
    `;
    
    // Campaign mode stats
    if (stats.enemiesKilled !== undefined) {
      statsHTML += `<p><strong>Waves Completed:</strong> ${stats.wavesCompleted}/${stats.totalWaves}</p>`;
      statsHTML += `<p><strong>Enemies Defeated:</strong> ${stats.enemiesKilled}/${stats.totalEnemies}</p>`;
    } else {
      statsHTML += `<p><strong>Targets Destroyed:</strong> ${this.spState.targetsDestroyed || stats.kills}</p>`;
    }
    
    statsHTML += `
        <p><strong>Score:</strong> ${stats.score}</p>
        <p><strong>Final Health:</strong> ${stats.health}</p>
      </div>
    `;
    
    // Show unlock message if new campaign unlocked
    if (stats.unlockedCampaign) {
      statsHTML += `
        <div style="background: ${stats.unlockedCampaign.color}; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p style="font-size: 1.3em; font-weight: bold; margin: 0;">🔓 NEW BORDER UNLOCKED!</p>
          <p style="margin: 10px 0 0 0;">${stats.unlockedCampaign.name}</p>
        </div>
      `;
    }
    
    statsHTML += `
      <button id="spReturnBtn" style="
        padding: 12px 30px;
        background: #4CAF50;
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 1.1em;
        cursor: pointer;
        margin-top: 20px;
      ">Return to Menu</button>
    `;
    
    content.innerHTML = statsHTML;
    modal.appendChild(content);
    document.body.appendChild(modal);
    
    document.getElementById('spReturnBtn').addEventListener('click', () => {
      window.location.href = '/menu.html';
    });
  }

  getModeName() {
    const names = {
      training: 'Training',
      timeattack: 'Time Attack',
      targetpractice: 'Campaign Game',
      bossrush: 'Boss Rush'
    };
    return names[this.mode] || 'Single Player';
  }

  getDifficultyName() {
    const names = {
      easy: 'Easy',
      normal: 'Normal',
      hard: 'Hard'
    };
    return names[this.difficulty] || 'Normal';
  }
}
