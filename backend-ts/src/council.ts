/**
 * 3-stage LLM Council orchestration with caching optimizations.
 */

import {
  queryModelsParallel,
  queryModel,
  type Message,
  CHAIRMAN_TIMEOUT,
  TITLE_GENERATION_TIMEOUT,
} from './openrouter.js';
import { COUNCIL_MODELS, CHAIRMAN_MODEL, TITLE_GENERATION_MODEL } from './config.js';
import { logger } from './logger.js';
import { titleCache, getTitleCacheKey } from './cache.js';

export interface Stage1Result {
  model: string;
  response: string;
}

export interface Stage2Result {
  model: string;
  ranking: string;
  parsed_ranking: string[];
}

export interface Stage3Result {
  model: string;
  response: string;
}

export interface CouncilMetadata {
  label_to_model: Record<string, string>;
  aggregate_rankings: Array<{
    model: string;
    average_rank: number;
    rankings_count: number;
  }>;
}

/**
 * Stage 1: Collect individual responses from all council models.
 *
 * @param userQuery - The user's question
 * @param useCache - Whether to use cache (default: false for Stage 1 to ensure fresh responses)
 * @returns List of dicts with 'model' and 'response' keys
 */
export async function stage1CollectResponses(
  userQuery: string,
  useCache = false
): Promise<Stage1Result[]> {
  const messages: Message[] = [{ role: 'user', content: userQuery }];

  // Query all models in parallel
  const responses = await queryModelsParallel(COUNCIL_MODELS, messages, useCache);

  // Format results - filter out null responses and map to results
  return Object.entries(responses)
    .filter(([, response]) => response !== null)
    .map(([model, response]) => ({
      model,
      response: response!.content || '',
    }));
}

/**
 * Stage 2: Each model ranks the anonymized responses.
 *
 * @param userQuery - The original user query
 * @param stage1Results - Results from Stage 1
 * @returns Tuple of (rankings list, label_to_model mapping)
 */
export async function stage2CollectRankings(
  userQuery: string,
  stage1Results: Stage1Result[]
): Promise<[Stage2Result[], Record<string, string>]> {
  // Create anonymized labels for responses (Response A, Response B, etc.)
  const labels = stage1Results.map((_, i) => String.fromCharCode(65 + i)); // A, B, C, ...

  // Create mapping from label to model name
  const labelToModel: Record<string, string> = {};
  for (let i = 0; i < labels.length; i++) {
    labelToModel[`Response ${labels[i]}`] = stage1Results[i].model;
  }

  // Build the ranking prompt
  const responsesText = stage1Results
    .map((result, i) => `Response ${labels[i]}:\n${result.response}`)
    .join('\n\n');

  const rankingPrompt = `You are evaluating different responses to the following question:

Question: ${userQuery}

Here are the responses from different models (anonymized):

${responsesText}

Your task:
1. First, evaluate each response individually. For each response, explain what it does well and what it does poorly.
2. Then, at the very end of your response, provide a final ranking.

IMPORTANT: Your final ranking MUST be formatted EXACTLY as follows:
- Start with the line "FINAL RANKING:" (all caps, with colon)
- Then list the responses from best to worst as a numbered list
- Each line should be: number, period, space, then ONLY the response label (e.g., "1. Response A")
- Do not add any other text or explanations in the ranking section

Example of the correct format for your ENTIRE response:

Response A provides good detail on X but misses Y...
Response B is accurate but lacks depth on Z...
Response C offers the most comprehensive answer...

FINAL RANKING:
1. Response C
2. Response A
3. Response B

Now provide your evaluation and ranking:`;

  const messages: Message[] = [{ role: 'user', content: rankingPrompt }];

  // Get rankings from all council models in parallel
  const responses = await queryModelsParallel(COUNCIL_MODELS, messages, false); // Don't cache rankings

  // Format results - filter out null responses and map to results
  const stage2Results: Stage2Result[] = Object.entries(responses)
    .filter(([, response]) => response !== null)
    .map(([model, response]) => ({
      model,
      ranking: response!.content || '',
      parsed_ranking: parseRankingFromText(response!.content || ''),
    }));

  return [stage2Results, labelToModel];
}

