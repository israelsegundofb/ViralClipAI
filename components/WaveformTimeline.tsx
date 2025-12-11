import React, { useEffect, useRef, useMemo, useState } from 'react';
import { parseTimestampToSeconds } from '../utils';

interface WaveformTimelineProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  segments: Array<{ timestamp: string; text: string }>;
}

export const WaveformTimeline: React.FC<WaveformTimelineProps> = ({ videoRef, segments }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [duration, setDuration] = useState<number>(0);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const animationFrameRef = useRef<number>(null);

  // Initialize and listen for video metadata
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateDuration = () => setDuration(video.duration);
    
    // If metadata already loaded
    if (video.readyState >= 1) {
      updateDuration();
    }

    video.addEventListener('loadedmetadata', updateDuration);
    video.addEventListener('durationchange', updateDuration);

    return () => {
      video.removeEventListener('loadedmetadata', updateDuration);
      video.removeEventListener('durationchange', updateDuration);
    };
  }, [videoRef]);

  // Generate waveform data based on transcript segments
  // This simulates the audio waveform by using speech segments as "loud" parts
  const waveformData = useMemo(() => {
    if (!duration || duration <= 0 || segments.length === 0) return new Float32Array(0);
    
    const bars = 600; // Resolution of the waveform
    const data = new Float32Array(bars);
    
    // Initialize with low background noise
    for (let i = 0; i < bars; i++) {
        data[i] = 0.1 + Math.random() * 0.1; // 10-20% height background noise
    }

    // Fill in speech segments
    segments.forEach((seg, index) => {
      const start = parseTimestampToSeconds(seg.timestamp);
      // Infer end time: next segment start or +5 seconds cap
      const nextSeg = segments[index + 1];
      let end = nextSeg ? parseTimestampToSeconds(nextSeg.timestamp) : start + 5;
      
      // Cap end at duration
      if (end > duration) end = duration;
      // Sanity check for very long gaps -> probably silence, so clamp segment duration if needed
      if (end - start > 15) end = start + 10; 

      const startBin = Math.floor((start / duration) * bars);
      const endBin = Math.floor((end / duration) * bars);
      
      for (let i = startBin; i < endBin && i < bars; i++) {
        // Higher amplitude for speech, randomized for "audio" look
        // Center the randomness around 0.7
        data[i] = 0.5 + Math.random() * 0.5; 
      }
    });

    return data;
  }, [segments, duration]);

  // Draw loop
  const draw = () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    const currentTime = video.currentTime;
    const currentDuration = video.duration || 1;

    ctx.clearRect(0, 0, width, height);

    if (waveformData.length === 0) return;

    const barWidth = width / waveformData.length;
    // const gap = Math.max(0.5, barWidth * 0.1); 
    // No gap looks more like a continuous waveform
    
    // Colors
    const playedHue = 220; // Blue
    const futureHue = 215; // Darker Blue/Gray
    
    for (let i = 0; i < waveformData.length; i++) {
      const val = waveformData[i];
      const barHeight = val * height;
      const x = i * barWidth;
      const y = (height - barHeight) / 2;
      
      const barTime = (i / waveformData.length) * currentDuration;
      
      // Color logic
      let fillStyle = 'rgba(75, 85, 99, 0.4)'; // Default gray (future)

      if (barTime <= currentTime) {
        // Played part - gradient-ish look or solid primary
        fillStyle = `rgb(59, 130, 246)`; // primary-500
      } else {
        // Unplayed part
        fillStyle = `rgb(55, 65, 81)`; // gray-700
      }

      // Hover highlight
      if (hoverTime !== null) {
          const hoverDiff = Math.abs(barTime - hoverTime);
          if (hoverDiff < currentDuration * 0.01) { // 1% range
              fillStyle = '#ffffff';
          }
      }

      ctx.fillStyle = fillStyle;
      
      // Draw rounded bars? just rects for performance
      ctx.fillRect(x, y, Math.ceil(barWidth), barHeight);
    }

    // Draw scrubber line
    const progressRatio = currentTime / currentDuration;
    const scrubberX = progressRatio * width;
    
    ctx.beginPath();
    ctx.moveTo(scrubberX, 0);
    ctx.lineTo(scrubberX, height);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Loop
    animationFrameRef.current = requestAnimationFrame(draw);
  };

  // Start animation loop
  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(draw);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }); // Run every render to catch state changes, but draw loop handles frame pacing

  // Handle Resize
  useEffect(() => {
      const handleResize = () => {
          if (containerRef.current && canvasRef.current) {
              canvasRef.current.width = containerRef.current.offsetWidth;
              canvasRef.current.height = containerRef.current.offsetHeight;
          }
      };
      
      window.addEventListener('resize', handleResize);
      handleResize(); // Init
      
      return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Interaction Handlers
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!containerRef.current || !duration) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, x / rect.width));
      setHoverTime(ratio * duration);
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!containerRef.current || !videoRef.current || !duration) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, x / rect.width));
      const newTime = ratio * duration;
      videoRef.current.currentTime = newTime;
      // Optional: videoRef.current.play();
  };

  return (
    <div className="mt-4">
        <div className="flex justify-between items-end mb-2">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Audio Activity & Navigation</h4>
            <span className="text-xs font-mono text-gray-500">
                {hoverTime ? new Date(hoverTime * 1000).toISOString().substr(11, 8) : ''}
            </span>
        </div>
        <div 
            ref={containerRef} 
            className="w-full h-16 bg-gray-900 rounded-lg border border-gray-800 overflow-hidden cursor-pointer relative shadow-inner"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoverTime(null)}
            onClick={handleClick}
        >
            <canvas ref={canvasRef} className="w-full h-full block" />
        </div>
    </div>
  );
};
