# Local Network Testing Guide

## Starting the Server

1. Start the server with:
   ```bash
   npm start
   ```

2. The server will display something like:
   ```
   🎮 Tank Game Server Running!
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Local:     http://localhost:3000
   Network:   http://192.168.1.100:3000
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ```

## Connecting from Different Devices

### On the Same Computer (Local):
- Open your browser and go to: `http://localhost:3000`

### From Another Computer on the Same Network:
1. Note the **Network IP** from the server output (e.g., `192.168.1.100`)
2. On the other computer, open a browser and go to:
   ```
   http://192.168.1.100:3000
   ```

### From Another Device (Phone, Tablet, etc.):
1. Make sure the device is connected to the **same WiFi** as your computer
2. Open a browser on that device and enter the Network IP address
3. Go to: `http://192.168.1.100:3000`

## Testing Multiplayer

1. **Open multiple browser windows/tabs** on your computer:
   - Tab 1: `http://localhost:3000`
   - Tab 2: `http://localhost:3000`

2. **Open on different devices**:
   - Computer 1: `http://192.168.1.100:3000`
   - Computer 2: `http://192.168.1.100:3000`
   - Phone: `http://192.168.1.100:3000`

## Troubleshooting

### Can't connect from another device?
1. Make sure both devices are on the **same WiFi network**
2. Check if your firewall is blocking port 3000:
   - macOS: System Preferences → Security & Privacy → Firewall Options
   - Allow Node.js to accept connections

### Need to find your Network IP?
Run this command in terminal:
```bash
ipconfig getifaddr en0
```
(Replace `en0` with your network interface if needed)

### Connection keeps dropping?
- Make sure your WiFi is stable
- Don't put your computer to sleep while testing
- Keep the server terminal window open

## Game Controls
- **Arrow Keys or WASD**: Move tank
- **Mouse**: Aim barrel
- **Click**: Shoot
