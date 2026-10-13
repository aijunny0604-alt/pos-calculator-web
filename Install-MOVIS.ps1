param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
try {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js LTS를 먼저 설치해주세요: https://nodejs.org/'
  }
  $movisBinRoot = Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\bin'
  $movisBinaries = @(Get-ChildItem -LiteralPath $movisBinRoot -Filter codex.exe -Recurse -ErrorAction SilentlyContinue)
  if ($movisBinaries.Count -eq 0) {
    throw 'Codex 데스크톱 앱을 설치하고 한 번 실행해주세요. 이 설치 파일에는 Codex나 로그인 정보가 포함되어 있지 않습니다.'
  }
  $movisFiles = @('dist', 'bridge', 'package.json', 'Start-MOVIS.cmd', 'Start-MOVIS.ps1', '사용설명.md')
  foreach ($movisFile in $movisFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot $movisFile))) {
      throw "설치 파일 누락: $movisFile. ZIP 전체를 먼저 압축 해제해주세요."
    }
  }
  if ($CheckOnly) { Write-Output 'PASS: 설치 구성 및 Node.js·Codex 확인'; exit 0 }

  $movisDestination = Join-Path $env:LOCALAPPDATA 'MOVIS-Intelligence'
  New-Item -ItemType Directory -Path $movisDestination -Force | Out-Null
  # 명시한 프로그램 파일만 복사한다. 원본 PC의 인증·로그·바로가기는 복사하지 않는다.
  if ([IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\') -ne [IO.Path]::GetFullPath($movisDestination).TrimEnd('\')) {
    foreach ($movisFile in $movisFiles) {
      Copy-Item -LiteralPath (Join-Path $PSScriptRoot $movisFile) -Destination $movisDestination -Recurse -Force
    }
  }
  $movisShell = New-Object -ComObject WScript.Shell
  $movisPowerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $movisArguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $movisDestination 'Start-MOVIS.ps1') + '"'
  $movisLinks = @(
    @{Path=(Join-Path ([Environment]::GetFolderPath('Desktop')) 'MOVE POS.lnk'); Arguments=$movisArguments},
    @{Path=(Join-Path ([Environment]::GetFolderPath('Startup')) 'MOVIS 자동 연결.lnk'); Arguments=($movisArguments + ' -BackgroundOnly')}
  )
  foreach ($movisEntry in $movisLinks) {
    $movisShortcut = $movisShell.CreateShortcut($movisEntry.Path)
    $movisShortcut.TargetPath = $movisPowerShell
    $movisShortcut.Arguments = $movisEntry.Arguments
    $movisShortcut.WorkingDirectory = $movisDestination
    $movisShortcut.WindowStyle = 7
    $movisShortcut.Description = 'MOVE POS를 열고 이 PC의 GPT 연결 프로그램을 자동 실행합니다.'
    $movisShortcut.Save()
  }
  Write-Output '설치 완료. 바탕화면 MOVE POS를 열고 본인의 ChatGPT 계정으로 연결하세요.'
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
