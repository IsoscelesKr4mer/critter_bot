import discord
from discord.ext import commands, tasks
import aiohttp
import json
import asyncio
from datetime import datetime, timezone
import pytz
import os
import math

# Bot setup
intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix='!', intents=intents)

# Configuration
API_URL = "https://cqg.critters.quest/api/mining/miners"
CHECK_INTERVAL_MINUTES = 30  # Run every 30 minutes
ALERT_WINDOW_SECONDS = 5 * 3600  # Default 5 hours for scheduled checks and !checknow
DISCORD_CHANNEL_ID = 1418738561531908269  # Your provided channel ID
BOT_TOKEN = "[INSERT_YOUR_DISCORD_BOT_TOKEN_HERE]"  # Replace with your actual bot token
PLOTS_FILE = "plots.json"  # File to store plot data
MATT_WALLET = "3E77qMQBScwWQDeauPgerW5G46pB42HngbGCb32oBfu1"  # Matt's wallet address

# Define PST/PDT timezone
PST = pytz.timezone('America/Los_Angeles')

# Reminder intervals (in seconds)
REMINDER_INTERVALS = [30 * 60, 15 * 60, 5 * 60, 60]  # 30min, 15min, 5min, 1min

# Global variables
plots_data = {}
last_check_time = None
check_task = None

def load_plots():
    """Load plots data from file"""
    global plots_data
    try:
        if os.path.exists(PLOTS_FILE):
            with open(PLOTS_FILE, 'r') as f:
                plots_data = json.load(f)
        else:
            plots_data = {}
    except Exception as e:
        print(f"Error loading plots: {e}")
        plots_data = {}

def save_plots():
    """Save plots data to file"""
    try:
        with open(PLOTS_FILE, 'w') as f:
            json.dump(plots_data, f, indent=2)
    except Exception as e:
        print(f"Error saving plots: {e}")

def get_seconds_until_next_half_hour():
    """Calculate seconds until next half-hour mark"""
    now = datetime.now(timezone.utc)
    # Get next half-hour mark
    if now.minute < 30:
        next_time = now.replace(minute=30, second=0, microsecond=0)
    else:
        next_time = now.replace(minute=0, second=0, microsecond=0)
        next_time = next_time.replace(hour=next_time.hour + 1)
    
    return (next_time - now).total_seconds()

def format_time_duration(seconds):
    """Format seconds into human readable time"""
    if seconds < 60:
        return f"{int(seconds)}s"
    elif seconds < 3600:
        return f"{int(seconds/60)}m {int(seconds%60)}s"
    else:
        hours = int(seconds/3600)
        minutes = int((seconds%3600)/60)
        return f"{hours}h {minutes}m"

def is_lootable(plot, current_time):
    """Check if a plot is lootable"""
    try:
        if 'lastMined' not in plot or not plot['lastMined']:
            return False
        
        last_mined = datetime.fromisoformat(plot['lastMined'].replace('Z', '+00:00'))
        time_diff = (current_time - last_mined).total_seconds()
        
        # Plot becomes lootable after 6 hours (21600 seconds)
        return time_diff >= 21600
    except Exception as e:
        print(f"Error checking if plot is lootable: {e}")
        return False

async def fetch_miners_data():
    """Fetch miners data from API"""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(API_URL) as response:
                if response.status == 200:
                    data = await response.json()
                    return data
                else:
                    print(f"API request failed with status: {response.status}")
                    return None
    except Exception as e:
        print(f"Error fetching miners data: {e}")
        return None

def process_plots_data(data, current_time):
    """Process plots data and return lootable plots"""
    lootable_plots = []
    
    if not data or 'miners' not in data:
        return lootable_plots
    
    for miner_address, miner_data in data['miners'].items():
        if 'plots' not in miner_data:
            continue
            
        for plot_id, plot_data in miner_data['plots'].items():
            if is_lootable(plot_data, current_time):
                time_until_lootable = (current_time - datetime.fromisoformat(plot_data['lastMined'].replace('Z', '+00:00'))).total_seconds()
                lootable_plots.append({
                    'plot_id': plot_id,
                    'miner_address': miner_address,
                    'last_mined': plot_data['lastMined'],
                    'time_since_mined': time_until_lootable,
                    'tile': plot_data.get('tile', 'Unknown')
                })
    
    return lootable_plots

