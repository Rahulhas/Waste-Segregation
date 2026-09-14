# EcoSort - Smart Waste Segregation Platform

EcoSort is an AI-powered waste segregation and management platform that connects citizens, collection workers, and municipal administrators for automated waste classification and optimized collection routing.

## Tech Stack

- **AI Microservice**: Python, PyTorch, Flask (Port `5001`)
- **Backend API**: Node.js, Express, Prisma, SQLite (Port `5000`)
- **Frontend Client**: React 19, Vite, Leaflet Maps (Port `5173`)

## Features

- **AI Waste Classification**: Computer vision model to classify waste categories from uploaded images or camera feed.
- **Citizen Portal**: Submit collection requests, view detection results, and track request status.
- **Dispatch & Route Optimization**: Worker dashboard with road-snapped navigation for waste pickup.
- **Admin Dashboard**: Real-time analytics, zone management, audit trails, and worker monitoring.

## Getting Started

### Prerequisites
- Node.js (v18+)
- Python (v3.9+)

### Installation

```bash
# 1. Install Python dependencies
pip install -r requirements.txt

# 2. Install and initialize Frontend & Server
cd Frontend
npm install
npm run setup
cd ..
```

### Running the Application

Start all services (AI microservice, Express API, and React frontend) simultaneously:

```bash
# Windows
start_servers.bat

# Or using Node directly
node start_servers.js
```

### Services & URLs

| Service | Technology | URL |
|---|---|---|
| **Frontend UI** | React / Vite | `http://localhost:5173` |
| **Backend API** | Express / Prisma | `http://localhost:5000` |
| **AI Microservice** | PyTorch / Flask | `http://localhost:5001` |
