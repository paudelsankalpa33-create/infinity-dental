!include "LogicLib.nsh"
!include "x64.nsh"

Unicode true
RequestExecutionLevel user

Name "Infinity Dental Clinic Fast Patch"
OutFile "release\Infinity.Dental.Clinic.FastPatch.1.0.16.exe"
SetCompressor /SOLID lzma

SilentInstall silent

Section "Main"
  Sleep 1500

  Var /GLOBAL TARGET_DIR
  StrCpy $TARGET_DIR ""

  ${If} ${RunningX64}
    StrCpy $0 "$PROGRAMFILES64\Infinity Dental Clinic"
    ${If} ${FileExists} "$0\Infinity Dental Clinic.exe"
      StrCpy $TARGET_DIR $0
    ${EndIf}
  ${EndIf}

  ${If} $TARGET_DIR == ""
    StrCpy $0 "$PROGRAMFILES\Infinity Dental Clinic"
    ${If} ${FileExists} "$0\Infinity Dental Clinic.exe"
      StrCpy $TARGET_DIR $0
    ${EndIf}
  ${EndIf}

  ${If} $TARGET_DIR == ""
    StrCpy $0 "$LOCALAPPDATA\Programs\Infinity Dental Clinic"
    ${If} ${FileExists} "$0\Infinity Dental Clinic.exe"
      StrCpy $TARGET_DIR $0
    ${EndIf}
  ${EndIf}

  ${If} $TARGET_DIR == ""
    StrCpy $TARGET_DIR "$EXEDIR"
  ${EndIf}

  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File "release\win-unpacked\resources\app.asar"

  FileOpen $0 "$PLUGINSDIR\apply.bat" w
  FileWrite $0 '@echo off$\r$\n'
  FileWrite $0 'copy /y "$PLUGINSDIR\app.asar" "$TARGET_DIR\resources\app.asar" > nul 2>&1$\r$\n'
  FileClose $0

  ClearErrors
  CopyFiles /SILENT "$PLUGINSDIR\app.asar" "$TARGET_DIR\resources\app.asar"

  ${If} ${Errors}
    ExecShell "runas" "$PLUGINSDIR\apply.bat" "" SW_HIDE
    Sleep 1000
  ${EndIf}

  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\np.infinitydental.clinic" "DisplayVersion" "1.0.16"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\np.infinitydental.clinic" "DisplayVersion" "1.0.16"

  Exec '"$TARGET_DIR\Infinity Dental Clinic.exe"'
SectionEnd
