@echo off
title Infinity Dental Clinic - Localhost Server
echo ========================================================
echo Starting Infinity Dental Clinic on Localhost...
echo URL:      http://localhost:3000
echo Database: C:\Infiinity Dental Clinic\Database\InfinityDentalClinic.sqlite
echo ========================================================
timeout /t 2 /nobreak >nul
start "" http://localhost:3000
node server.js
pause
