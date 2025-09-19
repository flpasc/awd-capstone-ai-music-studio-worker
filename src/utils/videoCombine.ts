import { launchFfmpegProcess } from './ffmpeg';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';

const codecArgs = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac'];

// Create a video from an image and audio file
export function createVideoFromImageAndAudio(
  image: string,
  audio: string,
  outputVideo: string,
  options: { signal?: AbortSignal; imageTime?: number } = {}
) {
  const inputArgs = [];
  inputArgs.push('-y'); // overwrite output files
  // inputArgs.push('-n'); // disable overwriting output files
  inputArgs.push('-loop', '1');
  inputArgs.push('-i', image);
  if (options.imageTime) {
    inputArgs.push('-t', options.imageTime.toString());
  }
  inputArgs.push('-i', audio);

  const outputArgs = ['-shortest', outputVideo];
  const { signal } = options;
  const args = [...inputArgs, ...codecArgs, ...outputArgs];
  launchFfmpegProcess(args, { signal });
}

// Create a slideshow from multiple images and audio files
export type SlideShowOptions = {
  imageFiles: string[];
  imageTimings: number[];
  audioFiles: string[];
  audioTimings: number[];
  /** Transition duration in seconds; if undefined or zero, no transitions */
  transitionDuration?: number;
};

export function createSlideShow(
  options: SlideShowOptions,
  outputVideo: string,
  ffmpegOptions: { signal?: AbortSignal; pixelFormat?: string } = {}
) {
  const { imageFiles, imageTimings, audioFiles, audioTimings } = options;
  // allow overriding pixel format (e.g., 'yuv420p', 'yuv422p', etc.)
  const pixelFormat = ffmpegOptions.pixelFormat ?? 'yuv420p';

  if (imageFiles.length !== imageTimings.length || audioFiles.length !== audioTimings.length) {
    throw new Error('Number of image files, audio files, and timings must match');
  }

  const inputArgs: string[] = [];
  const filterParts: string[] = [];
  const videoOutputs: string[] = [];
  const audioOutputs: string[] = [];

  // Adding images and audio as inputs
  imageFiles.forEach((image) => {
    inputArgs.push('-loop', '1');
    inputArgs.push('-i', image);
  });
  audioFiles.forEach((audio) => inputArgs.push('-i', audio));

  // Processing each image
  for (let i = 0; i < imageFiles.length; i++) {
    filterParts.push(
      `[${i}:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,trim=duration=${imageTimings[i]},setpts=PTS-STARTPTS[v${i}]`
    );
    videoOutputs.push(`[v${i}]`);
  }

  // Processing each audio file
  for (let i = 0; i < audioFiles.length; i++) {
    filterParts.push(
      `[${i + imageFiles.length}:a]atrim=duration=${audioTimings[i]},asetpts=PTS-STARTPTS[a${i}]`
    );
    audioOutputs.push(`[a${i}]`);
  }

  // Concatenate video: either with transitions or simple concat
  const { transitionDuration } = options;
  if (transitionDuration && transitionDuration > 0 && imageFiles.length > 1) {
    let currentLabel = videoOutputs[0];
    let cumulative = imageTimings[0];
    // apply xfade between each pair
    for (let i = 1; i < imageFiles.length; i++) {
      const next = videoOutputs[i];
      const out = `vx${i}`;
      // use net duration before fade to calculate offset
      const offset = cumulative - transitionDuration;
      filterParts.push(
        `${currentLabel}${next}` +
          `xfade=transition=fade:duration=${transitionDuration}:offset=${offset}` +
          `[${out}]`
      );
      currentLabel = `[${out}]`;
      // update net duration: previous chain plus next slide minus overlap
      cumulative = cumulative + imageTimings[i] - transitionDuration;
    }
    // final format
    filterParts.push(`${currentLabel}format=${pixelFormat}[vout]`);
  } else {
    // simple concat of video streams
    filterParts.push(`${videoOutputs.join('')}concat=n=${imageFiles.length}:v=1:a=0[vout]`);
  }

  // Concatenating all audio
  filterParts.push(`${audioOutputs.join('')}concat=n=${audioFiles.length}:v=0:a=1[aout]`);

  const filterGraph = filterParts.join(';');

  const args = [
    ...inputArgs,
    '-filter_complex',
    filterGraph,
    '-map',
    '[vout]',
    '-map',
    '[aout]',
    '-c:v',
    'libx264',
    '-pix_fmt',
    pixelFormat,
    '-c:a',
    'aac',
    '-shortest',
    '-y',
    outputVideo,
  ];

  return launchFfmpegProcess(args, { signal: ffmpegOptions.signal });
}

