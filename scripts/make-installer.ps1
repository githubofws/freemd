# FreeMD 一键打包：前端构建 + 单文件发布 + （若安装了 Inno Setup 6）编译安装包
# 产物：dist\FreeMD.exe（绿色版）与 dist\FreeMD-Setup-*.exe（安装包，需 Inno Setup 6）
# -SelfContained: 把 .NET 运行时打进 exe，最终用户零环境要求（推荐用于分发）
param(
  [switch]$SelfContained
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

if ($SelfContained) {
  powershell -ExecutionPolicy Bypass -File "$root\scripts\publish.ps1" -SelfContained
} else {
  powershell -ExecutionPolicy Bypass -File "$root\scripts\publish.ps1"
}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$iscc = @(
  "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
  "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($iscc) {
  Write-Host "==> 编译安装包（Inno Setup）" -ForegroundColor Cyan
  & $iscc "$root\scripts\installer\FreeMD.iss"
  Write-Host "==> 完成：$root\dist\FreeMD-Setup-*.exe" -ForegroundColor Green
} else {
  Write-Host "==> 未安装 Inno Setup 6，跳过安装包（已有绿色版 dist\FreeMD.exe）" -ForegroundColor Yellow
  Write-Host "    安装后即可一键出安装包：https://jrsoftware.org/isdl.php"
}
