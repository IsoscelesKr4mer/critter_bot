# Critter Quest Lootable Plots Discord Bot

A Discord bot that monitors upcoming lootable plots in Critter Quest and sends automated reminders.

## Features

- **Automated Monitoring**: Checks for lootable plots every 30 minutes
- **Smart Reminders**: Sends alerts at 30min, 15min, 5min, and 1min before lootable
- **Matt's Plots**: Special tracking for Matt's wallet with dedicated alerts
- **Manual Commands**: Check specific tiles, wallets, or time windows
- **Persistent Storage**: Remembers plots and sent reminders

## Setup

1. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Configure the bot**:
   - Update `BOT_TOKEN` with your Discord bot token
   - Update `GAME_ACCESS_TOKEN` with your game access token
   - Update `DISCORD_CHANNEL_ID` with your channel ID

3. **Run the bot**:
   ```bash
   python lootable_bot.py
   ```

## Commands

- `!checknow` - Generate 5-hour lootable plots summary
- `!check [hours]` - Check plots for specific time window (e.g., `!check 12`)
- `!check [tile]` - Check specific tile status (e.g., `!check 12345`)
- `!check [wallet]` - Check all miners for wallet address
- `!matt` - Quick check for Matt's plots
- `!help` - Show available commands

## Token Management

### Discord Bot Token
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to "Bot" section
4. Copy the token and update `BOT_TOKEN`

### Game Access Token
1. Go to [beta.critters.quest](https://beta.critters.quest)
2. Log in to your account
3. Open Developer Tools (F12)
4. Go to Application → Cookies
5. Find `gameAccessToken` and copy the value
6. Update `GAME_ACCESS_TOKEN`

## Configuration

- `CHECK_INTERVAL_MINUTES`: How often to check (default: 30 minutes)
- `ALERT_WINDOW_SECONDS`: Default alert window (default: 5 hours)
- `REMINDER_INTERVALS`: Reminder times before lootable (default: 30min, 15min, 5min, 1min)
- `MATT_WALLET`: Matt's wallet address for special tracking

## Data Storage

The bot stores plot data and reminder history in `plots.json` to prevent duplicate notifications.

## Troubleshooting

- **Bot not responding**: Check if the bot token is correct and has proper permissions
- **No data**: Update the game access token if it has expired
- **Wrong channel**: Make sure the channel ID is correct
- **API errors**: Check if the game API is accessible

## Security

- Never commit tokens to version control
- Use environment variables for production
- Regularly update tokens when they expire
