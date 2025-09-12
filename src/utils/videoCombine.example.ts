import { createSlideShow, createVideoFromImageAndAudio } from './videoCombine';

const abortControllers: AbortController[] = [];

// Handle termination signals
process.on('SIGINT', () => {
  console.log('Received SIGINT. Aborting...');
  abortControllers.forEach((controller) => controller.abort());
});
process.on('SIGTERM', () => {
  console.log('Received SIGTERM. Aborting...');
  abortControllers.forEach((controller) => controller.abort());
});

const abortController1 = new AbortController();
abortControllers.push(abortController1);
createVideoFromImageAndAudio('assets/image1.png', 'assets/audio1.mp3', 'video5.mp4', {
  signal: abortController1.signal,
  imageTime: 10,
});

const abortController2 = new AbortController();
abortControllers.push(abortController2);
createSlideShow(
  {
    imageFiles: ['assets/image1.png', 'assets/image2.png', 'assets/image3.png'],
    imageTimings: [5, 5, 5],
    audioFiles: ['assets/audio1.mp3', 'assets/audio2.mp3', 'assets/audio3.mp3'],
    audioTimings: [5, 5, 5],
    transitionDuration: 1,
  },
  'slideshow.mp4',
  { signal: abortController2.signal, pixelFormat: 'yuv422p' }
);
