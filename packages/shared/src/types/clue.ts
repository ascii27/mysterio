import type { ClueCategoryType } from "./logicStructure.js";

export type ClueSource = "manual" | "annotation";

export interface Clue {
  id: string;
  mystery_id: string;
  category_type: ClueCategoryType;
  content: string;
  audio_timestamp_ms: number | null;
  source: ClueSource;
  annotation_id: string | null;
  created_at: string;
}
