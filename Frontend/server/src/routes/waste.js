import { Router } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:5001';

// Locate sample.py for CLI fallback
const CANDIDATE_SAMPLE_PATHS = [
  path.resolve(__dirname, '../../../../Backend/sample.py'),
  path.resolve(__dirname, '../../../Backend/sample.py'),
  path.resolve(process.cwd(), '../Backend/sample.py'),
  path.resolve(process.cwd(), 'Backend/sample.py'),
  'C:\\Users\\HP\\SIH KLE\\Backend\\sample.py',
];

function getSamplePyPath() {
  for (const candidate of CANDIDATE_SAMPLE_PATHS) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Executes sample.py as a subprocess fallback
 */
function runPythonFallback(imageBase64) {
  return new Promise((resolve, reject) => {
    const sampleScript = getSamplePyPath();
    if (!sampleScript) {
      return reject(new Error('Backend/sample.py script not found on server.'));
    }

    const pythonBin = process.env.PYTHON_BIN || 'python';
    const pyProcess = spawn(pythonBin, [sampleScript, '--json', '--stdin'], {
      cwd: path.dirname(sampleScript),
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });

    pyProcess.stdin.write(imageBase64);
    pyProcess.stdin.end();

    let stdout = '';
    let stderr = '';

    pyProcess.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf-8');
    });

    pyProcess.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf-8');
    });

    pyProcess.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Python process exited with code ${code}: ${stderr}`));
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        resolve(parsed);
      } catch (err) {
        reject(new Error(`Failed to parse Python output: ${err.message}. Output was: ${stdout}`));
      }
    });

    pyProcess.on('error', (err) => {
      reject(new Error(`Could not spawn python process: ${err.message}`));
    });
  });
}

/**
 * POST /api/waste/analyze
 * Body: { image: "data:image/jpeg;base64,..." }
 */
router.post('/analyze', async (req, res) => {
  try {
    const { image } = req.body;

    if (!image || typeof image !== 'string') {
      return res.status(400).json({ error: 'Image data (base64 string) is required.' });
    }

    // Step 1: Try HTTP request to Python AI Microservice (fast path)
    let aiResult = null;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const aiResponse = await fetch(`${AI_SERVICE_URL}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (aiResponse.ok) {
        const payload = await aiResponse.json();
        if (payload.success && payload.result) {
          aiResult = payload.result;
        }
      }
    } catch (fetchErr) {
      // AI service might be offline or timing out; proceed to fallback
      console.warn(`[Waste Router] AI microservice at ${AI_SERVICE_URL} unavailable (${fetchErr.message}). Attempting CLI fallback...`);
    }

    // Step 2: CLI fallback if AI service was not reachable
    if (!aiResult) {
      try {
        aiResult = await runPythonFallback(image);
      } catch (cliErr) {
        console.error('[Waste Router] Both AI service and CLI fallback failed:', cliErr);
        return res.status(500).json({
          error: 'Waste analysis failed. Ensure Python environment with PyTorch is configured.',
          details: cliErr.message,
        });
      }
    }

    // Return standardized response
    return res.json({
      success: true,
      result: aiResult,
    });
  } catch (err) {
    console.error('[Waste Router] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error while analyzing waste.' });
  }
});

/**
 * GET /api/waste/history
 * Fetch prediction history from SQLite
 */
router.get('/history', async (req, res) => {
  try {
    const qs = new URLSearchParams(req.query).toString();
    const aiResponse = await fetch(`${AI_SERVICE_URL}/api/history${qs ? `?${qs}` : ''}`);
    if (aiResponse.ok) {
      const data = await aiResponse.json();
      return res.json(data);
    }
    return res.json({ success: true, predictions: [] });
  } catch (err) {
    return res.json({ success: true, predictions: [] });
  }
});

/**
 * GET /api/waste/stats
 * Fetch analytics from SQLite
 */
router.get('/stats', async (_req, res) => {
  try {
    const aiResponse = await fetch(`${AI_SERVICE_URL}/api/stats`);
    if (aiResponse.ok) {
      const data = await aiResponse.json();
      return res.json(data);
    }
    return res.json({ success: true, stats: {} });
  } catch (err) {
    return res.json({ success: true, stats: {} });
  }
});

export default router;
