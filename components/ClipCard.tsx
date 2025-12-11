import React, { useState } from 'react';
import { Clip } from '../types';
import { Play, Download, TrendingUp, Heart, BookOpen, Share2, Youtube, Instagram, Music2, Image as ImageIcon, Copy, Check, Sparkles, Video } from 'lucide-react';

interface ClipCardProps {
  clip: Clip;
  isTop10: boolean;
  onPlay: (start: string) => void;
  onDownload: (clip: Clip) => void;
  tags?: string[];
}

export const ClipCard: React.FC<ClipCardProps> = ({ clip, isTop10, onPlay, onDownload, tags = [] }) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-400';
    if (score >= 75) return 'text-blue-400';
    return 'text-yellow-400';
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className={`bg-gray-800 rounded-xl overflow-hidden border ${isTop10 ? 'border-primary-500/50 shadow-lg shadow-primary-500/10' : 'border-gray-700'} hover:border-gray-600 transition-all group flex flex-col h-full`}>
      <div className="p-5 flex flex-col flex-grow">
        {/* Header */}
        <div className="flex justify-between items-start mb-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Clip #{clip.clip_number}</span>
              {isTop10 && <span className="bg-primary-600/20 text-primary-400 text-xs px-2 py-0.5 rounded-full border border-primary-600/30">Top 10</span>}
            </div>
            <h3 className="text-lg font-bold text-white leading-tight line-clamp-2" title={clip.title}>{clip.title}</h3>
          </div>
          <div className="flex items-center gap-1 bg-gray-900/50 px-2 py-1 rounded-lg border border-gray-700 shrink-0">
             <TrendingUp size={14} className={getScoreColor(clip.engagement_score)} />
             <span className={`font-mono font-bold ${getScoreColor(clip.engagement_score)}`}>{clip.engagement_score}</span>
          </div>
        </div>

        {/* Tags & Metadata */}
        <div className="flex gap-2 mb-4 flex-wrap">
          <span className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded border border-gray-600">{clip.duration}</span>
          <span className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded border border-gray-600">{clip.importance_level}</span>
          {tags.map(tag => (
             <span key={tag} className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded flex items-center gap-1 border border-gray-600">
                {tag === 'Emotional' && <Heart size={10} className="text-red-400"/>}
                {tag === 'Educational' && <BookOpen size={10} className="text-blue-400"/>}
                {tag === 'Viral' && <TrendingUp size={10} className="text-green-400"/>}
                {tag}
             </span>
          ))}
        </div>

        {/* AI Description */}
        {clip.ai_description && (
          <div className="mb-3 text-sm text-gray-200 bg-primary-900/10 border-l-2 border-primary-500 pl-3 py-1 italic relative">
            <Sparkles size={12} className="absolute -top-1.5 -left-1.5 text-primary-400 bg-gray-800 rounded-full" />
            "{clip.ai_description}"
          </div>
        )}

        {/* Excerpt */}
        <p className="text-sm text-gray-400 mb-4 line-clamp-2 border-t border-gray-700/50 pt-2">
          <span className="text-xs font-semibold text-gray-500 block mb-1 uppercase">Transcript</span>
          "{clip.transcript_excerpt}"
        </p>
        
        {/* Why it works */}
        <div className="text-xs text-gray-500 mb-4 bg-gray-900/30 p-2 rounded border border-gray-800">
          <span className="font-semibold text-gray-400">Analysis:</span> {clip.reason_for_engagement}
        </div>

        {/* Social Titles */}
        {clip.social_titles && (
          <div className="mb-4 space-y-3 bg-gray-900/50 p-3 rounded-lg border border-gray-800">
            <h4 className="text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-1 flex items-center gap-1">
              <Share2 size={10} /> Optimized Titles
            </h4>
            
            <div className="flex items-start gap-2 group/title">
              <div className="mt-0.5 shrink-0 text-red-500 w-4"><Youtube size={14} /></div>
              <div className="flex-grow min-w-0">
                 <p className="text-xs text-gray-200 font-medium leading-snug">{clip.social_titles.youtube_shorts}</p>
                 <span className="text-[10px] text-gray-600">YouTube Shorts</span>
              </div>
              <button onClick={() => handleCopy(clip.social_titles.youtube_shorts, `yt-${clip.clip_number}`)} className="text-gray-500 hover:text-white transition-colors">
                {copiedKey === `yt-${clip.clip_number}` ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
              </button>
            </div>

            <div className="flex items-start gap-2 group/title">
              <div className="mt-0.5 shrink-0 text-pink-500 w-4"><Music2 size={14} /></div>
              <div className="flex-grow min-w-0">
                 <p className="text-xs text-gray-200 font-medium leading-snug">{clip.social_titles.tiktok}</p>
                 <span className="text-[10px] text-gray-600">TikTok</span>
              </div>
              <button onClick={() => handleCopy(clip.social_titles.tiktok, `tk-${clip.clip_number}`)} className="text-gray-500 hover:text-white transition-colors">
                 {copiedKey === `tk-${clip.clip_number}` ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
              </button>
            </div>

            <div className="flex items-start gap-2 group/title">
              <div className="mt-0.5 shrink-0 text-purple-500 w-4"><Instagram size={14} /></div>
              <div className="flex-grow min-w-0">
                 <p className="text-xs text-gray-200 font-medium leading-snug">{clip.social_titles.instagram_reels}</p>
                 <span className="text-[10px] text-gray-600">Instagram Reels</span>
              </div>
              <button onClick={() => handleCopy(clip.social_titles.instagram_reels, `ig-${clip.clip_number}`)} className="text-gray-500 hover:text-white transition-colors">
                 {copiedKey === `ig-${clip.clip_number}` ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
              </button>
            </div>
          </div>
        )}

        {/* Thumbnail Suggestions */}
        {clip.thumbnail_suggestions && clip.thumbnail_suggestions.length > 0 && (
          <div className="mb-4 bg-gray-900/30 p-3 rounded-lg border border-gray-800">
             <h4 className="text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-2 flex items-center gap-1">
              <ImageIcon size={10} /> Thumbnail Ideas
            </h4>
            <div className="grid grid-cols-1 gap-2">
              {clip.thumbnail_suggestions.map((thumb, idx) => (
                <div key={idx} className="flex gap-2 text-xs items-start">
                  <span className="shrink-0 font-semibold text-primary-400 bg-primary-900/20 px-1.5 py-0.5 rounded border border-primary-900/30 h-fit text-[10px] w-24 text-center whitespace-normal leading-tight">
                    {thumb.style}
                  </span>
                  <span className="text-gray-400 leading-snug pt-0.5">{thumb.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="mt-auto grid grid-cols-2 gap-2">
          <button 
            onClick={() => onPlay(clip.start_time)}
            className="col-span-1 bg-gray-700 hover:bg-gray-600 text-white text-sm py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-colors border border-gray-600"
          >
            <Play size={16} /> Preview
          </button>
          <button 
            onClick={() => onDownload(clip)}
            className="col-span-1 bg-primary-600 hover:bg-primary-500 text-white text-sm py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-lg shadow-primary-900/20"
            title="Download Video File"
          >
            <Video size={16} /> Download
          </button>
        </div>
      </div>
    </div>
  );
};