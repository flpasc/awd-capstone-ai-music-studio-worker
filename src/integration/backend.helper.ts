import { BackendTaskDto, backendTaskDtoSchema, BackendTaskKind, BackendTaskStatus } from './backend.types';

function mapTaskActionToBackend(action: TaskAction): BackendTaskKind {
    if (action === 'createSlideshow') return BackendTaskKind.createSlideshow;
    if (action === 'renderVideo') return BackendTaskKind.renderVideo;
    throw new Error(`Unknown task action: ${action}`);
}

function mapTaskStatusToBackend(status: TaskStatus): BackendTaskStatus {
    if (status === 'processing') return 'running';
    if (status === 'done') return 'finished';
    if (status === 'error') return 'error';
    return 'pending';
}

export function mapTaskToBackendDto(task: AnyTask): BackendTaskDto {
    return backendTaskDtoSchema.parse({
        ...task,
        kind: mapTaskActionToBackend(task.action),
        status: mapTaskStatusToBackend(task.status),
        error: task.error || null,
        result: task.result || null
    });
}
