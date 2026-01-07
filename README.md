# 💥 Cannon Clash

A real-time multiplayer tank battle game built with Node.js, Socket.IO, PostgreSQL, and HTML5 Canvas. Battle against friends or AI with various power-ups, weapons, and multiple game modes!

![Version](https://img.shields.io/badge/version-1.2.2-blue.svg)
![License](https://img.shields.io/badge/license-ISC-green.svg)
![Node.js](https://img.shields.io/badge/node.js-v14%2B-brightgreen.svg)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-13%2B-blue.svg)

## 🎯 Features

### Game Modes
- **Multiplayer Only**: Classic free-for-all PvP with 2-10 players
- **Team vs Team (PvP)**: 2 teams battle for supremacy
  - Team A (⚡) vs Team B (🛡️)
  - Dynamic team selection in lobby
  - Team-based win conditions
- **Solo vs AI Bots**: Practice against AI opponents (1-9 bots)
- **Co-op vs AI Bots**: Team up with friends against AI enemies
- **Multiplayer + AI Fill**: Mix of human players and AI bots

### Gameplay
- **Real-time Multiplayer**: Up to 10 players can battle simultaneously
- **Multiple Game Sessions**: Support for up to 5 concurrent games
- **Game Lobby System**: Create or join games with unique 6-character codes
- **Time-Limited Matches**: 5-minute battle rounds
- **Damage & Health System**: Strategic combat with 100 HP per tank
- **AI Opponents**: Three difficulty levels (Easy, Medium, Hard)
- **Persistent Player Stats**: Tracks wins, kills, deaths, and scores
- **Game History**: View your last game statistics

### Power-ups & Weapons
- **Speed Boost**: Move 2x faster for 8 seconds
- **Shield**: Protect yourself for 10 seconds
- **Health Pack**: Restore 50 HP instantly
- **Invincibility**: Become invincible for 5 seconds
- **Ammo Refill**: Get 20 additional rounds

### Special Weapons
- **Rapid Fire**: Fast shooting for 8 seconds
- **Triple Shot**: Shoot three projectiles at once (10 seconds)
- **Laser**: Powerful laser attacks (12 seconds)
- **Rockets**: Explosive rocket launcher (15 seconds)

### Game Features
- **Dynamic Obstacles**: Random obstacles spawn during gameplay
- **Collision Detection**: Physics-based collision system
- **Smooth Controls**: Responsive keyboard and mouse controls
- **Background Music**: In-game audio with 6 melody options (Battle, Classic, Intense, Chill, Epic, Retro)
- **Visual Effects**: Explosions and particle effects
- **Scoreboard**: Real-time player rankings
- **Game Timer**: Countdown display with 3-second start countdown
- **Customizable Settings**:
  - Tank speed (Slow, Normal, Fast, Very Fast)
  - Debug mode (one-hit kills)
  - Enable/disable weapons and power-ups
  - Limited ammo mode (20 bullets with regeneration)
  - AI difficulty and count
- **Team Chat**: In-game team communication for Team PvP mode
- **Username Customization**: Set and change your display name
- **Return to Lobby**: Seamless restart system after game ends

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- npm (Node Package Manager)
- PostgreSQL (v13 or higher) - for production deployment
  - Local development can use PostgreSQL or fallback to JSON storage
  - See [DATABASE_SETUP.md](DATABASE_SETUP.md) for detailed setup instructions

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/toche7/OnlineTankGame.git
   cd OnlineTankGame
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Database** (Optional for local development)
   ```bash
   # Create .env file and add your PostgreSQL connection
   DATABASE_URL=postgresql://username:password@localhost:5432/cannon_clash
   NODE_ENV=development
   ```
   See [DATABASE_SETUP.md](DATABASE_SETUP.md) for full setup guide.

4. **Start the server**
   ```bash
   npm start
   ```
   For development with auto-reload:
   ```bash
   npm run dev
   ```

5. **Access the game**
   - Local: Open `http://localhost:3000/menu.html` in your browser
   - Network: Use your local IP (shown in terminal) for other devices

## 🎮 How to Play

### Game Setup

**As Host:**
1. Open the menu page
2. Configure game settings:
   - Choose game mode (Multiplayer, Team PvP, AI modes)
   - Set tank speed
   - Select background music
   - Enable/disable weapons, power-ups, limited ammo
   - For AI modes: set difficulty and bot count
3. Click "Create New Game"
4. **For Team PvP**: Players select Team A or Team B
5. Wait for other players to join
6. Click "Start Game" when ready (requires at least 2 players for multiplayer modes)

**As Guest:**
1. Open the lobby page
2. See available games in "Server Status"
3. Click on a waiting game to join
4. **For Team PvP**: Choose your team (Team A or Team B)
5. Wait for the host to start

### Gameplay

- **Free-for-all**: Destroy enemy tanks to earn points, survive until the timer runs out, highest score wins
- **Team PvP**: Eliminate all enemy team members or have the highest team score when time expires
- **Co-op vs AI**: Work together to eliminate all AI bots
- Collect power-ups and weapons for tactical advantages

### Controls

- **Movement**: Arrow Keys or WASD
- **Aim**: Mouse
- **Shoot**: Left Mouse Click
- **Look Around**: Move mouse to rotate tank barrel

### Objective

- Destroy enemy tanks to earn points
- Collect power-ups and weapons for advantages
- Survive until the timer runs out
- Player with the highest score wins!

## 🌐 Local Network Setup

### Testing on Multiple Devices

1. **Start the server** - Note the network IP displayed
2. **Same Computer**: Use `http://localhost:3000/menu.html`
3. **Other Devices**: Use `http://[YOUR-NETWORK-IP]:3000/menu.html`
   - Replace `[YOUR-NETWORK-IP]` with the IP shown in the server output
   - Ensure all devices are on the **same WiFi network**

### Finding Your Network IP

**macOS/Linux:**
```bash
ipconfig getifaddr en0
```

**Windows:**
```bash
ipconfig
```
Look for "IPv4 Address" under your active network adapter.

### Firewall Configuration

Make sure port **3000** is allowed through your firewall:
- **macOS**: System Preferences → Security & Privacy → Firewall Options
- **Windows**: Windows Defender Firewall → Allow an app through firewall
- Allow Node.js to accept incoming connections

## 📁 Project Structure

```
OnlineTankGame/
├── client/
│   ├── game.html          # Game canvas page
│   ├── game.js            # Game client logic
│   ├── lobby.html         # Game lobby page
│   ├── lobby.js           # Lobby client logic
│   ├── lobby.css          # Lobby styling
│   ├── menu.html          # Main menu page
│   ├── menu.js            # Menu client logic
│   ├── menu.css           # Menu styling
│   ├── stats.html         # Player statistics page
│   ├── stats.js           # Stats client logic
│   ├── stats.css          # Stats styling
│   ├── styles.css         # Game styling
│   └── index.html         # Landing page
├── server/
│   ├── server.js          # Express & Socket.IO server
│   └── database.js        # PostgreSQL database module
├── data/
│   └── players.json       # JSON fallback for player stats
├── package.json           # Project dependencies
├── .env                   # Environment variables (create this)
├── .gitignore             # Git ignore rules
├── nixpacks.toml          # Nixpacks build configuration
├── railway.toml           # Railway deployment config
├── DATABASE_SETUP.md      # PostgreSQL setup guide
├── RAILWAY_DEPLOYMENT.md  # Railway deployment guide
├── LOCAL_NETWORK_SETUP.md # Local network setup guide
└── README.md              # This file
```

## 🛠️ Technologies Used

- **Backend**:
  - Node.js (Express)
  - Socket.IO
  - PostgreSQL
  - dotenv (environment config)

- **Frontend**:
  - HTML5 Canvas
  - Vanilla JavaScript
  - Socket.IO Client
  - CSS3

- **Database**:
  - PostgreSQL (production)
  - JSON fallback (development)

## 🎯 Game Mechanics

### Tank Properties
- **Size**: 20x20 pixels
- **Speed**: Configurable (1.5x to 7x base speed)
  - Base Speed: 5 units/frame (10 with Speed Boost)
- **Max Health**: 100 HP
- **Rotation Speed**: 5 degrees/frame
- **Team Colors** (visual in-game):
  - Own tank: Green
  - Allies (Team PvP): Blue
  - Enemies: Red

### Projectile Properties
- **Speed**: 8 units/frame
- **Size**: 5x5 pixels
- **Damage**: Varies by weapon type

### Power-up Spawn System
- Power-ups spawn randomly during gameplay
- Limited duration (5-15 seconds)
- Strategic collection required

## 🔧 Development

### Running in Development Mode
```bash
npm run dev
```
This uses `nodemon` for automatic server restarts on file changes.

### Configuration

Key constants in [server/server.js](server/server.js):
- `GAME_DURATION`: Match length (default: 5 minutes)
- `MAX_PLAYERS`: Maximum players per game (default: 10)
- `MAX_CONCURRENT_GAMES`: Maximum simultaneous games (default: 5)
- `UPDATE_RATE`: Server tick rate (default: 60 FPS)

### Environment Variables

Create a `.env` file in the project root:
```env
DATABASE_URL=postgresql://username:password@host:port/database
NODE_ENV=development  # or production
PORT=3000  # optional, defaults to 3000
```

## 🚀 Deployment

### Railway Deployment

This project is configured for easy deployment to Railway:

1. **Push to GitHub**
2. **Connect to Railway**
   - Import your repository at [railway.app](https://railway.app)
3. **Add PostgreSQL Database**
   - Click "+ New" → "Database" → "PostgreSQL"
4. **Configure Environment**
   - Railway automatically sets DATABASE_URL
   - Add NODE_ENV=production

For detailed instructions, see [RAILWAY_DEPLOYMENT.md](RAILWAY_DEPLOYMENT.md)

### Other Platforms

The app can be deployed to any Node.js hosting platform:
- Heroku
- DigitalOcean
- AWS
- Google Cloud

Ensure PostgreSQL is configured and DATABASE_URL is set.

## 🐛 Troubleshooting

### Can't connect from another device?
- Verify both devices are on the same WiFi network
- Check firewall settings for port 3000
- Ensure the server is running
- See [LOCAL_NETWORK_SETUP.md](LOCAL_NETWORK_SETUP.md)

### Connection keeps dropping?
- Check WiFi stability
- Keep computer awake while hosting
- Don't close the server terminal

### Game doesn't start?
- Make sure at least one player has joined
- Verify the host clicked "Start Game"
- Check browser console for errors (F12)

### Database connection issues?
- Verify DATABASE_URL is correctly set in .env
- Check PostgreSQL is running
- Review logs for specific error messages
- See [DATABASE_SETUP.md](DATABASE_SETUP.md)

## 📝 License

This project is licensed under the ISC License.

## 👥 Contributing

Contributions are welcome! Feel free to:
1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## 🎓 Learning Points

This project demonstrates:
- Real-time WebSocket communication with Socket.IO
- Game loop and physics implementation
- Multiplayer game state synchronization
- Canvas-based rendering and animations
- Lobby system and matchmaking
- Collision detection algorithms
- Client-server architecture
- AI pathfinding and behavior
- Team-based game mechanics
- Persistent data storage

## 🔮 Future Enhancements

Potential features for future versions:
- [ ] Different tank types/classes with unique abilities
- [ ] Custom maps and arena editor
- [ ] Sound effects for shooting, explosions, and power-ups
- [ ] Mobile-friendly touch controls
- [ ] Replay system to watch past games
- [ ] Tournament mode with brackets
- [ ] Ranked matchmaking with ELO system
- [ ] Achievements and badges system
- [ ] Tank skins and customization
- [ ] Spectator mode for finished players
- [ ] Voice chat integration
- [ ] Power-up combinations and special effects
- [ ] Weather effects and environmental hazards
- [ ] Capture the flag game mode
- [ ] King of the hill game mode
- [ ] Battle royale shrinking zone mode

## ✅ Recent Updates (v1.2.2)

### Database & Infrastructure
- ✅ PostgreSQL database integration
- ✅ Environment variable configuration with dotenv
- ✅ Railway deployment support
- ✅ Nixpacks build configuration
- ✅ Database setup documentation

### Gameplay Features
- ✅ Team-based PvP gameplay (Team A vs Team B)
- ✅ AI opponent support with difficulty levels
- ✅ Persistent player statistics
- ✅ Game history tracking
- ✅ Multiple game modes (PvP, Team PvP, Solo vs AI, Co-op)
- ✅ Customizable game settings
- ✅ Team chat system
- ✅ Username customization
- ✅ Enhanced lobby system
- ✅ Background music with 6 melody options

## 📧 Contact

For questions or feedback, please open an issue on GitHub.

---

**Enjoy the battle!** 💥🎮
