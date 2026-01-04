# 🎮 Online Tank Game

A real-time multiplayer tank battle game built with Node.js, Socket.IO, and HTML5 Canvas. Battle against friends or AI with various power-ups, weapons, and multiple game modes!

![License](https://img.shields.io/badge/license-ISC-blue.svg)
![Node.js](https://img.shields.io/badge/node.js-v14%2B-green.svg)

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

3. **Start the server**
   ```bash
   npm start
   ```

4. **Access the game**
   - Local: Open `http://localhost:3000/lobby.html` in your browser
   Configure game settings:
   - Choose game mode (Multiplayer, Team PvP, AI modes)
   - Set tank speed
   - Select background music
   - Enable/disable weapons, power-ups, limited ammo
   - For AI modes: set difficulty and bot count
4. **For Team PvP**: Players select Team A or Team B
5. Wait for other players to join
6. Click "Start Game" when ready (requires at least 2 players for multiplayer modes)

**As Guest:**
1. Open the lobby page
2. See available games in "Server Status"
3. Click on a waiting game to join
4. **For Team PvP**: Choose your team (Team A or Team B)
5. Open the lobby page
2. Click "Create New Game"
3. Wait for other players to join
4.**Free-for-all**: Destroy enemy tanks to earn points, survive until the timer runs out, highest score wins
- **Team PvP**: Eliminate all enemy team members or have the highest team score when time expires
- **Co-op vs AI**: Work together to eliminate all AI bots
- Collect power-ups and weapons for tactical advantages
2. See available games in "Server Status"
3. Click on a waiting game to join
4. Wait for the host to start

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
2. **Same Computer**: Use `http://localhost:3000/lobby.html`
3. **Other Devices**: Use `http://[YOUR-NETWORK-IP]:3000/lobby.html`
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
Onli├── stats.html         # Player statistics page
│   ├── stats.js           # Stats client logic
│   ├── stats.css          # Stats styling
│   └── index.html         # Landing page
├── server/
│   ├── server.js          # Express & Socket.IO server
│   └── database.js        # Player stats database
├── data/
│   └── players.json       # Persistent player statistics
├── package.json           # Project dependencies
├── LOCAL_NETWORK_SETUP.md # Detailed network setup guide
└── README.md .js           # Lobby client logic
│   ├── lobby.css          # Lobby styling
│   ├── styles.css         # Game styling
│   └── index.html         # Landing page
├── server/
│   └── server.js          # Express & Socket.IO server
├── package.json           # Project dependencies
├── LOCAL_NETWORK_SETUP.md # Detailed network setup guide
└── README.md             # This file
```

## 🛠️ Technologies Used

- **Backend**:
  - Node.jsConfigurable (1.5x to 7x base speed)
- **Base Speed**: 5 units/frame (10 with Speed Boost)
- **Max Health**: 100 HP
- **Rotation Speed**: 5 degrees/frame
- **Team Colors (visual in-game)**:
  - Own tank: Green
  - Allies (Team PvP): Blue
  - Enemies: Redn)

- **Frontend**:
  - HTML5 Canvas
  - Vanilla JavaScript
  - Socket.IO Client
  - CSS3

## 🎯 Game Mechanics

### Tank Properties
- **Size**: 20x20 pixels
- **Speed**: 5 units/frame (10 with Speed Boost)
- **Max Health**: 100 HP
- **Rotation Speed**: 5 degrees/frame

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

Key constants in `server/server.js`:
- `GAME_DURATION`: Match length (default: 5 minutes)
- `MAX_PLAYERS`: Maximum players per game (default: 10)
- `MAX_CONCURRENT_GAMES`: Maximum simultaneous games (default: 5)
- `UPDATE_RATE`: Server tick rate (default: 60 FPS)

## 🐛 Troubleshooting

### Can't connect from another device?
- Verify both devices are on the same WiFi network
- Check firewall settings for port 3000
- Ensure the server is running

### Connection keeps dropping?
- Check WiFi stability
- Keep computer awake while hosting
- Don't close the server terminal

### Game doesn't start?
- Make sure at least one player has joined
- Verify the host clicked "Start Game"
- Check browser console for errors (F12)

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

## ✅ Recent Updates

- ✅ Team-based PvP gameplay (Team A vs Team B)
- ✅ AI opponent support with difficulty levels
- ✅ Persistent player statistics
- ✅ Game history tracking
- ✅ Multiple game modes
- ✅ Customizable game settings
- ✅ Team chat system
- ✅ Username customization
- ✅ Enhanced lobby system

## 📧 Contact

For questions or feedback, please open an issue on GitHub.

---

**Enjoy the battle!** 💥🎮
