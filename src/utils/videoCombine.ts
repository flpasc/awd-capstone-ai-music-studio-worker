import { launchFfmpegProcess } from './ffmpeg';

const codecArgs = [
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
];

// Create a video from an image and audio file
export function createVideoFromImageAndAudio(image: string, audio: string, outputVideo: string, options: { signal?: AbortSignal, imageTime?: number } = {}) {
    const inputArgs = [];
    inputArgs.push('-y'); // overwrite output files
    // inputArgs.push('-n'); // disable overwriting output files
    inputArgs.push('-loop', '1');
    inputArgs.push('-i', image);
    if (options.imageTime) {
        inputArgs.push('-t', options.imageTime.toString());
    }
    inputArgs.push('-i', audio);

    const outputArgs = [
        '-shortest',
        outputVideo
    ];
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

    if (imageFiles.length !== imageTimings.length || audioFiles.length !== audioTimings.length || imageFiles.length !== audioFiles.length) {
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
        filterParts.push(`[${i}:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,trim=duration=${imageTimings[i]},setpts=PTS-STARTPTS[v${i}]`);
        videoOutputs.push(`[v${i}]`);
    }

    // Processing each audio file
    for (let i = 0; i < audioFiles.length; i++) {
        filterParts.push(`[${i + imageFiles.length}:a]atrim=duration=${audioTimings[i]},asetpts=PTS-STARTPTS[a${i}]`);
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
        '-filter_complex', filterGraph,
        '-map', '[vout]',
        '-map', '[aout]',
        '-c:v', 'libx264',
        '-pix_fmt', pixelFormat,
        '-c:a', 'aac',
        '-shortest',
        '-y',
        outputVideo
    ];

    return launchFfmpegProcess(args, { signal: ffmpegOptions.signal });
}
