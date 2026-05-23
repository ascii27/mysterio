import { customAlphabet } from "nanoid";

const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
export const mysteryId = customAlphabet(alphabet, 12);
export const shortId = customAlphabet(alphabet, 8);
