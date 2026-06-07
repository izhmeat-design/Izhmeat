$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$projectRoot = Split-Path -Parent $PSScriptRoot
$nodeRoot = Join-Path $projectRoot ".tools\node"
New-Item -ItemType Directory -Force -Path $nodeRoot | Out-Null

if (-not [Environment]::Is64BitOperatingSystem) {
  throw "This automatic portable installer supports 64-bit Windows only. Please install Node.js LTS manually from https://nodejs.org/"
}

Write-Host "Looking for the latest Node.js LTS release..."
$releases = Invoke-RestMethod "https://nodejs.org/dist/index.json"
$release = $releases | Where-Object { $_.lts -ne $false -and $_.files -contains "win-x64-zip" } | Select-Object -First 1
if (-not $release) {
  throw "Could not find a Windows x64 Node.js LTS ZIP release."
}

$version = $release.version
$zipName = "node-$version-win-x64.zip"
$url = "https://nodejs.org/dist/$version/$zipName"
$zipPath = Join-Path $nodeRoot $zipName

Write-Host "Downloading $zipName..."
Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing

Write-Host "Extracting Node.js..."
Expand-Archive -Path $zipPath -DestinationPath $nodeRoot -Force
Remove-Item $zipPath -Force

Write-Host "Portable Node.js $version is ready."
