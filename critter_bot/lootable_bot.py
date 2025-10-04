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
BOT_TOKEN = "MTQxODczNjk4MzU1OTM3MjkyMA.GO9w1D.mp6l9Cvu2dNxnfrJ1PL92deH0jCsRULUiNqIU0"  # Your provided bot token
PLOTS_FILE = "plots.json"  # File to store plot data

# Define PST/PDT timezone
PST = pytz.timezone('America/Los_Angeles')

# Reminder intervals (in seconds)
REMINDER_INTERVALS = [30 * 60, 15 * 60, 5 * 60, 60]  # 30min, 15min, 5min, 1min

async def fetch_miners_data():
    cookies = {"gameAccessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ3YWxsZXQiOiI2Nk1FUzVMN05iemRwVDZpWHRRb0NuSGFnNXptQlBRcFhqYlc3QWgzRFpEVCIsImlhdCI6MTc1OTUxOTEyNiwiZXhwIjoxNzU5NTYyMzI2fQ.Lszd_5Ji1UdPR2oRTToQ5y2_TJRuWRSicx4d_hFwj2U"}
    for attempt in range(3):
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(API_URL, cookies=cookies) as response:
                    if response.status == 200:
                        return await response.json()
                    elif response.status == 429:
                        print(f"[{datetime.now(PST).strftime('%H:%M:%S %Z')}] Rate limit hit, retrying after 10 seconds...")
                        await asyncio.sleep(10)
                        continue
                    else:
                        print(f"[{datetime.now(PST).strftime('%H:%M:%S %Z')}] Error: API returned status {response.status}")
                        return None
        except Exception as e:
            print(f"[{datetime.now(PST).strftime('%H:%M:%S %Z')}] Error fetching data: {e}")
            return None
    print(f"[{datetime.now(PST).strftime('%H:%M:%S %Z')}] Failed to fetch data after 3 attempts")
    return None

def get_current_timestamp():
    return int(datetime.now(timezone.utc).timestamp())

def format_time_duration(seconds):
    if seconds <= 0:
        return "Now"
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    return f"{hours}h {minutes}m"

