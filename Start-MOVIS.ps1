$ErrorActionPreference = 'Stop'
$movisRoot = $PSScriptRoot
$movisUrl = 'http://127.0.0.1:43127/pos-calculator-web/'
$movisRuntime = Join-Path $movisRoot '.movis-runtime'
New-Item -ItemType Directory -Force -Path $movisRuntime | Out-Null
try {
  $movisNode = (Get-Command node -ErrorAction Stop).Source
  $movisRunning = $false
  try {
    $movisCheck = Invoke-RestMethod -Uri 'http://127.0.0.1:43127/api/movis/session' -Headers @{ 'X-Movis-Client' = 'pos' } -TimeoutSec 2
    $movisRunning = [bool]$movisCheck.token
  } catch { }
  if (-not $movisRunning) {
    $movisProcess = Start-Process -FilePath $movisNode -ArgumentList @('"' + (Join-Path $movisRoot 'bridge\server.mjs') + '"') -WorkingDirectory $movisRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $movisRuntime 'server.log') -RedirectStandardError (Join-Path $movisRuntime 'server-error.log')
    $movisProcess.Id | Set-Content -LiteralPath (Join-Path $movisRuntime 'server.pid')
    for ($movisAttempt = 0; $movisAttempt -lt 20; $movisAttempt++) {
      Start-Sleep -Milliseconds 250
      try { $null = Invoke-RestMethod -Uri 'http://127.0.0.1:43127/api/movis/session' -Headers @{ 'X-Movis-Client' = 'pos' } -TimeoutSec 1; $movisRunning = $true; break } catch { }
    }
    if (-not $movisRunning) { throw 'MOVIS 연결 프로그램이 시작되지 않았습니다. .movis-runtime/server-error.log를 확인해주세요.' }
  }
  Start-Process $movisUrl
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
  Read-Host 'Enter를 누르면 닫힙니다'
  exit 1
}
