# 🚂 Railway Deployment Guide

This guide will help you deploy the Online Tank Game to Railway.

## Prerequisites

1. A GitHub account
2. A Railway account (sign up at [railway.app](https://railway.app))
3. Your code pushed to a GitHub repository

## Step 1: Prepare Your Repository

1. **Push your code to GitHub** (if not already done):
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/OnlineTankGame.git
   git push -u origin main
   ```

## Step 2: Deploy to Railway

### Option A: Deploy via Railway Dashboard (Recommended)

1. Go to [railway.app](https://railway.app)
2. Sign in with your GitHub account
3. Click **"New Project"**
4. Select **"Deploy from GitHub repo"**
5. Choose your **OnlineTankGame** repository
6. Railway will automatically detect your Node.js app and deploy it

### Option B: Deploy via Railway CLI

1. **Install Railway CLI**:
   ```bash
   npm install -g @railway/cli
   ```

2. **Login to Railway**:
   ```bash
   railway login
   ```

3. **Initialize and deploy**:
   ```bash
   railway init
   railway up
   ```

## Step 3: Configure Your Deployment

Railway should auto-detect your settings, but verify:

1. **Build Command**: (none needed)
2. **Start Command**: `npm start`
3. **Node Version**: 14.x or higher

## Step 4: Get Your Deployment URL

1. After deployment completes, Railway will provide a URL like:
   - `https://your-app-name.up.railway.app`

2. Click **"Generate Domain"** if no URL is shown in the Settings tab

3. Your game will be accessible at:
   - Menu: `https://your-app-name.up.railway.app/menu.html`
   - Stats: `https://your-app-name.up.railway.app/stats.html`

## Step 5: Test Your Deployment

1. Open your Railway URL in a browser
2. Navigate to `/menu.html`
3. Create a game and test functionality
4. Have friends join from different locations to test multiplayer

## Environment Variables (Optional)

You can add environment variables in Railway dashboard under Settings → Variables:

- `NODE_ENV`: `production`
- `PORT`: (automatically set by Railway, don't override)

## Important Notes

### ✅ WebSocket Configuration

Railway automatically supports WebSockets - no additional configuration needed!

### ⚠️ Data Persistence

The `data/players.json` file stores player statistics locally. On Railway, this file will be reset on each deployment because Railway uses ephemeral storage.

**Solutions**:
1. **For Production**: Migrate to a database (MongoDB Atlas, PostgreSQL, etc.)
2. **For Testing**: Accept that stats will reset on redeploys

### 💰 Costs

- Railway offers a **free trial** with $5 credit
- After trial, pay-as-you-go pricing
- Typical small game costs: $1-5/month
- Free tier sufficient for testing and small player counts

## Troubleshooting

### Build Failed?
- Check that `package.json` has correct dependencies
- Ensure `npm start` works locally
- View logs in Railway dashboard

### Can't Connect to WebSocket?
- Check Railway logs in the dashboard
- Verify CORS settings in `server/server.js` (currently set to allow all origins)
- Ensure you're using `https://` (not `http://`)

### Game Runs Locally but Not on Railway?
- Check Railway deployment logs for errors
- Verify PORT is using `process.env.PORT` ✅ (already configured)
- Ensure all dependencies are in `package.json`

### Performance Issues?
- Railway free resources are limited
- Multiple concurrent games may require more resources
- Monitor usage in Railway dashboard
- Consider upgrading plan if needed

### Stats Not Saving?
- This is expected with ephemeral storage
- Stats reset on each deployment
- For persistent stats, migrate to a cloud database

## Updating Your Deployment

After making changes locally:

```bash
git add .
git commit -m "Your update message"
git push
```

Railway will automatically redeploy your changes within seconds!

## Custom Domain (Optional)

1. Go to your Railway project settings
2. Click on **"Settings"** → **"Domains"**
3. Click **"Add Domain"**
4. Enter your custom domain
5. Update your DNS records as instructed by Railway

## Monitoring

View your app's status and logs:
- **Dashboard**: View in Railway project dashboard
- **Logs**: Real-time logs in the Deployments tab
- **Metrics**: CPU, Memory, Network usage in Metrics tab
- **CLI Logs**: `railway logs` (if using CLI)

## Alternative Deployment Platforms

If Railway doesn't work for you, alternatives include:
- **Render**: Free tier available, similar to Railway
- **Fly.io**: Good for WebSocket apps, generous free tier
- **Heroku**: Well-established, requires credit card for free tier
- **DigitalOcean App Platform**: $5/month minimum
- **AWS/Google Cloud/Azure**: More complex but powerful

## Database Migration (Future)

To make stats persistent, consider migrating to:

### MongoDB Atlas (Recommended - Free Tier Available)
1. Create account at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
2. Create free cluster
3. Get connection string
4. Add connection string to Railway environment variables
5. Update `server/database.js` to use MongoDB

### PostgreSQL on Railway
1. Add PostgreSQL plugin in Railway dashboard
2. Connection string auto-added to environment
3. Update `server/database.js` to use PostgreSQL

---

## Need Help?

- **Railway Discord**: [discord.gg/railway](https://discord.gg/railway)
- **Railway Docs**: [docs.railway.app](https://docs.railway.app)
- **Railway Status**: [status.railway.app](https://status.railway.app)
- **GitHub Issues**: Open an issue in your repository

**Good luck with your deployment!** 🚂🎮
