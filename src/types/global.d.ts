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
    id: string;
    progress: number;
    status: Omit<TaskStatus, 'error'>;
} | {
    id: string;
    progress: number;
    status: 'error';
    error: string
};

declare type checkTaskResponseDto = {
    id: string;
    progress: number;
    status: TaskStatus;
    error?: string;
    etag?: string;
};
