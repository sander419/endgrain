@echo off
rem Vypusk klyucha v dialoge - dlya yarlyka na rabochem stole.
rem Fayl namerenno bez kirillicy: vse russkie stroki pechataet node,
rem uzhe posle chcp 65001. Kirillica v samom .cmd zavisit ot kodovoy
rem stranicy konsoli i lomaetsya na chuzhoy mashine.
chcp 65001 >nul
title End-Grain - vypusk klyucha
node "%~dp0issue-license.mjs" --ask
echo.
pause
