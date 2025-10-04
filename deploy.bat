@echo off
echo 🚀 Preparing Critter Quest Lootable Plots Tracker for GitHub Pages...

REM Check if we're in a git repository
if not exist ".git" (
    echo ❌ Error: Not in a git repository. Please initialize git first.
    pause
    exit /b 1
)

REM Check if files exist
set required_files=index.html styles.css script.js README.md
for %%f in (%required_files%) do (
    if not exist "%%f" (
        echo ❌ Error: Required file %%f not found.
        pause
        exit /b 1
    )
)

echo ✅ All required files found.

REM Create .gitignore if it doesn't exist
if not exist ".gitignore" (
    echo 📝 Creating .gitignore...
    (
        echo # OS generated files
        echo .DS_Store
        echo .DS_Store?
        echo ._*
        echo .Spotlight-V100
        echo .Trashes
        echo ehthumbs.db
        echo Thumbs.db
        echo.
        echo # IDE files
        echo .vscode/
        echo .idea/
        echo *.swp
        echo *.swo
        echo.
        echo # Logs
        echo *.log
        echo.
        echo # Runtime data
        echo pids
        echo *.pid
        echo *.seed
        echo *.pid.lock
        echo.
        echo # Coverage directory used by tools like istanbul
        echo coverage/
        echo.
        echo # Dependency directories
        echo node_modules/
        echo.
        echo # Optional npm cache directory
        echo .npm
        echo.
        echo # Optional REPL history
        echo .node_repl_history
        echo.
        echo # Output of 'npm pack'
        echo *.tgz
        echo.
        echo # Yarn Integrity file
        echo .yarn-integrity
        echo.
        echo # dotenv environment variables file
        echo .env
        echo.
        echo # Local development files
        echo local/
        echo temp/
    ) > .gitignore
)

REM Add and commit files
echo 📦 Adding files to git...
git add .

REM Check if there are changes to commit
git diff --staged --quiet
if %errorlevel% equ 0 (
    echo ℹ️  No changes to commit.
) else (
    echo 💾 Committing changes...
    git commit -m "Deploy Critter Quest Lootable Plots Tracker to GitHub Pages"
)

REM Push to main branch
echo 🚀 Pushing to main branch...
git push origin main

echo ✅ Deployment initiated!
echo.
echo 📋 Next steps:
echo 1. Go to your GitHub repository settings
echo 2. Navigate to 'Pages' section
echo 3. Select 'Deploy from a branch'
echo 4. Choose 'main' branch and '/ (root)' folder
echo 5. Your site will be available at: https://yourusername.github.io/critter_bot
echo.
echo 🎉 Your Critter Quest Lootable Plots Tracker is ready!
pause
