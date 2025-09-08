
// Define types for communication between worker and backend
export enum BackendTaskKind {
  createSlideshow = 'create_slideshow',
  renderVideo = 'render_video',
  generatingAudio = 'generating_audio',
}
export type BackendTaskStatus = 'running' | 'error' | 'pending' | 'finished' | 'canceled';

export interface BackendCreateSlideshowResult {
  videoKey: string;
  videoEtag: string;
}

export interface BackendRenderVideoResult {
  videoKey: string;
  duration: number;
  fileSize: number;
}

interface BackendBaseTaskDto {
  id: string;
  kind: BackendTaskKind;
  status: BackendTaskStatus;
  progress: number;
  error: string | null;
}

declare type BackendCreateSlideshowTaskDto = BackendBaseTaskDto & {
    kind: BackendTaskKind.createSlideshow;
    result: BackendCreateSlideshowResult | null;
};

declare type BackendRenderVideoTaskDto = BackendBaseTaskDto & {
    kind: BackendTaskKind.renderVideo;
    result: BackendRenderVideoResult | null;
};

export type BackendTaskDto = BackendCreateSlideshowTaskDto | BackendRenderVideoTaskDto;
