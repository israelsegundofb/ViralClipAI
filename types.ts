export interface Clip {
  clip_number: number;
  title: string;
  start_time: string;
  end_time: string;
  duration: string;
  engagement_score: number;
  importance_level: 'High' | 'Medium' | 'Essential' | 'Emotional Peak' | 'Teaching Moment' | 'Viral Potential';
  reason_for_engagement: string;
  transcript_excerpt: string;
  ai_description: string;
  social_titles: {
    youtube_shorts: string;
    tiktok: string;
    instagram_reels: string;
  };
  thumbnail_suggestions: Array<{
    description: string;
    style: 'Reaction Shot' | 'Text Overlay' | 'Action Frame' | 'Minimalist' | 'Clickbait' | 'Quote Bubble' | 'Animated GIF';
  }>;
}

export interface Topic {
  theme: string;
  subtopics: string[];
  emotional_tone: string;
}

export interface AnalysisResult {
  video_transcription: {
    full_text: string;
    segments: Array<{ timestamp: string; text: string }>;
  };
  topic_map: {
    primary_themes: string[];
    topics: Topic[];
    storytelling_arc: string;
  };
  clip_catalog: Clip[];
  top_10_clips: number[]; // IDs of top clips
  stats: {
    highest_emotional_impact_clip_id: number;
    most_educational_clip_id: number;
    highest_viral_potential_clip_id: number;
  };
}

export enum AppState {
  IDLE,
  ANALYZING,
  COMPLETE,
  ERROR
}