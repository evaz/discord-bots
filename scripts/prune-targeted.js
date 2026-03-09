/**
 * Targeted Message Pruner
 *
 * Deletes specific messages by ID. Searches across all accessible channels
 * to find each message, then deletes it. Stops searching for a message
 * once it's found.
 *
 * Usage: node scripts/prune-targeted.js
 */

const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const DRY_RUN = process.env.DRY_RUN === 'true';

// The specific message IDs to delete
const TARGET_MESSAGE_IDS = [
  '1474530715495305327',
  '1474530722302918827',
  '1474530736928329871',
  '1474530746809979143',
  '1474530771934118192',
  '1474530795686465799',
  '1474530827437084755',
  '1474530835146346647',
  '1474530891115004052',
  '1474530874434256917',
  '1474530865253060801',
];

if (!BOT_TOKEN || !GUILD_ID) {
  console.error('Missing required environment variables. Check your .env file.');
  console.error('Required: DISCORD_BOT_TOKEN, DISCORD_GUILD_ID');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

client.once('ready', async () => {
  console.log(`\nLogged in as ${client.user.tag}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Messages to find: ${TARGET_MESSAGE_IDS.length}\n`);

  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    console.log(`Server: ${guild.name}`);

    // Get all text channels the bot can access
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

    console.log(`Searching across ${textChannels.size} channels...\n`);

    const remaining = new Set(TARGET_MESSAGE_IDS);
    const found = [];
    const deleted = [];
    const failed = [];

    for (const [, channel] of textChannels) {
      if (remaining.size === 0) break;

      for (const msgId of [...remaining]) {
        try {
          const message = await channel.messages.fetch(msgId);

          // Found it
          const preview = message.content?.substring(0, 60) || '[no text]';
          console.log(`Found ${msgId} in #${channel.name}: "${preview}"`);
          found.push({ id: msgId, channel: channel.name });
          remaining.delete(msgId);

          if (!DRY_RUN) {
            await message.delete();
            console.log(`  Deleted.`);
            deleted.push(msgId);
          } else {
            console.log(`  [DRY RUN] Would delete.`);
          }

          await sleep(500);
        } catch (err) {
          // 10008 = Unknown Message (not in this channel), just move on
          if (err.code === 10008) continue;

          // Actual error
          console.error(`  Error fetching ${msgId} in #${channel.name}: ${err.message}`);
          await sleep(500);
        }
      }
    }

    // Also check active threads
    if (remaining.size > 0) {
      console.log('\nChecking active threads...');
      try {
        const activeThreads = await guild.channels.fetchActiveThreads();
        for (const [, thread] of activeThreads.threads) {
          if (remaining.size === 0) break;
          if (!thread.isTextBased()) continue;

          for (const msgId of [...remaining]) {
            try {
              const message = await thread.messages.fetch(msgId);
              const preview = message.content?.substring(0, 60) || '[no text]';
              console.log(`Found ${msgId} in thread "${thread.name}": "${preview}"`);
              found.push({ id: msgId, channel: `thread:${thread.name}` });
              remaining.delete(msgId);

              if (!DRY_RUN) {
                await message.delete();
                console.log(`  Deleted.`);
                deleted.push(msgId);
              } else {
                console.log(`  [DRY RUN] Would delete.`);
              }

              await sleep(500);
            } catch (err) {
              if (err.code === 10008) continue;
              console.error(`  Error in thread "${thread.name}": ${err.message}`);
              await sleep(500);
            }
          }
        }
      } catch (err) {
        console.log(`Could not scan threads: ${err.message}`);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('SUMMARY');
    console.log('='.repeat(50));
    console.log(`Messages to find:  ${TARGET_MESSAGE_IDS.length}`);
    console.log(`Found:             ${found.length}`);
    if (!DRY_RUN) {
      console.log(`Deleted:           ${deleted.length}`);
    }
    if (remaining.size > 0) {
      console.log(`Not found:         ${remaining.size}`);
      console.log(`Missing IDs:       ${[...remaining].join(', ')}`);
      console.log('(These may be in channels the bot cannot access, or already deleted.)');
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
