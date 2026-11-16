!include "LogicLib.nsh"
!include "x64.nsh"

Unicode true
RequestExecutionLevel user

Name "Infinity Dental Clinic Fast Patch"
OutFile "release\Infinity.Dental.Clinic.FastPatch.1.0.20.exe"
SetCompressor /SOLID lzma

SilentInstall silent

Section "Main"
  Sleep 1000

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

  StrCpy $1 "$TEMP\InfinityDentalPatch"
  CreateDirectory "$1"
  SetOutPath "$1"
  File "/oname=app.asar" "release\win-unpacked\resources\app.asar"

  FileOpen $0 "$1\apply.bat" w
  FileWrite $0 '@echo off$\r$\n'
  FileWrite $0 'taskkill /F /IM "Infinity Dental Clinic.exe" >nul 2>&1$\r$\n'
  FileWrite $0 'timeout /t 1 /nobreak >nul$\r$\n'
  FileWrite $0 ':retry$\r$\n'
  FileWrite $0 'copy /Y "$1\app.asar" "$TARGET_DIR\resources\app.asar" >nul 2>&1$\r$\n'
  FileWrite $0 'if errorlevel 1 ($\r$\n'
  FileWrite $0 '  timeout /t 1 /nobreak >nul$\r$\n'
  FileWrite $0 '  goto retry$\r$\n'
  FileWrite $0 ')$\r$\n'
  FileWrite $0 'reg add "HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall\np.infinitydental.clinic" /v "DisplayVersion" /t REG_SZ /d "1.0.20" /f >nul 2>&1$\r$\n'
  FileWrite $0 'reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\np.infinitydental.clinic" /v "DisplayVersion" /t REG_SZ /d "1.0.20" /f >nul 2>&1$\r$\n'
  FileWrite $0 'start "" "$TARGET_DIR\Infinity Dental Clinic.exe"$\r$\n'
  FileWrite $0 'timeout /t 2 /nobreak >nul$\r$\n'
  FileWrite $0 'rd /s /q "$1" >nul 2>&1$\r$\n'
  FileWrite $0 'exit$\r$\n'
  FileClose $0

  ClearErrors
  CopyFiles /SILENT "$1\app.asar" "$TARGET_DIR\resources\app.asar"

  ${If} ${Errors}
    ExecShell "runas" "$1\apply.bat" "" SW_HIDE
  ${Else}
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\np.infinitydental.clinic" "DisplayVersion" "1.0.20"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\np.infinitydental.clinic" "DisplayVersion" "1.0.20"
    Exec '"$TARGET_DIR\Infinity Dental Clinic.exe"'
    RMDir /r "$1"
  ${EndIf}
SectionEnd
