# Discord Bots

Persistent moderation bot and one-off message pruning utilities for Discord.

## Project Structure

```
discord-bots/
  .env                  # Shared config (all bots read from here)
  package.json
  Dockerfile
  railway.toml
  src/
    mod-bot.js          # 24/7 moderation bot
  scripts/
    prune-messages.js   # Full channel scanner (delete all messages from a user)
    prune-targeted.js   # Targeted pruner (delete specific messages by ID)
```

## Setup

### 1. Create a Discord Bot Application

1. Go to https://discord.com/developers/applications
2. Click **New Application**, give it a name
3. Go to the **Bot** tab
4. Click **Reset Token** and copy the token
5. Under **Privileged Gateway Intents**, enable:
   - **Server Members Intent** (required for kick)
   - **Message Content Intent** (required to read messages)
6. Save changes

### 2. Invite the Bot to Your Server

1. Go to the **OAuth2** tab
2. Under **OAuth2 URL Generator**, check: `bot`
3. Under **Bot Permissions**, check:
   - `Read Messages/View Channels`
   - `Read Message History`
   - `Manage Messages`
   - `Send Messages` (for mod-log)
   - `Kick Members`
4. Copy the generated URL and open it in your browser
5. Select your server and authorize

### 3. Configure

```bash
cp .env.example .env
```

Fill in your values. To copy IDs, enable Developer Mode in Discord (Settings > Advanced > Developer Mode), then right-click items to see "Copy ID".

### 4. Install

```bash
npm install
```

## Usage

### Moderation Bot (persistent, runs 24/7)

```bash
npm start
```

Monitors all messages in real time. When a user posts the same message in 3+ different channels:
1. DMs the user a warning with a 5-minute window to self-delete
2. If not deleted in time, bot deletes all copies and kicks the user
3. All actions logged to the #mod-log channel

### Full Channel Scanner (one-off)

Scans every channel and deletes all messages from `TARGET_USER_ID`:

```bash
# Dry run (preview only)
DRY_RUN=true npm run prune

# Live deletion
DRY_RUN=false npm run prune
```

### Targeted Message Pruner (one-off)

Edit `scripts/prune-targeted.js` to set the message IDs, then:

```bash
# Dry run
DRY_RUN=true npm run prune:targeted

# Live deletion
DRY_RUN=false npm run prune:targeted
```

## Status Page Webhook

The bot forwards Statuspage.io incidents to a Discord channel via webhook.

**Setup:**

1. In Discord, create a webhook in your status updates channel (Channel Settings > Integrations > Webhooks)
2. Copy the webhook URL and set it as `STATUS_WEBHOOK_URL` in your Render env vars
3. In your Statuspage.io dashboard, add a webhook subscriber pointing at:
   ```
   https://<your-render-url>/webhook/status
   ```
4. Statuspage.io will POST incident and component updates to the bot, which formats them as embeds and forwards to Discord

**Endpoints:**
- `GET /health` — returns `{ status: 'ok' }`
- `POST /webhook/status` — receives Statuspage.io payloads

## Deploy to Render

1. Push this repo to GitHub
2. Create a new **Web Service** on [Render](https://render.com)
3. Connect your GitHub repo — Render will pick up `render.yaml` automatically
4. Set environment variables in Render's dashboard (`DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `MOD_LOG_CHANNEL_ID`, `STATUS_WEBHOOK_URL`)
5. Render will build and deploy on push

The public URL (e.g. `https://discord-mod-bot-rfjh.onrender.com`) is what you give to Statuspage.io as the webhook target.

## Notes

- Messages older than 14 days cannot be bulk-deleted per Discord API limits and are deleted one at a time (~1/sec)
- The mod bot uses an in-memory cache with a 10-minute TTL for cross-post tracking
- The cross-post threshold and warning timeout are configurable via `.env`
