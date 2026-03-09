/**
 * User Spam Pruner
 *
 * Finds and deletes all messages from a specific user posted within a time window.
 * Used for cleanup when the cross-post bot missed messages.
 *
 * Usage: node scripts/prune-user-spam.js
 */

const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const DRY_RUN = process.env.DRY_RUN !== 'false'; // default to dry run for safety

// ── Configure these ──────────────────────────────────────────────────────
const TARGET_USER_ID = '1081332718039736340'; // jackieman1026
const AFTER_TIME = new Date('2026-03-03T22:03:00Z'); // just before the spam started
const BEFORE_TIME = new Date('2026-03-03T22:10:00Z'); // after the spam ended
// ─────────────────────────────────────────────────────────────────────────

if (!BOT_TOKEN || !GUILD_ID) {
  console.error('Missing required environment variables. Check your .env file.');
  console.error('Required: DISCORD_BOT_TOKEN, DISCORD_GUILD_ID');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (set DRY_RUN=false to delete)' : 'LIVE - WILL DELETE'}`);
  console.log(`Target user: ${TARGET_USER_ID}`);
  console.log(`Time window: ${AFTER_TIME.toISOString()} to ${BEFORE_TIME.toISOString()}\n`);

  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    console.log(`Server: ${guild.name}`);

    const allChannels = await guild.channels.fetch();
    const textChannels = allChannels.filter(
      (ch) =>
        ch &&
        ch.isTextBased() &&
        !ch.isThread() &&
        ch.permissionsFor(guild.members.me)?.has([
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.ManageMessages,
        ])
    );

    console.log(`Scanning ${textChannels.size} channels...\n`);

    const found = [];
    const deleted = [];

    for (const [, channel] of textChannels) {
      try {
        // Fetch recent messages around the time window
        const messages = await channel.messages.fetch({ limit: 50 });
        const userMsgs = messages.filter(
          (m) =>
            m.author.id === TARGET_USER_ID &&
            m.createdAt >= AFTER_TIME &&
            m.createdAt <= BEFORE_TIME
        );

        for (const [, msg] of userMsgs) {
          const preview = msg.content?.substring(0, 80) || '[no text]';
          console.log(`Found in #${channel.name}: "${preview}" (${msg.id})`);
          found.push({ id: msg.id, channel: channel.name });

          if (!DRY_RUN) {
            await msg.delete();
            console.log(`  Deleted.`);
            deleted.push(msg.id);
            await sleep(1000); // rate limit safety
          } else {
            console.log(`  [DRY RUN] Would delete.`);
          }
        }
      } catch (err) {
        if (err.code !== 50001) { // ignore Missing Access silently
          console.error(`  Error in #${channel.name}: ${err.message}`);
        }
      }
    }

    // Also check active threads (forum posts show up as threads)
    console.log('\nChecking active threads...');
    try {
      const activeThreads = await guild.channels.fetchActiveThreads();
      for (const [, thread] of activeThreads.threads) {
        if (!thread.isTextBased()) continue;
        try {
          const messages = await thread.messages.fetch({ limit: 50 });
          const userMsgs = messages.filter(
            (m) =>
              m.author.id === TARGET_USER_ID &&
              m.createdAt >= AFTER_TIME &&
              m.createdAt <= BEFORE_TIME
          );

          for (const [, msg] of userMsgs) {
            const preview = msg.content?.substring(0, 80) || '[no text]';
            console.log(`Found in thread "${thread.name}": "${preview}" (${msg.id})`);
            found.push({ id: msg.id, channel: `thread:${thread.name}` });

            if (!DRY_RUN) {
              await msg.delete();
              console.log(`  Deleted.`);
              deleted.push(msg.id);
              await sleep(1000);
            } else {
              console.log(`  [DRY RUN] Would delete.`);
            }
          }
        } catch (err) {
          if (err.code !== 50001) {
            console.error(`  Error in thread "${thread.name}": ${err.message}`);
          }
        }
      }
    } catch (err) {
      console.log(`Could not scan threads: ${err.message}`);
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('SUMMARY');
    console.log('='.repeat(50));
    console.log(`Found:    ${found.length} messages from user in time window`);
    if (!DRY_RUN) {
      console.log(`Deleted:  ${deleted.length}`);
    }
    if (found.length === 0) {
      console.log('(Messages may have been deleted already or are in channels the bot cannot access.)');
    }
    console.log('='.repeat(50));
  } catch (err) {
    console.error(`Fatal error: ${err.message}`);
    console.error(err.stack);
  }

  client.destroy();
  console.log('\nDone.');
  process.exit(0);
});

client.on('error', (err) => {
  console.error('Client error:', err.message);
});

console.log('Connecting to Discord...');
client.login(BOT_TOKEN);
