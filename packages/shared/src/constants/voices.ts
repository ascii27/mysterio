// OpenAI tts-1-hd voices
export const OPENAI_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;
export type OpenAIVoice = (typeof OPENAI_VOICES)[number];
