/**
 * A region of the clean narrative text that was tagged by the LLM with an inline
 * `[p:<id>]...[/p]` (person) or `[c:<id>]...[/c]` (clue) marker. The frontend
 * uses these to render pill highlights and wire tap → auto-add-to-notes.
 */
export interface NarrativeAnnotation {
  type: "person" | "clue";
  /** character.id for type:"person" or essential_clues[i].id for type:"clue" */
  id: string;
  /** Index (0-based, code units) into the CLEAN narrative text where the highlighted span starts */
  offset: number;
  /** Length of the highlighted span in the clean text */
  length: number;
  /** The original text that was inside the tags (e.g., "Oliver" or "trail of clover sprigs") */
  text: string;
}