def load_plots():
    try:
        with open(PLOTS_FILE, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return {"plots": [], "sent_reminders": {}}

def save_plots(data):
    try:
        with open(PLOTS_FILE, 'w') as f:
            json.dump(data, f, indent=4)
    except Exception as e:
        print(f"[{datetime.now(PST).strftime('%H:%M:%S %Z')}] Error saving plots.json: {e}")

async def get_seconds_until_next_half_hour():
    now = datetime.now(PST)
    minutes = now.minute
    seconds = now.second
    # Calculate minutes until next :00 or :30
    if minutes < 30:
        target_minutes = 30
    else:
        target_minutes = 60
    minutes_to_wait = target_minutes - minutes
    seconds_to_wait = (minutes_to_wait * 60) - seconds
    return seconds_to_wait

@bot.event
async def on_ready():
    print(f"[{datetime.now(PST).strftime('%H:%M:%S %Z')}] Logged in as {bot.user}")
    check_reminders.start()
    # Start check_lootable_plots manually to control timing
    asyncio.create_task(check_lootable_plots())

async def check_lootable_plots():
    while True:
        # Wait until the next :00 or :30
        seconds_to_wait = await get_seconds_until_next_half_hour()
        print(f"[{datetime.now(PST).strftime('%H:%M:%S %Z')}] Waiting {seconds_to_wait // 60}m {seconds_to_wait % 60}s until next half-hour mark...")
        await asyncio.sleep(seconds_to_wait)

        print(f"[{datetime.now(PST).strftime('%H:%M:%S %Z')}] Starting scheduled check.")
        channel = bot.get_channel(DISCORD_CHANNEL_ID)
        await run_plot_check(channel, hours=5)  # Default 5 hours for scheduled checks

        # Wait 30 minutes for the next check
        print(f"[{datetime.now(PST).strftime('%H:%M:%S %Z')}] Sleeping for 30 minutes until next check...")
        await asyncio.sleep(30 * 60)

async def run_plot_check(channel, hours):
    now = datetime.now(PST)
    print(f"[{now.strftime('%H:%M:%S %Z')}] Running plot check for {hours}-hour window...")
    if not channel:
        print(f"[{now.strftime('%H:%M:%S %Z')}] Error: Channel not found")
        return

    try:
        data = await fetch_miners_data()
        if not data:
            print(f"[{now.strftime('%H:%M:%S %Z')}] No data retrieved, skipping check")
            await channel.send("API error: No data available. Retrying in 30 minutes...")
            return
    except Exception as e:
        print(f"[{now.strftime('%H:%M:%S %Z')}] Exception in fetch: {e}")
        await channel.send(f"Error fetching data: {str(e)}. Check logs.")
        return

    current_time = get_current_timestamp()
    twentyfour_hours = 24 * 3600
    alert_window_seconds = hours * 3600  # Convert hours to seconds
    upcoming_lootable = []

    for mining_group in data.get("miners", {}).values():
        for miner in mining_group:
            if miner.get("expectedEndTime") and (miner.get("destination") or miner.get("currentTile")):
                lootable_time = miner["expectedEndTime"] + twentyfour_hours
                time_until_lootable = lootable_time - current_time
                tile = miner.get("destination") or miner.get("currentTile")

                # Only include plots within the specified hours
                if 0 < time_until_lootable <= alert_window_seconds:
                    player = miner.get("user", "unknown")
                    level = miner.get("level", 0)
                    tier = miner.get("tier", 0)
                    time_left = format_time_duration(time_until_lootable)
                    lootable_at = datetime.fromtimestamp(lootable_time, tz=PST).strftime("%Y-%m-%d %I:%M:%S %p %Z")
                    upcoming_lootable.append({
                        "tile": tile,
                        "player": player,
                        "level": level,
                        "tier": tier,
                        "time_left": time_left,
                        "lootable_at": lootable_at,
                        "lootable_time": lootable_time,
                        "is_lootable": False
                    })

    # Create embed
    embed = discord.Embed(
        title=f"Upcoming Lootable Plots Within {hours} Hours ({now.strftime('%I:%M%p').lower()})",
        description=f"Plots that will become lootable within the next {hours} hours:",
        color=discord.Color.blue(),
        timestamp=now
    )
    embed.set_footer(text="Bot by xAI | Data from cqg.critters.quest")

    # Upcoming Lootable Plots
    if upcoming_lootable:
        for plot in upcoming_lootable:
            embed.add_field(
                name=f"Tile {plot['tile']}",
                value=(
                    f"**Player**: {plot['player']}\n"
                    f"**Level**: {plot['level']}\n"
                    f"**Tier**: {plot['tier']}\n"
                    f"**Time Left**: {plot['time_left']}\n"
                    f"**Lootable At**: {plot['lootable_at']}"
                ),
                inline=False
            )
    else:
        embed.add_field(
            name="Upcoming Lootable Plots",
            value=f"No plots will become lootable within the next {hours} hours.",
            inline=False
        )

    await channel.send(embed=embed)
    print(f"[{now.strftime('%H:%M:%S %Z')}] Sent summary: {len(upcoming_lootable)} upcoming in {hours}-hour window")

    # Update stored plots (only for scheduled checks or !checknow with 5 hours)
    if hours == 5:
        stored_data = load_plots()
        stored_data["plots"] = upcoming_lootable
        save_plots(stored_data)

@tasks.loop(minutes=1)
async def check_reminders():
    now = datetime.now(PST)
    print(f"[{now.strftime('%H:%M:%S %Z')}] Checking for reminders...")
    channel = bot.get_channel(DISCORD_CHANNEL_ID)
    if not channel:
        print(f"[{now.strftime('%H:%M:%S %Z')}] Error: Channel not found")
        return

    current_time = get_current_timestamp()
    stored_data = load_plots()
    plots = stored_data.get("plots", [])
    sent_reminders = stored_data.get("sent_reminders", {})

    for plot in plots:
        lootable_time = plot["lootable_time"]
        time_until_lootable = lootable_time - current_time
        plot_id = f"{plot['tile']}_{lootable_time}"

        for interval in REMINDER_INTERVALS:
            if interval - 5 <= time_until_lootable <= interval + 5:
                if plot_id not in sent_reminders:
                    sent_reminders[plot_id] = []
                if interval not in sent_reminders[plot_id]:
                    color = {
                        30 * 60: discord.Color.green(),
                        15 * 60: discord.Color.yellow(),
                        5 * 60: discord.Color.orange(),
                        60: discord.Color.red()
                    }.get(interval, discord.Color.blue())

                    embed = discord.Embed(
                        title=f"Reminder: Plot Lootable in {format_time_duration(interval)}",
                        description=f"Tile {plot['tile']} will be lootable soon:",
                        color=color,
                        timestamp=now
                    )
                    embed.add_field(
                        name="Details",
                        value=(
                            f"**Player**: {plot['player']}\n"
                            f"**Level**: {plot['level']}\n"
                            f"**Tier**: {plot['tier']}\n"
                            f"**Time Left**: {format_time_duration(time_until_lootable)}\n"
                            f"**Lootable At**: {plot['lootable_at']}"
                        ),
                        inline=False
                    )
                    embed.set_footer(text="Bot by xAI | Data from cqg.critters.quest")
                    await channel.send(embed=embed)
                    sent_reminders[plot_id].append(interval)
                    print(f"[{now.strftime('%H:%M:%S %Z')}] Sent {format_time_duration(interval)} reminder for Tile {plot['tile']}")

    # Clean up expired plots and save
    stored_data["plots"] = [p for p in plots if p["lootable_time"] > current_time]
    stored_data["sent_reminders"] = {k: v for k, v in sent_reminders.items() if k in [f"{p['tile']}_{p['lootable_time']}" for p in stored_data["plots"]]}
    save_plots(stored_data)

@bot.command(name="checknow")
async def checknow(ctx):
    now = datetime.now(PST)
    if ctx.channel.id == DISCORD_CHANNEL_ID:
        await ctx.send("Generating 5-hour lootable plots summary...", embed=None)
        await run_plot_check(ctx.channel, hours=5)
    else:
        embed = discord.Embed(
            title="Error",
            description=f"This command can only be used in <#{DISCORD_CHANNEL_ID}>.",
            color=discord.Color.red(),
            timestamp=now
        )
        embed.set_footer(text="Bot by xAI | Data from cqg.critters.quest")
        await ctx.send(embed=embed)
        print(f"[{now.strftime('%H:%M:%S %Z')}] !checknow used in wrong channel: {ctx.channel.id}")

@bot.command(name="check")
async def check(ctx, arg: str):
    now = datetime.now(PST)
    if ctx.channel.id != DISCORD_CHANNEL_ID:
        embed = discord.Embed(
            title="Error",
            description=f"This command can only be used in <#{DISCORD_CHANNEL_ID}>.",
            color=discord.Color.red(),
            timestamp=now
        )
        embed.set_footer(text="Bot by xAI | Data from cqg.critters.quest")
        await ctx.send(embed=embed)
        print(f"[{now.strftime('%H:%M:%S %Z')}] !check {arg} used in wrong channel: {ctx.channel.id}")
        return

    # Check if arg is a number for !check X (e.g., !check 20) or tile number
    if arg.isdigit():
        hours = int(arg)
        if hours > 0:
            await ctx.send(f"Generating {hours}-hour lootable plots summary...", embed=None)
            await run_plot_check(ctx.channel, hours=hours)
        else:
            # Treat as tile number
            tile_number = arg
            await ctx.send(f"Checking status for Tile {tile_number}...", embed=None)
            await check_tile(ctx, tile_number, now)
    # Otherwise, treat as wallet address
    else:
        wallet_address = arg
        # Basic validation: Solana addresses are ~43 characters
        if len(wallet_address) < 40 or len(wallet_address) > 44:
            embed = discord.Embed(
                title="Error",
                description=f"Invalid wallet address '{wallet_address}'. Please use a valid Solana wallet address (e.g., !check nyQZH2XwodUmbAyL6UrMFQfMgjQ1foStNtXHW592dTk).",
                color=discord.Color.red(),
                timestamp=now
            )
            embed.set_footer(text="Bot by xAI | Data from cqg.critters.quest")
            await ctx.send(embed=embed)
            print(f"[{now.strftime('%H:%M:%S %Z')}] Invalid wallet address: {wallet_address}")
            return

        await ctx.send(f"Checking miners for wallet {wallet_address}...", embed=None)
        await check_wallet(ctx, wallet_address, now)

async def check_tile(ctx, tile_number, now):
    try:
        data = await fetch_miners_data()
        if not data:
            embed = discord.Embed(
                title="Error",
                description="API error: No data available. Try again later.",
                color=discord.Color.red(),
                timestamp=now
            )
            embed.set_footer(text="Bot by xAI | Data from cqg.critters.quest")
            await ctx.send(embed=embed)
            print(f"[{now.strftime('%H:%M:%S %Z')}] No data retrieved for !check {tile_number}")
            return
    except Exception as e:
        embed = discord.Embed(
            title="Error",
            description=f"Error fetching data: {str(e)}. Check logs.",
            color=discord.Color.red(),
            timestamp=now
        )
        embed.set_footer(text="Bot by xAI | Data from cqg.critters.quest")
        await ctx.send(embed=embed)
        print(f"[{now.strftime('%H:%M:%S %Z')}] Exception in !check {tile_number}: {e}")
        return

    current_time = get_current_timestamp()
    twentyfour_hours = 24 * 3600
    miner_found = None

    for mining_group in data.get("miners", {}).values():
        for miner in mining_group:
            tile = miner.get("destination") or miner.get("currentTile")
            if tile and str(tile) == tile_number:
                miner_found = miner
                break
        if miner_found:
            break

    if not miner_found:
        embed = discord.Embed(
            title=f"Tile {tile_number} Status ({now.strftime('%I:%M%p').lower()})",
            description=f"No miner found on Tile {tile_number}.",
            color=discord.Color.red(),
            timestamp=now
        )
        embed.set_footer(text="Bot by xAI | Data from cqg.critters.quest")
        await ctx.send(embed=embed)
        print(f"[{now.strftime('%H:%M:%S %Z')}] No miner found for Tile {tile_number}")
        return

    lootable_time = miner_found.get("expectedEndTime")
    if not lootable_time:
        embed = discord.Embed(
            title=f"Tile {tile_number} Status ({now.strftime('%I:%M%p').lower()})",
            description=f"Tile {tile_number} has no lootable time data.",
            color=discord.Color.red(),
            timestamp=now
        )
        embed.set_footer(text="Bot by xAI | Data from cqg.critters.quest")
        await ctx.send(embed=embed)
        print(f"[{now.strftime('%H:%M:%S %Z')}] No lootable time for Tile {tile_number}")
        return

    lootable_time += twentyfour_hours
    time_until_lootable = lootable_time - current_time
    player = miner_found.get("user", "unknown")
    level = miner_found.get("level", 0)
    tier = miner_found.get("tier", 0)
    time_left = format_time_duration(time_until_lootable)
    lootable_at = datetime.fromtimestamp(lootable_time, tz=PST).strftime("%Y-%m-%d %I:%M:%S %p %Z")

    # Determine status
    if 0 < time_until_lootable <= ALERT_WINDOW_SECONDS:
        status = "Lootable Soon"
        color = discord.Color.yellow()
    else:
        status = "Not Lootable"
        color = discord.Color.red()

    embed = discord.Embed(
        title=f"Tile {tile_number} Status ({now.strftime('%I:%M%p').lower()})",
        description=f"Current status for Tile {tile_number}: **{status}**",
        color=color,
        timestamp=now
    )
    embed.add_field(
        name="Details",
        value=(
            f"**Player**: {player}\n"
            f"**Level**: {level}\n"
            f"**Tier**: {tier}\n"
            f"**Time Left**: {time_left}\n"
            f"**Lootable At**: {lootable_at}"
        ),
        inline=False
    )
    embed.set_footer(text="Bot by xAI | Data from cqg.critters.quest")
    await ctx.send(embed=embed)
    print(f"[{now.strftime('%H:%M:%S %Z')}] Sent status for Tile {tile_number}: {status}")

async def check_wallet(ctx, wallet_address, now):
    try:
        data = await fetch_miners_data()
        if not data:
            embed = discord.Embed(
                title="Error",
                description="API error: No data available. Try again later.",
                color=discord.Color.red(),
                timestamp=now
            )
            embed.set_footer(text="Bot by xAI | Data from cqg.critters.quest")
            await ctx.send(embed=embed)
            print(f"[{now.strftime('%H:%M:%S %Z')}] No data retrieved for !check {wallet_address}")
            return
    except Exception as e:
        embed = discord.Embed(
            title="Error",
            description=f"Error fetching data: {str(e)}. Check logs.",
            color=discord.Color.red(),
            timestamp=now
        )
        embed.set_footer(text="Bot by xAI | Data from cqg.critters.quest")
        await ctx.send(embed=embed)
        print(f"[{now.strftime('%H:%M:%S %Z')}] Exception in !check {wallet_address}: {e}")
        return

    current_time = get_current_timestamp()
    twentyfour_hours = 24 * 3600
    miners = []

    for mining_group in data.get("miners", {}).values():
        for miner in mining_group:
            if miner.get("user") == wallet_address and miner.get("expectedEndTime") and (miner.get("destination") or miner.get("currentTile")):
                tile = miner.get("destination") or miner.get("currentTile")
                lootable_time = miner["expectedEndTime"] + twentyfour_hours
                time_until_lootable = lootable_time - current_time
                level = miner.get("level", 0)
                tier = miner.get("tier", 0)
                time_left = format_time_duration(time_until_lootable)
                lootable_at = datetime.fromtimestamp(lootable_time, tz=PST).strftime("%Y-%m-%d %I:%M:%S %p %Z")
                miners.append({
                    "tile": tile,
                    "level": level,
                    "tier": tier,
                    "time_left": time_left,
                    "lootable_at": lootable_at,
                    "lootable_time": lootable_time
                })

    # Create embed
    embed = discord.Embed(
        title=f"Miners for Wallet {wallet_address[:6]}...{wallet_address[-6:]} ({now.strftime('%I:%M%p').lower()})",
        description=f"Current status of all miners for wallet {wallet_address}:",
        color=discord.Color.blue(),
        timestamp=now
    )
    embed.set_footer(text="Bot by xAI | Data from cqg.critters.quest")

    if miners:
        for miner in miners:
            embed.add_field(
                name=f"Tile {miner['tile']}",
                value=(
                    f"**Level**: {miner['level']}\n"
                    f"**Tier**: {miner['tier']}\n"
                    f"**Time Left**: {miner['time_left']}\n"
                    f"**Lootable At**: {miner['lootable_at']}"
                ),
                inline=False
            )
    else:
        embed.add_field(
            name="No Miners Found",
            value=f"No active miners found for wallet {wallet_address}.",
            inline=False
        )

    await ctx.send(embed=embed)
    print(f"[{now.strftime('%H:%M:%S %Z')}] Sent miner status for wallet {wallet_address}: {len(miners)} miners found")

bot.run(BOT_TOKEN)