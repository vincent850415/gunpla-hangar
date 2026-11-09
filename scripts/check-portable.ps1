$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$version = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
$name = "Gunpla-Hangar-v$version-windows-x64"
$zip = Join-Path $projectRoot "releases\$name.zip"
$expected = ((Get-Content -LiteralPath "$zip.sha256" -Raw) -split '\s+')[0]
if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'ZIP checksum mismatch' }
$extract = Join-Path $projectRoot ('.release-work\verify-' + [guid]::NewGuid().ToString())
Expand-Archive -LiteralPath $zip -DestinationPath $extract
$portable = Join-Path $extract $name
$manifest = Get-Content -LiteralPath (Join-Path $portable 'release-manifest.json') -Raw | ConvertFrom-Json
foreach ($asset in $manifest.assets) {
  if ((Get-FileHash -LiteralPath (Join-Path $portable $asset.path) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $asset.sha256) { throw "Packaged model checksum mismatch: $($asset.path)" }
}
$node = Join-Path $portable 'runtime\node.exe'
if ((& $node --version) -ne $manifest.nodeVersion) { throw 'Bundled Node version mismatch' }
$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$listener.Start(); $port = $listener.LocalEndpoint.Port; $listener.Stop()
$previousPort = $env:PORT
try {
  $env:PORT = "$port"
  $process = Start-Process -FilePath $node -ArgumentList ('"' + (Join-Path $portable 'scripts\serve.mjs') + '"') -WorkingDirectory $portable -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $extract 'server.log') -RedirectStandardError (Join-Path $extract 'server-error.log')
  $ready = $false
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    Start-Sleep -Milliseconds 250
    try { if ((Invoke-WebRequest "http://127.0.0.1:$port/health" -UseBasicParsing -TimeoutSec 1).Content -eq 'hangar-collection-v1') { $ready = $true; break } } catch {}
    if ($process.HasExited) { throw 'Portable server exited' }
  }
  if (-not $ready) { throw 'Portable server did not start' }
  $page = Invoke-WebRequest "http://127.0.0.1:$port/" -UseBasicParsing
  if ($page.Content -notmatch 'Gunpla Hangar') { throw 'Packaged page missing' }
  foreach ($asset in @('/paddle/worker.js', '/paddle/runtime.js', '/paddle/PP-OCRv6_small_det.tar', '/paddle/PP-OCRv6_medium_rec.tar', '/ocr/eng.traineddata.gz')) {
    $response = Invoke-WebRequest "http://127.0.0.1:$port$asset" -Method Head -UseBasicParsing
    if ($response.StatusCode -ne 200) { throw "Portable asset unavailable: $asset" }
  }
  Write-Output "PASS: extracted ZIP, all model hashes, bundled Node $($manifest.nodeVersion), isolated local server and OCR assets"
} finally {
  $env:PORT = $previousPort
  if ($process -and -not $process.HasExited) { $process.Kill(); $process.WaitForExit() }
}
