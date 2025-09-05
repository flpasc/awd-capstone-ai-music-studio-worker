declare type TaskStatus = 'processing' | 'done' | 'error';

declare interface Task {
    status: TaskStatus;
    action: string;
    params?: unknown;
    objectName: string;
    progress: number;
    createdAt: string;
    updatedAt: string;
    error?: unknown;
    etag?: string;
}

declare type createTaskResponseDto = {
    taskId: string;
    objectName: string;
    progress: number;
    status: Omit<TaskStatus, 'error'>;
} | {
    taskId: string;
    objectName: string;
    progress: number;
    status: 'error';
    error: string
};