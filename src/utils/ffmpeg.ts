import { spawn } from 'node:child_process';
/**
 * Launches an FFmpeg process with the given arguments and options.
 *
 * Example:
 * const controller = new AbortController();
 * const { signal } = controller;
 * launchFfmpegProcess([
 *  '-i', 'input.mp4',
 *  '-c:v', 'libx264',
 *  '-preset', 'fast',
 *  '-crf', '22',
 *  'output.mp4'
 * ], { signal });
 * controller.abort(); // Stops the child process
 */
export function launchFfmpegProcess(args: string[], options = {}): Promise<void> {

    const ffmpeg = spawn('ffmpeg', [...args], {
        stdio: 'inherit',
        ...options
    });

    return new Promise((resolve, reject) => {
        ffmpeg.stdout?.on('data', (data) => {
            console.log(`stdout: ${data}`);
        });

        ffmpeg.stderr?.on('data', (data) => {
            console.error(`stderr: ${data}`);
        });

        ffmpeg.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`ffmpeg process exited with code ${code}`));
            }
        });
    });
}
