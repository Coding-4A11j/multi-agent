# Multi-Agent System Setup Script
param(
  [string]$OpenAIKey = "",
  [string]$DatabaseUrl = "postgresql://postgres:password@localhost:5432/multi_agent"
)

Write-Host "=== Multi-Agent System Setup ===" -ForegroundColor Cyan

# Write .env
$envContent = @"
DATABASE_URL="$DatabaseUrl"
OPENAI_API_KEY="$OpenAIKey"
PORT=3001
HOST=0.0.0.0
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3001
"@

Set-Content -Path "apps\api\.env" -Value $envContent
Set-Content -Path "apps\web\.env.local" -Value "NEXT_PUBLIC_API_URL=http://localhost:3001"

Write-Host "✓ Environment files written" -ForegroundColor Green

# Install dependencies
Write-Host "`nInstalling dependencies..." -ForegroundColor Yellow
npm install

# Generate Prisma client
Write-Host "`nGenerating Prisma client..." -ForegroundColor Yellow
Set-Location "apps\api"
npx prisma generate

# Push DB schema
Write-Host "`nPushing database schema..." -ForegroundColor Yellow
npx prisma db push

Set-Location "..\..\"

# Install Playwright browsers (chromium only)
Write-Host "`nInstalling Playwright Chromium..." -ForegroundColor Yellow
npx playwright install chromium

Write-Host "`n=== Setup complete! ===" -ForegroundColor Green
Write-Host "Run: npm run dev" -ForegroundColor Cyan
Write-Host "  API → http://localhost:3001" -ForegroundColor White
Write-Host "  Web → http://localhost:3000" -ForegroundColor White
