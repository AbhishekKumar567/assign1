const express = require('express');
const mongoose = require('mongoose');
const Queue = require('bull');
const ffmpeg = require('ffmpeg-static');
const ffmpegPath = ffmpeg.path;
const ffmpegCommand = require('fluent-ffmpeg');
const axios = require('axios');


// Set up Express app
const app = express();
app.use(express.json());

// Set up MongoDB connection
mongoose.connect('mongodb://localhost:27017/video_processing', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Defining VideoJob model
const VideoJob = mongoose.model('VideoJob', {
  jobId: String,
  videoUrl: String,
  status: String,
  processedVideoUrl: String,
});

// Setting up the job processing queue
const videoProcessingQueue = new Queue('videoProcessing', {
  redis: {
    host: 'localhost',
    port: 6379,
  },
});

// Processing video job
function processVideoJob(job) {
  return new Promise((resolve, reject) => {
    ffmpegCommand.setFfmpegPath(ffmpegPath);
    const videoPath = `/path/to/store/videos/${job.jobId}.mp4`;
    const processedVideoPath = `/path/to/store/processed_videos/${job.jobId}.mp4`;

    // Download the video file
    axios({
      url: job.videoUrl,
      responseType: 'stream',
    })
      .then((response) => {
        const writer = fs.createWriteStream(videoPath);
        response.data.pipe(writer);

        writer.on('finish', () => {
          // Process the video using ffmpeg
          ffmpegCommand(videoPath)
            .output(processedVideoPath)
            .on('end', () => {
              // Update job status and processed video URL
              job.status = 'completed';
              job.processedVideoUrl = `http://example.com/processed_videos/${job.jobId}.mp4`;
              job.save();

              resolve();
            })
            .on('error', (err) => {
              // Handle ffmpeg processing error
              job.status = 'failed';
              job.save();

              reject(err);
            })
            .run();
        });
      })
      .catch((err) => {
        // Handle video download error
        job.status = 'failed';
        job.save();

        reject(err);
      });
  });
}

// Define route to submit video job
app.post('/submit', async (req, res) => {
  const { videoUrl } = req.body;

  // Create a new video job
  const job = new VideoJob({
    jobId: Math.random().toString(36).substring(7),
    videoUrl,
    status: 'queued',
  });

  // Save the job to the database
  await job.save();

  // Add the job to the processing queue
  await videoProcessingQueue.add(job.jobId, job);

  res.json({ jobId: job.jobId });
});

// Define route to check job status
app.get('/status/:jobId', async (req, res) => {
  const { jobId } = req.params;

  // Find the job in the database
  const job = await VideoJob.findOne({ jobId });

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json({ status: job.status });
});

// Define route to download processed video
app.get('/download/:jobId', async (req, res) => {

const { jobId } = req.params;

// Find the job in the database
const job = await VideoJob.findOne({ jobId });

if (!job) {
  return res.status(404).json({ error: 'Job not found' });
}

if (job.status !== 'completed') {
  return res.status(400).json({ error: 'Job is not completed' });
}

// Provide the download link to the processed video
res.json({ downloadUrl: job.processedVideoUrl });
});


// Start the server
app.listen(3000, () => {
  console.log('Server is running on port 3000');
});

// Set up the job processor
videoProcessingQueue.process(async (job) => {
  // Find the video job in the database
  const videoJob = await VideoJob.findOne({ jobId: job.data.jobId });

  if (!videoJob) {
    throw new Error(`Video job not found: ${job.data.jobId}`);
  }

  // Update job status to 'processing'
  videoJob.status = 'processing';
  await videoJob.save();

  // Process the video job
  await processVideoJob(videoJob);
});

// Start the queue
videoProcessingQueue.resume();


