# Railway Deployment Guide

## Prerequisites

- A [GitHub](https://github.com) account
- A [Railway](https://railway.app) account (sign up with GitHub)

## Step 1: Push to GitHub

1. Create a new **private** repository on GitHub
2. In your terminal, from the project root:

```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main
```

## Step 2: Create Railway Project

1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click **"New Project"**
3. Select **"Deploy from GitHub Repo"**
4. Pick your repository
5. Railway will auto-detect the project

## Step 3: Set Root Directory

Railway needs to know the backend lives in a subfolder:

1. Go to your service **Settings** tab
2. Under **Root Directory**, set it to: `backend`
3. Railway will use `backend/package.json` to install dependencies and run `npm start`

## Step 4: Add Environment Variables

Go to the **Variables** tab and add each of these (copy values from your local `.env`):

| Variable | Value |
|----------|-------|
| `PORT` | `3000` |
| `NODE_ENV` | `production` |
| `AI_API_URL` | `https://api.anthropic.com/v1/messages` |
| `AI_API_KEY` | Your Anthropic API key |
| `AI_MODEL` | `claude-haiku-4-5-20251001` |
| `AI_ANNOUNCE_MAX_TOKENS` | `800` |
| `AI_REQUEST_TIMEOUT_MS` | `10000` |
| `DISCORD_BOT_TOKEN` | Your Discord bot token |
| `DISCORD_GATEWAY_ENABLED` | `true` |
| `ADMIN_USER_IDS` | Your Discord user ID |
| `QUERY_CHANNEL_ID` | Your bot command channel ID |
| `ANNOUNCE_CHANNEL_IDS` | Your announcement channel ID |
| `GUILD_ID` | Your Discord server ID |
| `DEFAULT_STYLE` | `Professional, confident, concise crypto-native tone.` |
| `AUTO_COOLDOWN_MS` | `3600000` |
| `AUTO_TOPICS` | `Latest project update,Community highlights` |
| `KILL_SWITCH` | `false` |
| `HUMANIZER_MIN_DELAY_MS` | `1500` |
| `HUMANIZER_MAX_DELAY_MS` | `5000` |
| `HUMANIZER_EMOJI_CHANCE` | `0.4` |
| `HUMANIZER_EMOJI_SET` | `🚀,🔥,⚡,🧠,📈,✨` |
| `WEBHOOK_AUTH_TOKEN` | Your webhook auth token |
| `REDIS_URL` | Leave empty (or add a Railway Redis addon later) |

> **Tip:** You can bulk-paste from your `.env` file using Railway's "RAW Editor" button in the Variables tab.

## Step 5: Deploy

Railway auto-deploys when you push to `main`. After adding variables:

1. Go to the **Deployments** tab
2. You should see a build in progress
3. Wait for it to say **"Success"** (usually 1-2 minutes)

## Step 6: Get Your Public URL

1. Go to **Settings** tab
2. Under **Networking** > **Public Networking**, click **"Generate Domain"**
3. Railway gives you a URL like: `your-app-production-xxxx.up.railway.app`

This is your permanent public URL. No more ngrok.

## Step 7: Update Zapier

1. Go to your Zapier Zap
2. Find the webhook POST step
3. Change the URL to: `https://your-app-production-xxxx.up.railway.app/webhook`
4. Keep the same Authorization header
5. Save and test

## Updating the Bot

After making code changes locally:

```bash
git add .
git commit -m "description of changes"
git push
```

Railway auto-deploys on every push to `main`. The bot restarts automatically.

## Monitoring

- **Logs:** Click your service > **Deployments** tab > click a deployment > view logs
- **Health check:** Visit `https://your-url.up.railway.app/health` in your browser

## Optional: Add Redis

If you want persistent style memory across restarts:

1. In your Railway project, click **"New"** > **"Database"** > **"Redis"**
2. Railway auto-creates a `REDIS_URL` variable and links it to your service
3. Redeploy - style memory will now persist

## Cost

Railway gives you a $5 free trial. After that, usage-based pricing is typically $5-7/month for a bot like this.
