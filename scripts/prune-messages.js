/**
 * Full Channel Scanner / User Message Pruner
 *
 * Scans every accessible text channel in the server and deletes all messages
 * from TARGET_USER_ID. Handles bulk deletion for recent messages and
 * single deletion for messages older than 14 days.
 *
 * Usage: node scripts/prune-messages.js
 */

const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const TARGET_USER_ID = process.env.TARGET_USER_ID;
const DRY_RUN = process.env.DRY_RUN === 'true';

if (!BOT_TOKEN || !GUILD_ID || !TARGET_USER_ID) {
  console.error('Missing required environment variables. Check your .env file.');
  console.error('Required: DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, TARGET_USER_ID');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.MessageContent],
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;

async function pruneChannel(channel, stats) {
  console.log(`\nScanning #${channel.name}...`);
  let lastId = null;
  let channelCount = 0;

  while (true) {
    const options = { limit: 100 };
    if (lastId) options.before = lastId;

    const messages = await channel.messages.fetch(options);
    if (messages.size === 0) break;

    const targetMessages = messages.filter((m) => m.author.id === TARGET_USER_ID);

    for (const [, msg] of targetMessages) {
      const preview = msg.content?.substring(0, 50) || '[no text]';
      const age = Date.now() - msg.createdTimestamp;

      if (DRY_RUN) {
        console.log(`  [DRY RUN] Would delete: "${preview}" (${age > FOURTEEN_DAYS ? 'old' : 'recent'})`);
        stats.found++;
        channelCount++;
      } else {
        try {
          await msg.delete();
          console.log(`  Deleted: "${preview}"`);
          stats.deleted++;
          channelCount++;
          await sleep(age > FOURTEEN_DAYS ? 1200 : 500);
        } catch (err) {
          console.error(`  Failed to delete ${msg.id}: ${err.message}`);
          stats.failed++;
        }
      }
    }

    lastId = messages.last().id;
    await sleep(1000);
  }

  if (channelCount > 0) {
    console.log(`  -> ${channelCount} messages ${DRY_RUN ? 'found' : 'deleted'} in #${channel.name}`);
  }
}

client.once('ready', async () => {
  console.log(`\nLogged in as ${client.user.tag}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Target user: ${TARGET_USER_ID}\n`);

  const stats = { found: 0, deleted: 0, failed: 0 };

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

    console.log(`Scanning ${textChannels.size} channels...`);

    for (const [, channel] of textChannels) {
      await pruneChannel(channel, stats);
    }

    // Scan active threads
    console.log('\nScanning active threads...');
    try {
      const activeThreads = await guild.channels.fetchActiveThreads();
      for (const [, thread] of activeThreads.threads) {
        if (!thread.isTextBased()) continue;
        await pruneChannel(thread, stats);
      }
    } catch (err) {
      console.error(`Could not scan threads: ${err.message}`);
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('SUMMARY');
    console.log('='.repeat(50));
    if (DRY_RUN) {
      console.log(`Messages found:  ${stats.found}`);
      console.log('(Run with DRY_RUN=false to delete)');
    } else {
      console.log(`Deleted:  ${stats.deleted}`);
      console.log(`Failed:   ${stats.failed}`);
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
