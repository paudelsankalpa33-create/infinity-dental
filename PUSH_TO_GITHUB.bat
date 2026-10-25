@echo off
title Push Infinity Dental Clinic to GitHub
echo ========================================================
echo Pushing Infinity Dental Clinic to GitHub:
echo URL: https://github.com/Sankalpannt/dental-
echo ========================================================
git branch -M main
git push -u origin main
echo ========================================================
if %ERRORLEVEL% equ 0 (
    echo Successfully pushed to GitHub!
) else (
    echo Note: If GitHub asks for login, please sign in with your GitHub account.
)
echo ========================================================
pause
