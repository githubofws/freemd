# FreeMD publish script
# Default: framework-dependent single file (~10 MB; target machine needs .NET 10 Desktop Runtime)
# -SelfContained: bundle the .NET runtime into the exe (zero dependency on target, much larger)
param(
  [switch]$SelfContained
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

Write-Host "==> Building frontend" -ForegroundColor Cyan
Push-Location "$root/web"
npm run build
Pop-Location

Write-Host "==> Publishing WPF single file" -ForegroundColor Cyan
$pubArgs = @(
  'publish', "$root/src/MyTypora.App/MyTypora.App.csproj",
  '-c', 'Release',
  '-r', 'win-x64',
  '-p:PublishSingleFile=true',
  '-p:IncludeAllContentForSelfExtract=true',
  '-o', "$root/dist"
)
if ($SelfContained) {
  # 压缩单文件：体积减半，代价是首次启动稍慢（解压到内存）
  $pubArgs += @('--self-contained', 'true', '-p:EnableCompressionInSingleFile=true')
} else {
  $pubArgs += @('--self-contained', 'false')
}
dotnet @pubArgs

Write-Host "==> Done: $root\dist\FreeMD.exe" -ForegroundColor Green
