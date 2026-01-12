// Game constants
const GAME_WIDTH = 1067;
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
const MAX_CONCURRENT_GAMES = 5;

// Weapon types configuration
const WEAPON_TYPES = {
  RAPID_FIRE: { name: 'Rapid Fire', duration: 8000, color: '#ff4444', damage: 7 },
  TRIPLE_SHOT: { name: 'Triple Shot', duration: 10000, color: '#44ff44', damage: 8 },
  LASER: { name: 'Laser', duration: 12000, color: '#4444ff', damage: 15 },
  ROCKETS: { name: 'Rockets', duration: 15000, color: '#ff44ff', damage: 20 },
};

// Power-up types
const POWERUP_TYPES = {
  SPEED_BOOST: { name: 'Speed Boost', duration: 8000, color: '#00d2ff', multiplier: 2.0 },
  SHIELD: { name: 'Shield', duration: 10000, color: '#a8e6cf' },
  HEALTH: { name: 'Health Pack', duration: 0, color: '#ff6b9d', healAmount: 50 },
  INVINCIBILITY: { name: 'Invincibility', duration: 5000, color: '#ffd93d' },
  AMMO_REFILL: { name: 'Ammo Refill', duration: 0, color: '#ff8c42', ammoRefill: 20 },
};

// Obstacle class
class Obstacle {
  constructor(x, y, width, height) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  collidesWith(x, y, size) {
    return (
      x + size > this.x &&
      x - size < this.x + this.width &&
      y + size > this.y &&
      y - size < this.y + this.height
    );
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
      if (
        x < 60 ||
        x + width > GAME_WIDTH - 60 ||
        y < 60 ||
        y + height > GAME_HEIGHT - 60
      ) {
        valid = false;
        continue;
      }

      // Check if overlaps with existing obstacles with guaranteed gap
      for (let obs of obsArray) {
        // Check for collision with padding
        if (
          !(
            x + width + MIN_GAP < obs.x ||
            x - MIN_GAP > obs.x + obs.width ||
            y + height + MIN_GAP < obs.y ||
            y - MIN_GAP > obs.y + obs.height
          )
        ) {
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

module.exports = {
  GAME_WIDTH,
  GAME_HEIGHT,
  TANK_SIZE,
  TANK_SPEED,
  TANK_ROTATION_SPEED,
  PROJECTILE_SPEED,
  PROJECTILE_SIZE,
  TANK_MAX_HEALTH,
  UPDATE_RATE,
  GAME_DURATION,
  MAX_PLAYERS,
  MAX_CONCURRENT_GAMES,
  WEAPON_TYPES,
  POWERUP_TYPES,
  Obstacle,
  generateObstacles,
};
