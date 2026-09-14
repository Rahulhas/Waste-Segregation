# Waste Segregation Platform

A full-stack waste management platform for connecting citizens, dispatch teams, and administrators. Citizens can submit waste collection requests, while authorized teams can manage requests, alerts, and operational workflows.

## Tech Stack

- React 19 with Vite
- React Router
- Express and Node.js
- Prisma with SQLite
- JWT authentication
- Leaflet and React Leaflet for maps

## Project Structure

```text
client/   React frontend
server/   Express API and Prisma database
```

## Getting Started

### Prerequisites

- Node.js 18 or newer
- npm

### Install and initialize

From the project root:

```bash
npm run setup
```

This installs workspace dependencies, generates the Prisma client, creates the local database, and seeds initial data.

### Configure the server

Copy `.env.example` to `.env` in the project root and set a secure `JWT_SECRET`. The default development configuration uses:

```env
PORT=5000
DATABASE_URL="file:./dev.db"
CLIENT_URL=http://localhost:5173
```

### Run the application

Start both the API and frontend together:

```bash
npm run dev
```

The frontend runs at `http://localhost:5173` and the API runs at `http://localhost:5000`.

To run them separately:

```bash
npm run dev:server
npm run dev:client
```

## Useful Commands

```bash
npm run build        # Build the frontend for production
npm run db:generate  # Generate the Prisma client
npm run db:migrate   # Apply database migrations
npm run db:seed      # Seed initial database data
```

## Security

Environment files, local databases, dependencies, and build output are excluded from version control. Never commit production secrets or credentials.