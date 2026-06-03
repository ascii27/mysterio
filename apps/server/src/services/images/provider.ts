export interface GenerateImageOpts {
  size: string;
  model: string;
}

export interface ImageProvider {
  /** Returns PNG (or provider-native) image bytes for the prompt. */
  generate(prompt: string, opts: GenerateImageOpts): Promise<Buffer>;
}
