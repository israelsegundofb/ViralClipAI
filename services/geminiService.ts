import { GoogleGenAI } from "@google/genai";
import { AnalysisResult } from "../types";

export const analyzeVideo = async (file: File, onProgress?: (progress: number) => void): Promise<AnalysisResult> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key not found in environment variables");
  }

  const ai = new GoogleGenAI({ apiKey });

  const model = "gemini-2.5-flash"; 
  
  // Fallback MIME type
  const mimeType = file.type || "video/mp4";

  console.log("Starting upload for file:", file.name, "Size:", file.size);
  
  // Phase 1: Uploading (0-30%)
  // Since the SDK upload is atomic, we simulate progress at start and confirm at end
  onProgress?.(5);

  // Use File API for large files
  const uploadResult = await ai.files.upload({
    file: file,
    config: { 
      displayName: file.name,
      mimeType: mimeType 
    }
  });

  onProgress?.(30);

  let fileUri = uploadResult.uri;
  let state = uploadResult.state;

  console.log(`File uploaded: ${fileUri}, State: ${state}`);

  // Phase 2: Processing (30-80%)
  // Poll for processing completion
  let processProgress = 30;
  
  while (state === "PROCESSING") {
    // Increment progress artificially while waiting, capped at 80%
    if (processProgress < 80) {
        processProgress += 2;
        onProgress?.(processProgress);
    }
    
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const currentFile = await ai.files.get({ name: uploadResult.name });
    state = currentFile.state;
    console.log(`Processing state: ${state}`);
    if (state === "FAILED") {
       throw new Error("Video processing failed by API.");
    }
  }

  // Phase 3: Generating (80-100%)
  onProgress?.(85);

  // Add a small buffer after ACTIVE state to ensure propagation
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const prompt = `
  You are an expert video editor and viral content strategist for Instagram Reels and TikTok.
  Analyze this video file deeply.
  
  YOUR TASK:
  1. Transcribe the speech accurately with timestamps roughly every 10-30 seconds.
  2. Map out the topics, emotional peaks, and storytelling beats.
  3. Detect up to 100 engaging clips (max 3 minutes each, typically 30s-90s).
  
  CRITICAL VISUAL & AUDIO CONSTRAINTS:
  - **9:16 SAFETY**: Only select clips where the speaker/subject is centered. The output will be cropped to vertical 9:16.
  - **AUDIO**: Do not select segments with overlapping noise or poor audio.
  - **PRECISION**: Ensure start_time and end_time do NOT cut sentences in half. Quote the first and last sentence of the clip in your "Chain of Thought" before outputting JSON to ensure accuracy.

  REQUIRED OUTPUT FORMAT:
  Return ONLY valid JSON. Do not use Markdown code blocks. Do not add explanations.
  Structure:
  {
    "video_transcription": {
      "full_text": "Complete transcript text...",
      "segments": [ { "timestamp": "00:00:10", "text": "..." } ]
    },
    "topic_map": {
      "primary_themes": ["Theme 1", "Theme 2"],
      "storytelling_arc": "Description of the narrative flow...",
      "topics": [
        { "theme": "Topic Name", "subtopics": ["sub1", "sub2"], "emotional_tone": "Inspiring" }
      ]
    },
    "clip_catalog": [
      {
        "clip_number": 1,
        "title": "Catchy Title",
        "start_time": "00:01:20",
        "end_time": "00:02:10",
        "duration": "50s",
        "engagement_score": 95,
        "importance_level": "High", 
        "reason_for_engagement": "Why this is viral...",
        "transcript_excerpt": "Quote from clip...",
        "ai_description": "A 1-sentence hook description of this clip.",
        "social_titles": {
           "youtube_shorts": "Title for YT",
           "tiktok": "Title for TikTok",
           "instagram_reels": "Title for Reels"
        },
        "thumbnail_suggestions": [
           { "description": "Visual description 1", "style": "Reaction Shot" },
           { "description": "Visual description 2", "style": "Text Overlay" },
           { "description": "Visual description 3", "style": "Action Frame" },
           { "description": "Visual description 4", "style": "Minimalist" },
           { "description": "Visual description 5", "style": "Quote Bubble" },
           { "description": "Visual description 6", "style": "Animated GIF" }
        ]
      }
    ],
    "top_10_clips": [1, 5, 2],
    "stats": {
      "highest_emotional_impact_clip_id": 1,
      "most_educational_clip_id": 5,
      "highest_viral_potential_clip_id": 2
    }
  }

  For "importance_level", use one of: 'High', 'Medium', 'Essential', 'Emotional Peak', 'Teaching Moment', 'Viral Potential'.
  For "style" in thumbnails, use one of: 'Reaction Shot', 'Text Overlay', 'Action Frame', 'Minimalist', 'Clickbait', 'Quote Bubble', 'Animated GIF'.
  
  Provide exactly 6 thumbnail suggestions per clip covering different styles.
  `;

  try {
    // Prefer the API-detected mimeType if available
    const finalMimeType = (uploadResult.mimeType && uploadResult.mimeType.length > 0) 
        ? uploadResult.mimeType 
        : mimeType;

    // Call generateContent with object-style contents param to allow correct handling of fileData
    const response = await ai.models.generateContent({
      model,
      contents: {
        role: 'user',
        parts: [
          { 
            fileData: { 
              fileUri: fileUri, 
              mimeType: finalMimeType
            } 
          },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: 'application/json',
      }
    });

    onProgress?.(95);

    const text = response.text;
    if (!text) {
      throw new Error("No response from Gemini");
    }

    // Clean Markdown code blocks if present (even if we asked not to)
    const cleanJson = text.replace(/```json\n?|```/g, '').trim();
    
    // Find the first '{' and last '}' to handle potential preamble text
    const firstBrace = cleanJson.indexOf('{');
    const lastBrace = cleanJson.lastIndexOf('}');
    
    if (firstBrace === -1 || lastBrace === -1) {
       throw new Error("Response is not valid JSON.");
    }

    const jsonString = cleanJson.substring(firstBrace, lastBrace + 1);
    
    onProgress?.(100);

    return JSON.parse(jsonString) as AnalysisResult;

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    
    // Check for 400 Invalid Argument in various error shapes
    const isInvalidArgument = 
      error.status === 400 || 
      error.message?.includes("INVALID_ARGUMENT") ||
      (error.error && error.error.code === 400) ||
      (error.error && error.error.status === "INVALID_ARGUMENT");

    if (isInvalidArgument) {
      throw new Error("Analysis failed due to invalid arguments (400). This often happens if the video file format is unsupported by the model, or if the file is corrupted. Please try a standard MP4 file.");
    }
    
    throw error;
  }
};