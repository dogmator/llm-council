# CLAUDE.md - Technical Notes for LLM Council

This file contains technical details, architectural decisions, and important implementation notes for future development sessions.

## Project Overview

LLM Council is a 3-stage deliberation system where multiple LLMs collaboratively answer user questions. The key innovation is anonymized peer review in Stage 2, preventing models from playing favorites.

## Architecture

### Backend Structure (`backend-ts/`)

**`src/config.ts`**
- Contains `COUNCIL_MODELS` (list of OpenRouter model identifiers)
- Contains `CHAIRMAN_MODEL` (model that synthesizes final answer)
- Uses environment variable `OPENROUTER_API_KEY` from `.env`
- Backend runs on **port 8001**

**`src/openrouter.ts`**
- `queryModel()`: Single async model query using undici fetch
- `queryModelsParallel()`: Parallel queries using `Promise.all()`
- Returns object with 'content' and optional 'reasoning_details'
- Graceful degradation: returns null on failure, continues with successful responses
- Proper error handling for HTTP errors, timeouts, and unexpected errors

**`src/council.ts`** - The Core Logic
- `stage1CollectResponses()`: Parallel queries to all council models
- `stage2CollectRankings()`:
  - Anonymizes responses as "Response A, B, C, etc."
  - Creates `label_to_model` mapping for de-anonymization
  - Prompts models to evaluate and rank (with strict format requirements)
  - Returns tuple: [rankings_list, label_to_model_dict]
  - Each ranking includes both raw text and `parsed_ranking` list
- `stage3SynthesizeFinal()`: Chairman synthesizes from all responses + rankings
  - Includes fallback to other council models if chairman fails
- `parseRankingFromText()`: Extracts "FINAL RANKING:" section, handles both numbered lists and plain format
- `calculateAggregateRankings()`: Computes average rank position across all peer evaluations

**`src/storage.ts`**
- JSON-based conversation storage in `data/conversations/`
- Uses Node.js `fs/promises` for async file operations
- Each conversation: `{id, created_at, title, messages[]}`
- Assistant messages contain: `{role, stage1, stage2, stage3, timestamp}`
- Note: metadata (label_to_model, aggregate_rankings) is NOT persisted to storage, only returned via API

**`src/main.ts`**
- Fastify app with CORS enabled for localhost:5173 and localhost:3000
- POST `/api/conversations/{id}/message` returns metadata in addition to stages
- POST `/api/conversations/{id}/message/stream` provides SSE streaming
- Metadata includes: label_to_model mapping and aggregate_rankings
- Uses Zod for request validation (replaces Pydantic from Python version)

### Frontend Structure (`frontend/src/`)

**`App.jsx`**
- Main orchestration: manages conversations list and current conversation
- Handles message sending and metadata storage
- Important: metadata is stored in the UI state for display but not persisted to backend JSON

**`components/ChatInterface.jsx`**
- Multiline textarea (3 rows, resizable)
- Enter to send, Shift+Enter for new line
- User messages wrapped in markdown-content class for padding

**`components/Stage1.jsx`**
- Tab view of individual model responses
- ReactMarkdown rendering with markdown-content wrapper

**`components/Stage2.jsx`**
- **Critical Feature**: Tab view showing RAW evaluation text from each model
- De-anonymization happens CLIENT-SIDE for display (models receive anonymous labels)
- Shows "Extracted Ranking" below each evaluation so users can validate parsing
- Aggregate rankings shown with average position and vote count
- Explanatory text clarifies that boldface model names are for readability only

**`components/Stage3.jsx`**
- Final synthesized answer from chairman
- Green-tinted background (#f0fff0) to highlight conclusion

**Styling (`*.css`)**
- Light mode theme (not dark mode)
- Primary color: #4a90e2 (blue)
- Global markdown styling in `index.css` with `.markdown-content` class
- 12px padding on all markdown content to prevent cluttered appearance

## Key Design Decisions

### Stage 2 Prompt Format
The Stage 2 prompt is very specific to ensure parseable output:
```
1. Evaluate each response individually first
2. Provide "FINAL RANKING:" header
3. Numbered list format: "1. Response C", "2. Response A", etc.
4. No additional text after ranking section
```

This strict format allows reliable parsing while still getting thoughtful evaluations.

### De-anonymization Strategy
- Models receive: "Response A", "Response B", etc.
- Backend creates mapping: `{"Response A": "openai/gpt-4o-mini", ...}`
- Frontend displays model names in **bold** for readability
- Users see explanation that original evaluation used anonymous labels
- This prevents bias while maintaining transparency

### Error Handling Philosophy
- Continue with successful responses if some models fail (graceful degradation)
- Never fail the entire request due to single model failure
- Log errors but don't expose to user unless all models fail
- Stage 3 includes automatic fallback to other council models if chairman fails

### UI/UX Transparency
- All raw outputs are inspectable via tabs
- Parsed rankings shown below raw text for validation
- Users can verify system's interpretation of model outputs
- This builds trust and allows debugging of edge cases

## Important Implementation Details

### TypeScript Compilation
- Uses `tsgo` (Microsoft's Go-based TypeScript compiler) for fast compilation
- Standard `tsc` available as fallback with `npm run build:tsc`
- Development uses `tsx` for hot reload without compilation
- Production build outputs to `dist/` directory

### Port Configuration
- Backend: 8001
- Frontend: 5173 (Vite default)
- Update both `backend-ts/src/main.ts` and `frontend/src/api.js` if changing

### Markdown Rendering
All ReactMarkdown components must be wrapped in `<div className="markdown-content">` for proper spacing. This class is defined globally in `index.css`.

### Model Configuration
Models are configured in `backend-ts/src/config.ts`. Chairman can be same or different from council members. The current default is Gemini as chairman.

### Data Compatibility
The TypeScript backend maintains 100% compatibility with existing JSON conversation files. No migration needed.

## Common Gotchas

1. **Module Import Errors**: Use ES module imports with `.js` extension (TypeScript requirement)
2. **CORS Issues**: Frontend must match allowed origins in `main.ts` CORS configuration
3. **Ranking Parse Failures**: If models don't follow format, fallback regex extracts any "Response X" patterns in order
4. **Missing Metadata**: Metadata is ephemeral (not persisted), only available in API responses
5. **SSE Streaming**: Fastify SSE implementation uses raw response streams, format must match Python version exactly

## Future Enhancement Ideas

- Configurable council/chairman via UI instead of config file
- Enhanced streaming with progress indicators
- Export conversations to markdown/PDF
- Model performance analytics over time
- Custom ranking criteria (not just accuracy/insight)
- Support for reasoning models (o1, etc.) with special handling

## Testing Notes

Test API connectivity by checking health endpoint: `curl http://localhost:8001/`

## Data Flow Summary

```
User Query
    ↓
Stage 1: Parallel queries → [individual responses]
    ↓
Stage 2: Anonymize → Parallel ranking queries → [evaluations + parsed rankings]
    ↓
Aggregate Rankings Calculation → [sorted by avg position]
    ↓
Stage 3: Chairman synthesis with full context (with fallback)
    ↓
Return: {stage1, stage2, stage3, metadata}
    ↓
Frontend: Display with tabs + validation UI
```

The entire flow is async/parallel where possible to minimize latency.

## Migration Notes

The backend was migrated from Python (FastAPI) to TypeScript (Fastify) while maintaining 100% API compatibility. All logic, error handling, and data structures remain identical.
