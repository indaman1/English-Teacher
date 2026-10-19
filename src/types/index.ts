export type EnglishLevel = 'beginner' | 'elementary' | 'intermediate' | 'upper_intermediate' | 'advanced';

export const LEVELS: { value: EnglishLevel; label: string; hint: string }[] = [
  { value: 'beginner', label: 'Beginner', hint: 'I know a few words and simple phrases' },
  { value: 'elementary', label: 'Elementary', hint: 'I can handle simple everyday conversations' },
  { value: 'intermediate', label: 'Intermediate', hint: 'I can talk about familiar topics with some effort' },
  { value: 'upper_intermediate', label: 'Upper Intermediate', hint: 'I can discuss many topics fairly fluently' },
  { value: 'advanced', label: 'Advanced', hint: 'I speak confidently and want to polish my English' },
];

export function levelLabel(level: string): string {
  return LEVELS.find((l) => l.value === level)?.label ?? level;
}

export const GOALS = [
  'Speaking',
  'Listening',
  'Grammar',
  'Vocabulary',
  'Pronunciation',
  'Job interviews',
  'Business English',
  'School',
  'Travel',
  'General communication',
] as const;

export type ExplanationLanguage = 'english' | 'hausa';

export interface Profile {
  id: string;
  display_name: string;
  email: string | null;
  english_level: EnglishLevel;
  learning_goals: string[];
  primary_goal: string | null;
  explanation_language: ExplanationLanguage;
  daily_target_minutes: number;
  avatar_url: string | null;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface LearningMode {
  code: string;
  name: string;
  description: string;
  icon: string;
  topics: string[];
  is_active: boolean;
  sort_order: number;
}

export interface LessonCategory {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  sort_order: number;
}

export interface LessonExample {
  text: string;
  note?: string;
}

export interface LessonExercise {
  type: 'fill' | 'choice' | 'speak';
  prompt: string;
  answer: string;
}

export interface Lesson {
  id: string;
  category_id: string;
  slug: string;
  title: string;
  description: string;
  level: EnglishLevel;
  objective: string;
  content: string;
  examples: LessonExample[];
  exercises: LessonExercise[];
  suggested_mode: string | null;
  estimated_minutes: number;
  is_published: boolean;
  sort_order: number;
}

export interface LessonProgress {
  id: string;
  user_id: string;
  lesson_id: string;
  status: 'in_progress' | 'completed';
  score: number | null;
  completed_at: string | null;
}

export interface LearningSession {
  id: string;
  user_id: string;
  mode_code: string | null;
  lesson_id: string | null;
  topic: string;
  level: EnglishLevel;
  status: 'active' | 'completed' | 'abandoned';
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  summary: string | null;
  suggestions: string[];
  recommended_next: string | null;
  estimated_score: number | null;
  feedback_status: 'pending' | 'ready' | 'unavailable';
}

export interface ConversationMessage {
  id: string;
  session_id: string;
  role: 'student' | 'teacher';
  content: string;
  seq: number;
  created_at: string;
}

export interface GrammarCorrection {
  id: string;
  session_id: string;
  original: string;
  corrected: string;
  explanation: string;
  category: string;
  created_at: string;
}

export type VocabStatus = 'new' | 'learning' | 'mastered';

export interface VocabularyItem {
  id: string;
  word: string;
  meaning: string;
  example: string;
  hausa_explanation: string | null;
  status: VocabStatus;
  session_id: string | null;
  created_at: string;
}

export interface DailyStat {
  stat_date: string;
  speaking_seconds: number;
  sessions_count: number;
  corrections_count: number;
  vocabulary_count: number;
}

export interface UsageSummary {
  plan_code: string;
  daily_limit_seconds: number;
  monthly_limit_seconds: number;
  daily_sessions_limit: number;
  max_session_seconds: number;
  daily_used_seconds: number;
  monthly_used_seconds: number;
  sessions_today: number;
}

export interface Subscription {
  plan_code: 'free' | 'premium';
  status: 'active' | 'past_due' | 'canceled' | 'trialing';
  provider: 'none' | 'paystack' | 'stripe';
  current_period_end: string | null;
}

export interface Plan {
  code: 'free' | 'premium';
  name: string;
  daily_voice_seconds: number;
  monthly_voice_seconds: number;
  daily_sessions: number;
  max_session_seconds: number;
}
