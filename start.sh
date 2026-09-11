#!/bin/bash

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' 

echo -e "${BLUE}[SYSTEM] Initializing...${NC}"

kill_port() {
    PORT=$1
    PID=$(lsof -ti:$PORT 2>/dev/null)
    if [ -n "$PID" ]; then
        kill -9 $PID
    fi
}

kill_port 3000 
kill_port 8000 

cleanup() {
    echo -e "\n${RED}[SYSTEM] Zamykanie wszystkich usług...${NC}"
    
    kill 0 2>/dev/null
    
    wait 2>/dev/null
    echo -e "${GREEN}[SYSTEM] Closed.${NC}"
}

trap cleanup SIGINT SIGTERM EXIT

(
    cd backend
    source venv/bin/activate
    uvicorn main:app --reload --port 8000
) &
API_PID=$!

(
    cd backend
    source venv/bin/activate
    
    EXPORT_COMMAND=$(python3 -c "
import os
import site
try:
    sp = next(p for p in site.getsitepackages() if 'site-packages' in p)
except:
    from distutils.sysconfig import get_python_lib
    sp = get_python_lib()

libs = []
libs.append(os.path.join(sp, 'torch', 'lib'))
nv_path = os.path.join(sp, 'nvidia')
if os.path.exists(nv_path):
    for root, dirs, files in os.walk(nv_path):
        if 'lib' in dirs:
            libs.append(os.path.join(root, 'lib'))

print(f'export LD_LIBRARY_PATH={os.pathsep.join(libs)}:$LD_LIBRARY_PATH')
")
    eval "$EXPORT_COMMAND"
    
    python -u worker.py
) &
WORKER_PID=$!

(
    cd frontend
    CI=true npm start
) &
FRONTEND_PID=$!

echo -e "\n${BLUE}[SYSTEM] All services working.${NC}\n"

wait