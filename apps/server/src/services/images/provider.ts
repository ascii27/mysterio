export interface GenerateImageOpts {
  size: string;
  model: string;
}

export interface ImageProvider {
  /** Returns PNG (or provider-native) image bytes for the prompt. */
  generate(prompt: string, opts: GenerateImageOpts): Promise<Buffer>;
  /** Composes a new image from the prompt, using the given reference PNGs as visual guides (gpt-image-1 edit). */
  editWithReferences(prompt: string, references: Buffer[], opts: GenerateImageOpts): Promise<Buffer>;
}
