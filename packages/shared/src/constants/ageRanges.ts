export const AGE_RANGES = ["8-9", "10-11", "12-13"] as const;
export type AgeRange = (typeof AGE_RANGES)[number];
export const DEFAULT_AGE_RANGE: AgeRange = "10-11";