async def send_lootable_alert(plots, time_window_hours=5):
    """Send lootable plots alert to Discord"""
    if not plots:
        return
    
    channel = bot.get_channel(DISCORD_CHANNEL_ID)
    if not channel:
        print(f"Channel {DISCORD_CHANNEL_ID} not found")
        return
    
    # Sort plots by time since mined (most recently lootable first)
    plots.sort(key=lambda x: x['time_since_mined'], reverse=True)
    
    embed = discord.Embed(
        title=f"🔍 Lootable Plots Alert ({time_window_hours}h window)",
        description=f"Found {len(plots)} lootable plots!",
        color=discord.Color.green(),
        timestamp=datetime.now(timezone.utc)
    )
    
    # Add plots to embed (limit to 25 fields max)
    for i, plot in enumerate(plots[:25]):
        time_str = format_time_duration(plot['time_since_mined'])
        embed.add_field(
            name=f"Plot {plot['plot_id']}",
            value=f"**Miner:** `{plot['miner_address'][:8]}...`\n**Tile:** {plot['tile']}\n**Lootable for:** {time_str}",
            inline=True
        )
    
    if len(plots) > 25:
        embed.add_field(
            name="Note",
            value=f"Showing first 25 plots. Total: {len(plots)}",
            inline=False
        )
    
    embed.set_footer(text="Bot by xAI | Data from cqg.critters.quest")
    
    try:
        await channel.send(embed=embed)
    except Exception as e:
        print(f"Error sending alert: {e}")

async def check_lootable_plots():
    """Check for lootable plots and send alerts"""
    global last_check_time
    
    print(f"[{datetime.now()}] Checking for lootable plots...")
    
    current_time = datetime.now(timezone.utc)
    data = await fetch_miners_data()
    
    if not data:
        print("Failed to fetch miners data")
        return
    
    # Process plots for 5-hour window
    lootable_plots = process_plots_data(data, current_time)
    
    if lootable_plots:
        print(f"Found {len(lootable_plots)} lootable plots")
        await send_lootable_alert(lootable_plots, 5)
        
        # Update last check time
        last_check_time = current_time
        save_plots()
    else:
        print("No lootable plots found")

async def check_reminders():
    """Check for reminder alerts"""
    if not plots_data:
        return
    
    current_time = datetime.now(timezone.utc)
    channel = bot.get_channel(DISCORD_CHANNEL_ID)
    
    if not channel:
        return
    
    for plot_id, plot_info in plots_data.items():
        if 'last_reminder' not in plot_info:
            continue
        
        last_reminder = datetime.fromisoformat(plot_info['last_reminder'])
        time_since_reminder = (current_time - last_reminder).total_seconds()
        
        # Send reminder if it's been more than 30 minutes
        if time_since_reminder >= 1800:  # 30 minutes
            embed = discord.Embed(
                title="⏰ Plot Reminder",
                description=f"Plot {plot_id} may be lootable soon!",
                color=discord.Color.orange()
            )
            
            try:
                await channel.send(embed=embed)
                plot_info['last_reminder'] = current_time.isoformat()
                save_plots()
            except Exception as e:
                print(f"Error sending reminder: {e}")

@bot.event
async def on_ready():
    """Bot ready event"""
    print(f'{bot.user} has connected to Discord!')
    print(f'Bot is in {len(bot.guilds)} guilds')
    
    # Load plots data
    load_plots()
    
    # Start the periodic check task
    global check_task
    if check_task is None or check_task.done():
        check_task = asyncio.create_task(periodic_check())
    
    print("Bot is ready and monitoring plots!")

async def periodic_check():
    """Periodic check for lootable plots"""
    while True:
        try:
            await check_lootable_plots()
            await check_reminders()
            
            # Wait until next half-hour mark
            wait_time = get_seconds_until_next_half_hour()
            print(f"Waiting {format_time_duration(wait_time)} until next check...")
            await asyncio.sleep(wait_time)
            
        except Exception as e:
            print(f"Error in periodic check: {e}")
            await asyncio.sleep(300)  # Wait 5 minutes on error

@bot.command(name="checknow")
async def check_now(ctx):
    """Manual check for lootable plots"""
    await ctx.send("🔍 Checking for lootable plots...")
    
    current_time = datetime.now(timezone.utc)
    data = await fetch_miners_data()
    
    if not data:
        await ctx.send("❌ Failed to fetch miners data")
        return
    
    lootable_plots = process_plots_data(data, current_time)
    
    if not lootable_plots:
        await ctx.send("✅ No lootable plots found in the 5-hour window")
        return
    
    await send_lootable_alert(lootable_plots, 5)

