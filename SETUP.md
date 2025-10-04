# Setup Guide for GitHub Pages Deployment

This guide will help you deploy your Critter Quest Lootable Plots Tracker to GitHub Pages.

## Prerequisites

- A GitHub account
- Git installed on your computer
- Basic knowledge of GitHub repositories

## Step 1: Create a GitHub Repository

1. Go to [GitHub.com](https://github.com) and sign in
2. Click the "+" icon in the top right corner
3. Select "New repository"
4. Name your repository (e.g., `critter-quest-tracker`)
5. Make sure it's set to **Public** (required for free GitHub Pages)
6. **Don't** initialize with README, .gitignore, or license
7. Click "Create repository"

## Step 2: Upload Your Files

### Option A: Using Git Command Line (Recommended)

1. Open terminal/command prompt in your project folder
2. Initialize git repository:
   ```bash
   git init
   ```
3. Add remote origin:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY_NAME.git
   ```
4. Add all files:
   ```bash
   git add .
   ```
5. Commit the files:
   ```bash
   git commit -m "Initial commit: Critter Quest Lootable Plots Tracker"
   ```
6. Push to GitHub:
   ```bash
   git push -u origin main
   ```

### Option B: Using GitHub Web Interface

1. Go to your repository page
2. Click "uploading an existing file"
3. Drag and drop all your files (index.html, styles.css, script.js, etc.)
4. Add a commit message
5. Click "Commit changes"

## Step 3: Enable GitHub Pages

1. Go to your repository on GitHub
2. Click on the "Settings" tab
3. Scroll down to the "Pages" section in the left sidebar
4. Under "Source", select "Deploy from a branch"
5. Choose "main" branch and "/ (root)" folder
6. Click "Save"

## Step 4: Access Your Website

- Your website will be available at: `https://YOUR_USERNAME.github.io/YOUR_REPOSITORY_NAME`
- It may take a few minutes for the site to become available
- GitHub will show you the URL once deployment is complete

## Step 5: Custom Domain (Optional)

If you want to use a custom domain:

1. In the Pages settings, enter your domain name
2. Add a `CNAME` file to your repository with your domain name
3. Configure DNS settings with your domain provider

## Troubleshooting

### Site Not Loading
- Wait 5-10 minutes for GitHub Pages to deploy
- Check that all files are in the root directory
- Ensure your repository is public

### CORS Issues
- The website uses CORS proxy services to access the API
- If you encounter issues, you may need to set up your own proxy server
- Consider using services like Netlify Functions or Vercel for serverless functions

### API Token Issues
- The API token in the code may expire
- Update the `COOKIE` value in `script.js` when needed
- Consider implementing a more robust authentication system

## Updating Your Site

To update your website:

1. Make changes to your files locally
2. Commit and push to GitHub:
   ```bash
   git add .
   git commit -m "Update website"
   git push origin main
   ```
3. GitHub Pages will automatically redeploy your site

## File Structure

Your repository should contain:
```
├── index.html          # Main HTML file
├── styles.css          # CSS styles
├── script.js           # JavaScript functionality
├── README.md           # Project documentation
├── SETUP.md            # This setup guide
├── deploy.bat          # Windows deployment script
├── deploy.sh           # Linux/Mac deployment script
├── .github/
│   └── workflows/
│       └── deploy.yml  # GitHub Actions workflow
└── _config.yml         # GitHub Pages configuration
```

## Support

If you encounter any issues:

1. Check the GitHub Pages documentation
2. Review the browser console for JavaScript errors
3. Ensure all file paths are correct
4. Verify that your repository is public

## Security Notes

- The website uses only the game access token needed for API calls (no Discord tokens)
- The API token is visible in the client-side code (acceptable for this use case)
- Never commit Discord bot tokens or other sensitive credentials to public repositories
- The original Discord bot file has been removed for security

## Performance Tips

- The site automatically refreshes every 30 minutes
- Data is cached locally for better performance
- Consider implementing service workers for offline functionality

Your Critter Quest Lootable Plots Tracker is now ready to go live on GitHub Pages!
