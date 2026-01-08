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