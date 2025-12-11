import React from 'react';
import { Topic } from '../types';
import { Hash, Activity } from 'lucide-react';

interface TopicMapProps {
  topics: Topic[];
  themes: string[];
  arc: string;
}

export const TopicMap: React.FC<TopicMapProps> = ({ topics, themes, arc }) => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-800 p-5 rounded-xl border border-gray-700">
          <h3 className="text-gray-400 text-sm font-semibold uppercase mb-3 flex items-center gap-2">
            <Hash size={16} /> Primary Themes
          </h3>
          <div className="flex flex-wrap gap-2">
            {themes.map((theme, i) => (
              <span key={i} className="px-3 py-1 bg-gray-700 text-gray-200 rounded-full text-sm border border-gray-600">
                {theme}
              </span>
            ))}
          </div>
        </div>
        <div className="bg-gray-800 p-5 rounded-xl border border-gray-700">
          <h3 className="text-gray-400 text-sm font-semibold uppercase mb-3 flex items-center gap-2">
            <Activity size={16} /> Storytelling Arc
          </h3>
          <p className="text-gray-300 text-sm leading-relaxed">
            {arc}
          </p>
        </div>
      </div>

      <div>
        <h3 className="text-xl font-bold text-white mb-4">Detailed Topic Breakdown</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {topics.map((topic, idx) => (
            <div key={idx} className="bg-gray-800/50 p-4 rounded-xl border border-gray-700 hover:border-gray-600 transition-colors">
              <h4 className="text-lg font-semibold text-primary-400 mb-2">{topic.theme}</h4>
              <div className="mb-3">
                <span className="text-xs text-gray-500 uppercase font-semibold">Tone: </span>
                <span className="text-xs text-gray-300 bg-gray-700 px-2 py-0.5 rounded">{topic.emotional_tone}</span>
              </div>
              <ul className="list-disc list-inside text-sm text-gray-400 space-y-1">
                {topic.subtopics.map((sub, sIdx) => (
                  <li key={sIdx}>{sub}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};