const path = require('path');
const fs = require('fs');
const raspivid = require('raspivid');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const { promisify } = require('util');

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

// Initialize motion detection
const Jimp = require('jimp');
const motion = {
    threshold: MOTION_THRESHOLD * 100,
    area: MOTION_AREA_THRESHOLD,
    width: MOTION_WIDTH,
    height: MOTION_HEIGHT,
    lastFrame: null,
    isDetecting: false
};

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

// Initialize motion detection
const motionDetector = initializeMotionDetection();

// Motion detection class
class MotionDetector {
    constructor() {
        this.lastMotionTime = null;
        this.detectMotion = null;
    }

    async detectMotion(frame) {
        if (!this.detectMotion) {
            console.error('Motion detection not initialized');
            return false;
        }

        try {
            const hasMotion = await this.detectMotion(frame);
            if (hasMotion) {
                this.lastMotionTime = Date.now();
                console.log('Motion detected!');
            }
            return hasMotion;
        } catch (error) {
            console.error('Error detecting motion:', error);
            return false;
        }
    }

    shouldProcessMotion() {
        // Only process motion if it's been at least CLIP_DURATION since the last motion
        // Add a small buffer to prevent rapid firing
        return !this.lastMotionTime || (Date.now() - this.lastMotionTime) > (CLIP_DURATION * 1000 + 5000);
    }
}

// Bird feeder camera class
class BirdFeederCamera {
    constructor() {
        this.motionDetector = new MotionDetector();
        this.recording = false;
        this.buffer = [];
        this.telegramBot = null;
        this.whatsappBot = null;
        this.cleanupInterval = null;
    }

    async capturePhoto(outputPath) {
        return new Promise((resolve, reject) => {
            raspivid(
                {
                    output: outputPath,
                    width: 1920,
                    height: 1080,
                    quality: 100,
                    timeout: 1000
                },
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    async initialize() {
        try {
            // Create necessary directories
            fs.mkdirSync(path.join(__dirname, '..', 'captures'), { recursive: true });
            fs.mkdirSync(path.join(__dirname, '..', 'clips'), { recursive: true });
            fs.mkdirSync(path.join(__dirname, '..', 'temp'), { recursive: true });

            // Start cleanup interval
            this.startCleanupInterval();

            // Initialize motion detection
            const motionDetector = await initializeMotionDetection();
            this.motionDetector = new MotionDetector();
            this.motionDetector.detectMotion = motionDetector.detect;

            console.log('Camera initialized successfully');
        } catch (error) {
            console.error('Error initializing camera:', error);
            throw error;
        }
    }

    async startCleanupInterval() {
        const cleanupDays = parseInt(process.env.CLEANUP_DAYS) || DEFAULT_CLEANUP_DAYS;
        this.cleanupInterval = setInterval(() => {
            this.cleanupOldClips(cleanupDays);
        }, 24 * 60 * 60 * 1000); // Run cleanup daily
    }

    async identifyBird(imagePath) {
        try {
            const rfApiKey = process.env.ROBOFLOW_API_KEY;
            const rfWorkspace = process.env.ROBOFLOW_WORKSPACE;
            const rfProject = process.env.ROBOFLOW_PROJECT;
            const rfVersion = process.env.ROBOFLOW_VERSION || '1';

            if (!rfApiKey || !rfWorkspace || !rfProject) {
                console.warn("Roboflow credentials not set. Skipping bird identification.");
                return null;
            }

            const formData = new FormData();
            formData.append('image', fs.createReadStream(imagePath));

            const response = await axios.post(
                `https://${rfWorkspace}.roboflow.com/${rfProject}/${rfVersion}/predict`,
                formData,
                {
                    headers: {
                        'x-api-key': rfApiKey,
                        ...formData.getHeaders()
                    },
                    timeout: 30000
                }
            );

            if (response.data && response.data.predictions && response.data.predictions.length > 0) {
                const prediction = response.data.predictions.reduce((max, pred) => 
                    pred.confidence > max.confidence ? pred : max
                );
                return {
                    species: prediction.class,
                    confidence: Math.round(prediction.confidence * 100)
                };
            }

            return null;
        } catch (error) {
            console.error('Error identifying bird:', error);
            return null;
        }
    }

    async sendTelegramNotification(imagePath, birdInfo) {
        const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
        const chatId = process.env.TELEGRAM_CHAT_ID;

        let caption = "Bird detected!";
        if (birdInfo) {
            caption += `\nSpecies: ${birdInfo.species}\nConfidence: ${birdInfo.confidence}%`;
        }

        try {
            await bot.sendPhoto(chatId, imagePath, { caption });
        } catch (error) {
            console.error('Error sending Telegram notification:', error);
        }
    }

    static async getStats() {
        return new Promise((resolve, reject) => {
            db.all(
                'SELECT COUNT(*) as total, species, confidence FROM bird_visits GROUP BY species ORDER BY total DESC',
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    async cleanupOldClips(daysToKeep) {
        try {
            const clipsDir = path.join(__dirname, '..', 'clips');
            const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);

            fs.readdir(clipsDir, (err, files) => {
                if (err) {
                    console.error('Error reading clips directory:', err);
                    return;
                }

                files.forEach(file => {
                    if (file.endsWith('.mp4')) {
                        const filePath = path.join(clipsDir, file);
                        fs.stat(filePath, (statErr, stats) => {
                            if (statErr) {
                                console.error(`Error checking file stats for ${file}:`, statErr);
                                return;
                            }

                            if (stats.mtimeMs < cutoffTime) {
                                fs.unlink(filePath, unlinkErr => {
                                    if (unlinkErr) {
                                        console.error(`Error deleting file ${file}:`, unlinkErr);
                                    }
                                });
                            }
                        });
                    }
                });
            });
        } catch (error) {
            console.error('Error in cleanupOldClips:', error);
        }
    }
    async processMotionEvent() {
        if (!this.motionDetector.shouldProcessMotion()) {
            return;
        }

        // Capture frame for motion detection
        const framePath = path.join(__dirname, '..', 'temp', 'motion_frame.jpg');
        await this.capturePhoto(framePath);

        // Check for motion
        const hasMotion = await this.motionDetector.detectMotion(framePath);
        if (!hasMotion) {
            return;
        }

        // Wait for capture delay
        await new Promise(resolve => setTimeout(resolve, CAPTURE_DELAY * 1000));

        // Start video recording
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const clipPath = path.join(__dirname, '..', 'clips', `${timestamp}.mp4`);

        // Record video
        await new Promise((resolve, reject) => {
            raspivid({
                output: clipPath,
                width: 1280,
                height: 720,
                quality: 100,
                timeout: CLIP_DURATION * 1000,
                bitrate: 10000000,
                fps: 30
            }, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Capture still image for identification
        const imagePath = path.join(__dirname, '..', 'captures', `${timestamp}.jpg`);
        await this.capturePhoto(imagePath);

        // Identify bird
        const birdInfo = await this.identifyBird(imagePath);

        // Store in database
        if (birdInfo) {
            await this.storeBirdVisit(birdInfo);
        }

        // Send notification
        await this.sendNotification(imagePath, birdInfo);
    }

    static async getClips() {
        const clipsDir = path.join(__dirname, '..', 'clips');
        const clips = fs.readdirSync(clipsDir)
            .filter(file => file.endsWith('.mp4'))
            .map(file => ({
                filename: file,
                timestamp: file.replace(/\.mp4$/, '')
            }));
        return clips;
    }
}

module.exports = { MotionDetector, BirdFeederCamera };