@bot.command(name="check")
async def check_command(ctx, *, arg=None):
    """Check command with various options"""
    if not arg:
        await ctx.send("❌ Please specify what to check. Use `!bothelp` for options.")
        return
    
    current_time = datetime.now(timezone.utc)
    data = await fetch_miners_data()
    
    if not data:
        await ctx.send("❌ Failed to fetch miners data")
        return
    
    # Check if arg is a number (hours or tile)
    try:
        if arg.isdigit():
            # Check if it's a reasonable hour value (1-24)
            hours = int(arg)
            if 1 <= hours <= 24:
                await check_time_window(ctx, data, current_time, hours)
                return
            else:
                # Assume it's a tile number
                await check_tile(ctx, data, arg)
                return
        else:
            # Assume it's a wallet address
            await check_wallet(ctx, data, arg)
            return
    except ValueError:
        await ctx.send("❌ Invalid input. Use `!bothelp` for options.")

async def check_time_window(ctx, data, current_time, hours):
    """Check plots for specific time window"""
    # Calculate time threshold
    threshold_time = current_time - timedelta(hours=hours)
    
    lootable_plots = []
    for miner_address, miner_data in data.get('miners', {}).items():
        if 'plots' not in miner_data:
            continue
            
        for plot_id, plot_data in miner_data['plots'].items():
            if 'lastMined' not in plot_data or not plot_data['lastMined']:
                continue
                
            last_mined = datetime.fromisoformat(plot_data['lastMined'].replace('Z', '+00:00'))
            if last_mined <= threshold_time:
                time_diff = (current_time - last_mined).total_seconds()
                lootable_plots.append({
                    'plot_id': plot_id,
                    'miner_address': miner_address,
                    'last_mined': plot_data['lastMined'],
                    'time_since_mined': time_diff,
                    'tile': plot_data.get('tile', 'Unknown')
                })
    
    if not lootable_plots:
        await ctx.send(f"✅ No lootable plots found in the last {hours} hours")
        return
    
    await send_lootable_alert(lootable_plots, hours)

async def check_tile(ctx, data, tile_id):
    """Check specific tile for lootable plots"""
    lootable_plots = []
    
    for miner_address, miner_data in data.get('miners', {}).items():
        if 'plots' not in miner_data:
            continue
            
        for plot_id, plot_data in miner_data['plots'].items():
            if plot_data.get('tile') == tile_id and is_lootable(plot_data, datetime.now(timezone.utc)):
                time_diff = (datetime.now(timezone.utc) - datetime.fromisoformat(plot_data['lastMined'].replace('Z', '+00:00'))).total_seconds()
                lootable_plots.append({
                    'plot_id': plot_id,
                    'miner_address': miner_address,
                    'last_mined': plot_data['lastMined'],
                    'time_since_mined': time_diff,
                    'tile': plot_data.get('tile', 'Unknown')
                })
    
    if not lootable_plots:
        await ctx.send(f"✅ No lootable plots found for tile {tile_id}")
        return
    
    embed = discord.Embed(
        title=f"🔍 Tile {tile_id} Status",
        description=f"Found {len(lootable_plots)} lootable plots on this tile",
        color=discord.Color.green()
    )
    
    for plot in lootable_plots:
        time_str = format_time_duration(plot['time_since_mined'])
        embed.add_field(
            name=f"Plot {plot['plot_id']}",
            value=f"**Miner:** `{plot['miner_address'][:8]}...`\n**Lootable for:** {time_str}",
            inline=True
        )
    
    await ctx.send(embed=embed)

