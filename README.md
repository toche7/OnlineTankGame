# 🎮 Online Tank Game

A real-time multiplayer tank battle game built with Node.js, Socket.IO, and HTML5 Canvas. Battle against friends on the same local network with various power-ups and weapons!

![License](https://img.shields.io/badge/license-ISC-blue.svg)
![Node.js](https://img.shields.io/badge/node.js-v14%2B-green.svg)

## 🎯 Features

### Gameplay
- **Real-time Multiplayer**: Up to 10 players can battle simultaneously
- **Multiple Game Sessions**: Support for up to 5 concurrent games
- **Game Lobby System**: Create or join games with unique game codes
- **Time-Limited Matches**: 5-minute battle rounds
- **Damage & Health System**: Strategic combat with 100 HP per tank

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
- **Background Music**: In-game audio with multiple melodies
- **Visual Effects**: Explosions and particle effects
- **Scoreboard**: Real-time player rankings
- **Game Timer**: Countdown display

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
   - Network: Use the displayed network IP (e.g., `http://192.168.1.114:3000/lobby.html`)

## 🎮 How to Play

### Starting a Game

**As Host:**
1. Open the lobby page
2. Click "Create New Game"
3. Wait for other players to join
4. Click "Start Game" when ready

**As Guest:**
1. Open the lobby page
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
OnlineTankGame/
├── client/
│   ├── game.html          # Main game interface
│   ├── game.js            # Game client logic
│   ├── lobby.html         # Game lobby interface
│   ├── lobby.js           # Lobby client logic
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
  - Node.js
  - Express.js
  - Socket.IO (Real-time communication)

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

## 🔮 Future Enhancements

Potential features for future versions:
- [ ] Different tank types/classes
- [ ] Team-based gameplay
- [ ] Custom maps and arenas
- [ ] Persistent player statistics
- [ ] Sound effects for actions
- [ ] Mobile-friendly touch controls
- [ ] Replay system
- [ ] Tournament mode

## 📧 Contact

For questions or feedback, please open an issue on GitHub.

---

**Enjoy the battle!** 💥🎮
