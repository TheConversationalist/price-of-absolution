# One-time GitHub push setup for this repo (run in PowerShell).
$ErrorActionPreference = 'Stop'

$git = 'C:\Program Files\Git\cmd\git.exe'
$gh = 'C:\Program Files\GitHub CLI\gh.exe'
if (-not (Test-Path $gh)) {
  $gh = (Get-Command gh -ErrorAction SilentlyContinue)?.Source
}
if (-not (Test-Path $gh)) {
  Write-Error 'GitHub CLI (gh) not found. Install: winget install GitHub.cli'
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$name = git config user.name 2>$null
$email = git config user.email 2>$null
if (-not $name) {
  $name = Read-Host 'Git commit name (e.g. Jane Smith)'
  & $git config user.name $name
}
if (-not $email) {
  $email = Read-Host 'Git commit email (GitHub noreply or your email)'
  & $git config user.email $email
}

Write-Host "`nSigning in to GitHub (browser)..."
& $gh auth login -h github.com -p https -w
& $gh auth setup-git

Write-Host "`nRemote:"
& $git remote -v
Write-Host "`nDone. Commit your work, then push:"
Write-Host "  git add -A"
Write-Host "  git commit -m `"your message`""
Write-Host "  git push origin main"
Write-Host "`nIf push is denied, fork the repo on GitHub and run:"
Write-Host "  gh repo fork TheConversationalist/price-of-absolution --remote=true"
