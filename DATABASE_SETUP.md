# PostgreSQL Database Setup Guide

## ✅ Installation Complete!

The following changes have been implemented:
- ✅ Installed `pg` and `dotenv` packages
- ✅ Created `.env` file for database configuration
- ✅ Updated `.gitignore` to exclude `.env`
- ✅ Converted `server/database.js` to use PostgreSQL
- ✅ Updated `server/server.js` to initialize database on startup

---

## 🚀 Quick Start

### Step 1: Add PostgreSQL to Railway

1. Go to your Railway dashboard: https://railway.app/dashboard
2. Select your **Cannon Clash** project
3. Click **"+ New"** → **"Database"** → **"Add PostgreSQL"**
4. Wait for provisioning (usually takes 30-60 seconds)

### Step 2: Get Database URL

1. Click on the **PostgreSQL** service in Railway
2. Go to the **"Variables"** tab
3. Find and copy the **`DATABASE_URL`** value
   - It looks like: `postgresql://postgres:password@containers-us-west-123.railway.app:5432/railway`

### Step 3: Update Your `.env` File

1. Open `.env` in your project root
2. Replace the placeholder with your actual DATABASE_URL:

```env
DATABASE_URL=postgresql://
NODE_ENV=development
```

### Step 4: Test Locally

```bash
npm start
```

**Expected output:**
```
✅ Connected to PostgreSQL database
✅ Database tables initialized successfully

========================================
🎮 Cannon Clash Server v1.2.2
========================================
Port: 3000
Environment: development
Local access: http://localhost:3000
```

### Step 5: Deploy to Railway

```bash
git add .
git commit -m "Add PostgreSQL persistent stats"
git push
```

Railway will automatically:
- Detect the new dependencies (`pg`, `dotenv`)
- Use the `DATABASE_URL` environment variable
- Deploy with persistent stats enabled! 🎉

---

## 🗄️ Database Schema

### Tables Created Automatically

#### `players` table
- Stores cumulative player statistics
- Fields: id, username, tank_color, games_played, wins, kills, deaths, total_score, highest_kills, last_played

#### `game_history` table
- Stores individual game records (last 10 games per player)
- Fields: player_id, game_id, timestamp, result, kills, deaths, score, health, game_mode, reason

---

## ✨ What Changed?

### Before (File-based)
- Stats stored in `data/players.json`
- ❌ Reset on every Railway deployment
- ❌ Lost when container restarts
- Single file I/O

### After (PostgreSQL)
- Stats stored in Railway PostgreSQL
- ✅ Persist forever across all deployments
- ✅ Survives container restarts
- ✅ Same database for local dev and production
- ACID transactions, concurrent safe

---

## 🧪 Testing Your Database

### Test 1: Check Connection
```bash
npm start
```
Look for: `✅ Connected to PostgreSQL database`

### Test 2: Play a Game
1. Open browser: `http://localhost:3000/menu.html`
2. Create and play a game
3. Check stats are saved

### Test 3: Verify Persistence
```bash
# Stop server (Ctrl+C)
# Restart server
npm start

# Stats should still be there!
```

### Test 4: View Database (Optional)

**Using Railway Dashboard:**
1. Go to PostgreSQL service in Railway
2. Click "Data" tab
3. Run query: `SELECT * FROM players;`

**Using psql:**
```bash
psql "YOUR_DATABASE_URL"
\dt  -- List tables
SELECT * FROM players LIMIT 10;
SELECT * FROM game_history ORDER BY timestamp DESC LIMIT 10;
```

---

## 🔧 Troubleshooting

### ❌ Error: "connect ECONNREFUSED"
**Problem:** Can't connect to database

**Solutions:**
1. Check `.env` file has correct `DATABASE_URL`
2. Verify PostgreSQL service is running in Railway
3. Check your internet connection
4. Copy DATABASE_URL again from Railway (might have changed)

### ❌ Error: "no pg_hba.conf entry"
**Problem:** SSL connection issue

**Solution:** Already handled! Code automatically uses SSL in production.

