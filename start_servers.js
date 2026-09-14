const { spawn, execSync } = require('child_process');
const path = require('path');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  magenta: '\x1b[35m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

function formatPrefix(name, color) {
  return `${color}[${name}]${colors.reset} `;
}

const PREFIX_AI = formatPrefix('ai', colors.magenta);
const PREFIX_SERVER = formatPrefix('server', colors.cyan);
const PREFIX_CLIENT = formatPrefix('client', colors.green);

const os = require('os');

function getLanIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    if (/virtual|vethernet|wsl|vbox/i.test(name)) continue;
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        if (net.address.startsWith('192.168.56.')) continue; // skip VirtualBox host-only
        return net.address;
      }
    }
  }
  return null;
}

const lanIp = getLanIp();

console.log(`${colors.bright}======================================================================${colors.reset}`);
console.log(`${colors.green}${colors.bright}              ECOSORT SMART WASTE SEGREGATION PLATFORM               ${colors.reset}`);
console.log(`${colors.bright}======================================================================${colors.reset}`);
console.log(`  ${PREFIX_AI}Python AI Microservice : ${colors.bright}http://localhost:5001${colors.reset}${lanIp ? `  (LAN: http://${lanIp}:5001)` : ''}`);
console.log(`  ${PREFIX_SERVER}Express Backend API    : ${colors.bright}http://localhost:5000${colors.reset}${lanIp ? `  (LAN: http://${lanIp}:5000)` : ''}`);
console.log(`  ${PREFIX_CLIENT}React Frontend Client  : ${colors.bright}http://localhost:5173${colors.reset}${lanIp ? `  (LAN: http://${lanIp}:5173)` : ''}`);
console.log(`${colors.bright}======================================================================${colors.reset}`);
console.log(`${colors.dim}Press ${colors.bright}Ctrl + C${colors.reset}${colors.dim} once to instantly stop all servers.${colors.reset}\n`);

// Free ports 5000, 5001 & 5173 if occupied from previous sessions
if (process.platform === 'win32') {
  try {
    const netstat = execSync('netstat -aon', { encoding: 'utf-8' });
    const pids = new Set();
    for (const line of netstat.split('\n')) {
      if ((line.includes(':5000 ') || line.includes(':5001 ') || line.includes(':5173 ')) && line.includes('LISTENING')) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0' && !isNaN(pid)) {
          pids.add(pid);
        }
      }
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /F /PID ${pid} >nul 2>&1`);
      } catch {}
    }
  } catch {}
}

const processes = [];
let isShuttingDown = false;

function pipeOutput(proc, prefix) {
  proc.stdout.on('data', (data) => {
    const lines = data.toString('utf-8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Strip ANSI escape codes to inspect raw text
      const clean = trimmed.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');

      // Add free space around the client Local URL so it stands out
      if (clean.includes('Local:')) {
        console.log('');
        console.log('');
        console.log(`${prefix}   ${colors.bright}${colors.green}➜  Local:   http://localhost:5173/${colors.reset}`);
        console.log('');
        console.log('');
      } else if (clean.includes('SIH Waste Platform API running')) {
        console.log('');
        console.log(`${prefix}${line}`);
      } else {
        console.log(`${prefix}${line}`);
      }
    }
  });

  proc.stderr.on('data', (data) => {
    const lines = data.toString('utf-8').split(/\r?\n/);
    for (const line of lines) {
      if (line.trim()) {
        console.error(`${prefix}${line}`);
      }
    }
  });
}

// 1. Start Python AI Microservice (:5001)
const backendDir = path.join(__dirname, 'Backend');
const aiProcess = spawn('python', ['app.py'], {
  cwd: backendDir,
  env: { ...process.env, PYTHONIOENCODING: 'utf-8', PORT: '5001' },
});
processes.push({ name: 'ai', proc: aiProcess });
pipeOutput(aiProcess, PREFIX_AI);

// 2. Start Express API Server (:5000)
const serverDir = path.join(__dirname, 'Frontend', 'server');
const serverProcess = spawn('node', ['--watch-path=src', 'src/index.js'], {
  cwd: serverDir,
  env: { ...process.env, PORT: '5000', AI_SERVICE_URL: 'http://127.0.0.1:5001' },
});
processes.push({ name: 'server', proc: serverProcess });
pipeOutput(serverProcess, PREFIX_SERVER);

// 3. Start React Vite Client (:5173)
const clientDir = path.join(__dirname, 'Frontend', 'client');
const viteBin = path.join(__dirname, 'Frontend', 'node_modules', 'vite', 'bin', 'vite.js');
const clientProcess = spawn('node', [viteBin], {
  cwd: clientDir,
  env: { ...process.env },
});
processes.push({ name: 'client', proc: clientProcess });
pipeOutput(clientProcess, PREFIX_CLIENT);

// Open browser after 2.5 seconds
setTimeout(() => {
  if (!isShuttingDown) {
    try {
      const openCmd = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
      execSync(`${openCmd} http://localhost:5173`);
    } catch {}
  }
}, 2500);

// Unified Shutdown Handler
function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n\n${colors.yellow}${colors.bright}🛑 Shutting down all EcoSort servers...${colors.reset}`);

  for (const { name, proc } of processes) {
    try {
      if (proc && proc.pid) {
        if (process.platform === 'win32') {
          // Instantly terminate process tree
          execSync(`taskkill /F /T /PID ${proc.pid} >nul 2>&1`);
        } else {
          proc.kill('SIGTERM');
        }
      }
    } catch {}
  }

  // Ensure ports 5000 and 5001 are freed
  if (process.platform === 'win32') {
    try {
      const netstat = execSync('netstat -aon', { encoding: 'utf-8' });
      for (const line of netstat.split('\n')) {
        if ((line.includes(':5000 ') || line.includes(':5001 ')) && line.includes('LISTENING')) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && pid !== '0' && !isNaN(pid)) {
            execSync(`taskkill /F /PID ${pid} >nul 2>&1`);
          }
        }
      }
    } catch {}
  }

  console.log(`${colors.green}${colors.bright}🌿 All servers stopped cleanly. Goodbye!${colors.reset}\n`);
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGHUP', shutdown);
