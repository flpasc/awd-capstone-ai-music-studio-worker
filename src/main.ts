import path from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import { z } from 'zod';
import { S3Client } from '@aws-sdk/client-s3';
import { S3Store } from './utils/s3store';
import { createS3SlideShow, S3SlideShowOptions } from './utils/videoCombine.s3';
import { BackendTaskDto } from './integration/backend.types';
import { mapTaskToBackendDto } from './integration/backend.helper';

const env = process.env.NODE_ENV || 'development';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), `.env.${env}`) });
dotenv.config({
  path: path.resolve(process.cwd(), '.env.local'),
  override: true,
});

const app = express();
app.use(express.json());

const envSchema = z.object({
  S3_REGION: z.string().min(1, 'S3_REGION is required'),
  S3_ENDPOINT: z.string().min(1, 'S3_ENDPOINT is required'),
  S3_ACCESS_KEY_ID: z.string().min(1, 'S3_ACCESS_KEY_ID is required'),
  S3_SECRET_ACCESS_KEY: z.string().min(1, 'S3_SECRET_ACCESS_KEY is required'),
  S3_FORCE_PATH_STYLE: z.string().optional().default('true'),
  S3_BUCKET_NAME: z.string().min(1, 'S3_BUCKET_NAME is required'),
  PORT: z
    .string()
    .optional()
    .default('3000')
    .transform((val) => parseInt(val, 10)),
  BACKEND_URL: z.url().optional(),
});

export const config = envSchema.parse(process.env);

const s3 = new S3Client({
  region: config.S3_REGION,
  endpoint: config.S3_ENDPOINT,
  forcePathStyle: config.S3_FORCE_PATH_STYLE === 'true',
  credentials: {
    accessKeyId: config.S3_ACCESS_KEY_ID,
    secretAccessKey: config.S3_SECRET_ACCESS_KEY,
  },
});

const s3Store = new S3Store({
  client: s3,
  bucketName: config.S3_BUCKET_NAME,
});

const tasks = new Map<string, AnyTask>();

function mapError(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.message;
  } else if (typeof error === 'string') {
    return error;
  }
  return undefined;
}

function createTask<T extends keyof TaskActions>(args: {
  id: string;
  action: T;
  status: TaskStatus;
  objectName: string;
  params: TaskActions[T]['params'];
  progress?: number;
  result?: TaskActions[T]['result'];
  error?: string | Error | unknown;
}): Task<T> {
  const task: Task<T> = {
    id: args.id,
    status: args.status,
    action: args.action,
    objectName: args.objectName,
    progress: args.progress ?? 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    params: args.params,
    ...(args.result !== undefined ? { result: args.result } : {}),
    ...(args.error !== undefined ? { error: mapError(args.error) } : {}),
  };
  tasks.set(args.id, task as AnyTask);
  notifyTaskStatus(args.id);
  return task;
}

function updateTask<T extends keyof TaskActions>(
  taskId: string,
  fields: {
    status?: TaskStatus;
    progress?: number;
    error?: string | Error | unknown;
    result?: TaskActions[T]['result'];
  }
): Task<T> {
  const task = tasks.get(taskId) as Task<T> | undefined;
  if (!task) {
    throw new Error(`Task with ID ${taskId} not found`);
  }

  let { result, error, ...restFields } = fields;
  const updated: Task<T> = {
    ...task,
    ...restFields,
    ...(result !== undefined ? { result } : {}),
    ...(error !== undefined ? { error: mapError(error) } : {}),
    updatedAt: new Date().toISOString(),
  };

  tasks.set(taskId, updated as AnyTask);
  notifyTaskStatus(taskId);
  return updated;
}

