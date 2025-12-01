/**
 * Configuration for the LLM Council.
 * All configuration values are loaded from environment variables.
 */

import dotenv from 'dotenv';
import { setLogLevel } from './logger.js';
import type { LogLevel } from './logger.js';

dotenv.config();

// OpenRouter API configuration
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
export const OPENROUTER_API_URL =
  process.env.OPENROUTER_API_URL || 'https://openrouter.ai/api/v1/chat/completions';

// Server configuration
export const BACKEND_PORT = parseInt(process.env.BACKEND_PORT || '8001', 10);
export const BACKEND_HOST = process.env.BACKEND_HOST || '0.0.0.0';

// CORS configuration
export const CORS_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim())
  : ['http://localhost:5173', 'http://localhost:3000'];

// Data directory for conversation storage
export const DATA_DIR = process.env.DATA_DIR || 'data/conversations';

// Council members - list of OpenRouter model identifiers
export const COUNCIL_MODELS = process.env.COUNCIL_MODELS
  ? process.env.COUNCIL_MODELS.split(',').map((model) => model.trim())
  : [
      'google/gemini-2.0-flash-thinking',
      'anthropic/claude-3.5-haiku',
      'openai/gpt-4o-mini',
      'meta-llama/llama-3.1-8b-instruct:free',
    ];

// Chairman model - synthesizes final response
export const CHAIRMAN_MODEL = process.env.CHAIRMAN_MODEL || 'google/gemini-2.0-flash';

// Title generation model
export const TITLE_GENERATION_MODEL = process.env.TITLE_GENERATION_MODEL || 'google/gemini-2.5-flash';

// Request timeouts (in seconds)
export const DEFAULT_TIMEOUT = parseFloat(process.env.DEFAULT_TIMEOUT || '120');
export const CHAIRMAN_TIMEOUT = parseFloat(process.env.CHAIRMAN_TIMEOUT || '180');
export const TITLE_GENERATION_TIMEOUT = parseFloat(process.env.TITLE_GENERATION_TIMEOUT || '30');

// Logging
export const LOG_LEVEL = (process.env.LOG_LEVEL || 'info') as LogLevel;

// Initialize logger with configured level
setLogLevel(LOG_LEVEL);


