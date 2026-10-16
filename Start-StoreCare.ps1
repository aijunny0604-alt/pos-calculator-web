$ErrorActionPreference = 'Stop'
if (Get-NetTCPConnection -LocalPort 43128 -State Listen -ErrorAction SilentlyContinue) { Write-Output '스토어 문의 연결이 이미 실행 중입니다.'; exit 0 }
$careScript = Join-Path $PSScriptRoot 'bridge/store-care.mjs'
Start-Process -FilePath (Get-Command node).Source -ArgumentList @(('"' + $careScript + '"')) -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
Write-Output '스토어 문의 연결을 시작했습니다. POS에서 문의 조회를 눌러주세요.'
