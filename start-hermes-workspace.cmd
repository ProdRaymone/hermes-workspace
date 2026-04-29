@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

set "WORKSPACE_PORT=3002"
if not "%HERMES_WORKSPACE_PORT%"=="" set "WORKSPACE_PORT=%HERMES_WORKSPACE_PORT%"
set "WORKSPACE_URL=http://127.0.0.1:%WORKSPACE_PORT%"
set "WORKSPACE_READY_URL=%WORKSPACE_URL%/chat/new"
set "GATEWAY_HEALTH_URL=http://127.0.0.1:8642/health"

if not exist "%ROOT%\server-entry.js" (
  echo [ERROR] Missing "%ROOT%\server-entry.js"
  pause
  exit /b 1
)

if not exist "%ROOT%\dist\server\server.js" (
  echo [1/4] Building Hermes Workspace...
  pushd "%ROOT%"
  call pnpm build
  set "BUILD_EXIT=%ERRORLEVEL%"
  popd
  if not "!BUILD_EXIT!"=="0" (
    echo [ERROR] Build failed. Check dependencies or logs.
    pause
    exit /b 1
  )
)

call :probe "%GATEWAY_HEALTH_URL%"
if errorlevel 1 (
  echo [2/4] Hermes1/default gateway is not reachable at %GATEWAY_HEALTH_URL%.
  echo [INFO] This launcher does not start or restart Hermes gateways.
  echo [INFO] Use the Workspace Profiles page for explicit non-default Start actions, or start Hermes1 manually if needed.
) else (
  echo [2/4] Hermes1/default gateway is reachable.
)

call :probe "%WORKSPACE_READY_URL%"
if errorlevel 1 (
  echo [3/4] Starting Hermes Workspace on %WORKSPACE_URL%...
  start "Hermes Workspace" /D "%ROOT%" /MIN cmd.exe /c "set PORT=%WORKSPACE_PORT%&& set HOST=127.0.0.1&& node server-entry.js > .workspace-server.log 2>&1"
  call :wait_for "%WORKSPACE_READY_URL%" 30 "Hermes Workspace"
  if errorlevel 1 (
    echo [ERROR] Hermes Workspace startup timed out.
    pause
    exit /b 1
  )
) else (
  echo [3/4] Reusing existing Hermes Workspace at %WORKSPACE_URL%.
)

if "%HERMES_WORKSPACE_SKIP_OPEN%"=="1" (
  echo [4/4] Hermes Workspace ready: %WORKSPACE_READY_URL%
  exit /b 0
)

echo [4/4] Opening Hermes Workspace...
start "" "%WORKSPACE_READY_URL%"
exit /b 0

:probe
curl.exe -fsS -o NUL --max-time 3 %~1
exit /b %ERRORLEVEL%

:wait_for
set "WAIT_URL=%~1"
set /a WAIT_MAX=%~2
set "WAIT_NAME=%~3"
for /L %%I in (1,1,!WAIT_MAX!) do (
  call :probe "!WAIT_URL!"
  if not errorlevel 1 exit /b 0
  timeout /t 1 /nobreak >NUL
)
echo [ERROR] !WAIT_NAME! did not become ready in time.
exit /b 1
