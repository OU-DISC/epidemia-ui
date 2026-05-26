# One-time local seed: build district caches and upload to GitHub release for CI.
# Requires: gh CLI authenticated, backend/report/report_data.json present.
$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root

function Get-GhExecutable {
    $cmd = Get-Command gh -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    $candidates = @(
        (Join-Path ${env:ProgramFiles} "GitHub CLI\gh.exe"),
        (Join-Path ${env:LOCALAPPDATA} "Programs\GitHub CLI\gh.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "GitHub CLI\gh.exe")
    )
    foreach ($path in $candidates) {
        if (Test-Path $path) { return $path }
    }
    return $null
}

$reportPath = Join-Path $Root "backend\report\report_data.json"
if (-not (Test-Path $reportPath)) {
    Write-Error "Missing $reportPath. Run the forecast pipeline or copy report_data.json first."
}

Write-Host "Building per-district cache files..."
python (Join-Path $Root "backend\scripts\prepare_district_caches.py")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& (Join-Path $Root ".github\scripts\package-district-caches.ps1")

$gzipPath = Join-Path $Root "report_data.json.gz"
$tarPath = Join-Path $Root "district_forecasts.tar.gz"

Write-Host "Compressing report_data.json..."
$inputStream = [System.IO.File]::OpenRead($reportPath)
$outputStream = [System.IO.File]::Create($gzipPath)
$gzipStream = New-Object System.IO.Compression.GzipStream($outputStream, [System.IO.Compression.CompressionLevel]::Optimal)
$inputStream.CopyTo($gzipStream)
$gzipStream.Close()
$outputStream.Close()
$inputStream.Close()

$ghExe = Get-GhExecutable
if (-not $env:GITHUB_REPOSITORY) {
    if ($ghExe) {
        $env:GITHUB_REPOSITORY = (& $ghExe repo view --json nameWithOwner -q .nameWithOwner)
    } else {
        $env:GITHUB_REPOSITORY = "OU-DISC/epidemia-ui"
    }
}

if (-not $ghExe) {
    Write-Host ""
    Write-Host "GitHub CLI (gh) is not installed or not on PATH. Files are ready for manual upload:"
    Write-Host "  $tarPath"
    Write-Host "  $gzipPath"
    Write-Host ""
    Write-Host "Upload via browser:"
    Write-Host "  1. Open https://github.com/$($env:GITHUB_REPOSITORY)/releases/new"
    Write-Host "  2. Choose tag: epidemia-forecast-data (create new tag)"
    Write-Host "  3. Title: EPIDEMIA forecast data"
    Write-Host "  4. Attach district_forecasts.tar.gz and report_data.json.gz"
    Write-Host "  5. Publish release, then push to master or run Refresh District Forecast Caches in Actions"
    Write-Host ""
    Write-Host "If gh is installed but not found, restart PowerShell or run:"
    Write-Host '  & "C:\Program Files\GitHub CLI\gh.exe" auth login'
    exit 0
}

$releaseTag = if ($env:EPIDEMIA_FORECAST_DATA_RELEASE) { $env:EPIDEMIA_FORECAST_DATA_RELEASE } else { "epidemia-forecast-data" }
$repo = $env:GITHUB_REPOSITORY

Write-Host "Uploading to release $releaseTag on $repo..."
$releaseExists = $false
try {
    & $ghExe release view $releaseTag --repo $repo 2>$null | Out-Null
    $releaseExists = ($LASTEXITCODE -eq 0)
} catch { }

if (-not $releaseExists) {
    & $ghExe release create $releaseTag `
        --repo $repo `
        --title "EPIDEMIA forecast data" `
        --notes "Per-district chart caches and report_data.json.gz for CI refresh."
}

& $ghExe release upload $releaseTag $tarPath $gzipPath --repo $repo --clobber
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Done. Push to master or run the Refresh District Forecast Caches workflow in GitHub Actions."
