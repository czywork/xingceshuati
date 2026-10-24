@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

rem ============================================================
rem  行测真题刷题系统 - 一键启动
rem  用法：双击本文件即可（首次运行会自动构建题库数据）
rem ============================================================

rem 定位 app 目录：优先 <脚本目录>\app，其次脚本自身所在目录
set "APP_DIR=%~dp0app"
if not exist "%APP_DIR%\package.json" set "APP_DIR=%~dp0"

if not exist "%APP_DIR%\package.json" (
  echo.
  echo [错误] 未找到 app\package.json
  echo        请把本脚本放在项目根目录（与 app 文件夹同级）。
  echo.
  pause
  exit /b 1
)

cd /d "%APP_DIR%"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [错误] 未检测到 Node.js
  echo        请先安装 Node.js 18 或更高版本：https://nodejs.org/
  echo.
  pause
  exit /b 1
)

if not exist "data\meta.json" (
  echo.
  echo 首次运行：正在解析真题、构建题库数据，可能需要几分钟，请稍候...
  echo.
  call npm run build
  if errorlevel 1 (
    echo.
    echo [错误] 题库数据构建失败，请查看上方日志。
    echo.
    pause
    exit /b 1
  )
)

echo.
echo 正在启动服务...
start "行测刷题系统 - 服务（关闭本窗口即停止服务）" cmd /k "npm start"

rem 轮询等待服务就绪，最多 30 秒
set /a tries=0
:srv_wait
set /a tries+=1
timeout /t 1 /nobreak >nul
curl -s -o nul --max-time 2 http://127.0.0.1:5173/ >nul 2>nul
if errorlevel 1 if !tries! lss 30 goto srv_wait

if !tries! geq 30 (
  echo [提示] 等待超时，仍会尝试打开浏览器。若打不开请查看服务窗口的报错信息。
) else (
  echo 服务已就绪。
)

start "" "http://127.0.0.1:5173"

echo.
echo 已在浏览器打开 http://127.0.0.1:5173
echo 停止服务：关闭标题为「行测刷题系统 - 服务」的窗口，或在该窗口按 Ctrl+C。
echo.
timeout /t 4 /nobreak >nul
endlocal