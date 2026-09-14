import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import citizenRequestRoutes from './routes/citizenRequests.js';
import wasteRoutes from './routes/waste.js';
import zonesRoutes from './routes/zones.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 5000;
const configuredClientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

app.use(cors({
  origin: (origin, callback) => {
    // In local development, allow all requests without origin (curl, server calls) or from local/LAN networks
    if (!origin) return callback(null, true);
    const isLocalOrLan = /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(origin);
    if (isLocalOrLan || origin === configuredClientUrl || process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));
app.use(express.json({ limit: '20mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'SIH Waste Platform API' });
});

app.use('/api/auth', authRoutes);
app.use('/api/citizen-requests', citizenRequestRoutes);
app.use('/api/waste', wasteRoutes);
app.use('/api/zones', zonesRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🌿 SIH Waste Platform API running on http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health\n`);
});

// Configure keep-alive timeout longer than standard client/proxy timeout to prevent ECONNRESET
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
