$ErrorActionPreference = 'Stop'
$projectPath = $PSScriptRoot
$appUrl = 'http://127.0.0.1:4173'
try {
    $health = Invoke-WebRequest -Uri "$appUrl/health" -UseBasicParsing -TimeoutSec 2
    if ($health.Content -eq 'hangar-collection-v1') { Start-Process $appUrl; exit }
    throw 'Port 4173 is already used by another app.'
} catch {
    if ($_.Exception.Message -like '*already used*') { throw }
}
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$bundledRuntime = Join-Path $projectPath 'runtime\node.exe'
$runtimePath = if (Test-Path -LiteralPath $bundledRuntime) { $bundledRuntime } elseif ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
if (-not (Test-Path -LiteralPath $runtimePath)) { throw 'Node.js 22+ is required. Install Node.js, then run this launcher again.' }
if (-not (Test-Path -LiteralPath (Join-Path $projectPath 'dist\index.html'))) { throw 'Missing build. Run npm install, npm run prepare:ocr, and npm run build first.' }
$serverScript = Join-Path $projectPath 'scripts\serve.mjs'
$serverProcess = Start-Process -FilePath $runtimePath -ArgumentList ('"' + $serverScript + '"') -WorkingDirectory $projectPath -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $projectPath 'server.log') -RedirectStandardError (Join-Path $projectPath 'server-error.log')
for ($attempt = 0; $attempt -lt 40; $attempt++) {
    Start-Sleep -Milliseconds 250
    try {
        $health = Invoke-WebRequest -Uri "$appUrl/health" -UseBasicParsing -TimeoutSec 1
        if ($health.Content -eq 'hangar-collection-v1') { Start-Process $appUrl; exit }
    } catch {}
    if ($serverProcess.HasExited) { throw 'Server could not start. Check server-error.log.' }
}
throw 'Server did not become ready. Check server-error.log.'
