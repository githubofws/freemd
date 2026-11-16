; FreeMD 安装包脚本（Inno Setup 6 编译）
; 用法：
;   1) powershell -ExecutionPolicy Bypass -File scripts\publish.ps1   （生成 dist\FreeMD.exe）
;   2) 安装 Inno Setup 6: https://jrsoftware.org/isdl.php
;   3) "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" scripts\installer\FreeMD.iss
; 产物：dist\FreeMD-Setup-<版本>.exe
; 或者直接一键：powershell -ExecutionPolicy Bypass -File scripts\make-installer.ps1

#define MyAppName "FreeMD"
#define MyAppVersion "1.0.0"
#define MyAppExeName "FreeMD.exe"

[Setup]
AppId={{7F2C5A18-93D4-4E61-B08C-F1E5A2B3C4D9}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
; PrivilegesRequired=lowest → {autopf} 解析为 %LOCALAPPDATA%\Programs\FreeMD，无需管理员
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
PrivilegesRequired=lowest
OutputDir=..\..\dist
OutputBaseFilename=FreeMD-Setup-{#MyAppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
SetupIconFile=..\..\src\MyTypora.App\icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
ArchitecturesInstallIn64BitMode=x64compatible

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式(&D)"; GroupDescription: "附加任务："
Name: "mdassoc"; Description: "把 FreeMD 加入 .md 文件的打开方式列表(&M)"; GroupDescription: "附加任务："; Flags: unchecked

[Files]
Source: "..\..\dist\FreeMD.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\卸载 {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Registry]
; 以“打开方式”候选加入（不抢占用户现有的默认关联）；卸载时一并清理
Root: HKA; Subkey: "Software\Classes\FreeMD.md"; ValueType: string; ValueData: "Markdown 文档 (FreeMD)"; Flags: uninsdeletekey; Tasks: mdassoc
Root: HKA; Subkey: "Software\Classes\FreeMD.md\DefaultIcon"; ValueType: string; ValueData: "{app}\{#MyAppExeName},0"; Tasks: mdassoc
Root: HKA; Subkey: "Software\Classes\FreeMD.md\shell\open\command"; ValueType: string; ValueData: """{app}\{#MyAppExeName}"" ""%1"""; Tasks: mdassoc
Root: HKA; Subkey: "Software\Classes\.md\OpenWithProgids"; ValueType: string; ValueName: "FreeMD.md"; ValueData: ""; Tasks: mdassoc

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "立即运行 {#MyAppName}"; Flags: nowait postinstall skipifsilent

; 官方 Inno 6 不带简中语言包；下载 ChineseSimplified.isl 放入 Inno 的 Languages 目录后启用以下两行
; [Languages]
; Name: "chinesesimplified"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"
