; SederPlusSetup.exe — one installer, all three programs.
;
; Built by scripts/build-installer.mjs, which passes the version in on the
; command line. Inno Setup 6 is pre-installed on GitHub's windows runners, so
; the release workflow needs nothing extra.
;
; This file is saved as UTF-8 *with a BOM*: Inno Setup reads a .iss without one
; in the system's ANSI codepage, and the Hebrew shortcut names below would come
; out as mojibake on the user's desktop.
;
; Two decisions worth stating:
;
;  * Per-user (PrivilegesRequired=lowest, installs under %LOCALAPPDATA%). No
;    UAC prompt on install and none on update, which is what lets the in-app
;    updater run the whole thing quietly. A per-machine install would put a
;    consent dialog in front of every automatic update.
;
;  * Quiet by default. Every page a wizard could show is suppressed: there is
;    nothing to choose here — three EXEs, one folder, two desktop shortcuts — so
;    the installer shows a progress bar and finishes. /SILENT and /VERYSILENT
;    work as usual for the updater, which passes /SILENT.

#define AppName "סדר פלוס"
#define AppExe "SederPlus.exe"
#define QuickExe "SederPlusQuick.exe"
#define AgentExe "SederPlusAgent.exe"
; The AppUserModelID the app raises its Windows notifications under (the
; `identifier` in src-tauri/full/tauri.conf.json). Stamped onto the Start menu
; shortcut below so Windows recognises the toasts as this app - they group
; under one name in the Action Center and get one entry in Windows' own
; notification settings.
#define ToastAppId "il.co.9900.sederplus"
#define Publisher "סדר פלוס"

#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif
#ifndef VersionLabel
  #define VersionLabel "1"
#endif
#ifndef SourceDir
  #define SourceDir "..\release-win"
#endif
#ifndef OutputDir
  #define OutputDir "..\release-win"
#endif

[Setup]
AppId={{9E3C0B2E-6F42-4C1D-9A5B-7F1D0C4E51A7}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#VersionLabel}
VersionInfoVersion={#AppVersion}
VersionInfoProductName={#AppName}
AppPublisher={#Publisher}
DefaultDirName={localappdata}\SederPlus
DefaultGroupName={#AppName}
UninstallDisplayName={#AppName}
UninstallDisplayIcon={app}\{#AppExe}
OutputDir={#OutputDir}
OutputBaseFilename=SederPlusSetup
SetupIconFile=..\src-tauri\full\icons\icon.ico
Compression=lzma2/max
SolidCompression=yes
; Per-user: no administrator prompt, on install or on update.
PrivilegesRequired=lowest
; Nothing to decide, so nothing to ask.
DisableWelcomePage=yes
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
WizardStyle=modern
; Lets the installer replace an EXE that is running — which is exactly the
; case when the app updates itself.
CloseApplications=force
RestartApplications=no

[Files]
Source: "{#SourceDir}\{#AppExe}"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#SourceDir}\{#QuickExe}"; DestDir: "{app}"; Flags: ignoreversion
; The background reminder process. It gets no shortcut anywhere: it is started
; by the app when the switch in Settings is turned on, and by the Run entry
; that switch writes. Nobody is meant to double-click it.
Source: "{#SourceDir}\{#AgentExe}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
; Both programs get a desktop shortcut — the quick window is the one most
; people open every day, so burying it in the Start menu would be wrong.
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; IconFilename: "{app}\{#AppExe}"
Name: "{autodesktop}\כניסה מהירה - {#AppName}"; Filename: "{app}\{#QuickExe}"; IconFilename: "{app}\{#QuickExe}"
; The Start menu shortcut carries the AppUserModelID. That is what makes a
; Windows notification from either the app or SederPlusAgent.exe show up as
; this app rather than as an unidentified program: they raise their toasts
; under the same ID (see src-tauri/agent/src/main.rs), and Windows resolves it
; through this shortcut.
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExe}"; AppUserModelID: "{#ToastAppId}"
Name: "{group}\כניסה מהירה - {#AppName}"; Filename: "{app}\{#QuickExe}"
Name: "{group}\הסרת {#AppName}"; Filename: "{uninstallexe}"

[Registry]
; The "start with Windows" entry is written by the app itself, not here — it
; is a setting, not part of the install. This only makes sure an uninstall
; does not leave it pointing at an EXE that is gone. The value name must match
; RUN_VALUE_NAME in src-tauri/core/src/background.rs.
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueName: "SederPlusAgent"; Flags: dontcreatekey uninsdeletevalue

[Run]
; A plain `nowait` entry rather than `postinstall`: a postinstall item is a
; checkbox on the Finished page, and a silent install — which is how the app
; updates itself — never shows that page, so the app would never come back up.
Filename: "{app}\{#AppExe}"; Flags: nowait

[UninstallRun]
; Stop the agent before its EXE is deleted out from under it.
Filename: "{sys}\taskkill.exe"; Parameters: "/f /im {#AgentExe}"; Flags: runhidden; RunOnceId: "StopAgent"

[UninstallDelete]
; The data in %APPDATA%\SederPlus is the user's own and is never touched by an
; uninstall — only what the installer itself put down.
Type: dirifempty; Name: "{app}"

[Code]
// SederPlusAgent.exe has no window, and CloseApplications works by asking
// windows to close. An update — which the app runs silently, in place, over
// files that are in use — would otherwise fail on the one file that is
// running and cannot be asked to stop.
//
// It comes back on its own: the [Run] entry starts SederPlus.exe, which
// starts the agent again if the switch is on (see core/src/lib.rs).
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/f /im {#AgentExe}', '',
       SW_HIDE, ewWaitUntilTerminated, ResultCode);
  // Nothing here can fail in a way worth stopping an install for: if the
  // agent was not running, taskkill returns non-zero and that is correct.
  Result := '';
end;
