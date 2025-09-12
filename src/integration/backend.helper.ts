import {
  BackendTaskDto,
  BackendTaskKind,
  BackendTaskStatus,
  CreateSlideshowTaskDto,
  RenderVideoTaskDto,
} from './backend.types';

function mapTaskStatusToBackend(status: TaskStatus): BackendTaskStatus {
  if (status === 'processing') return 'running';
  if (status === 'done') return 'finished';
  if (status === 'error') return 'error';
  return 'pending';
}

export function mapTaskToBackendDto(task: AnyTask): BackendTaskDto {
  if (task.action === 'createSlideshow') {
    return {
      ...task,
      kind: BackendTaskKind.createSlideshow,
      status: mapTaskStatusToBackend(task.status),
      error: task.error || null,
      result: task.result || null,
    } satisfies CreateSlideshowTaskDto;
  } else if (task.action === 'renderVideo') {
    return {
      ...task,
      kind: BackendTaskKind.renderVideo,
      status: mapTaskStatusToBackend(task.status),
      error: task.error || null,
      result: task.result || null,
    } satisfies RenderVideoTaskDto;
  }
  throw new Error(`Unknown task action`);
}