/**
 * Stage 3: Chairman synthesizes final response.
 *
 * @param userQuery - The original user query
 * @param stage1Results - Individual model responses from Stage 1
 * @param stage2Results - Rankings from Stage 2
 * @returns Dict with 'model' and 'response' keys
 */
export async function stage3SynthesizeFinal(
  userQuery: string,
  stage1Results: Stage1Result[],
  stage2Results: Stage2Result[]
): Promise<Stage3Result> {
  // Build comprehensive context for chairman
  const stage1Text = stage1Results
    .map((result) => `Model: ${result.model}\nResponse: ${result.response}`)
    .join('\n\n');

  const stage2Text = stage2Results
    .map((result) => `Model: ${result.model}\nRanking: ${result.ranking}`)
    .join('\n\n');

  const chairmanPrompt = `You are the Chairman of an LLM Council. Multiple AI models have provided responses to a user's question, and then ranked each other's responses.

Original Question: ${userQuery}

STAGE 1 - Individual Responses:
${stage1Text}

STAGE 2 - Peer Rankings:
${stage2Text}

Your task as Chairman is to synthesize all of this information into a single, comprehensive, accurate answer to the user's original question. Consider:
- The individual responses and their insights
- The peer rankings and what they reveal about response quality
- Any patterns of agreement or disagreement

Provide a clear, well-reasoned final answer that represents the council's collective wisdom:`;

  const messages: Message[] = [{ role: 'user', content: chairmanPrompt }];

  // Query the chairman model with increased timeout
  logger.info(`Attempting to query Chairman model: ${CHAIRMAN_MODEL}`);
  let response = await queryModel(CHAIRMAN_MODEL, messages, CHAIRMAN_TIMEOUT, false); // Don't cache synthesis

  if (response === null) {
    // Try fallback to first available council model
    logger.warn(`Chairman model ${CHAIRMAN_MODEL} failed, trying fallback models`);
    const fallbackModels = COUNCIL_MODELS.filter((m) => m !== CHAIRMAN_MODEL);

    for (const fallbackModel of fallbackModels) {
      logger.info(`Trying fallback model: ${fallbackModel}`);
      response = await queryModel(fallbackModel, messages, CHAIRMAN_TIMEOUT, false);
      if (response !== null) {
        logger.info(`Successfully used fallback model: ${fallbackModel}`);
        return {
          model: fallbackModel,
          response: response.content || '',
        };
      }
    }

    // If all models fail, return error with more context
    logger.error('All models failed for Stage 3 synthesis');
    return {
      model: CHAIRMAN_MODEL,
      response: `Error: Unable to generate final synthesis. Chairman model (${CHAIRMAN_MODEL}) and all fallback models failed. Please check your API key and model availability.`,
    };
  }

  return {
    model: CHAIRMAN_MODEL,
    response: response.content || '',
  };
}

/**
 * Parse the FINAL RANKING section from the model's response.
 *
 * @param rankingText - The full text response from the model
 * @returns List of response labels in ranked order
 */
export function parseRankingFromText(rankingText: string): string[] {
  // Look for "FINAL RANKING:" section
  if (rankingText.includes('FINAL RANKING:')) {
    // Extract everything after "FINAL RANKING:"
    const parts = rankingText.split('FINAL RANKING:');
    if (parts.length >= 2) {
      const rankingSection = parts[1];
      // Try to extract numbered list format (e.g., "1. Response A")
      // This pattern looks for: number, period, optional space, "Response X"
      const numberedMatches = rankingSection.match(/\d+\.\s*Response [A-Z]/g);
      if (numberedMatches && numberedMatches.length > 0) {
        // Extract just the "Response X" part
        return numberedMatches
          .map((m) => {
            const match = m.match(/Response [A-Z]/);
            return match ? match[0] : '';
          })
          .filter(Boolean);
      }

      // Fallback: Extract all "Response X" patterns in order
      const matches = rankingSection.match(/Response [A-Z]/g);
      if (matches) {
        return matches;
      }
    }
  }

  // Fallback: try to find any "Response X" patterns in order
  const matches = rankingText.match(/Response [A-Z]/g);
  return matches || [];
}

