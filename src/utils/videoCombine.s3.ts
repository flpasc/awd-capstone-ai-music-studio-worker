import { S3Store } from './s3store';
import { createSlideShowFromStreams, SlideShowStreamOptions } from './videoCombine';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export type S3SlideShowOptions = {
    imageKeys: string[];
    imageTimings: number[];
    audioKeys: string[];
    audioTimings: number[];
    /** Transition duration in seconds; if undefined or zero, no transitions */
    transitionDuration?: number;
    /** S3 bucket name to use for input files (optional, uses default bucket) */
    inputBucketName?: string;
    /** S3 bucket name to use for output video (optional, uses default bucket) */
    outputBucketName?: string;
    /** Output video key on S3 */
    outputKey: string;
};

/**
 * Creates a slideshow from S3 files and uploads the result back to S3
 * @param s3Store - S3Store instance for file operations
 * @param options - SlideShow options with S3 file keys
 * @returns Promise that resolves ETag when the slideshow is created and uploaded
 */
export async function createS3SlideShow(s3Store: S3Store, options: S3SlideShowOptions): Promise<string> {
    const {
        imageKeys,
        imageTimings,
        audioKeys,
        audioTimings,
        transitionDuration,
        inputBucketName,
        outputBucketName,
        outputKey
    } = options;

    // Validate input parameters
    if (imageKeys.length !== imageTimings.length) {
        throw new Error('Number of image keys and image timings must match');
    }
    if (audioKeys.length !== audioTimings.length) {
        throw new Error('Number of audio keys and audio timings must match');
    }

    try {
        // Create streams from S3 files
        const imageStreams = await Promise.all(imageKeys.map(async (key) => {
            const stream = await s3Store.getFileStream(key, inputBucketName);
            return {
                stream,
                name: key
            };
        }));

        const audioStreams = await Promise.all(audioKeys.map(async (key) => {
            const stream = await s3Store.getFileStream(key, inputBucketName);
            return {
                stream,
                name: key
            };
        }));

        // Create temporary output file
        const tempDir = os.tmpdir();
        const tempVideoPath = path.join(tempDir, `slideshow_${Date.now()}_${Math.random().toString(36).slice(2, 11)}.mp4`);

        const streamOptions: SlideShowStreamOptions = {
            imageStreams,
            imageTimings,
            audioStreams,
            audioTimings,
            transitionDuration
        };

        // Create slideshow from streams
        await createSlideShowFromStreams(streamOptions, tempVideoPath);

        // Upload result to S3
        const videoBuffer = fs.readFileSync(tempVideoPath);
        const etag = await s3Store.uploadBuffer(outputKey, videoBuffer, 'video/mp4', outputBucketName);

        // Clean up temporary file
        fs.unlinkSync(tempVideoPath);

        console.log(`S3 slideshow created successfully and uploaded to: ${outputKey}`);
        return etag;
    } catch (error) {
        console.error('Error creating S3 slideshow:', error);
        throw error;
    }
}
