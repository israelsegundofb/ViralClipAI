
import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileVideo, AlertCircle, PlayCircle, Grid, BarChart2, Download, TrendingUp, Smartphone, Monitor, ArrowLeft, Layers, Loader2, List, Settings, Zap, Highlighter, Link as LinkIcon, Youtube, X, CheckCircle2 } from 'lucide-react';
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
  const [showSafeZones, setShowSafeZones] = useState(true);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  
  // Input Mode
  const [inputMode, setInputMode] = useState<'upload' | 'url'>('upload');
  const [urlInput, setUrlInput] = useState('');
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  const [resolvedFallbackUrl, setResolvedFallbackUrl] = useState<string | null>(null);
  
  // Rendering State
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderingClipId, setRenderingClipId] = useState<number | null>(null);
  const [renderQuality, setRenderQuality] = useState<'720p' | '1080p'>('720p'); // Default to 720p for speed
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
      // Size check updated to 5GB
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
      // Strip common tracking params
      ['feature', 't', 'si', 'pp'].forEach(p => urlObj.searchParams.delete(p));
      
      // Keep only v param for watch URLs
      if (urlObj.hostname.includes('youtube.com') && urlObj.pathname === '/watch') {
        const v = urlObj.searchParams.get('v');
        if (v) return `https://www.youtube.com/watch?v=${v}`;
      }
      // Return bare URL for youtu.be
      if (urlObj.hostname.includes('youtu.be')) {
         return `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
      }
      return urlObj.toString();
    } catch {
      return url;
    }
  };

  const getYoutubeVideoId = (url: string): string | null => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const resolveYoutubeVideo = async (url: string): Promise<{ url: string, filename: string }> => {
    const errors: string[] = [];
    const cleanUrl = cleanYoutubeUrl(url);
    const videoId = getYoutubeVideoId(cleanUrl);

    if (!videoId) {
        throw new Error("Could not extract video ID from URL");
    }

    // Standardized Fetch Helper with Proxy Rotation
    const fetchWithProxy = async (url: string, options: RequestInit = {}) => {
       // Method check - GET vs POST affect proxy choice
       const isPost = options.method === 'POST';

       const proxies = isPost ? [
          // POST Compatible Proxies
          (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
          (u: string) => `https://thingproxy.freeboard.io/fetch/${u}`,
          (u: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`
       ] : [
          // GET Compatible Proxies - Prioritize CodeTabs/AllOrigins for JSON
          (u: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
          (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
          (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
          (u: string) => `https://thingproxy.freeboard.io/fetch/${u}`
       ];

       // 1. Try Direct (if no-cors is acceptable or API supports CORS)
       try {
          const res = await fetch(url, { ...options, referrerPolicy: 'no-referrer' });
          if (res.ok) return res;
       } catch {}

       // 2. Try Proxies
       for (const proxyGen of proxies) {
          try {
             const res = await fetch(proxyGen(url), { ...options, referrerPolicy: 'no-referrer' });
             if (res.ok) return res;
          } catch {}
       }
       throw new Error("Connection failed via all proxies");
    };

    // Retry Helper
    const tryResolve = async (name: string, instances: string[], logic: (base: string) => Promise<{url:string, filename:string} | null>) => {
       // Randomize to spread load
       const shuffled = [...instances].sort(() => Math.random() - 0.5).slice(0, 10); // Try up to 10
       for (const base of shuffled) {
          try {
             const result = await logic(base);
             if (result) return result;
          } catch (e: any) {
             errors.push(`${name}(${base}): ${e.message}`);
          }
       }
       return null;
    };

    // --- STRATEGY 1: PIPED API (Best for raw streams) ---
    const pipedInstances = [
        'https://pipedapi.kavin.rocks',
        'https://api.piped.privacydev.net',
        'https://pipedapi.drgns.space',
        'https://pipedapi.sq.r4fo.com',
        'https://api.piped.yt',
        'https://pipedapi.frontendfriendly.xyz',
        'https://api.piped.projectsegfau.lt',
        'https://pipedapi.moomoo.me',
        'https://pipedapi.smnz.de',
        'https://pipedapi.adminforge.de',
        'https://pipedapi.lunar.icu',
        'https://pipedapi.leptons.xyz',
        'https://pipedapi.ducks.party',
        'https://pa.il.ax',
        'https://api.piped.r4fo.com',
        'https://pipedapi.kavin.rocks',
        'https://piped-api.lunar.icu'
    ];

    const pipedResult = await tryResolve('Piped', pipedInstances, async (base) => {
        const res = await fetchWithProxy(`${base}/streams/${videoId}`);
        const data = await res.json();
        
        if (data.videoStreams && Array.isArray(data.videoStreams)) {
            // Filter: Prefer audio+video.
            let streams = data.videoStreams;
            
            // Prefer streams that are NOT videoOnly (so they have audio)
            const muxedStreams = streams.filter((s: any) => s.videoOnly === false);
            if (muxedStreams.length > 0) {
                streams = muxedStreams;
            }
            
            if (streams.length > 0) {
                // Quality sort: 1080p -> 720p -> 480p -> 360p
                const qualityOrder = ['1080p', '720p', '480p', '360p'];
                streams.sort((a: any, b: any) => {
                    const idxA = qualityOrder.indexOf(a.quality);
                    const idxB = qualityOrder.indexOf(b.quality);
                    const valA = idxA === -1 ? 99 : idxA;
                    const valB = idxB === -1 ? 99 : idxB;
                    return valA - valB;
                });
                return { 
                    url: streams[0].url, 
                    filename: `${data.title || 'video'}.mp4` 
                };
            }
        }
        return null;
    });
    if (pipedResult) return pipedResult;

    // --- STRATEGY 2: INVIDIOUS API ---
    const invidiousInstances = [
        'https://inv.tux.pizza',
        'https://invidious.projectsegfau.lt',
        'https://invidious.jing.rocks',
        'https://vid.puffyan.us',
        'https://invidious.nerdvpn.de',
        'https://inv.zzls.xyz',
        'https://invidious.perennialte.ch',
        'https://yt.artemislena.eu',
        'https://invidious.privacyredirect.com',
        'https://invidious.drgns.space',
        'https://invidious.lunar.icu',
        'https://invidious.fdn.fr',
        'https://invidious.io.lol',
        'https://invidious.private.coffee',
        'https://iv.ggtyler.dev',
        'https://invidious.flokinet.to',
        'https://invidious.privacydev.net'
    ];

    const invidiousResult = await tryResolve('Invidious', invidiousInstances, async (base) => {
        const res = await fetchWithProxy(`${base}/api/v1/videos/${videoId}`);
        const data = await res.json();
        
        // 1. Check formatStreams (pre-muxed)
        if (data.formatStreams && Array.isArray(data.formatStreams) && data.formatStreams.length > 0) {
            // Prefer mp4
            let stream = data.formatStreams.find((s: any) => s.container === 'mp4');
            // Or take first available
            if (!stream) stream = data.formatStreams[0];

            if (stream && stream.url) {
                return { 
                    url: stream.url, 
                    filename: `${data.title || 'video'}.${stream.container || 'mp4'}` 
                };
            }
        }
        
        // 2. Fallback: adaptiveFormats (if no muxed streams available)
        if (data.adaptiveFormats && Array.isArray(data.adaptiveFormats)) {
           // Find highest bitrate video that we might be able to download (browser might not play it if audio is separate, but better than nothing)
           // Actually, let's look for a stream that might have both or just try the best video.
           // Invidious adaptive formats separate audio/video usually. 
           // We will skip for now to avoid silent video, unless we are desperate.
        }

        return null;
    });
    if (invidiousResult) return invidiousResult;

    // --- STRATEGY 3: COBALT API (Final fallback) ---
    const cobaltInstances = [
        'https://cobalt.kwiatekmiki.pl',
        'https://api.tiklydown.eu',
        'https://cobalt.arms.nu',
        'https://cobalt.xyzen.dev',
        'https://api.doubutsu.wtf',
        'https://cobalt.q1.pm',
        'https://cobalt.pladys.me',
        'https://cobalt.club',
        'https://cobalt.datasync.pw',
        'https://cobalt.kinsh.uk',
        'https://cobalt.run',
        'https://api.cobalt.tools',
        'https://cobalt.grid.cl',
        'https://cobalt.nerds.pw',
        'https://cobalt.anishapps.com',
        'https://cobalt.200021.xyz',
        'https://cobalt.slpy.one'
    ];

    const cobaltResult = await tryResolve('Cobalt', cobaltInstances, async (base) => {
        const endpoint = base.endsWith('/') ? `${base}api/json` : `${base}/api/json`;
        
        const res = await fetchWithProxy(endpoint, {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: cleanUrl }),
            referrerPolicy: 'no-referrer'
        });

        if (res.ok) {
            const data = await res.json();
            const u = data.url || (data.picker && data.picker[0]?.url);
            if (u) return { url: u, filename: data.filename || 'video.mp4' };
        }
        return null;
    });
    if (cobaltResult) return cobaltResult;

    console.warn("All resolution strategies failed.", errors);
    const providers = Array.from(new Set(errors.map(e => e.split('(')[0]))).join(', ');
    throw new Error(`Could not resolve video stream. Providers tried: ${providers || 'None'}. Detailed errors in console.`);
  };

  const handleUrlAnalyze = async () => {
    const trimmedUrl = urlInput.trim();
    if (!trimmedUrl) {
      setError("Please enter a valid URL.");
      return;
    }

    setState(AppState.ANALYZING);
    setAnalysisProgress(1);
    setIsFetchingUrl(true);
    setError(null);
    setResolvedFallbackUrl(null);

    try {
      let downloadUrl = trimmedUrl;
      let filename = "imported_video.mp4";
      
      if (trimmedUrl.includes('youtube.com') || trimmedUrl.includes('youtu.be')) {
        setAnalysisProgress(2);
        console.log("Resolving YouTube URL...");
        try {
           const resolved = await resolveYoutubeVideo(trimmedUrl);
           downloadUrl = resolved.url;
           filename = resolved.filename;
           // Sanitize filename
           filename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
           
           setResolvedFallbackUrl(downloadUrl);
           console.log("Resolved to direct stream:", downloadUrl);
        } catch (resolverError: any) {
           throw new Error(`YouTube Resolution Failed: ${resolverError.message}`);
        }
      } else {
        const urlParts = trimmedUrl.split('/');
        const lastPart = urlParts[urlParts.length - 1];
        if (lastPart && (lastPart.includes('.mp4') || lastPart.includes('.mov'))) {
            filename = lastPart.split('?')[0];
        }
      }

      setAnalysisProgress(5);
      
      console.log("Fetching video data via proxy...");
      
      let response;
      let usedProxy = '';
      
      // Proxy Rotation for binary data (Video Blob)
      const proxyGenerators = [
        (u: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
        (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
        (u: string) => `https://thingproxy.freeboard.io/fetch/${u}`,
        (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`
      ];

      for (const gen of proxyGenerators) {
         try {
            const res = await fetch(gen(downloadUrl), { referrerPolicy: 'no-referrer' });
            if (res.ok) {
               response = res;
               usedProxy = gen(downloadUrl).split('/')[2];
               break;
            }
         } catch {}
      }
      
      if (!response || !response.ok) {
        throw new Error(`Failed to download video data. All proxies failed.`);
      }
      
      console.log(`Video fetch successful using ${usedProxy}`);
      
      const blob = await response.blob();
      
      if (blob.size > 750 * 1024 * 1024) {
         throw new Error(`Video is too large for browser analysis (${(blob.size/1024/1024).toFixed(0)}MB). Please download it manually and use the "Upload Video" tab (supports up to 5GB).`);
      }

      // Check for Text/HTML content (proxy error pages)
      if (blob.type.includes('text') || blob.type.includes('html')) {
          throw new Error("Proxy returned invalid data (HTML/Text). The video link might be expired or blocking access.");
      }

      // Infer mime type if blob has it, else default
      const mimeType = blob.type.includes('video') ? blob.type : 'video/mp4';
      if (!filename.includes('.')) {
          filename += mimeType.includes('webm') ? '.webm' : '.mp4';
      }

      const convertedFile = new File([blob], filename, { type: mimeType }); 

      console.log("Video downloaded successfully:", convertedFile.size);
      setIsFetchingUrl(false);

      setFile(convertedFile);
      setVideoUrl(URL.createObjectURL(convertedFile));
      
      const data = await analyzeVideo(convertedFile, (progress) => {
        setAnalysisProgress(10 + (progress * 0.9));
      });
      setResult(data);
      setState(AppState.COMPLETE);

    } catch (err: any) {
      console.error("URL Analysis Error:", err);
      setIsFetchingUrl(false);
      
      let msg = err.message;
      if (msg.includes('Failed to fetch')) {
        msg = "Network error: Could not download video. The external link might be blocking access.";
      }
      setError(msg);
      setState(AppState.ERROR);
    }
  };

  const handleAnalyze = async () => {
    if (!file) return;
    
    setState(AppState.ANALYZING);
    setError(null);
    setAnalysisProgress(0);
    setResolvedFallbackUrl(null);
    
    try {
      const data = await analyzeVideo(file, (progress) => {
        setAnalysisProgress(progress);
      });
      setResult(data);
      setState(AppState.COMPLETE);
    } catch (err: any) {
      console.error("Analysis Error:", err);
      
      let errorMessage = "An unexpected error occurred during analysis.";
      
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'string') {
        errorMessage = err;
      } else if (err && typeof err === 'object') {
        if (err.error && err.error.message) {
            errorMessage = err.error.message;
        } else {
            try {
              errorMessage = JSON.stringify(err);
              if (errorMessage === '{}' && err.message) errorMessage = err.message;
              if (errorMessage === '{}') errorMessage = "Unknown error object received.";
            } catch {
              errorMessage = "An error occurred that could not be displayed.";
            }
        }
      }

      setError(errorMessage);
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
    setResult(null);
    setAnalysisProgress(0);
    setUrlInput('');
    setIsFetchingUrl(false);
    setResolvedFallbackUrl(null);
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
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const downloadSourceVideo = () => {
    if (!file || !videoUrl) return;
    const a = document.createElement('a');
    a.href = videoUrl;
    a.download = file.name || "source_video.mp4";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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
    if (elapsed < 1) return "Calculating...";

    const rate = renderProgress / elapsed; // % per second
    const remaining = (100 - renderProgress) / rate;
    
    if (remaining < 0) return "Finishing...";
    if (remaining > 60) {
        const mins = Math.ceil(remaining / 60);
        return `~${mins} mins left`;
    }
    return `~${Math.ceil(remaining)}s left`;
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

    if (!ctx) {
      setIsRendering(false);
      alert("Could not initialize rendering context.");
      return;
    }

    const width = renderQuality === '1080p' ? 1080 : 720;
    const height = renderQuality === '1080p' ? 1920 : 1280;
    const bitrate = renderQuality === '1080p' ? 5000000 : 2500000; 

    canvas.width = width;
    canvas.height = height;

    // Reset video source safely
    video.src = videoUrl;
    video.volume = 0; // Important: Mute via volume, don't use 'muted' attribute if we want track access in some browsers
    video.currentTime = startTime;

    // Strict seek wait
    await new Promise(resolve => {
        const onSeek = () => {
            video.removeEventListener('seeked', onSeek);
            resolve(null);
        };
        video.addEventListener('seeked', onSeek);
        video.currentTime = startTime;
    });
    
    // Ensure data loaded
    if (video.readyState < 2) {
        await new Promise(resolve => {
             video.onloadeddata = resolve;
        });
    }

    const stream = canvas.captureStream(30);
    
    let audioStream: MediaStream | null = null;
    try {
       // @ts-ignore
       if (video.captureStream) {
         // @ts-ignore
         audioStream = video.captureStream();
       } else if ((video as any).mozCaptureStream) { 
         audioStream = (video as any).mozCaptureStream();
       }
    } catch (e) {
      console.warn("Could not capture audio stream from video element directly.", e);
    }

    if (audioStream) {
      const audioTracks = audioStream.getAudioTracks();
      if (audioTracks.length > 0) {
        stream.addTrack(audioTracks[0]);
      } else {
        console.warn("No audio tracks found on video stream.");
      }
    }

    let mimeTypes = [];
    if (format === 'mp4') {
        mimeTypes = [
            'video/mp4;codecs=h264,aac',
            'video/mp4',
            'video/webm;codecs=h264,opus', 
            'video/webm'
        ];
    } else {
        mimeTypes = [
            'video/webm;codecs=h264,opus',
            'video/webm;codecs=vp9,opus',
            'video/webm',
            'video/mp4;codecs=h264,aac',
            'video/mp4'
        ];
    }
    
    let selectedMimeType = '';
    for (const type of mimeTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        selectedMimeType = type;
        break;
      }
    }

    if (!selectedMimeType) {
        alert("Your browser does not support video recording.");
        setIsRendering(false);
        return;
    }

    const mediaRecorder = new MediaRecorder(stream, {
        mimeType: selectedMimeType,
        videoBitsPerSecond: bitrate
    });

    const chunks: Blob[] = [];
    mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: selectedMimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const ext = selectedMimeType.includes('mp4') ? 'mp4' : 'webm'; 
        a.download = `clip_${clip.clip_number}_${(clip.title || 'video').replace(/[^a-z0-9]/gi, '_')}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        setIsRendering(false);
        setRenderingClipId(null);
    };

    mediaRecorder.start();
    
    try {
        await video.play();
    } catch(e) {
        console.error("Playback failed during render:", e);
        setIsRendering(false);
        return;
    }
    
    const drawFrame = () => {
        const vidW = video.videoWidth;
        const vidH = video.videoHeight;
        
        // Center crop logic for 9:16
        const targetAspect = 9 / 16;
        let drawW = vidH * targetAspect;
        let drawH = vidH;
        let startX = (vidW - drawW) / 2;
        let startY = 0;
        
        // If video is already narrower than target, fit width
        if (vidW / vidH < targetAspect) {
             drawW = vidW;
             drawH = vidW / targetAspect;
             startX = 0;
             startY = (vidH - drawH) / 2;
        }

        ctx.drawImage(video, startX, startY, drawW, drawH, 0, 0, canvas.width, canvas.height);
    };

    if ('requestVideoFrameCallback' in video) {
        const onFrame = (now: number, metadata: VideoFrameMetadata) => {
            if (!isRendering && !renderingClipId) {
                // Stopped externally
                return;
            }
            
            if (video.currentTime >= endTime || video.ended || video.paused) {
                if (mediaRecorder.state === 'recording') {
                   mediaRecorder.stop();
                   video.pause();
                }
                return; 
            }

            drawFrame();

            const currentProgress = ((video.currentTime - startTime) / duration) * 100;
            setRenderProgress(Math.min(99, Math.max(0, currentProgress)));

            video.requestVideoFrameCallback(onFrame);
        };
        video.requestVideoFrameCallback(onFrame);
    } else {
        const renderLoop = () => {
            if (video.currentTime >= endTime || video.ended || video.paused) {
                if (mediaRecorder.state === 'recording') {
                   mediaRecorder.stop();
                   video.pause();
                }
                return;
            }

            drawFrame();
            
            const currentProgress = ((video.currentTime - startTime) / duration) * 100;
            setRenderProgress(Math.min(99, Math.max(0, currentProgress)));
            
            requestAnimationFrame(renderLoop);
        };
        renderLoop();
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white pb-20">
      <div className="hidden opacity-0 pointer-events-none fixed top-0 left-0">
         <video 
            ref={renderVideoRef} 
            crossOrigin="anonymous" 
            playsInline
         />
         <canvas ref={renderCanvasRef} />
      </div>

      {showDownloadModal && clipToDownload && (
          <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-gray-800 rounded-2xl border border-gray-700 max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                  <div className="p-6 border-b border-gray-700 flex justify-between items-center">
                      <h3 className="text-xl font-bold text-white">Download Clip #{clipToDownload.clip_number}</h3>
                      <button onClick={() => setShowDownloadModal(false)} className="text-gray-400 hover:text-white transition-colors">
                          <X size={20} />
                      </button>
                  </div>
                  
                  <div className="p-6 space-y-6">
                      <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-800">
                          <p className="text-sm font-medium text-gray-300 mb-1">Title</p>
                          <p className="text-white font-bold text-lg line-clamp-2">{clipToDownload.title}</p>
                          <div className="flex gap-4 mt-2 text-xs text-gray-400">
                             <span>Duration: {clipToDownload.duration}</span>
                             <span>Format: 9:16 Vertical</span>
                          </div>
                      </div>

                      <div className="space-y-3">
                          <label className="text-sm font-medium text-gray-300 block">Select Format</label>
                          <div className="grid grid-cols-2 gap-3">
                              <button 
                                  onClick={() => setDownloadFormat('mp4')}
                                  className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all ${downloadFormat === 'mp4' ? 'border-primary-500 bg-primary-900/20 text-white' : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'}`}
                              >
                                  <span className="font-bold text-lg">MP4</span>
                                  <span className="text-xs opacity-70">Best compatibility</span>
                                  {downloadFormat === 'mp4' && <CheckCircle2 size={16} className="text-primary-500 mt-1" />}
                              </button>
                              <button 
                                  onClick={() => setDownloadFormat('webm')}
                                  className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all ${downloadFormat === 'webm' ? 'border-primary-500 bg-primary-900/20 text-white' : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'}`}
                              >
                                  <span className="font-bold text-lg">WebM</span>
                                  <span className="text-xs opacity-70">Smaller size</span>
                                  {downloadFormat === 'webm' && <CheckCircle2 size={16} className="text-primary-500 mt-1" />}
                              </button>
                          </div>
                          <p className="text-xs text-gray-500 italic text-center mt-2">
                            Note: If your browser doesn't support the selected format, the best available alternative will be used automatically.
                          </p>
                      </div>
                  </div>
                  
                  <div className="p-6 border-t border-gray-700 bg-gray-900/30 flex gap-3">
                      <Button variant="secondary" onClick={() => setShowDownloadModal(false)} fullWidth>
                          Cancel
                      </Button>
                      <Button onClick={confirmDownload} fullWidth className="gap-2">
                          <Download size={18} /> Start Rendering
                      </Button>
                  </div>
              </div>
          </div>
      )}

      {isRendering && (
          <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center flex-col">
              <div className="bg-gray-800 p-8 rounded-2xl border border-gray-700 max-w-md w-full shadow-2xl text-center">
                  <div className="w-16 h-16 bg-primary-900/50 rounded-full flex items-center justify-center mx-auto mb-6 relative">
                      <Loader2 className="animate-spin text-primary-500" size={32} />
                      <div className="absolute inset-0 border-4 border-primary-500/20 rounded-full"></div>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Rendering Clip #{renderingClipId}</h3>
                  <p className="text-gray-400 mb-6 text-sm">
                    Creating {renderQuality} vertical video...<br/>
                    <span className="text-xs text-gray-500">Optimizing for fast download</span>
                  </p>
                  
                  <div className="w-full bg-gray-700 rounded-full h-4 overflow-hidden mb-2">
                      <div 
                          className="bg-gradient-to-r from-primary-600 to-purple-500 h-full transition-all duration-200"
                          style={{ width: `${renderProgress}%` }}
                      ></div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 font-mono">
                      <span>{Math.round(renderProgress)}%</span>
                      <span>{getEstimatedRemainingTime()}</span>
                  </div>
              </div>
          </div>
      )}

      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {state !== AppState.IDLE && (
              <button onClick={resetApp} className="text-gray-400 hover:text-white transition-colors" title="Back to Home">
                 <ArrowLeft size={24} />
              </button>
            )}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-purple-600 rounded-lg flex items-center justify-center">
                <PlayCircle size={20} className="text-white" />
              </div>
              <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
                ViralClip AI
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
             <a href="#" className="text-sm text-gray-400 hover:text-white transition-colors">Documentation</a>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {state === AppState.IDLE && !result && (
           <div className="max-w-2xl mx-auto mt-10">
              <div className="text-center mb-10">
                <h2 className="text-4xl font-bold mb-4">Turn Long Videos into Viral Shorts</h2>
                <p className="text-gray-400 text-lg">Upload a video up to 5GB or use a YouTube link. Our AI will analyze, transcribe, and extract the most engaging moments for you.</p>
              </div>

              <div className="flex justify-center mb-6">
                <div className="bg-gray-800 p-1 rounded-lg flex border border-gray-700">
                  <button 
                    onClick={() => setInputMode('upload')}
                    className={`px-6 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${inputMode === 'upload' ? 'bg-primary-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
                  >
                    <Upload size={16} /> Upload File
                  </button>
                  <button 
                    onClick={() => setInputMode('url')}
                    className={`px-6 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${inputMode === 'url' ? 'bg-primary-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
                  >
                    <Youtube size={16} /> YouTube / URL
                  </button>
                </div>
              </div>

              {inputMode === 'upload' && (
                <div className="bg-gray-800 border-2 border-dashed border-gray-700 rounded-2xl p-10 flex flex-col items-center justify-center text-center transition-colors hover:border-primary-500/50 hover:bg-gray-800/50 group animate-fade-in">
                  <input 
                    type="file" 
                    accept="video/*" 
                    onChange={handleFileChange} 
                    className="hidden" 
                    id="video-upload"
                  />
                  
                  {!file ? (
                    <label htmlFor="video-upload" className="cursor-pointer w-full flex flex-col items-center">
                      <div className="w-20 h-20 bg-gray-900 rounded-full flex items-center justify-center mb-6 shadow-inner group-hover:scale-110 transition-transform">
                        <Upload size={32} className="text-gray-400 group-hover:text-primary-500 transition-colors" />
                      </div>
                      <h3 className="text-xl font-semibold text-white mb-2">Click to upload or drag video here</h3>
                      <p className="text-gray-500">MP4, MOV, WebM supported (Max 5GB)</p>
                    </label>
                  ) : (
                    <div className="w-full">
                      <div className="flex items-center justify-center gap-3 mb-6">
                        <FileVideo size={32} className="text-primary-500" />
                        <span className="text-lg font-medium truncate max-w-xs">{file.name}</span>
                        <button onClick={() => { setFile(null); setVideoUrl(null); }} className="text-gray-500 hover:text-red-400">
                          <span className="text-xs underline">Remove</span>
                        </button>
                      </div>
                      <Button onClick={handleAnalyze} size="lg" className="mx-auto px-8 py-3 text-lg w-full max-w-sm">
                        Start AI Analysis
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {inputMode === 'url' && (
                 <div className="bg-gray-800 border border-gray-700 rounded-2xl p-8 animate-fade-in">
                    <div className="text-center mb-6">
                       <div className="w-16 h-16 bg-gray-900 rounded-full flex items-center justify-center mb-4 shadow-inner mx-auto">
                          <Youtube size={32} className="text-red-500" />
                       </div>
                       <h3 className="text-xl font-semibold text-white">Import from YouTube</h3>
                       <p className="text-sm text-gray-500 mt-2">Paste a YouTube link or a direct video URL below</p>
                    </div>

                    <div className="flex gap-2 max-w-xl mx-auto">
                       <input 
                          type="text" 
                          placeholder="https://www.youtube.com/watch?v=..." 
                          value={urlInput}
                          onChange={(e) => setUrlInput(e.target.value)}
                          className="flex-grow bg-gray-900 border border-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:border-transparent transition-all"
                       />
                       <Button onClick={handleUrlAnalyze} disabled={!urlInput || isFetchingUrl} className="shrink-0 px-6 min-w-[140px]">
                          {isFetchingUrl ? (
                             <>
                               <Loader2 className="animate-spin" />
                               <span className="ml-1 text-xs">
                                 {analysisProgress < 2 ? "Resolving..." : analysisProgress < 5 ? "Downloading..." : "Analyzing..."}
                               </span>
                             </>
                          ) : "Analyze Video"}
                       </Button>
                    </div>
                    
                    <div className="mt-4 text-xs text-gray-500 text-center flex flex-col items-center justify-center gap-1">
                       <div className="flex items-center gap-2">
                         <AlertCircle size={12} />
                         <span>Note: External tools are used to process YouTube links.</span>
                       </div>
                       <span className="opacity-70">Please ensure you have rights to process the content.</span>
                    </div>
                 </div>
              )}
              
              {error && (
                <div className="mt-4 p-4 bg-red-900/20 border border-red-900/50 rounded-lg flex items-center gap-3 text-red-200">
                  <AlertCircle size={20} className="shrink-0" />
                  <span className="break-words">{error}</span>
                </div>
              )}
           </div>
        )}

        {state === AppState.ANALYZING && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="relative mb-6">
              <div className="w-24 h-24 border-4 border-gray-800 rounded-full"></div>
              <div className="w-24 h-24 border-4 border-primary-500 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
            </div>
            
            <h3 className="text-2xl font-bold animate-pulse mb-2">
              {isFetchingUrl && analysisProgress < 10 ? "Downloading Video..." : analysisProgress < 30 ? "Uploading & Analyzing..." : analysisProgress < 80 ? "Processing Content..." : "Generating Insights..."}
            </h3>
            
            <div className="w-full max-w-md space-y-2">
              <div className="w-full bg-gray-700 rounded-full h-4 overflow-hidden border border-gray-600">
                <div 
                  className="bg-gradient-to-r from-blue-500 to-primary-600 h-full transition-all duration-300 ease-out"
                  style={{ width: `${analysisProgress}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-sm text-gray-400 font-mono">
                <span>{Math.round(analysisProgress)}% Complete</span>
                <span>{file?.name || 'Processing...'}</span>
              </div>
            </div>

            <p className="text-gray-400 mt-6 max-w-md text-center text-sm">
              Our AI is watching your video, transcribing speech, mapping topics, and measuring engagement signals. This may take a moment for larger files.
            </p>
          </div>
        )}

        {state === AppState.ERROR && !result && error && (
           <div className="flex flex-col items-center justify-center py-20">
              <div className="bg-red-900/20 border border-red-900/50 p-8 rounded-2xl max-w-2xl text-center">
                 <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
                 <h3 className="text-xl font-bold text-red-200 mb-2">Analysis Failed</h3>
                 <p className="text-gray-300 mb-6">{error}</p>
                 <div className="flex gap-4 justify-center flex-wrap">
                    <Button variant="secondary" onClick={resetApp}>Try Another Video</Button>
                    <Button onClick={inputMode === 'url' ? handleUrlAnalyze : handleAnalyze}>Retry Analysis</Button>
                    
                    {/* Manual Fallback Option */}
                    <a 
                       href={resolvedFallbackUrl || "https://cobalt.kwiatekmiki.pl"} 
                       target="_blank" 
                       rel="noreferrer" 
                       className="bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm"
                    >
                       <Download size={16} /> 
                       {resolvedFallbackUrl ? "Download Video Manually" : "Open Manual Downloader"}
                    </a>
                 </div>
                 <p className="text-xs text-gray-400 mt-4 max-w-md mx-auto">
                    {resolvedFallbackUrl 
                        ? 'If the automatic download fails, please download the video manually and upload it using the "Upload Video" tab.'
                        : 'If YouTube analysis fails repeatedly, please open the downloader, paste your link there, download the MP4, and upload it manually.'}
                 </p>
              </div>
           </div>
        )}

        {state === AppState.COMPLETE && result && (
          <div className="animate-fade-in">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              <div className="lg:col-span-2">
                 <div className="flex items-center justify-between mb-2">
                    <h3 className="text-gray-400 font-semibold text-sm">Preview Player</h3>
                    <div className="flex gap-2">
                      <div className="flex bg-gray-800 rounded-lg p-1 border border-gray-700">
                        <button 
                          onClick={() => setPreviewMode('original')}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${previewMode === 'original' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'}`}
                        >
                          <Monitor size={14} /> Original
                        </button>
                        <button 
                          onClick={() => setPreviewMode('9:16')}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${previewMode === '9:16' ? 'bg-primary-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                        >
                          <Smartphone size={14} /> Instagram 9:16
                        </button>
                      </div>
                      {previewMode === '9:16' && (
                        <button 
                          onClick={() => setShowSafeZones(!showSafeZones)}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${showSafeZones ? 'bg-gray-700 border-gray-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'}`}
                          title="Toggle UI Safe Zones"
                        >
                          <Layers size={14} /> Safe Zones
                        </button>
                      )}
                    </div>
                 </div>
                 
                 <div className="bg-black rounded-xl overflow-hidden shadow-2xl relative border border-gray-800 flex items-center justify-center h-[500px]">
                    <div className={`relative transition-all duration-300 ${previewMode === '9:16' ? 'h-full aspect-[9/16] ring-1 ring-gray-700 overflow-hidden' : 'w-full h-full'}`}>
                      <video 
                        ref={videoRef} 
                        src={videoUrl || ""} 
                        controls 
                        className={`w-full h-full transition-all duration-300 ${previewMode === '9:16' ? 'object-cover' : 'object-contain'}`}
                      />
                      {previewMode === '9:16' && (
                        <>
                          <div className="absolute top-2 right-2 bg-black/60 backdrop-blur text-white text-[10px] px-2 py-1 rounded border border-white/10 pointer-events-none z-10">
                            Instagram Preview
                          </div>
                          {showSafeZones && (
                            <div className="absolute inset-0 pointer-events-none z-0 opacity-40">
                              <div className="absolute right-2 bottom-20 flex flex-col gap-4 items-center">
                                <div className="w-8 h-8 rounded-full bg-white/20"></div>
                                <div className="w-8 h-8 rounded-full bg-white/20"></div>
                                <div className="w-8 h-8 rounded-full bg-white/20"></div>
                                <div className="w-8 h-8 rounded-full bg-white/20"></div>
                              </div>
                              <div className="absolute bottom-4 left-4 w-2/3 space-y-2">
                                <div className="h-3 w-1/3 bg-white/20 rounded"></div>
                                <div className="h-3 w-3/4 bg-white/20 rounded"></div>
                              </div>
                              <div className="absolute top-[10%] bottom-[20%] left-[5%] right-[15%] border border-dashed border-red-500/50 rounded-lg flex items-start justify-start p-1">
                                <span className="text-[8px] text-red-400 bg-black/50 px-1">Safe Zone</span>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                 </div>

                 <WaveformTimeline 
                    videoRef={videoRef}
                    segments={result.video_transcription.segments}
                 />

              </div>

              <div className="space-y-4">
                <div className="bg-gray-800 p-5 rounded-xl border border-gray-700 h-full flex flex-col">
                  <h3 className="text-gray-400 font-semibold mb-4 uppercase text-xs tracking-wider flex items-center gap-2">
                    <Settings size={14} /> Export Settings
                  </h3>
                  <div className="space-y-4 flex-grow">
                    <div className="flex justify-between items-center border-b border-gray-700 pb-3">
                      <span className="text-gray-300">Total Clips Found</span>
                      <span className="text-2xl font-bold text-white">{result.clip_catalog.length}</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-gray-700 pb-3">
                      <span className="text-gray-300">Aspect Ratio</span>
                      <div className="flex flex-col items-end">
                         <span className="font-medium text-white">9:16 Vertical</span>
                         <span className="text-xs text-green-400">Instagram Ready</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center border-b border-gray-700 pb-3">
                      <span className="text-gray-300">Render Quality</span>
                      <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-600">
                         <button 
                           onClick={() => setRenderQuality('720p')}
                           className={`px-3 py-1 text-xs rounded transition-colors flex items-center gap-1 ${renderQuality === '720p' ? 'bg-primary-600 text-white' : 'text-gray-400 hover:text-white'}`}
                           title="Faster rendering, smaller file size"
                         >
                            <Zap size={10} /> 720p
                         </button>
                         <button 
                           onClick={() => setRenderQuality('1080p')}
                           className={`px-3 py-1 text-xs rounded transition-colors flex items-center gap-1 ${renderQuality === '1080p' ? 'bg-primary-600 text-white' : 'text-gray-400 hover:text-white'}`}
                           title="Higher quality, slower rendering"
                         >
                            <Highlighter size={10} /> 1080p
                         </button>
                      </div>
                    </div>
                    {inputMode === 'url' && (
                       <div className="flex justify-between items-center border-b border-gray-700 pb-3">
                         <span className="text-gray-300">Source Video</span>
                         <button 
                           onClick={downloadSourceVideo}
                           className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded flex items-center gap-2 transition-colors"
                         >
                            <Download size={12} /> Save Full Video
                         </button>
                       </div>
                    )}
                  </div>
                  
                  <div className="pt-6 mt-auto space-y-3">
                     <Button variant="outline" fullWidth onClick={downloadJSON} className="gap-2">
                       <Download size={16} /> Export Analysis JSON
                     </Button>
                     <Button variant="secondary" fullWidth onClick={resetApp} className="gap-2">
                        <ArrowLeft size={16} /> Upload New Video
                     </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex border-b border-gray-800 mb-6 sticky top-16 bg-gray-900/95 backdrop-blur z-40">
              <button 
                onClick={() => setActiveTab('clips')}
                className={`px-6 py-3 font-medium text-sm flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'clips' ? 'border-primary-500 text-white' : 'border-transparent text-gray-400 hover:text-white'}`}
              >
                <Grid size={16} /> Viral Clips
              </button>
              <button 
                onClick={() => setActiveTab('topics')}
                className={`px-6 py-3 font-medium text-sm flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'topics' ? 'border-primary-500 text-white' : 'border-transparent text-gray-400 hover:text-white'}`}
              >
                <BarChart2 size={16} /> Topics & Insights
              </button>
              <button 
                onClick={() => setActiveTab('transcript')}
                className={`px-6 py-3 font-medium text-sm flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'transcript' ? 'border-primary-500 text-white' : 'border-transparent text-gray-400 hover:text-white'}`}
              >
                <List size={16} /> Full Transcript
              </button>
            </div>

            <div className="min-h-[400px]">
              {activeTab === 'clips' && (
                <div className="space-y-8">
                  <div>
                    <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                       <TrendingUp className="text-yellow-400" /> Top Performing Clips
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                       {result.clip_catalog
                         .filter(c => result.top_10_clips.includes(c.clip_number))
                         .slice(0, 3)
                         .map(clip => (
                           <ClipCard 
                              key={clip.clip_number} 
                              clip={clip} 
                              isTop10={true}
                              onPlay={jumpToTimestamp}
                              onDownload={handleDownloadRequest}
                              tags={[
                                 clip.clip_number === result.stats.highest_emotional_impact_clip_id ? 'Emotional' : '',
                                 clip.clip_number === result.stats.highest_viral_potential_clip_id ? 'Viral' : '',
                                 clip.clip_number === result.stats.most_educational_clip_id ? 'Educational' : ''
                              ].filter(Boolean)}
                           />
                         ))
                       }
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold mb-4 text-gray-400">All Detected Clips</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                       {result.clip_catalog
                         .filter(c => !result.top_10_clips.includes(c.clip_number) || result.top_10_clips.indexOf(c.clip_number) >= 3)
                         .map(clip => (
                           <ClipCard 
                              key={clip.clip_number} 
                              clip={clip} 
                              isTop10={result.top_10_clips.includes(clip.clip_number)}
                              onPlay={jumpToTimestamp}
                              onDownload={handleDownloadRequest}
                           />
                         ))
                       }
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'topics' && (
                <TopicMap 
                  topics={result.topic_map.topics} 
                  themes={result.topic_map.primary_themes}
                  arc={result.topic_map.storytelling_arc}
                />
              )}

              {activeTab === 'transcript' && (
                <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
                  <h3 className="text-xl font-bold mb-6">Full Video Transcription</h3>
                  <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                    {result.video_transcription.segments.map((seg, i) => (
                      <div key={i} className="flex gap-4 group hover:bg-gray-700/50 p-2 rounded transition-colors cursor-pointer" onClick={() => jumpToTimestamp(seg.timestamp)}>
                        <span className="text-primary-400 font-mono text-sm shrink-0 mt-0.5">{seg.timestamp}</span>
                        <p className="text-gray-300 leading-relaxed group-hover:text-white transition-colors">{seg.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

          </div>
        )}
      </main>
    </div>
  );
};

export default App;
