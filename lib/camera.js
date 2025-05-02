const path = require('path');
const fs = require('fs');
const { Picamera2 } = require('picamera2');
const cv = require('opencv4nodejs');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const { promisify } = require('util');

// Constants
const CLIP_DURATION = 60; // seconds
const PRE_MOTION_BUFFER = 10; // seconds
const MOTION_SENSITIVITY = 20;
const CAPTURE_DELAY = 2; // seconds
const DEFAULT_CLEANUP_DAYS = 7; // Default number of days to keep clips

// Database setup
const db = new sqlite3.Database('bird_visits.db');

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS bird_visits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            species TEXT,
            confidence INTEGER
        )
    `);
});

// Motion detection class
class MotionDetector {
    constructor(sensitivity = MOTION_SENSITIVITY) {
        this.sensitivity = sensitivity;
        this.previousFrame = null;
        this.motionDetected = false;
        this.lastMotionTime = null;
    }

    detectMotion(frame) {
        const gray = frame.cvtColor(cv.COLOR_BGR2GRAY);
        const blurred = gray.gaussianBlur(new cv.Size(21, 21), 0);

        if (!this.previousFrame) {
            this.previousFrame = blurred;
            return false;
        }

        const frameDelta = cv.absdiff(this.previousFrame, blurred);
        const thresh = frameDelta.threshold(25, 255, cv.THRESH_BINARY);
        const dilated = thresh.dilate(null, 2);

        const contours = dilated.findContours(cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        let motion = false;
        contours.forEach(contour => {
            if (cv.contourArea(contour) > this.sensitivity) {
                motion = true;
            }
        });

        if (motion) {
            this.lastMotionTime = Date.now();
        }

        this.previousFrame = blurred;
        return motion;
    }

    shouldProcessMotion() {
        // Only process motion if it's been at least CLIP_DURATION since the last motion
        return !this.lastMotionTime || (Date.now() - this.lastMotionTime) > (CLIP_DURATION * 1000);
    }
}

// Bird feeder camera class
class BirdFeederCamera {
    constructor() {
        this.picam2 = new Picamera2();
        this.motionDetector = new MotionDetector();
        this.recording = false;
        this.buffer = [];
        this.telegramBot = null;
        this.whatsappBot = null;
        this.cleanupInterval = null;
    }

    async initialize() {
        const config = this.picam2.createVideoConfiguration();
        this.picam2.configure(config);
        this.picam2.start();

        // Create necessary directories
        fs.mkdirSync(path.join(__dirname, '..', 'captures'), { recursive: true });
        fs.mkdirSync(path.join(__dirname, '..', 'clips'), { recursive: true });

        // Start cleanup interval
        this.startCleanupInterval();
    }

    startCleanupInterval() {
        const cleanupDays = parseInt(process.env.CLEANUP_DAYS) || DEFAULT_CLEANUP_DAYS;
        this.cleanupInterval = setInterval(() => {
            this.cleanupOldClips(cleanupDays);
        }, 24 * 60 * 60 * 1000); // Run cleanup daily
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

        // Capture still image
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const imagePath = path.join(__dirname, '..', 'captures', `${timestamp}.jpg`);
        this.picam2.captureFile(imagePath);

        // Identify bird
        const birdInfo = await this.identifyBird(imagePath);

        // Store in database
        if (birdInfo) {
            await this.storeBirdVisit(birdInfo);
        }

        // Send notification
        await this.sendNotification(imagePath, birdInfo);
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
                `https://api.roboflow.com/${rfWorkspace}/${rfProject}/${rfVersion}`,
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

    storeBirdVisit(birdInfo) {
        return new Promise((resolve, reject) => {
            const stmt = db.prepare(
                'INSERT INTO bird_visits (species, confidence) VALUES (?, ?)'
            );
            stmt.run(
                birdInfo.species,
                birdInfo.confidence,
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    async sendNotification(imagePath, birdInfo) {
        if (process.env.TELEGRAM_ENABLED === 'true') {
            await this.sendTelegramNotification(imagePath, birdInfo);
        }
    }

    async sendTelegramNotification(imagePath, birdInfo) {
        const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
        const chatId = process.env.TELEGRAM_CHAT_ID;

        let caption = "Bird detected!";
        if (birdInfo) {
            caption += `\nSpecies: ${birdInfo.species}\nConfidence: ${birdInfo.confidence}%`;
        }

        await bot.sendPhoto(chatId, imagePath, { caption });
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
