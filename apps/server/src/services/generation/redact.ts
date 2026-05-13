import type { LogicStructure, RedactedLogicStructure } from "@mysterio/shared";

export function redact(ls: LogicStructure): RedactedLogicStructure {
  return {
    category: ls.category,
    setting: ls.setting,
    characters: ls.characters.map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role,
      description: c.description,
    })),
    essential_clues: ls.essential_clues,
  };
}
