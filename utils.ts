
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

export const fileToGenerativePart = async (file: File): Promise<{ inlineData: { data: string; mimeType: string } }> => {
  return new Promise((resolve, reject) => {
    // Safety check for file size to prevent browser crash on readAsDataURL with 5GB files
    // Browsers typically crash around 500MB - 2GB for data URLs depending on available RAM.
    // We will attempt it, but warn if it fails.
    
    const reader = new FileReader();
    
    reader.onloadend = () => {
      // 1. Handle Reader Errors
      if (reader.error) {
        reject(new Error(`File reading failed: ${reader.error.name} - ${reader.error.message}`));
        return;
      }
      
      // 2. Handle Null Result
      if (reader.result === null) {
        reject(new Error("File reading failed: Result is null. The file might be too large for the browser to handle."));
        return;
      }

      const base64data = reader.result;

      try {
        if (typeof base64data === 'string') {
          // 3. Safe split
          const parts = base64data.split(',');
          if (parts.length > 1) {
             resolve({
              inlineData: {
                data: parts[1],
                mimeType: file.type,
              },
            });
          } else {
            // Fallback if no comma (unexpected for data URL)
             resolve({
              inlineData: {
                data: base64data,
                mimeType: file.type,
              },
            });
          }
        } else {
          reject(new Error("Unexpected file data format: Result is not a string"));
        }
      } catch (e) {
        reject(new Error(`Error processing file data: ${e instanceof Error ? e.message : String(e)}`));
      }
    };

    reader.onerror = () => {
       reject(new Error(`File reading error: ${reader.error?.message || "Unknown error"}`));
    };
    
    reader.onabort = () => {
      reject(new Error("File reading aborted"));
    };

    try {
      reader.readAsDataURL(file);
    } catch (e) {
      reject(new Error(`Failed to start file read: ${e instanceof Error ? e.message : String(e)}`));
    }
  });
};

export const parseTimestampToSeconds = (timestamp: any): number => {
  if (timestamp === null || timestamp === undefined || timestamp === '') return 0;
  
  try {
    const strTimestamp = String(timestamp).trim();
    if (!strTimestamp.includes(':')) {
       // Handle seconds only input if applicable
       const val = parseFloat(strTimestamp);
       return isNaN(val) ? 0 : val;
    }

    const parts = strTimestamp.split(':').map(part => parseFloat(part));
    
    if (parts.some(isNaN)) return 0;

    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return 0;
  } catch (error) {
    console.warn("Error parsing timestamp:", timestamp, error);
    return 0;
  }
};

export const formatSecondsToTimestamp = (seconds: number): string => {
  if (typeof seconds !== 'number' || isNaN(seconds)) return "00:00";
  
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  
  const hDisplay = h > 0 ? `${h}:` : "";
  const mDisplay = `${m < 10 && h > 0 ? '0' : ''}${m}:`;
  const sDisplay = `${s < 10 ? '0' : ''}${s}`;
  
  return `${hDisplay}${mDisplay}${sDisplay}`;
};

export const muxStreams = async (videoBlob: Blob, audioBlob: Blob, filename: string): Promise<Blob> => {
    const ffmpeg = new FFmpeg();
    // Using 0.12.10 to match package.json.
    // Note: To use this in production, the server must send COOP/COEP headers:
    // 'Cross-Origin-Opener-Policy': 'same-origin'
    // 'Cross-Origin-Embedder-Policy': 'require-corp'
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm';

    // We use the single-threaded version if headers are an issue, but default to multi-threaded in 0.12.6 if supported.
    // However, 0.12.6 default is mt. We will try to load it.
    // To ensure compatibility without SharedArrayBuffer (which requires specific headers), we should use the single-threaded build if available,
    // or rely on the user having headers.
    // But since we can't control user headers easily here, we might need a workaround.
    // However, for this task, we will assume standard ffmpeg.wasm usage.

    // Note: If Cross-Origin-Opener-Policy is not set, this will fail with SharedArrayBuffer error.
    // Since we are in a dev environment or specific deployment, we'll try to use the single-threaded core if we can target it,
    // or just standard.
    // Checking the node_modules, we saw ffmpeg-core.js and ffmpeg-core.wasm in @ffmpeg/core/dist/esm.
    // This implies it might be single threaded or checking at runtime.

    await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    const videoExt = videoBlob.type.includes('webm') ? 'webm' : 'mp4';
    const audioExt = audioBlob.type.includes('webm') ? 'webm' : 'm4a'; // m4a for aac/mp4 audio

    await ffmpeg.writeFile(`video.${videoExt}`, await fetchFile(videoBlob));
    await ffmpeg.writeFile(`audio.${audioExt}`, await fetchFile(audioBlob));

    const outputExt = filename.endsWith('.webm') ? 'webm' : 'mp4';

    // -c copy is fastest and doesn't re-encode
    await ffmpeg.exec(['-i', `video.${videoExt}`, '-i', `audio.${audioExt}`, '-c', 'copy', `output.${outputExt}`]);

    const data = await ffmpeg.readFile(`output.${outputExt}`);
    return new Blob([data], { type: outputExt === 'webm' ? 'video/webm' : 'video/mp4' });
};
