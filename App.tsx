import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileVideo, AlertCircle, PlayCircle, Download, TrendingUp, Smartphone, Monitor, ArrowLeft, Loader2, Settings, Youtube, X, CheckCircle2 } from 'lucide-react';
import { Button } from './components/Button';
import { analyzeVideo } from './services/geminiService';
import { AppState, AnalysisResult, Clip } from './types';
import { ClipCard } from './components/ClipCard';
import { TopicMap } from './components/TopicMap';
import { WaveformTimeline } from './components/WaveformTimeline';
import { parseTimestampToSeconds } from './utils';

const App = () => {
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [state, setState] = useState<AppState>(AppState.IDLE);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'clips' | 'topics' | 'transcript'>('clips');
  const [previewMode, setPreviewMode] = useState<'original' | '9:16'>('9:16');
  const [analysisProgress, setAnalysisProgress] = useState(0);
  
  // Input Mode
  const [inputMode, setInputMode] = useState<'upload' | 'url'>('upload');
  const [urlInput, setUrlInput] = useState('');
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  
  // Rendering State
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderingClipId, setRenderingClipId] = useState<number | null>(null);
  const [renderQuality] = useState<'720p' | '1080p'>('720p');
  const [renderStartTime, setRenderStartTime] = useState<number>(0);
  
  // Download Modal State
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [clipToDownload, setClipToDownload] = useState<Clip | null>(null);
  const [downloadFormat, setDownloadFormat] = useState<'mp4' | 'webm'>('mp4');

  const videoRef = useRef<HTMLVideoElement>(null);
  const renderVideoRef = useRef<HTMLVideoElement>(null);
  const renderCanvasRef = useRef<HTMLCanvasElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.size > 5 * 1024 * 1024 * 1024) { 
         setError("File is too large. Please use a video under 5GB.");
         return;
      }
      setFile(selectedFile);
      setVideoUrl(URL.createObjectURL(selectedFile));
      setError(null);
      setState(AppState.IDLE);
    }
  };

  const cleanYoutubeUrl = (url: string): string => {
    try {
      const urlObj = new URL(url);
      ['feature', 't', 'si', 'pp'].forEach(p => urlObj.searchParams.delete(p));
      if (urlObj.pathname.includes('/shorts/')) {
        const id = urlObj.pathname.split('/shorts/')[1];
        if (id) return `https://www.youtube.com/watch?v=${id}`;
      }
      if (urlObj.hostname.includes('youtube.com') && urlObj.pathname === '/watch') {
        const v = urlObj.searchParams.get('v');
        if (v) return `https://www.youtube.com/watch?v=${v}`;
      }
      if (urlObj.hostname.includes('youtu.be')) {
         return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
      }
      return urlObj.toString();
    } catch {
      return url;
    }
  };

  const getYoutubeVideoId = (url: string): string | null => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const resolveYoutubeVideo = async (url: string): Promise<{ url: string, filename: string }> => {
    const errors: string[] = [];
    const cleanUrl = cleanYoutubeUrl(url);
    const videoId = getYoutubeVideoId(cleanUrl);

    if (!videoId) throw new Error("Could not extract video ID from URL");

    const smartFetch = async (targetUrl: string, options: RequestInit = {}) => {
       const isPost = options.method === 'POST';
       const ts = Date.now();
       const strategies = [];

       // 1. Direct (some instances support it, browser might allow it)
       strategies.push(async () => {
          const res = await fetch(targetUrl, { ...options });
          if (!res.ok) throw new Error(`Direct failed: ${res.status}`);
          return res;
       });

       if (isPost) {
           // For POST (Cobalt), we need a proxy that forwards method and body
           strategies.push(async () => {
               const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(targetUrl)}`, { ...options });
               if (!res.ok) throw new Error(`CorsProxy failed`);
               return res;
           });
           strategies.push(async () => {
               const res = await fetch(`https://thingproxy.freeboard.io/fetch/${targetUrl}`, { ...options });
               if (!res.ok) throw new Error(`ThingProxy failed`);
               return res;
           });
       } else {
           // For GET (Piped), standard GET proxies are often more reliable for large responses
           strategies.push(async () => {
               const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}&t=${ts}`);
               if (!res.ok) throw new Error(`AllOrigins failed`);
               return res;
           });
           strategies.push(async () => {
               const res = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`);
               if (!res.ok) throw new Error(`CodeTabs failed`);
               return res;
           });
       }

       let lastError;
       for (const strat of strategies) {
           try { return await strat(); } catch (e) { lastError = e; }
       }
       throw lastError || new Error("All proxy strategies failed");
    };

    const tryResolve = async (name: string, instances: string[], logic: (base: string) => Promise<{url:string, filename:string} | null>) => {
       const shuffled = [...instances].sort(() => Math.random() - 0.5).slice(0, 5);
       for (const base of shuffled) {
          try {
             const cleanBase = base.replace(/\/$/, '');
             const res = await logic(cleanBase);
             if (res) return res;
          } catch (e: any) {
             errors.push(`${name}(${base}): ${e.message}`);
          }
       }
       return null;
    };

    // --- Cobalt ---
    // Expanded instances and refined logic
    const cobaltInstances = [
        'https://api.cobalt.tools', 
        'https://cobalt.kwiatekmiki.pl', 
        'https://cobalt.xyzen.dev', 
        'https://cobalt.pladys.me',
        'https://api.doubutsu.wtf',
        'https://cobalt.q1.pm'
    ];
    const cobaltRes = await tryResolve('Cobalt', cobaltInstances, async (base) => {
        const res = await smartFetch(`${base}/api/json`, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: cleanUrl, vCodec: 'h264' }) // Suggest h264 for better compatibility
        });
        const data = await res.json();
        if (data.status === 'error') throw new Error(data.text || 'Cobalt returned error');
        
        const u = data.url || (data.picker && data.picker[0]?.url);
        if (u) return { url: u, filename: data.filename || 'video.mp4' };
        return null;
    });
    if (cobaltRes) return cobaltRes;

    // --- Piped ---
    const pipedInstances = [
        'https://pipedapi.kavin.rocks', 
        'https://api.piped.privacydev.net', 
        'https://pipedapi.moomoo.me', 
        'https://pa.il.ax',
        'https://pipedapi.drgns.space',
        'https://pipedapi.smnz.de'
    ];
    const pipedRes = await tryResolve('Piped', pipedInstances, async (base) => {
        const res = await smartFetch(`${base}/streams/${videoId}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        if (data.videoStreams) {
            // Priority: Progressive streams (audio+video), sorted by quality descending
            const valid = data.videoStreams.filter((s:any) => s.videoOnly === false)
               .sort((a:any, b:any) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0));
            
            if (valid[0]?.url) {
                // Return proxy-wrapped URL if direct access is restricted
                return { url: valid[0].url, filename: 'video.mp4' };
            }
        }
        return null;
    });
    if (pipedRes) return pipedRes;

    throw new Error(`Failed to resolve YouTube video after multiple attempts. Specific errors: ${errors.slice(0, 4).join('; ')}`);
  };

  const handleUrlAnalyze = async () => {
    const trimmedUrl = urlInput.trim();
    if (!trimmedUrl) { setError("Please enter a valid URL."); return; }

    setState(AppState.ANALYZING);
    setAnalysisProgress(1);
    setIsFetchingUrl(true);
    setError(null);

    try {
      let downloadUrl = trimmedUrl;
      let filename = "video.mp4";
      
      if (trimmedUrl.includes('youtube.com') || trimmedUrl.includes('youtu.be')) {
        const resolved = await resolveYoutubeVideo(trimmedUrl);
        downloadUrl = resolved.url;
        filename = resolved.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      }

      setAnalysisProgress(10);
      
      let response;
      // When fetching the actual binary, try direct then common proxies
      const proxies = [
          (u:string)=>u, 
          (u:string)=>`https://corsproxy.io/?${encodeURIComponent(u)}`, 
          (u:string)=>`https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
          (u:string)=>`https://thingproxy.freeboard.io/fetch/${u}`
      ];
      
      for (const p of proxies) {
         try {
            console.log("Attempting fetch with:", p(downloadUrl).substring(0, 100));
            const res = await fetch(p(downloadUrl));
            if (res.ok) { response = res; break; }
         } catch (e) {
            console.warn("Fetch failed for proxy strategy", e);
         }
      }
      
      if (!response || !response.ok) throw new Error(`Could not fetch video. All download strategies failed.`);
      
      const blob = await response.blob();
      if (blob.size > 1024 * 1024 * 1024) throw new Error(`Video too large for browser import (over 1GB). Please use local upload.`);
      if (blob.type.includes('text') || blob.type.includes('html')) throw new Error("Received non-video data. Link may be expired or blocked.");

      const fileObj = new File([blob], filename, { type: blob.type.includes('video') ? blob.type : 'video/mp4' }); 
      setIsFetchingUrl(false);
      setFile(fileObj);
      setVideoUrl(URL.createObjectURL(fileObj));
      
      const data = await analyzeVideo(fileObj, (p) => setAnalysisProgress(10 + p * 0.9));
      setResult(data);
      setState(AppState.COMPLETE);
    } catch (err: any) {
      console.error(err);
      setIsFetchingUrl(false);
      setError(err.message || "An unexpected error occurred during URL analysis.");
      setState(AppState.ERROR);
    }
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setState(AppState.ANALYZING);
    setError(null);
    setAnalysisProgress(0);
    try {
      const data = await analyzeVideo(file, (p) => setAnalysisProgress(p));
      setResult(data);
      setState(AppState.COMPLETE);
    } catch (err: any) {
      setError(err.message || "An error occurred during analysis.");
      setState(AppState.ERROR);
    }
  };

  const resetApp = () => {
    setFile(null);
    setVideoUrl(null);
    setState(AppState.IDLE);
    setResult(null);
    setError(null);
    setActiveTab('clips');
    setAnalysisProgress(0);
    setUrlInput('');
    setIsFetchingUrl(false);
  };

  const jumpToTimestamp = (timestamp: string) => {
    if (videoRef.current) {
      const seconds = parseTimestampToSeconds(timestamp);
      videoRef.current.currentTime = seconds;
      videoRef.current.play();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const downloadJSON = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `viralclip-analysis-${Date.now()}.json`;
    a.click();
  };

  const downloadSourceVideo = () => {
    if (!file || !videoUrl) return;
    const a = document.createElement('a');
    a.href = videoUrl;
    a.download = file.name || "source_video.mp4";
    a.click();
  };

  const handleDownloadRequest = (clip: Clip) => {
    setClipToDownload(clip);
    setShowDownloadModal(true);
  };

  const confirmDownload = () => {
    if (clipToDownload) {
      renderClip(clipToDownload, downloadFormat);
      setShowDownloadModal(false);
      setClipToDownload(null);
    }
  };

  const getEstimatedRemainingTime = () => {
    if (!isRendering || renderProgress <= 0 || renderStartTime === 0) return "Calculating...";
    const elapsed = (Date.now() - renderStartTime) / 1000;
    const rate = renderProgress / elapsed; 
    const remaining = (100 - renderProgress) / rate;
    if (remaining < 0) return "Finishing...";
    return remaining > 60 ? `~${Math.ceil(remaining / 60)} mins left` : `~${Math.ceil(remaining)}s left`;
  };

  const renderClip = async (clip: Clip, format: 'mp4' | 'webm' = 'mp4') => {
    if (!renderVideoRef.current || !renderCanvasRef.current || !videoUrl) return;
    setIsRendering(true);
    setRenderingClipId(clip.clip_number);
    setRenderProgress(0);
    setRenderStartTime(Date.now());

    const startTime = parseTimestampToSeconds(clip.start_time);
    const endTime = parseTimestampToSeconds(clip.end_time);
    const duration = endTime - startTime;
    const video = renderVideoRef.current;
    const canvas = renderCanvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: false }); 
    if (!ctx) return;

    canvas.width = renderQuality === '1080p' ? 1080 : 720;
    canvas.height = renderQuality === '1080p' ? 1920 : 1280;
    video.src = videoUrl;
    video.volume = 0;
    video.currentTime = startTime;

    await new Promise(resolve => video.addEventListener('seeked', resolve, { once: true }));
    if (video.readyState < 2) await new Promise(resolve => video.onloadeddata = resolve);

    const stream = canvas.captureStream(30);
    try {
      const audioS = (video as any).captureStream ? (video as any).captureStream() : (video as any).mozCaptureStream();
      if (audioS.getAudioTracks().length > 0) stream.addTrack(audioS.getAudioTracks()[0]);
    } catch (e) {}

    const mime = format === 'mp4' ? 'video/mp4;codecs=h264,aac' : 'video/webm;codecs=h264,opus';
    const finalMime = MediaRecorder.isTypeSupported(mime) ? mime : 'video/webm';
    const mediaRecorder = new MediaRecorder(stream, { mimeType: finalMime, videoBitsPerSecond: renderQuality === '1080p' ? 5000000 : 2500000 });
    const chunks: Blob[] = [];
    mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
    mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: finalMime });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `clip_${clip.clip_number}.${finalMime.includes('mp4') ? 'mp4' : 'webm'}`;
        a.click();
        setIsRendering(false);
    };

    mediaRecorder.start();
    video.play();
    
    const loop = () => {
        if (video.currentTime >= endTime || video.ended || video.paused) {
            if (mediaRecorder.state === 'recording') mediaRecorder.stop();
            video.pause();
            return;
        }
        const vW = video.videoWidth, vH = video.videoHeight, target = 9/16;
        let dW = vH * target, dH = vH, sX = (vW - dW) / 2, sY = 0;
        if (vW/vH < target) { dW = vW; dH = vW/target; sX = 0; sY = (vH - dH)/2; }
        ctx.drawImage(video, sX, sY, dW, dH, 0, 0, canvas.width, canvas.height);
        setRenderProgress(Math.min(99, ((video.currentTime - startTime) / duration) * 100));
        requestAnimationFrame(loop);
    };
    loop();
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white pb-20">
      <div className="hidden opacity-0 pointer-events-none fixed top-0 left-0">
         <video ref={renderVideoRef} crossOrigin="anonymous" playsInline />
         <canvas ref={renderCanvasRef} />
      </div>

      {showDownloadModal && clipToDownload && (
          <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-gray-800 rounded-2xl border border-gray-700 max-w-md w-full shadow-2xl overflow-hidden p-6">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-bold">Download Clip #{clipToDownload.clip_number}</h3>
                      <button onClick={() => setShowDownloadModal(false)}><X size={20} /></button>
                  </div>
                  <div className="space-y-4 mb-6">
                      <div className="bg-gray-900 p-4 rounded-lg border border-gray-800">
                          <p className="text-white font-bold">{clipToDownload.title}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                          <button onClick={() => setDownloadFormat('mp4')} className={`p-3 rounded-lg border-2 ${downloadFormat === 'mp4' ? 'border-primary-500 bg-primary-900/20' : 'border-gray-700 bg-gray-800'}`}>MP4</button>
                          <button onClick={() => setDownloadFormat('webm')} className={`p-3 rounded-lg border-2 ${downloadFormat === 'webm' ? 'border-primary-500 bg-primary-900/20' : 'border-gray-700 bg-gray-800'}`}>WebM</button>
                      </div>
                  </div>
                  <div className="flex gap-3">
                      <Button variant="secondary" onClick={() => setShowDownloadModal(false)} fullWidth>Cancel</Button>
                      <Button onClick={confirmDownload} fullWidth><Download size={18} /> Render</Button>
                  </div>
              </div>
          </div>
      )}

      {isRendering && (
          <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center flex-col p-8">
              <div className="bg-gray-800 p-8 rounded-2xl border border-gray-700 max-w-md w-full text-center">
                  <Loader2 className="animate-spin text-primary-500 mx-auto mb-6" size={48} />
                  <h3 className="text-xl font-bold mb-2">Rendering Clip #{renderingClipId}</h3>
                  <div className="w-full bg-gray-700 rounded-full h-4 overflow-hidden mb-2">
                      <div className="bg-primary-500 h-full" style={{ width: `${renderProgress}%` }}></div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">{Math.round(renderProgress)}% <span>{getEstimatedRemainingTime()}</span></div>
              </div>
          </div>
      )}

      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-md h-16 flex items-center px-4 sm:px-8">
        <div className="flex items-center gap-4">
          {state !== AppState.IDLE && <button onClick={resetApp} className="text-gray-400 hover:text-white"><ArrowLeft size={24} /></button>}
          <h1 className="text-xl font-bold">ViralClip AI</h1>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 sm:px-8 py-8">
        {state === AppState.IDLE && !result && (
           <div className="max-w-2xl mx-auto mt-10">
              <div className="text-center mb-10">
                <h2 className="text-4xl font-bold mb-4">Long Video to Viral Shorts</h2>
                <p className="text-gray-400">Upload up to 5GB or use a YouTube link.</p>
              </div>
              <div className="flex justify-center mb-6 gap-2 bg-gray-800 p-1 rounded-lg w-fit mx-auto border border-gray-700">
                <button onClick={() => setInputMode('upload')} className={`px-6 py-2 rounded-md ${inputMode === 'upload' ? 'bg-primary-600' : 'text-gray-400'}`}>Upload</button>
                <button onClick={() => setInputMode('url')} className={`px-6 py-2 rounded-md ${inputMode === 'url' ? 'bg-primary-600' : 'text-gray-400'}`}>YouTube</button>
              </div>
              {inputMode === 'upload' ? (
                <div className="bg-gray-800 border-2 border-dashed border-gray-700 rounded-2xl p-10 flex flex-col items-center">
                  <input type="file" accept="video/*" onChange={handleFileChange} className="hidden" id="v-up" />
                  {!file ? (
                    <label htmlFor="v-up" className="cursor-pointer flex flex-col items-center">
                      <Upload size={48} className="text-gray-400 mb-4" />
                      <h3 className="text-xl font-semibold">Click to upload video</h3>
                    </label>
                  ) : (
                    <div className="w-full text-center">
                      <FileVideo size={32} className="text-primary-500 mx-auto mb-4" />
                      <p className="mb-6">{file.name}</p>
                      <Button onClick={handleAnalyze} size="lg" fullWidth>Analyze Video</Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-gray-800 border border-gray-700 rounded-2xl p-8 flex flex-col sm:flex-row gap-2">
                  <input type="text" placeholder="https://youtube.com/..." value={urlInput} onChange={(e)=>setUrlInput(e.target.value)} className="flex-grow bg-gray-900 border border-gray-700 rounded-lg px-4 h-12" />
                  <Button onClick={handleUrlAnalyze} disabled={!urlInput || isFetchingUrl} className="h-12 px-8">{isFetchingUrl ? <Loader2 className="animate-spin"/> : "Analyze"}</Button>
                </div>
              )}
              {error && <div className="mt-4 p-4 bg-red-900/20 border border-red-900/50 rounded-lg text-red-200 text-sm">{error}</div>}
           </div>
        )}

        {state === AppState.ANALYZING && (
          <div className="flex flex-col items-center py-20">
            <Loader2 size={48} className="animate-spin text-primary-500 mb-6" />
            <h3 className="text-2xl font-bold mb-4">Analyzing Video...</h3>
            <div className="w-full max-w-md bg-gray-700 rounded-full h-4 overflow-hidden border border-gray-600">
               <div className="bg-primary-500 h-full" style={{ width: `${analysisProgress}%` }}></div>
            </div>
            <p className="mt-4 text-gray-500 text-sm">This may take a few minutes for larger videos.</p>
          </div>
        )}

        {state === AppState.COMPLETE && result && (
          <div className="animate-fade-in">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              <div className="lg:col-span-2">
                 <div className="flex justify-between items-center mb-2">
                    <h3 className="text-gray-400 text-sm font-semibold">Preview</h3>
                    <div className="flex bg-gray-800 rounded-lg p-1 border border-gray-700">
                        <button onClick={() => setPreviewMode('original')} className={`px-3 py-1 text-xs ${previewMode === 'original' ? 'bg-gray-600' : 'text-gray-400'}`}>Original</button>
                        <button onClick={() => setPreviewMode('9:16')} className={`px-3 py-1 text-xs ${previewMode === '9:16' ? 'bg-primary-600' : 'text-gray-400'}`}>Vertical</button>
                    </div>
                 </div>
                 <div className="bg-black rounded-xl border border-gray-800 flex items-center justify-center h-[500px] overflow-hidden">
                    <div className={previewMode === '9:16' ? 'h-full aspect-[9/16]' : 'w-full h-full'}>
                      <video ref={videoRef} src={videoUrl || ""} controls className="w-full h-full object-contain" />
                    </div>
                 </div>
                 <WaveformTimeline videoRef={videoRef} segments={result.video_transcription.segments} />
              </div>
              <div className="bg-gray-800 p-5 rounded-xl border border-gray-700 flex flex-col">
                <h3 className="text-gray-400 text-xs font-bold uppercase mb-4 flex gap-2"><Settings size={14}/> Actions</h3>
                <div className="space-y-4 mb-auto">
                    <div className="flex justify-between border-b border-gray-700 pb-2"><span>Clips Found</span><span className="font-bold">{result.clip_catalog.length}</span></div>
                    <div className="flex justify-between border-b border-gray-700 pb-2"><span>Top 10 Potential</span><span className="font-bold">{result.top_10_clips.length}</span></div>
                </div>
                <div className="space-y-2 mt-6">
                   <Button variant="primary" fullWidth onClick={downloadSourceVideo}><Download size={16}/> Download Full Video</Button>
                   <Button variant="outline" fullWidth onClick={downloadJSON}><Download size={16}/> Export JSON</Button>
                   <Button variant="secondary" fullWidth onClick={resetApp}><ArrowLeft size={16}/> Start New</Button>
                </div>
              </div>
            </div>

            <div className="flex border-b border-gray-800 mb-6 sticky top-0 bg-gray-900 z-40">
              {['clips', 'topics', 'transcript'].map((t:any) => (
                <button key={t} onClick={() => setActiveTab(t)} className={`px-6 py-3 text-sm border-b-2 capitalize transition-all ${activeTab === t ? 'border-primary-500 text-white' : 'border-transparent text-gray-400'}`}>{t}</button>
              ))}
            </div>

            {activeTab === 'clips' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                 {result.clip_catalog.map(clip => (
                   <ClipCard key={clip.clip_number} clip={clip} isTop10={result.top_10_clips.includes(clip.clip_number)} onPlay={jumpToTimestamp} onDownload={handleDownloadRequest} />
                 ))}
              </div>
            )}
            {activeTab === 'topics' && <TopicMap topics={result.topic_map.topics} themes={result.topic_map.primary_themes} arc={result.topic_map.storytelling_arc} />}
            {activeTab === 'transcript' && (
              <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 max-h-[600px] overflow-y-auto">
                {result.video_transcription.segments.map((seg, i) => (
                  <div key={i} className="flex gap-4 p-2 hover:bg-gray-700 rounded cursor-pointer transition-colors" onClick={() => jumpToTimestamp(seg.timestamp)}>
                    <span className="text-primary-400 font-mono text-sm shrink-0">{seg.timestamp}</span>
                    <p className="text-gray-300 text-sm leading-relaxed">{seg.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default App;