# Create district_forecasts.tar.gz for GitHub release upload and CI restore.
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $Root

$paths = @(
    Join-Path $Root "public\district_forecasts"
    Join-Path $Root "backend\report\district_forecasts"
)

$files = @()
foreach ($dir in $paths) {
    if (Test-Path $dir) {
        $files += Get-ChildItem -Path $dir -Filter "*.json" -Recurse -File -ErrorAction SilentlyContinue
    }
}

if ($files.Count -eq 0) {
    Write-Error "No district cache files found. Run: python backend/scripts/prepare_district_caches.py"
}

$tarPath = Join-Path $Root "district_forecasts.tar.gz"
if (Test-Path $tarPath) { Remove-Item $tarPath -Force }

# Build paths relative to repo root for tar (Git Bash tar or Windows tar)
$relPaths = @()
foreach ($dir in $paths) {
    if (Test-Path $dir) {
        $rel = $dir.Substring($Root.Length).TrimStart("\", "/") -replace "\\", "/"
        $relPaths += $rel
    }
}

$tar = Get-Command tar -ErrorAction SilentlyContinue
if (-not $tar) {
    Write-Error "tar not found. Install Git for Windows (includes tar) or use Windows 10+ built-in tar."
}

& tar -czf $tarPath @relPaths
$sizeMb = [math]::Round((Get-Item $tarPath).Length / 1MB, 1)
Write-Host "Packaged $($files.Count) cache files into district_forecasts.tar.gz (${sizeMb} MB)."