### ❌ Error: "relation 'players' does not exist"
**Problem:** Tables not created

**Solution:** 
```bash
# Restart server - it will auto-create tables
npm start
```

### ❌ Stats not saving
**Problem:** Database functions not being called

**Check:**
1. Look for any errors in server logs
2. Verify game ends properly
3. Check network tab in browser for errors

---

## 📊 Monitoring Your Database

### Railway Dashboard
- **CPU/Memory**: Monitor PostgreSQL resource usage
- **Query Logs**: View all queries being executed
- **Metrics**: Track connections, query time

### Check Data
```bash
# Connect to your database
psql "YOUR_DATABASE_URL"

# Get player count
SELECT COUNT(*) FROM players;

# Get top 10 players
SELECT username, kills, wins FROM players ORDER BY kills DESC LIMIT 10;

# Get recent games
SELECT p.username, gh.result, gh.kills, gh.deaths 
FROM game_history gh 
JOIN players p ON gh.player_id = p.id 
ORDER BY gh.timestamp DESC 
LIMIT 20;
```

---

## 💰 Cost

**Railway PostgreSQL Pricing:**
- Free Tier: $5 credit/month (usually enough for small games)
- Hobby Plan: $5/month for database
- Pro Plan: $20/month with more resources

**Free Alternatives:**
- Supabase (500MB free)
- Neon (500MB free)
- ElephantSQL (20MB free)

---

## 🔐 Security Best Practices

✅ **Already Done:**
- `.env` file excluded from git
- SSL enabled for production connections
- Prepared statements prevent SQL injection

⚠️ **Remember:**
- Never commit `.env` to GitHub
- Don't share your `DATABASE_URL` publicly
- Rotate passwords periodically in Railway dashboard

---

## 🎮 How Stats Work Now

### When a Player Connects
1. Client sends persistent player ID (stored in localStorage)
2. Server calls `db.getPlayer(playerId)` 
3. PostgreSQL returns player stats or creates new player
4. Stats displayed in UI

### When a Game Ends
1. Server calculates kills, deaths, wins
2. Calls `db.updatePlayerStats(playerId, gameStats)`
3. Calls `db.saveGameRecord(playerId, gameRecord)`
4. PostgreSQL saves to database
5. Stats persist forever! 🎉

### When Viewing Leaderboard
1. Client requests leaderboard
2. Server calls `db.getLeaderboard(sortBy, limit)`
3. PostgreSQL returns sorted players
4. Leaderboard displayed in UI

---

## 📝 Migration from Old Data (Optional)

If you have existing stats in `data/players.json`, you can migrate them:

```javascript
// migration-script.js
const fs = require('fs');
const db = require('./server/database');

async function migrate() {
  await db.initDatabase();
  
  const data = JSON.parse(fs.readFileSync('./data/players.json'));
  
  for (const playerId in data.players) {
    const player = data.players[playerId];
    await db.getPlayer(playerId, player.username);
    
    if (player.stats.gamesPlayed > 0) {
      await db.updatePlayerStats(playerId, {
        kills: player.stats.kills,
        deaths: player.stats.deaths,
        score: player.stats.totalScore,
        isWinner: false // Adjust wins manually if needed
      });
    }
    
    if (player.tankColor) {
      await db.updatePlayerColor(playerId, player.tankColor);
    }
  }
  
  console.log('Migration complete!');
  process.exit(0);
}

migrate();
```

Run: `node migration-script.js`

---

## ✅ Next Steps

1. ✅ Add PostgreSQL to Railway
2. ✅ Update `.env` with DATABASE_URL
3. ✅ Test locally with `npm start`
4. ✅ Deploy to Railway with `git push`
5. 🎉 Enjoy persistent stats!

---

## 🆘 Need Help?

**Common Issues:**
- Double-check `.env` file syntax (no spaces around `=`)
- Verify Railway PostgreSQL service is running
- Check Railway deployment logs for errors
- Ensure you're using the correct DATABASE_URL

**Still stuck?** 
- Check Railway deployment logs
- View PostgreSQL logs in Railway dashboard
- Verify environment variables are set correctly
