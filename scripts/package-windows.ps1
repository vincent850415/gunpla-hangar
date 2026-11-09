param([string]$NodeVersion = 'v24.22.2')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$version = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
$packageName = "Gunpla-Hangar-v$version-windows-x64"
$workRoot = Join-Path $projectRoot ('.release-work\' + [guid]::NewGuid().ToString())
$stage = Join-Path $workRoot $packageName
$output = Join-Path $projectRoot 'releases'
New-Item -ItemType Directory -Path $stage, $output -Force | Out-Null
$runtimeArchive = "node-$NodeVersion-win-x64.zip"
$baseUrl = "https://nodejs.org/dist/$NodeVersion"
Invoke-WebRequest "$baseUrl/SHASUMS256.txt" -OutFile (Join-Path $workRoot 'SHASUMS256.txt') -UseBasicParsing
Invoke-WebRequest "$baseUrl/$runtimeArchive" -OutFile (Join-Path $workRoot $runtimeArchive) -UseBasicParsing
$checksumLine = Get-Content -LiteralPath (Join-Path $workRoot 'SHASUMS256.txt') | Where-Object { ($_ -split '\s+')[-1] -eq $runtimeArchive }
if (@($checksumLine).Count -ne 1) { throw 'Node checksum entry missing or ambiguous' }
$nodeHash = (Get-FileHash -LiteralPath (Join-Path $workRoot $runtimeArchive) -Algorithm SHA256).Hash.ToLowerInvariant()
if ($nodeHash -ne ($checksumLine -split '\s+')[0]) { throw 'Node download checksum mismatch' }
Expand-Archive -LiteralPath (Join-Path $workRoot $runtimeArchive) -DestinationPath $workRoot
New-Item -ItemType Directory -Path (Join-Path $stage 'runtime'), (Join-Path $stage 'scripts') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $workRoot "node-$NodeVersion-win-x64\node.exe") -Destination (Join-Path $stage 'runtime')
Copy-Item -LiteralPath (Join-Path $workRoot "node-$NodeVersion-win-x64\LICENSE") -Destination (Join-Path $stage 'runtime\NODE-LICENSE.txt')
$dist = Join-Path $projectRoot 'dist'
if (-not (Test-Path -LiteralPath (Join-Path $dist 'index.html'))) { throw 'Run npm run build first' }
Copy-Item -LiteralPath $dist -Destination $stage -Recurse
foreach ($name in @('Start.cmd', 'Start.ps1', 'README.md', 'THIRD_PARTY.md')) { Copy-Item -LiteralPath (Join-Path $projectRoot $name) -Destination $stage }
Push-Location $projectRoot
try {
  & node (Join-Path $PSScriptRoot 'collect-notices.mjs') (Join-Path $stage 'THIRD-PARTY-LICENSES.txt')
  if ($LASTEXITCODE -ne 0) { throw 'Could not collect third-party license notices' }
} finally { Pop-Location }
Copy-Item -LiteralPath (Join-Path $projectRoot 'scripts\serve.mjs') -Destination (Join-Path $stage 'scripts')
$assets = @()
foreach ($directory in @('paddle', 'ocr')) {
  foreach ($file in Get-ChildItem -LiteralPath (Join-Path $projectRoot "public\$directory") -File) {
    $packaged = Join-Path $stage "dist\$directory\$($file.Name)"
    if (-not (Test-Path -LiteralPath $packaged)) { throw "Missing packaged OCR asset: $packaged" }
    $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($hash -ne (Get-FileHash -LiteralPath $packaged -Algorithm SHA256).Hash.ToLowerInvariant()) { throw "Stale build asset: $packaged" }
    if ($file.Length -lt 500 -and (Get-Content -LiteralPath $file.FullName -Raw) -match '^version https://git-lfs.github.com/spec/v1') { throw 'Git LFS objects not downloaded. Run git lfs pull.' }
    $assets += @{ path = "dist/$directory/$($file.Name)"; sha256 = $hash; bytes = $file.Length }
  }
}
foreach ($required in @('dist/paddle/PP-OCRv6_small_det.tar', 'dist/paddle/PP-OCRv6_medium_rec.tar', 'dist/ocr/eng.traineddata.gz')) {
  if ($required -notin $assets.path) { throw "Required model missing: $required" }
}
$commit = git -C $projectRoot rev-parse HEAD
@{ version = $version; sourceCommit = $commit; nodeVersion = $NodeVersion; nodeArchiveSha256 = $nodeHash; assets = $assets } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $stage 'release-manifest.json') -Encoding UTF8
$zip = Join-Path $output "$packageName.zip"
if (Test-Path -LiteralPath $zip) { throw "Already exists: $zip" }
Compress-Archive -LiteralPath $stage -DestinationPath $zip -CompressionLevel Optimal
$zipHash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
"$zipHash  $packageName.zip" | Set-Content -LiteralPath "$zip.sha256" -Encoding ASCII
Write-Output "Created $zip"
