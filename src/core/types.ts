/**
 * Core domain model for Mila Studio.
 * All times are in SECONDS on the SOURCE video timeline unless stated otherwise.
 */

export type WordKind = 'word' | 'event';

export interface Word {
  id: string;
  /** Text as displayed (punctuation attached, e.g. "שלום,") */
  text: string;
  /** Original text returned by the transcription engine (never changed) */
  originalText: string;
  start: number;
  end: number;
  kind: WordKind;
  speakerId?: string;
  /** Engine confidence (log probability, <= 0) */
  logprob?: number;
  /** Highlighted word in captions ("important word") */
  emphasis?: boolean;
  /** Hidden in "clean" transcript mode (filler / repetition), still kept in the video unless cut */
  cleanHidden?: boolean;
}

export interface Speaker {
  id: string;
  name: string;
  color: string;
}

export interface Transcript {
  provider: 'elevenlabs-scribe' | 'on-device';
  model: string;
  languageCode: string;
  languageProbability: number;
  words: Word[];
  speakers: Speaker[];
  createdAt: number;
  /** Version counter bumped on every text edit (for autosave / caches) */
  revision: number;
  /** corrected by Claude (smart correction) */
  polished?: boolean;
}

export type TranscriptMode = 'verbatim' | 'organized' | 'clean';

/** A removed range of the source video (silence, filler, deleted sentence, manual cut). */
export interface Cut {
  id: string;
  start: number;
  end: number;
  reason: 'silence' | 'filler' | 'sentence' | 'manual';
}

export type CaptionDisplay = 'lines' | 'karaoke' | 'chunks' | 'single';
export type HighlightMode = 'none' | 'color' | 'box';
export type CaptionAnimation = 'none' | 'fade' | 'pop' | 'slide';

export interface CaptionStyle {
  presetId: string | null;
  fontId: string;
  /** Font size as a fraction of min(frameWidth, frameHeight) */
  fontScale: number;
  textColor: string;
  highlightMode: HighlightMode;
  highlightColor: string;
  /** Text color used on top of a highlight box */
  highlightTextColor: string;
  emphasisColor: string;
  strokeColor: string;
  /** Stroke width as fraction of font size (0 = none) */
  strokeWidth: number;
  shadow: boolean;
  shadowColor: string;
  background: boolean;
  backgroundColor: string;
  backgroundOpacity: number;
  /** Vertical center of caption block, 0 = top, 1 = bottom */
  positionY: number;
  /** Max width of caption block as fraction of frame width */
  maxWidth: number;
  /** Line height multiplier */
  lineHeight: number;
  /** Letter spacing as fraction of font size */
  letterSpacing: number;
  display: CaptionDisplay;
  maxCharsPerLine: number;
  maxLines: 1 | 2;
  /** Number of words per caption for "chunks" display */
  chunkWords: number;
  animation: CaptionAnimation;
}

export interface LogoAsset {
  id: string;
  /** IndexedDB blob key */
  blobKey: string;
  width: number;
  height: number;
  name: string;
}

export interface LogoPlacement {
  logoId: string;
  /** Center position, normalized 0..1 */
  x: number;
  y: number;
  /** Logo width as fraction of frame width */
  scale: number;
  opacity: number;
}

export type AspectRatio = 'original' | '9:16' | '16:9' | '1:1' | '4:5';
export type FrameFit = 'fit' | 'fill';

export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  fileSize: number;
  mimeType: string;
}

export type ProjectKind = 'transcribe' | 'studio';

export interface Project {
  id: string;
  kind: ProjectKind;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** IndexedDB blob key of the source video */
  videoKey: string;
  /** Small JPEG data URL for the project list */
  thumbnail: string | null;
  video: VideoInfo;
  transcript: Transcript | null;
  transcriptMode: TranscriptMode;
  /** Pending / running transcription job (lets an interrupted job be resumed) */
  transcriptionJob: TranscriptionJob | null;
  captionsEnabled: boolean;
  captionStyle: CaptionStyle;
  logo: LogoPlacement | null;
  cuts: Cut[];
  trimStart: number;
  trimEnd: number | null;
  aspect: AspectRatio;
  fit: FrameFit;
  frameBackground: string;
  /** why audio couldn't be prepared at import (diagnostics) */
  audioNote?: string;
}

export interface TranscriptionJob {
  status: 'download' | 'loading' | 'audio' | 'transcribe' | 'polish' | 'failed';
  progress?: number;
  /** live text while transcribing */
  text?: string;
  /** extra detail (e.g. part 2 of 3) */
  detail?: string;
  startedAt: number;
  error?: string;
}

export interface DictionaryEntry {
  id: string;
  /** What the engine tends to write (may be empty when only used as key term) */
  from: string;
  /** The correct spelling */
  to: string;
  /** Send `to` as a key term to bias recognition */
  keyterm: boolean;
}

export interface BrandKit {
  logos: LogoAsset[];
  defaultLogo: Omit<LogoPlacement, 'logoId'> & { logoId: string | null };
  colors: string[];
  captionStyle: CaptionStyle | null;
  savedStyles: { id: string; name: string; style: CaptionStyle }[];
  customFonts: CustomFont[];
}

export interface CustomFont {
  id: string;
  /** CSS font-family name we register */
  family: string;
  label: string;
  blobKey: string;
}
