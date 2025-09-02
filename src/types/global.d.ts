declare interface Task {
    status: 'processing' | 'done' | 'error';
    objectName: string;
    progress: number;
    createdAt: string;
    updatedAt: string;
    error?: unknown;
    etag?: string;
}