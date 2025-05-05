const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const { promisify } = require('util');
const Webcam = require('node-webcam');
const MotionDetector = require('./motion_detector');
const BirdFeederCamera = require('./bird_feed_camera');

// Constants
const CLIP_DURATION = 60; // seconds
const PRE_MOTION_BUFFER = 10; // seconds
const MOTION_THRESHOLD = 0.1; // Lower threshold for better detection
const MOTION_AREA_THRESHOLD = 500; // Lower area threshold
const CAPTURE_DELAY = 2; // seconds
const DEFAULT_CLEANUP_DAYS = 7; // Default number of days to keep clips
const MOTION_WIDTH = 640;
const MOTION_HEIGHT = 480;
const MOTION_FRAMERATE = 10;

// Determine if we're in development mode
const IS_DEV = process.env.NODE_ENV === 'development';

// Camera implementation based on environment
let cameraImpl = null;

// Initialize camera implementation
async function initializeCameraImpl() {
    try {
        // Initialize camera
        const webcam = Webcam.create({
            width: 1280,
            height: 720,
            quality: 100,
            delay: 0,
            output: 'jpeg',
            device: true,
            callbackReturn: 'buffer'
        });

        // List available cameras
        const availableCameras = await webcam.list();
        console.log('Available cameras:', availableCameras);

        if (!availableCameras || availableCameras.length === 0) {
            throw new Error('No cameras found');
        }

        // Set the first available camera
        await webcam.set('device', availableCameras[0]);

        return {
            capturePhoto: async (outputPath) => {
                try {
                    const buffer = await new Promise((resolve, reject) => {
                        webcam.snap((err, data) => {
                            if (err) reject(err);
                            else resolve(data);
                        });
                    });

                    // Save to file
                    fs.writeFileSync(outputPath, buffer);
                    return outputPath;
                } catch (error) {
                    console.error('Error capturing photo:', error);
                    throw error;
                }
            },
            startStream: async (req, res) => {
                try {
                    res.setHeader('Content-Type', 'multipart/x-mixed-replace; boundary=frame');
                    
                    // Create interval to capture frames
                    const interval = setInterval(async () => {
                        try {
                            const buffer = await new Promise((resolve, reject) => {
                                webcam.snap((err, data) => {
                                    if (err) reject(err);
                                    else resolve(data);
                                });
                            });

                            // Send frame
                            res.write(`--frame\r\n`);
                            res.write(`Content-Type: image/jpeg\r\n`);
                            res.write(`Content-Length: ${buffer.length}\r\n`);
                            res.write(`\r\n`);
                            res.write(buffer);
                            res.write(`\r\n`);
                        } catch (error) {
                            console.error('Error capturing frame:', error);
                        }
                    }, 1000/15); // 15 FPS

                    // Cleanup when connection closes
                    res.on('close', () => {
                        clearInterval(interval);
                    });
                } catch (error) {
                    console.error('Error starting stream:', error);
                    throw error;
                }
            }
        }
    } catch (error) {
        console.error('Error initializing camera implementation:', error);
        throw error;
    }
}

// Initialize database
const db = new sqlite3.Database(path.join(__dirname, 'bird_visits.db'), (err) => {
    if (err) {
        console.error('Error opening database:', err);
    } else {
        // Create table if it doesn't exist
        const createTable = `
            CREATE TABLE IF NOT EXISTS bird_visits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                species TEXT,
                confidence INTEGER,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `;
        db.run(createTable, (err) => {
            if (err) {
                console.error('Error creating table:', err);
            }
        });
    }
});

// Initialize motion detection
const motion = { isDetecting: false, lastFrame: null, threshold: MOTION_THRESHOLD, area: MOTION_AREA_THRESHOLD }
const Jimp = require('jimp');
const motionDetector = initializeMotionDetection();

// Initialize motion detection
async function initializeMotionDetection() {
    try {
        // Start motion detection
        motion.isDetecting = true;
        console.log('Motion detection initialized successfully');

        return {
            detect: async (frame) => {
                try {
                    // Convert frame to grayscale
                    const grayFrame = await Jimp.read(frame);
                    grayFrame.greyscale();

                    // Compare with last frame if available
                    if (motion.lastFrame) {
                        const diff = await grayFrame.clone().subtract(motion.lastFrame);
                        const pixels = await diff.getPixels();
                        
                        // Calculate motion score
                        let score = 0;
                        for (const pixel of pixels) {
                            if (pixel.r > motion.threshold) {
                                score++;
                            }
                        }

                        // Check if motion area is large enough
                        if (score > motion.area) {
                            console.log('Motion detected!');
                            return true;
                        }
                    }

                    // Update last frame
                    motion.lastFrame = grayFrame;
                    return false;
                } catch (error) {
                    console.error('Error in motion detection:', error);
                    return false;
                }
            }
        };
    } catch (error) {
        console.error('Error initializing motion detection:', error);
        process.exit(1);
    }
}

// Export the functions
module.exports = {
    initializeCameraImpl,
    initializeMotionDetection
};
