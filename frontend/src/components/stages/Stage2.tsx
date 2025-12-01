import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Stage2Result, AggregateRanking, CouncilMetadata } from '@llm-council/shared';
import './Stage2.css';

interface Stage2Props {
  rankings: Stage2Result[];
  labelToModel?: CouncilMetadata['label_to_model'];
  aggregateRankings?: AggregateRanking[];
}

function deAnonymizeText(text: string, labelToModel?: Record<string, string>): string {
  if (!labelToModel) return text;

  let result = text;
  // Replace each "Response X" with the actual model name
  Object.entries(labelToModel).forEach(([label, model]) => {
    const modelShortName = model.split('/')[1] || model;
    result = result.replace(new RegExp(label, 'g'), `**${modelShortName}**`);
  });
  return result;
}

export default function Stage2({ rankings, labelToModel, aggregateRankings }: Stage2Props) {
  const [activeTab, setActiveTab] = useState<number>(0);

  // Normalize rankings to always be an array
  const normalizedRankings = Array.isArray(rankings) ? rankings : [];

  if (!normalizedRankings || normalizedRankings.length === 0) {
    return null;
  }

  const activeRanking = normalizedRankings[activeTab];
  if (!activeRanking) {
    return null;
  }

  return (
    <div className="stage stage2">
      <h3 className="stage-title">Stage 2: Peer Rankings</h3>

      <h4>Raw Evaluations</h4>
      <p className="stage-description">
        Each model evaluated all responses (anonymized as Response A, B, C, etc.) and provided rankings.
        Below, model names are shown in <strong>bold</strong> for readability, but the original evaluation used anonymous labels.
      </p>

      <div className="tabs">
        {normalizedRankings.map((rank, index) => (
          <button
            key={index}
            className={`tab ${activeTab === index ? 'active' : ''}`}
            onClick={() => setActiveTab(index)}
          >
            {rank.model?.split('/')[1] || rank.model || `Model ${index + 1}`}
          </button>
        ))}
      </div>

      <div className="tab-content">
        <div className="ranking-model">
          {activeRanking.model || 'Unknown Model'}
        </div>
        <div className="ranking-content markdown-content">
          <ReactMarkdown>
            {deAnonymizeText(activeRanking.ranking || '', labelToModel)}
          </ReactMarkdown>
        </div>

        {activeRanking.parsed_ranking &&
         Array.isArray(activeRanking.parsed_ranking) &&
         activeRanking.parsed_ranking.length > 0 && (
          <div className="parsed-ranking">
            <strong>Extracted Ranking:</strong>
            <ol>
              {activeRanking.parsed_ranking.map((label, i) => (
                <li key={i}>
                  {labelToModel && labelToModel[label]
                    ? labelToModel[label].split('/')[1] || labelToModel[label]
                    : label}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      {aggregateRankings && aggregateRankings.length > 0 && (
        <div className="aggregate-rankings">
          <h4>Aggregate Rankings (Street Cred)</h4>
          <p className="stage-description">
            Combined results across all peer evaluations (lower score is better):
          </p>
          <div className="aggregate-list">
            {aggregateRankings.map((agg, index) => (
              <div key={index} className="aggregate-item">
                <span className="rank-position">#{index + 1}</span>
                <span className="rank-model">
                  {agg.model.split('/')[1] || agg.model}
                </span>
                <span className="rank-score">
                  Avg: {agg.average_rank.toFixed(2)}
                </span>
                <span className="rank-count">
                  ({agg.rankings_count} votes)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


