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

---

### Exact Bot Behavior

#### Cross-Post Detection

Every message is fingerprinted using:
- **Text:** first 15 words, lowercased and whitespace-normalized (fuzzy match — minor edits don't bypass detection)
- **Attachments:** sorted `filename:size` pairs (same file re-uploaded gets a different CDN URL but same fingerprint)
- **Stickers:** sorted sticker IDs

Messages shorter than 5 characters and messages with no text/attachments/stickers are ignored. Bot messages are ignored.

The cache has a **10-minute TTL** — messages posted more than 10 minutes apart won't be treated as cross-posts. Cache is cleaned every 2 minutes.

#### Step 1 — Warning DM (sent to the offending user)

Sent immediately when the threshold is crossed. Exact text:

> Hey! Just a heads up — it looks like you posted the same message in N channels (#channel-a, #channel-b, #channel-c). We'd appreciate it if you kept messages to one channel to avoid clutter.
>
> Could you delete the extra copies in the next **5 minutes**? If not, we'll go ahead and clean them up automatically — but that would also mean a kick from the server. No hard feelings, you'd be welcome to rejoin!

(Channel count and names are dynamic. Timeout is configurable via `WARNING_TIMEOUT_MINUTES`.)

If the user has DMs disabled, the bot logs a warning to console but still proceeds with enforcement.

#### Step 1 — Mod-Log Embed (orange `#ffa500`)

**Title:** `Cross-Post Warning Issued`

| Field | Value |
|---|---|
| User | `username#0000 (user-id)` |
| Channels | `#channel-a, #channel-b, #channel-c` |
| Threshold | `3/3` |
| Timeout | `5 minutes` |

#### Step 2 — After the timeout window

The bot re-fetches each tracked message from Discord. Three outcomes:

**A) User self-cleaned (copies below threshold)**

No action taken. Mod-log embed posted:

**Title:** `Cross-Post Warning Resolved` (green `#00ff00`)

| Field | Value |
|---|---|
| User | `username#0000 (user-id)` |
| Remaining copies | `1` |

**B) Copies still present (at or above threshold)**

Bot deletes all remaining copies and kicks the user.

Enforcement DM sent to user:

> Hey — since the duplicate messages weren't removed in time, we went ahead and cleaned them up. You've been kicked from the server, but you're welcome to rejoin. Just please keep messages to one channel next time!

Mod-log embed posted (red `#ff0000`):

**Title:** `Cross-Post Enforcement`

| Field | Value |
|---|---|
| User | `username#0000 (user-id)` |
| Messages Deleted | `3` |
| Kicked | `Yes` or `No (insufficient permissions)` |
| Affected Channels | `#channel-a, #channel-b, #channel-c` |

Kick reason (visible in Discord audit log): `Cross-post spam - did not remove duplicates after warning`

**C) Messages inaccessible**

If messages can't be fetched (already deleted, channel deleted, permissions lost), the bot treats them as deleted and skips enforcement for those.

### Full Channel Scanner (one-off)

Scans every channel and deletes all messages from `TARGET_USER_ID`:

```bash
# Dry run (preview only)
DRY_RUN=true npm run prune

# Live deletion
DRY_RUN=false npm run prune
```

### Targeted Message Pruner (one-off)

Set `TARGET_MESSAGE_IDS` in `.env` as a comma-separated list of Discord message IDs, then:

```bash
# Dry run
DRY_RUN=true npm run prune:targeted

# Live deletion
DRY_RUN=false npm run prune:targeted
```

## Status Page Webhook

The bot forwards Better Stack (status.vapi.ai) incidents to a Discord channel via webhook.

**Setup:**

1. In Discord, create a webhook in your status updates channel (Channel Settings > Integrations > Webhooks)
2. Copy the webhook URL and set it as `STATUS_WEBHOOK_URL` in your Render env vars
3. In your Better Stack status page dashboard, add a webhook subscriber pointing at:
   ```
   https://<your-render-url>/webhook/status
   ```
4. Better Stack will POST incident, maintenance, and component updates to the bot, which formats them as embeds and forwards to Discord

**Endpoints:**
- `GET /health` — returns `{ status: 'ok' }`
- `POST /webhook/status` — receives Better Stack payloads

#### Incident Embed (`event_type: "incident"`)

**Color:**
- Green (`#00ff00`) — `page.status_indicator` is `operational`, `resolved`, or `postmortem`
- Red (`#ff0000`) — `page.status_indicator` is `downtime` or `major_outage`
- Orange (`#ffa500`) — everything else (degraded, investigating, etc.)

**Title:** incident name, linked to `incident.shortlink` or `https://status.vapi.ai`

**Description:** body of the latest incident update

| Field | Value |
|---|---|
| Status | `page.status_indicator` (e.g. `degraded`, `downtime`, `operational`) |

#### Maintenance Embed (`event_type: "maintenance"`)

Same layout as incident embed, plus:

| Field | Value |
|---|---|
| Status | `maintenance` |
| Starts | `maintenance.starts_at` |
| Ends | `maintenance.ends_at` or `TBD` |

#### Component Status Change Embed (`event_type: "component_update"`)

**Title:** `<Component Name> Status Change`, linked to `https://status.vapi.ai`

**Description:** `<Component Name> changed from <previous_status> to <status>.`

| Field | Value |
|---|---|
| Component | component name |
| Status | new status (e.g. `partial outage`, `operational`) |

If the payload has an unrecognized `event_type`, the bot returns HTTP 400 and logs the raw payload.

## Deploy to Render

1. Push this repo to GitHub
2. Create a new **Web Service** on [Render](https://render.com)
3. Connect your GitHub repo — Render will pick up `render.yaml` automatically
4. Set environment variables in Render's dashboard (`DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `MOD_LOG_CHANNEL_ID`, `STATUS_WEBHOOK_URL`)
5. Render will build and deploy on push

The public URL (e.g. `https://discord-mod-bot-rfjh.onrender.com`) is what you give to Statuspage.io as the webhook target.

## Notes

- Messages older than 14 days cannot be bulk-deleted per Discord API limits and are deleted one at a time (~1/sec)
- Cross-post cache is **in-memory only** — a bot restart clears all pending warnings and tracked messages
- Any user with an active warning who reposts the same content in additional channels during the warning window will have those new channels included in enforcement (the cache is read live at enforcement time, not snapshotted at warning time)
- Only one active warning per user at a time — if a user triggers the threshold for a second distinct piece of content while already warned, the second trigger is silently ignored until the first warning resolves
- The cross-post threshold, warning timeout, and cache TTL are configurable via `.env`
