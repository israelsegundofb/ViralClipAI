import React, { useState, useRef, useEffect } from 'react';
import { Clip } from '../types';
import { Play, Download, TrendingUp, Heart, BookOpen, Share2, Youtube, Instagram, Music2, Image as ImageIcon, Copy, Check, Sparkles, Video, Twitter, Facebook, Link as LinkIcon, X as CloseIcon, ThumbsUp, ThumbsDown } from 'lucide-react';

interface ClipCardProps {
  clip: Clip;
  isTop10: boolean;
  onPlay: (start: string) => void;
  onDownload: (clip: Clip) => void;
  tags?: string[];
}

export const ClipCard: React.FC<ClipCardProps> = ({ clip, isTop10, onPlay, onDownload, tags = [] }) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [feedback, setFeedback] = useState<'pos' | 'neg' | null>(null);
  const [showThanks, setShowThanks] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const clickOut = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowShareMenu(false); };
    if (showShareMenu) document.addEventListener('mousedown', clickOut);
    return () => document.removeEventListener('mousedown', clickOut);
  }, [showShareMenu]);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleFeedback = (type: 'pos' | 'neg') => {
    setFeedback(type);
    setShowThanks(true);
    setTimeout(() => setShowThanks(false), 2000);
  };

  return (
    <div className={`bg-gray-800 rounded-xl overflow-hidden border ${isTop10 ? 'border-primary-500/50 shadow-lg' : 'border-gray-700'} flex flex-col h-full relative`}>
      <div className="p-4 flex flex-col flex-grow">
        <div className="flex justify-between items-start mb-2">
          <div>
            <span className="text-[10px] font-bold text-gray-500 uppercase">Clip #{clip.clip_number}</span>
            <h3 className="text-sm font-bold text-white line-clamp-2 leading-tight">{clip.title}</h3>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="bg-gray-900 px-1.5 py-0.5 rounded border border-gray-700 flex items-center gap-1">
              <TrendingUp size={10} className="text-green-400" />
              <span className="text-xs font-bold text-green-400">{clip.engagement_score}</span>
            </div>
            <div className="flex gap-1">
              <button onClick={() => handleFeedback('pos')} className={`p-1 rounded ${feedback === 'pos' ? 'text-green-400 bg-green-400/10' : 'text-gray-500 hover:text-green-400'}`}><ThumbsUp size={10} /></button>
              <button onClick={() => handleFeedback('neg')} className={`p-1 rounded ${feedback === 'neg' ? 'text-red-400 bg-red-400/10' : 'text-gray-500 hover:text-red-400'}`}><ThumbsDown size={10} /></button>
            </div>
          </div>
        </div>

        {showThanks && <div className="absolute top-2 right-10 bg-primary-600 text-[10px] px-2 py-0.5 rounded z-20">Thanks!</div>}

        <div className="flex gap-1.5 mb-3 flex-wrap">
          <span className="text-[10px] bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded">{clip.duration}</span>
          <span className="text-[10px] bg-primary-900/30 text-primary-300 px-1.5 py-0.5 rounded border border-primary-800/50">{clip.importance_level}</span>
        </div>

        <div className="mb-3 text-xs text-gray-300 bg-gray-900/50 p-2 rounded border-l-2 border-primary-500 line-clamp-2 italic">
          "{clip.ai_description}"
        </div>

        <div className="mt-auto space-y-2">
          <div className="bg-gray-900/50 p-2 rounded text-[10px] space-y-1">
             <div className="flex justify-between items-center text-gray-500 uppercase font-bold tracking-tighter"><span>Shorts Title</span><button onClick={()=>handleCopy(clip.social_titles.youtube_shorts, 'yt')} className="hover:text-white">{copiedKey==='yt'?<Check size={10}/>:<Copy size={10}/>}</button></div>
             <p className="text-gray-300 truncate">{clip.social_titles.youtube_shorts}</p>
          </div>

          <div className="flex gap-2 relative">
            <button onClick={() => onPlay(clip.start_time)} className="flex-1 bg-gray-700 hover:bg-gray-600 text-xs py-1.5 rounded flex items-center justify-center gap-1 transition-colors"><Play size={12} /> Play</button>
            <button onClick={() => onDownload(clip)} className="flex-1 bg-primary-600 hover:bg-primary-500 text-xs py-1.5 rounded flex items-center justify-center gap-1 transition-colors"><Video size={12} /> Export</button>
            <button onClick={() => setShowShareMenu(!showShareMenu)} className={`px-2 bg-gray-700 hover:bg-gray-600 rounded flex items-center justify-center border ${showShareMenu ? 'border-primary-500' : 'border-transparent'}`}><Share2 size={12} /></button>

            {showShareMenu && (
              <div ref={menuRef} className="absolute bottom-full right-0 mb-2 w-48 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl z-50 p-1">
                <button onClick={() => handleCopy(window.location.href, 'link')} className="w-full text-left p-2 text-[10px] text-gray-300 hover:bg-gray-800 rounded flex items-center gap-2">
                  {copiedKey==='link'?<Check size={12}/>:<LinkIcon size={12}/>} Copy Link
                </button>
                <button onClick={() => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(clip.title)}&url=${encodeURIComponent(window.location.href)}`, '_blank')} className="w-full text-left p-2 text-[10px] text-gray-300 hover:bg-gray-800 rounded flex items-center gap-2">
                  <Twitter size={12} className="text-sky-400"/> X / Twitter
                </button>
                <button onClick={() => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`, '_blank')} className="w-full text-left p-2 text-[10px] text-gray-300 hover:bg-gray-800 rounded flex items-center gap-2">
                  <Facebook size={12} className="text-blue-500"/> Facebook
                </button>
                {navigator.share && <button onClick={() => navigator.share({ title: clip.title, url: window.location.href })} className="w-full text-left p-2 text-[10px] text-primary-400 hover:bg-primary-900/20 rounded flex items-center gap-2 font-bold"><Share2 size={12}/> Native Share</button>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};