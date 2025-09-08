import { BackendTaskDto, BackendTaskKind, BackendTaskStatus } from './backend.types';

export function mapTaskActionToBackend(action: TaskAction): BackendTaskKind {
    switch (action) {
        case 'createSlideshow':
            return BackendTaskKind.createSlideshow;
        case 'renderVideo':
            return BackendTaskKind.renderVideo;
        default:
            throw new Error(`Unknown task action: ${action}`);
    }
}

export function mapTaskStatusToBackend(status: TaskStatus): BackendTaskStatus {
    switch (status) {
        case 'processing':
            return 'running';
        case 'done':
            return 'finished';
        case 'error':
            return 'error';
        default:
            return 'pending';
    }
}

export function mapTaskErrorToBackend(error: string | undefined): string | null {
    return error || null;
}

export function mapTaskToBackendDto(task: AnyTask): BackendTaskDto {
    switch (task.action) {
        case 'createSlideshow': {
            // TypeScript will automatically narrow the type to Task<'createSlideshow'>
            return {
                id: task.id,
                kind: BackendTaskKind.createSlideshow,
                status: mapTaskStatusToBackend(task.status),
                progress: task.progress,
                error: mapTaskErrorToBackend(task.error),
                result: task.result
                    ? { videoKey: task.result.videoKey, videoEtag: task.result.videoEtag }
                    : null
            };
        }
        case 'renderVideo': {
            // TypeScript will automatically narrow the type to Task<'renderVideo'>
            return {
                id: task.id,
                kind: BackendTaskKind.renderVideo,
                status: mapTaskStatusToBackend(task.status),
                progress: task.progress,
                error: mapTaskErrorToBackend(task.error),
                result: task.result
                    ? {
                        videoKey: task.result.videoKey,
                        duration: task.result.duration,
                        fileSize: task.result.fileSize
                    }
                    : null
            };
        }
        default: {
            // Exhaustive check - TypeScript will complain if we forget to handle a new type
            const exhaustiveCheck: never = task;
            throw new Error(`Unsupported task action: ${exhaustiveCheck}`);
        }
    }
}
