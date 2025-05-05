const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const { promisify } = require('util');
const raspivid = require('raspivid');
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
        // Initialize Raspberry Pi camera
        const camera = {
            capture: async (outputPath) => {
                return new Promise((resolve, reject) => {
                    const spawn = require('child_process').spawn;
                    const raspivid = spawn('raspivid', [
                        '-w', '1280',
                        '-h', '720',
                        '-fps', '25',
                        '-t', '0',
                        '-o', outputPath
                    ]);

                    raspivid.on('error', (error) => {
                        reject(error);
                    });

                    raspivid.on('close', (code) => {
                        if (code === 0) {
                            resolve(outputPath);
                        } else {
                            reject(new Error(`raspivid process exited with code ${code}`));
                        }
                    });
                });
            },
            stream: () => {
                const spawn = require('child_process').spawn;
                return spawn('raspivid', [
                    '-w', '1280',
                    '-h', '720',
                    '-fps', '25',
                    '-t', '0',
                    '-o', '-'
                ]);
            }
        };

        return {
            capturePhoto: async (outputPath) => {
                try {
                    await camera.capture(outputPath);
                    return outputPath;
                } catch (error) {
                    console.error('Error capturing photo:', error);
                    throw error;
                }
            },
            startStream: async (req, res) => {
                try {
                    res.setHeader('Content-Type', 'multipart/x-mixed-replace; boundary=frame');
                    
                    // Start streaming
                    const stream = camera.stream();
                    
                    // Pipe frames to response
                    stream.pipe(res);
                    
                    // Cleanup when connection closes
                    res.on('close', () => {
                        stream.destroy();
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
