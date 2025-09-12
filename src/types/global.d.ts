declare type TaskStatus = 'processing' | 'done' | 'error';

declare interface BaseTask {
  id: string;
  status: TaskStatus;
  objectName: string;
  progress: number;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

// Define types for actions and their parameters/results
declare interface TaskActions {
  createSlideshow: {
    params: {
      imageKeys: string[];
      audioKeys: string[];
      imageTimings: number[];
      audioTimings: number[];
      transitionDuration?: number;
      outputKey: string;
    };
    result: {
      videoKey: string;
      videoEtag: string;
    };
  };
  renderVideo: {
    params: {
      inputKey: string;
      outputKey: string;
      resolution: string;
      codec?: string;
    };
    result: {
      videoKey: string;
      duration: number;
      fileSize: number;
    };
  };
}
declare type TaskAction = keyof TaskActions;

declare type Task<T extends keyof TaskActions = keyof TaskActions> = BaseTask & {
  action: T;
  params: TaskActions[T]['params'];
  result?: TaskActions[T]['result'];
};

declare type AnyTask = {
  [K in keyof TaskActions]: Task<K>;
}[keyof TaskActions];

declare type createTaskResponseDto =
  | {
      id: string;
      progress: number;
      status: Omit<TaskStatus, 'error'>;
    }
  | {
      id: string;
      progress: number;
      status: 'error';
      error: string;
    };

declare type AnyTaskResult = {
  [K in keyof TaskActions]: TaskActions[K]['result'];
}[keyof TaskActions];

declare type checkTaskResponseDto = {
  id: string;
  progress: number;
  status: TaskStatus;
  error?: string;
  result?: AnyTaskResult;
};