// Stream-based version of SlideShowOptions
export type SlideShowStreamOptions = {
  imageStreams: { stream: Readable; name: string }[];
  imageTimings: number[];
  audioStreams: { stream: Readable; name: string }[];
  audioTimings: number[];
  /** Transition duration in seconds; if undefined or zero, no transitions */
  transitionDuration?: number;
};

/**
 * Create a slideshow from multiple image and audio streams
 * This version accepts streams instead of file paths, allowing for direct processing
 * of content from cloud storage without downloading to disk first.
 */
export function createSlideShowFromStreams(
  options: SlideShowStreamOptions,
  outputVideo: string,
  ffmpegOptions: { signal?: AbortSignal; pixelFormat?: string } = {}
): Promise<void> {
  const { imageStreams, imageTimings, audioStreams, audioTimings } = options;
  // allow overriding pixel format (e.g., 'yuv420p', 'yuv422p', etc.)
  const pixelFormat = ffmpegOptions.pixelFormat ?? 'yuv420p';

  if (imageStreams.length !== imageTimings.length || audioStreams.length !== audioTimings.length) {
    throw new Error('Number of image streams, audio streams, and timings must match');
  }

  return new Promise((resolve, reject) => {
    const inputArgs: string[] = [];
    const filterParts: string[] = [];
    const videoOutputs: string[] = [];
    const audioOutputs: string[] = [];

    // Adding images as pipe inputs
    imageStreams.forEach((_, index) => {
      inputArgs.push('-f', 'image2pipe'); // Explicitly specify image format
      // inputArgs.push('-loop', '1'); // -loop 1 have no sense with -f image2pipe
      inputArgs.push('-i', `pipe:${index}`); // Remove -loop 1 for pipes
    });

    // Adding audio as pipe inputs (starting after image inputs)
    audioStreams.forEach((_, index) => {
      inputArgs.push('-i', `pipe:${index + imageStreams.length}`);
    });

    // Processing each image
    for (let i = 0; i < imageStreams.length; i++) {
      // For static images from pipes, we need to loop them to create duration
      const frameCount = Math.ceil(imageTimings[i] * 25); // 25 FPS
      filterParts.push(
        `[${i}:v]scale=1280:720:force_original_aspect_ratio=decrease,` +
          `pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,` +
          `loop=loop=${frameCount}:size=1:start=0,` + // Loop the single frame
          `setpts=N/(25*TB)[v${i}]` // Set proper timestamps
      );
      videoOutputs.push(`[v${i}]`);
    }

    // Processing each audio stream
    for (let i = 0; i < audioStreams.length; i++) {
      filterParts.push(
        `[${i + imageStreams.length}:a]atrim=duration=${audioTimings[i]},asetpts=PTS-STARTPTS[a${i}]`
      );
      audioOutputs.push(`[a${i}]`);
    }

    // Concatenate video: either with transitions or simple concat
    const { transitionDuration } = options;
    if (transitionDuration && transitionDuration > 0 && imageStreams.length > 1) {
      let currentLabel = videoOutputs[0];
      let cumulative = imageTimings[0];
      // apply xfade between each pair
      for (let i = 1; i < imageStreams.length; i++) {
        const next = videoOutputs[i];
        const out = `vx${i}`;
        // use net duration before fade to calculate offset
        const offset = cumulative - transitionDuration;
        filterParts.push(
          `${currentLabel}${next}` +
            `xfade=transition=fade:duration=${transitionDuration}:offset=${offset}` +
            `[${out}]`
        );
        currentLabel = `[${out}]`;
        // update net duration: previous chain plus next slide minus overlap
        cumulative = cumulative + imageTimings[i] - transitionDuration;
      }
      // final format
      filterParts.push(`${currentLabel}format=${pixelFormat}[vout]`);
    } else {
      // simple concat of video streams
      filterParts.push(`${videoOutputs.join('')}concat=n=${imageStreams.length}:v=1:a=0[vout]`);
    }

    // Concatenating all audio
    filterParts.push(`${audioOutputs.join('')}concat=n=${audioStreams.length}:v=0:a=1[aout]`);

    const filterGraph = filterParts.join(';');

    const args = [
      ...inputArgs,
      '-filter_complex',
      filterGraph,
      '-map',
      '[vout]',
      '-map',
      '[aout]',
      '-c:v',
      'libx264',
      '-pix_fmt',
      pixelFormat,
      '-c:a',
      'aac',
      '-r',
      '25', // Set output frame rate
      '-shortest',
      '-y',
      outputVideo,
    ];

    // Debug logging
    console.log('FFmpeg command arguments:', args.join(' '));
    console.log('Filter graph:', filterGraph);

    // Calculate total number of input streams needed
    const totalStreams = imageStreams.length + audioStreams.length;

    // Create stdio array: stdin for each input stream + stdout + stderr
    const stdioConfig: Array<'pipe' | 'inherit'> = [];
    for (let i = 0; i < totalStreams; i++) {
      stdioConfig.push('pipe');
    }
    stdioConfig.push('pipe'); // stdout
    stdioConfig.push('pipe'); // stderr

    // Spawn FFmpeg process with pipe support
    const ffmpeg = spawn('ffmpeg', args, {
      stdio: stdioConfig,
      signal: ffmpegOptions.signal,
    });

    // Track stream completion for proper synchronization
    let completedStreams = 0;
    const totalInputStreams = imageStreams.length + audioStreams.length;

    const handleStreamComplete = () => {
      completedStreams++;
      if (completedStreams === totalInputStreams) {
        // All streams completed, we can now close stdin pipes if needed
        console.log('All input streams completed');
      }
    };

    // Pipe all image streams to FFmpeg
    imageStreams.forEach((imageStream, index) => {
      if (ffmpeg.stdio[index]) {
        const targetPipe = ffmpeg.stdio[index] as NodeJS.WritableStream;

        console.log(`Connecting image stream ${index} (${imageStream.name}) to pipe ${index}`);

        // Handle stream errors before piping
        imageStream.stream.on('error', (error) => {
          console.error(`Image stream ${index} (${imageStream.name}) error:`, error);
          reject(error);
        });

        // Handle pipe errors but don't reject on ECONNRESET if FFmpeg is finishing
        targetPipe.on('error', (error: NodeJS.ErrnoException) => {
          if (error.code === 'ECONNRESET' || error.code === 'EPIPE') {
            console.warn(`Target pipe ${index} closed by FFmpeg (expected during completion)`);
          } else {
            console.error(`Target pipe ${index} error:`, error);
            reject(error);
          }
        });

        // Use default pipe behavior (end: true)
        imageStream.stream.pipe(targetPipe);

        // Track stream completion
        imageStream.stream.on('end', () => {
          console.log(`Image stream ${index} (${imageStream.name}) ended`);
          handleStreamComplete();
        });
      }
    });

    // Pipe all audio streams to FFmpeg
    audioStreams.forEach((audioStream, index) => {
      const pipeIndex = index + imageStreams.length;
      if (ffmpeg.stdio[pipeIndex]) {
        const targetPipe = ffmpeg.stdio[pipeIndex] as NodeJS.WritableStream;

        console.log(`Connecting audio stream ${index} (${audioStream.name}) to pipe ${pipeIndex}`);

        // Handle stream errors before piping
        audioStream.stream.on('error', (error) => {
          console.error(`Audio stream ${index} (${audioStream.name}) error:`, error);
          reject(error);
        });

        // Handle pipe errors but don't reject on ECONNRESET if FFmpeg is finishing
        targetPipe.on('error', (error: NodeJS.ErrnoException) => {
          if (error.code === 'ECONNRESET' || error.code === 'EPIPE') {
            console.warn(`Target pipe ${pipeIndex} closed by FFmpeg (expected during completion)`);
          } else {
            console.error(`Target pipe ${pipeIndex} error:`, error);
            reject(error);
          }
        });

        // Use default pipe behavior (end: true)
        audioStream.stream.pipe(targetPipe);

        // Track stream completion
        audioStream.stream.on('end', () => {
          console.log(`Audio stream ${index} (${audioStream.name}) ended`);
          handleStreamComplete();
        });
      }
    });

    let output = '';
    let errorOutput = '';

    // stdout is now at index totalStreams, stderr at totalStreams + 1
    const stdoutIndex = totalStreams;
    const stderrIndex = totalStreams + 1;

    ffmpeg.stdio[stdoutIndex]?.on('data', (data: Buffer) => {
      output += data.toString();
    });

    ffmpeg.stdio[stderrIndex]?.on('data', (data: Buffer) => {
      errorOutput += data.toString();
      console.error(`FFmpeg stderr: ${data}`);
    });

    ffmpeg.on('close', (code: number | null) => {
      if (code === 0) {
        console.log('FFmpeg process completed successfully');
        // TODO: use output for tracking progress
        console.debug('FFmpeg output:', output);
        resolve();
      } else {
        console.error(`FFmpeg process exited with code ${code}`);
        console.error('Error output:', errorOutput);
        reject(new Error(`FFmpeg process exited with code ${code}: ${errorOutput}`));
      }
    });

    ffmpeg.on('error', (error: Error) => {
      console.error('FFmpeg process error:', error);
      reject(error);
    });
  });
}
