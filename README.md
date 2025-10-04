# Critter Quest Lootable Plots Tracker

A web-based tracker for monitoring upcoming lootable plots in Critter Quest. This project converts the original Discord bot functionality into a modern, responsive web interface.

## Features

- **Real-time Plot Tracking**: Monitor plots that will become lootable within configurable time windows
- **Interactive Dashboard**: View plots in table or card format with live countdown timers
- **Search & Filter**: Find specific plots by tile number, player, or wallet address
- **Statistics**: Overview of total plots, unique players, and average levels
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **Auto-refresh**: Data updates automatically every 30 minutes

## Live Demo

Visit the live website: [Critter Quest Lootable Plots Tracker](https://yourusername.github.io/critter_bot)

## How to Use

1. **Select Time Window**: Choose how far ahead to look for lootable plots (1-24 hours)
2. **Search**: Use the search bar to find specific plots by tile number or player
3. **View Options**: Switch between table and card views for different data presentations
4. **Quick Search**: Use the sidebar to quickly search by tile number or wallet address

## Data Source

This tracker uses data from the Critter Quest API at `cqg.critters.quest/api/mining/miners`.

## Technical Details

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Styling**: Custom CSS with modern design patterns
- **API**: Direct API calls with CORS proxy for browser compatibility
- **Hosting**: GitHub Pages
- **Auto-refresh**: Client-side polling every 30 minutes
- **Security**: No sensitive tokens or credentials in client-side code

## Setup for GitHub Pages

1. Fork this repository
2. Enable GitHub Pages in repository settings
3. Select source as "Deploy from a branch"
4. Choose "main" branch and "/ (root)" folder
5. Your site will be available at `https://yourusername.github.io/critter_bot`

## Browser Compatibility

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is open source and available under the MIT License.

## Disclaimer

This tool is for informational purposes only. Always verify data through official sources before making any in-game decisions.