/**
 * Calculate aggregate rankings across all models.
 *
 * @param stage2Results - Rankings from each model
 * @param labelToModel - Mapping from anonymous labels to model names
 * @returns List of dicts with model name and average rank, sorted best to worst
 */
export function calculateAggregateRankings(
  stage2Results: Stage2Result[],
  labelToModel: Record<string, string>
): Array<{ model: string; average_rank: number; rankings_count: number }> {
  // Track positions for each model
  const modelPositions: Record<string, number[]> = {};

  for (const ranking of stage2Results) {
    // Parse the ranking from the structured format
    const parsedRanking = parseRankingFromText(ranking.ranking);

    for (let position = 1; position <= parsedRanking.length; position++) {
      const label = parsedRanking[position - 1];
      if (label in labelToModel) {
        const modelName = labelToModel[label];
        if (!modelPositions[modelName]) {
          modelPositions[modelName] = [];
        }
        modelPositions[modelName].push(position);
      }
    }
  }

  // Calculate average position for each model
  const aggregate: Array<{ model: string; average_rank: number; rankings_count: number }> = [];
  for (const [model, positions] of Object.entries(modelPositions)) {
    if (positions.length > 0) {
      const avgRank = positions.reduce((sum, p) => sum + p, 0) / positions.length;
      aggregate.push({
        model,
        average_rank: Math.round(avgRank * 100) / 100,
        rankings_count: positions.length,
      });
    }
  }

  // Sort by average rank (lower is better)
  aggregate.sort((a, b) => a.average_rank - b.average_rank);

  return aggregate;
}

/**
 * Generate a short title for a conversation based on the first user message.
 * Uses caching for performance.
 *
 * @param userQuery - The first user message
 * @returns A short title (3-5 words)
 */
export async function generateConversationTitle(userQuery: string): Promise<string> {
  // Check cache first
  const cacheKey = getTitleCacheKey(userQuery);
  const cached = titleCache.get(cacheKey);
  if (cached) {
    logger.debug('Title cache hit');
    return cached;
  }

  const titlePrompt = `Generate a very short title (3-5 words maximum) that summarizes the following question.
The title should be concise and descriptive. Do not use quotes or punctuation in the title.

Question: ${userQuery}

Title:`;

  const messages: Message[] = [{ role: 'user', content: titlePrompt }];

  // Use configured title generation model
  const response = await queryModel(TITLE_GENERATION_MODEL, messages, TITLE_GENERATION_TIMEOUT, false);

  if (response === null) {
    // Fallback to a generic title
    return 'New Conversation';
  }

  let title = (response.content || 'New Conversation').trim();

  // Clean up the title - remove quotes, limit length
  title = title.replace(/^["']|["']$/g, '');

  // Truncate if too long
  if (title.length > 50) {
    title = title.substring(0, 47) + '...';
  }

  // Cache the title
  titleCache.set(cacheKey, title);

  return title;
}

/**
 * Run the complete 3-stage council process.
 *
 * @param userQuery - The user's question
 * @returns Tuple of (stage1_results, stage2_results, stage3_result, metadata)
 */
export async function runFullCouncil(
  userQuery: string
): Promise<[Stage1Result[], Stage2Result[], Stage3Result, CouncilMetadata]> {
  // Stage 1: Collect individual responses
  const stage1Results = await stage1CollectResponses(userQuery);

  // If no models responded successfully, return error
  if (stage1Results.length === 0) {
    return [
      [],
      [],
      {
        model: 'error',
        response: 'All models failed to respond. Please try again.',
      },
      { label_to_model: {}, aggregate_rankings: [] },
    ];
  }

  // Stage 2: Collect rankings
  const [stage2Results, labelToModel] = await stage2CollectRankings(userQuery, stage1Results);

  // Calculate aggregate rankings
  const aggregateRankings = calculateAggregateRankings(stage2Results, labelToModel);

  // Stage 3: Synthesize final answer
  const stage3Result = await stage3SynthesizeFinal(userQuery, stage1Results, stage2Results);

  // Prepare metadata
  const metadata: CouncilMetadata = {
    label_to_model: labelToModel,
    aggregate_rankings: aggregateRankings,
  };

  return [stage1Results, stage2Results, stage3Result, metadata];
}
