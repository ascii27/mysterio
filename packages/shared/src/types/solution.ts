export interface Solution {
  id: string;
  mystery_id: string;
  guess_who: string | null;
  guess_how: string | null;
  guess_why: string | null;
  is_correct: boolean;
  who_match: boolean | null;
  how_match: boolean | null;
  why_match: boolean | null;
  hints_used: number;
  gave_up: boolean;
  explanation: string | null;
  created_at: string;
}
