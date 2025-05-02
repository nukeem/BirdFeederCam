const path = require('path');
const fs = require('fs');
const raspivid = require('raspivid');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const { promisify } = require('util');

// Constants
const CLIP_DURATION = 60; // seconds
const PRE_MOTION_BUFFER = 10; // seconds
const MOTION_THRESHOLD = 0.3; // Motion detection threshold
const MOTION_AREA_THRESHOLD = 1000; // Minimum area to consider motion
const CAPTURE_DELAY = 2; // seconds
const DEFAULT_CLEANUP_DAYS = 7; // Default number of days to keep clips

// Initialize motion detection
const motion = require('motion');

// Configure motion detection
motion.configure({
    threshold: MOTION_THRESHOLD * 100, // Convert to percentage
    area: MOTION_AREA_THRESHOLD,
    width: 640,
    height: 480,
    framerate: 10,
    output: 'none'
});

// Start motion detection
motion.start();

// Motion detection class
class MotionDetector {
    constructor() {
        this.lastMotionTime = null;
    }

    detectMotion() {
        return motion.hasMotion();
    }

    shouldProcessMotion() {
        // Only process motion if it's been at least CLIP_DURATION since the last motion
        return !this.lastMotionTime || (Date.now() - this.lastMotionTime) > (CLIP_DURATION * 1000);
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
        // Create necessary directories
        fs.mkdirSync(path.join(__dirname, '..', 'captures'), { recursive: true });
        fs.mkdirSync(path.join(__dirname, '..', 'clips'), { recursive: true });

        // Start cleanup interval
        this.startCleanupInterval();

        // Start motion detection if available
        if (motion) {
            motion.start();
        } else {
            console.warn('Motion detection not available yet');
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
