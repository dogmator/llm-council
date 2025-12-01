import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Stage1Result } from '@llm-council/shared';
import './Stage1.css';

interface Stage1Props {
  responses: Stage1Result[];
}

export default function Stage1({ responses }: Stage1Props) {
  const [activeTab, setActiveTab] = useState<number>(0);

  if (!responses || responses.length === 0) {
    return null;
  }

  const activeResponse = responses[activeTab];
  if (!activeResponse) {
    return null;
  }

  return (
    <div className="stage stage1">
      <h3 className="stage-title">Stage 1: Individual Responses</h3>

      <div className="tabs">
        {responses.map((resp, index) => (
          <button
            key={index}
            className={`tab ${activeTab === index ? 'active' : ''}`}
            onClick={() => setActiveTab(index)}
          >
            {resp.model.split('/')[1] || resp.model}
          </button>
        ))}
      </div>

      <div className="tab-content">
        <div className="model-name">{activeResponse.model}</div>
        <div className="response-text markdown-content">
          <ReactMarkdown>{activeResponse.response}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}