async def check_wallet(ctx, data, wallet_address):
    """Check all miners for specific wallet address"""
    lootable_plots = []
    
    for miner_address, miner_data in data.get('miners', {}).items():
        if miner_address.lower() == wallet_address.lower():
            if 'plots' not in miner_data:
                continue
                
            for plot_id, plot_data in miner_data['plots'].items():
                if is_lootable(plot_data, datetime.now(timezone.utc)):
                    time_diff = (datetime.now(timezone.utc) - datetime.fromisoformat(plot_data['lastMined'].replace('Z', '+00:00'))).total_seconds()
                    lootable_plots.append({
                        'plot_id': plot_id,
                        'miner_address': miner_address,
                        'last_mined': plot_data['lastMined'],
                        'time_since_mined': time_diff,
                        'tile': plot_data.get('tile', 'Unknown')
                    })
    
    if not lootable_plots:
        await ctx.send(f"✅ No lootable plots found for wallet `{wallet_address[:8]}...`")
        return
    
    embed = discord.Embed(
        title=f"🔍 Wallet {wallet_address[:8]}... Status",
        description=f"Found {len(lootable_plots)} lootable plots for this wallet",
        color=discord.Color.green()
    )
    
    for plot in lootable_plots:
        time_str = format_time_duration(plot['time_since_mined'])
        embed.add_field(
            name=f"Plot {plot['plot_id']}",
            value=f"**Tile:** {plot['tile']}\n**Lootable for:** {time_str}",
            inline=True
        )
    
    await ctx.send(embed=embed)

@bot.command(name="matt")
async def check_matt(ctx):
    """Check Matt's plots specifically"""
    embed = discord.Embed(
        title="🔍 Matt's Plots Check",
        description="Checking Matt's wallet for lootable plots...",
        color=discord.Color.blue()
    )
    
    await ctx.send(embed=embed)
    
    current_time = datetime.now(timezone.utc)
    data = await fetch_miners_data()
    
    if not data:
        embed = discord.Embed(
            title="❌ Error",
            description="Failed to fetch miners data",
            color=discord.Color.red()
        )
        await ctx.send(embed=embed)
        return
    
    # Check if Matt has any miners
    matt_miners = [addr for addr in data.get('miners', {}).keys() if addr.lower() == MATT_WALLET.lower()]
    
    if not matt_miners:
        embed = discord.Embed(
            title="ℹ️ No Miners Found",
            description=f"No miners found for Matt's wallet: `{MATT_WALLET[:8]}...`",
            color=discord.Color.orange()
        )
        await ctx.send(embed=embed)
        return
    
    await ctx.send("Checking Matt's plots...", embed=None)
    await check_wallet(ctx, MATT_WALLET, now)

@bot.command(name="bothelp")
async def help_command(ctx):
    """Help command"""
    embed = discord.Embed(
        title="Critter Quest Lootable Plots Bot",
        description="Commands available:",
        color=discord.Color.blue()
    )
    
    embed.add_field(
        name="!checknow",
        value="Generate 5-hour lootable plots summary",
        inline=False
    )
    
    embed.add_field(
        name="!check [hours]",
        value="Check plots for specific time window (e.g., !check 12)",
        inline=False
    )
    
    embed.add_field(
        name="!check [tile]",
        value="Check specific tile status (e.g., !check 12345)",
        inline=False
    )
    
    embed.add_field(
        name="!check [wallet]",
        value="Check all miners for wallet address",
        inline=False
    )
    
    embed.add_field(
        name="!matt",
        value="Quick check for Matt's plots",
        inline=False
    )
    
    embed.set_footer(text="Bot by xAI | Data from cqg.critters.quest")
    await ctx.send(embed=embed)

@bot.command(name="status")
async def status_command(ctx):
    """Show bot status"""
    embed = discord.Embed(
        title="🤖 Bot Status",
        color=discord.Color.green()
    )
    
    embed.add_field(
        name="Uptime",
        value=f"{format_time_duration((datetime.now(timezone.utc) - bot.user.created_at).total_seconds())}",
        inline=True
    )
    
    embed.add_field(
        name="Last Check",
        value=f"{last_check_time.strftime('%Y-%m-%d %H:%M:%S UTC') if last_check_time else 'Never'}",
        inline=True
    )
    
    embed.add_field(
        name="Next Check",
        value=f"In {format_time_duration(get_seconds_until_next_half_hour())}",
        inline=True
    )
    
    embed.set_footer(text="Bot by xAI | Data from cqg.critters.quest")
    await ctx.send(embed=embed)

if __name__ == "__main__":
    print("Starting Critter Quest Lootable Plots Bot...")
    print("Make sure to update BOT_TOKEN and GAME_ACCESS_TOKEN before running!")
    
    if BOT_TOKEN == "[INSERT_YOUR_DISCORD_BOT_TOKEN_HERE]":
        print("❌ Please update BOT_TOKEN in the code before running!")
        exit(1)
    
    bot.run(BOT_TOKEN)
