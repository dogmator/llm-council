# LLM Council TypeScript Backend

TypeScript backend for the LLM Council application, built with Fastify.

## Features

- ✅ **TypeScript** with strict type checking
- ✅ **Fastify** web framework for high performance
- ✅ **ESLint** for code quality
- ✅ **Environment-based configuration** (no hardcoded values)
- ✅ **Hot Module Replacement (HMR)** via `tsx watch`
- ✅ **Centralized logging** with configurable log levels
- ✅ **Optimized** parallel processing for better performance

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file (copy from `.env.example` in project root):
```bash
cp ../.env.example ../.env
```

3. Configure environment variables in `.env`:
   - `OPENROUTER_API_KEY` - Your OpenRouter API key
   - `BACKEND_PORT` - Backend server port (default: 8001)
   - `BACKEND_HOST` - Backend server host (default: 0.0.0.0)
   - `CORS_ORIGINS` - Comma-separated list of allowed CORS origins
   - `LOG_LEVEL` - Logging level (debug, info, warn, error)

## Development

Run in development mode with HMR:
```bash
npm run dev
```

This uses `tsx watch` which automatically restarts the server on file changes.

## Building

Build for production:
```bash
npm run build
```

This uses `tsgo` (TypeScript Go compiler) for fast compilation.

Alternative build methods:
- `npm run build:tsc` - Use standard TypeScript compiler
- `npm run build:fast` - Use esbuild for fastest compilation

## Code Quality

Type check:
```bash
npm run type-check
```

Lint:
```bash
npm run lint
```

Fix linting issues:
```bash
npm run lint:fix
```

Full check (type check + lint):
```bash
npm run check
```

## Project Structure

```
backend-ts/
├── src/
│   ├── config.ts      # Configuration (reads from .env)
│   ├── logger.ts      # Centralized logging utility
│   ├── openrouter.ts  # OpenRouter API client
│   ├── storage.ts     # JSON-based conversation storage
│   ├── council.ts     # 3-stage LLM council orchestration
│   ├── main.ts        # Fastify server and API routes
│   └── utils.ts       # Utility functions
├── dist/              # Compiled JavaScript (generated)
├── tsconfig.json      # TypeScript configuration
├── eslint.config.js   # ESLint configuration
└── package.json       # Dependencies and scripts
```

## API Endpoints

- `GET /` - Health check
- `GET /api/conversations` - List all conversations
- `POST /api/conversations` - Create new conversation
- `GET /api/conversations/:id` - Get conversation by ID
- `POST /api/conversations/:id/message` - Send message (non-streaming)
- `POST /api/conversations/:id/message/stream` - Send message (SSE streaming)
- `GET /api/chats/stats` - Get chat statistics
- `GET /api/chats/:id/export` - Export conversation
- `GET /api/chats/debug` - Debug endpoint

## Environment Variables

All configuration is done via environment variables. See `.env.example` in the project root for all available options.

## Performance Optimizations

- Parallel file processing in `listConversations()`
- Functional programming patterns for better performance
- Efficient error handling with early returns
- Optimized JSON parsing and string operations