function notifyTaskStatus(taskId: string) {
  const task = tasks.get(taskId);
  if (task && config.BACKEND_URL) {
    const response: BackendTaskDto = mapTaskToBackendDto(task);
    fetch(`${config.BACKEND_URL}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(response),
    })
      .then((res) => {
        if (!res.ok) {
          console.error('Error notifying task status webhook:', res.statusText);
        } else {
          console.log(
            'Successfully notified task status webhook for task:',
            taskId,
            task.status,
            response.status
          );
        }
      })
      .catch((error) => {
        console.error('Error notifying task status webhook:', error);
      });
  }
}

app.post('/tasks/:id', async (req: express.Request, res: express.Response) => {
  const id = req.params.id;
  const taskIdSchema = z.uuid();
  const safeId = taskIdSchema.safeParse(id);
  if (!safeId.success) {
    return res.status(400).json({ error: 'Invalid taskId format. Must be a valid UUID.' });
  }
  if (tasks.has(id)) {
    return res.status(409).json({ error: 'Task with this ID already exists' });
  }

  const videoRequestSchema = z
    .object({
      imageKeys: z.array(z.string()),
      imageTimings: z.array(z.number().min(1)),
      audioKeys: z.array(z.string()),
      audioTimings: z.array(z.number().min(1)),
      outputKey: z.string().min(1).max(1024),
    })
    .refine(
      (data) => {
        const parts = data.outputKey.split('/');
        return parts.length >= 2 && parts[0].length > 0 && parts[0] !== '..';
      },
      {
        message: 'outputKey must not be in a root folder',
        path: ['outputKey'],
      }
    )
    .refine((data) => data.imageKeys.length === data.imageTimings.length, {
      message: 'imageKeys and imageTimings must have the same length',
      path: ['imageTimings'],
    })
    .refine((data) => data.audioKeys.length === data.audioTimings.length, {
      message: 'audioKeys and audioTimings must have the same length',
      path: ['audioTimings'],
    });

  const safeRequestBody = videoRequestSchema.safeParse(req.body);
  if (!safeRequestBody.success) {
    return res.status(400).json({ error: z.treeifyError(safeRequestBody.error) });
  }

  const objectName = safeRequestBody.data.outputKey;

  const slideShowOptions: S3SlideShowOptions = {
    imageKeys: safeRequestBody.data.imageKeys,
    audioKeys: safeRequestBody.data.audioKeys,
    imageTimings: safeRequestBody.data.imageTimings,
    audioTimings: safeRequestBody.data.audioTimings,
    // transitionDuration: 1;
    outputKey: safeRequestBody.data.outputKey,
  };
  let taskPromise;
  const action: TaskAction = 'createSlideshow';
  try {
    slideShowOptions.transitionDuration = 1;
    taskPromise = createS3SlideShow(s3Store, slideShowOptions);
    const task = createTask({
      id,
      action,
      status: 'processing',
      objectName,
      params: slideShowOptions,
    });
    const response: createTaskResponseDto = {
      id,
      status: task.status,
      progress: task.progress,
    };
    res.setHeader('Location', `/tasks/${id}`);
    res.status(201).json(response);
  } catch (error) {
    const task = createTask({
      id,
      action: 'createSlideshow',
      status: 'error',
      objectName,
      params: slideShowOptions,
      error,
    });
    console.error('Error creating S3 slideshow:', error);
    const response: createTaskResponseDto = {
      id,
      status: task.status,
      progress: task.progress,
      error: 'Failed to create slideshow',
    };
    return res.status(500).json(response);
  }

  try {
    const etag = await taskPromise;
    const result: TaskActions['createSlideshow']['result'] = {
      videoKey: slideShowOptions.outputKey,
      videoEtag: etag,
    };
    updateTask<'createSlideshow'>(id, { status: 'done', result });
  } catch (error) {
    updateTask(id, {
      status: 'error',
      error,
    });
    console.error('Error creating S3 slideshow:', error);
  }
});

app.get('/tasks/:id', (req, res) => {
  const id = req.params.id;
  if (!z.uuid().safeParse(id).success) {
    return res.status(400).json({ error: 'Invalid taskId format. Must be a valid UUID.' });
  }
  const task = tasks.get(id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  const response: checkTaskResponseDto =
    task.status === 'error'
      ? {
          id: task.id,
          progress: task.progress,
          status: task.status,
          error: task.error || 'Unknown error',
        }
      : {
          id: task.id,
          progress: task.progress,
          status: task.status,
          result: task.result,
        };
  res.json(response);
});

app.listen(config.PORT, () => console.log(`Server started on http://localhost:${config.PORT}`));
