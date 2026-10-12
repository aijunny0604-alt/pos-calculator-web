$ErrorActionPreference = 'Stop'
$movisRoot = $PSScriptRoot
$movisRuntime = Join-Path $movisRoot '.movis-runtime'
$movisConfig = Join-Path $movisRuntime 'mobile-config.json'
try {
  if (-not (Test-Path -LiteralPath $movisConfig)) { throw '고정 HTTPS 터널을 먼저 연결한 뒤 .movis-runtime/mobile-config.json에 origin을 설정하세요. 사용설명서를 확인하세요.' }
  $movisNode = (Get-Command node -ErrorAction Stop).Source
  if (Get-NetTCPConnection -LocalPort 43128 -State Listen -ErrorAction SilentlyContinue) { throw '모바일 게이트웨이가 이미 실행 중입니다. 새 연결 링크가 필요하면 기존 게이트웨이를 종료한 후 실행하세요.' }
  & (Join-Path $movisRoot 'Start-MOVIS.ps1')
  $movisProcess = Start-Process -FilePath $movisNode -ArgumentList @('"' + (Join-Path $movisRoot 'bridge\mobile-gateway.mjs') + '"') -WorkingDirectory $movisRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $movisRuntime 'mobile.log') -RedirectStandardError (Join-Path $movisRuntime 'mobile-error.log')
  $movisProcess.Id | Set-Content -LiteralPath (Join-Path $movisRuntime 'mobile.pid')
  for ($movisAttempt=0; $movisAttempt -lt 20; $movisAttempt++) {
    Start-Sleep -Milliseconds 250
    if (Get-NetTCPConnection -LocalPort 43128 -State Listen -ErrorAction SilentlyContinue) {
      Start-Process notepad.exe -ArgumentList @('"' + (Join-Path $movisRuntime 'mobile-pairing.txt') + '"')
      exit 0
    }
  }
  throw '모바일 게이트웨이 시작 실패: .movis-runtime/mobile-error.log를 확인하세요.'
} catch { Write-Host $_.Exception.Message -ForegroundColor Red; Read-Host 'Enter를 누르면 닫힙니다'; exit 1 }
