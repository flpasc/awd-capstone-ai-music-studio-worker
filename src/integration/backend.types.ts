import z from 'zod';
// Define types for communication between worker and backend
export enum BackendTaskKind {
  createSlideshow = 'create_slideshow',
  renderVideo = 'render_video',
  generatingAudio = 'generating_audio',
}
const backendTaskStatusSchema = z.enum(['running', 'error', 'pending', 'finished', 'canceled']);
export type BackendTaskStatus = z.infer<typeof backendTaskStatusSchema>;

const createSlideshowResultSchema = z.object({
  videoKey: z.string(),
  videoEtag: z.string(),
});

const renderVideoResultSchema = z.object({
  videoKey: z.string(),
  duration: z.number(),
  fileSize: z.number(),
});

const backendBaseTaskDtoSchema = z.object({
  id: z.string(),
  kind: z.enum(BackendTaskKind),
  status: backendTaskStatusSchema,
  progress: z.number(),
  error: z.string().nullable(),
});

const createSlideshowTaskDtoSchema = backendBaseTaskDtoSchema.extend({
  kind: z.literal(BackendTaskKind.createSlideshow),
  result: createSlideshowResultSchema.nullable(),
});
export type CreateSlideshowTaskDto = z.infer<typeof createSlideshowTaskDtoSchema>;

const renderVideoTaskDtoSchema = backendBaseTaskDtoSchema.extend({
  kind: z.literal(BackendTaskKind.renderVideo),
  result: renderVideoResultSchema.nullable(),
});
export type RenderVideoTaskDto = z.infer<typeof renderVideoTaskDtoSchema>;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const backendTaskDtoSchema = z.discriminatedUnion('kind', [
  createSlideshowTaskDtoSchema,
  renderVideoTaskDtoSchema,
]);
export type BackendTaskDto = z.infer<typeof backendTaskDtoSchema>;
