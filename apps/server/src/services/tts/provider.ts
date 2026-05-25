export interface SynthesizeOpts {
  voice: string;
  model: string;
}

export interface TTSProvider {
  synthesize(text: string, opts: SynthesizeOpts): Promise<Buffer>;
}
