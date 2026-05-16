import type { ClueCategoryType } from "./logicStructure.js";

export interface Clue {
  id: string;
  mystery_id: string;
  category_type: ClueCategoryType;
  content: string;
  audio_timestamp_ms: number | null;
  created_at: number;
}
