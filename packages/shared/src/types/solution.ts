export interface Solution {
  id: string;
  mystery_id: string;
  guess_who: string | null;
  guess_how: string | null;
  guess_why: string | null;
  is_correct: number;          // SQLite: 0 | 1
  who_match: number | null;    // SQLite: 0 | 1 | null
  how_match: number | null;
  why_match: number | null;
  hints_used: number;
  gave_up: number;             // SQLite: 0 | 1
  explanation: string | null;
  created_at: number;
}
