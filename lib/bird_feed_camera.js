const fs = require('fs');
const path = require('path');
const MotionDetector = require('./motion_detector');
const DEFAULT_CLEANUP_DAYS = 7;

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
        try {
            return await cameraImpl.capturePhoto(outputPath);
        } catch (error) {
            console.error('Error capturing photo:', error);
            throw error;
        }
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
            this.motionDetector = new MotionDetector();
            this.motionDetector.detectMotion = async (frame) => {
                // Simple motion detection implementation
                const hasMotion = frame !== null; // Replace with actual motion detection logic
                return hasMotion;
            };

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
                        'Authorization': `Bearer ${rfApiKey}`,
                        'Content-Type': 'multipart/form-data'
                    }
                }
            );

            // Process response and return bird info
            const predictions = response.data.predictions;
            if (predictions && predictions.length > 0) {
                const bird = predictions[0];
                return {
                    species: bird.class,
                    confidence: bird.confidence
                };
            }
            return null;
        } catch (error) {
            console.error('Error identifying bird:', error);
            return null;
        }
    }

    async sendTelegramNotification(imagePath, birdInfo) {
        try {
            const botToken = process.env.TELEGRAM_BOT_TOKEN;
            const chatId = process.env.TELEGRAM_CHAT_ID;

            if (!botToken || !chatId) {
                console.warn("Telegram credentials not set. Skipping notification.");
                return;
            }

            const formData = new FormData();
            formData.append('photo', fs.createReadStream(imagePath));
            formData.append('chat_id', chatId);

            if (birdInfo) {
                const caption = `Bird detected: ${birdInfo.species}\nConfidence: ${(birdInfo.confidence * 100).toFixed(1)}%`;
                formData.append('caption', caption);
            }

            await axios.post(
                `https://api.telegram.org/bot${botToken}/sendPhoto`,
                formData,
                {
                    headers: formData.getHeaders()
                }
            );
        } catch (error) {
            console.error('Error sending Telegram notification:', error);
        }
    }

    async startCleanupInterval() {
        try {
            const cleanupDays = parseInt(process.env.CLEANUP_DAYS) || DEFAULT_CLEANUP_DAYS;
            this.cleanupInterval = setInterval(() => {
                this.cleanupOldClips(cleanupDays);
            }, 24 * 60 * 60 * 1000); // Run cleanup daily
        } catch (error) {
            console.error('Error starting cleanup interval:', error);
        }
    }


    async cleanupOldClips(daysToKeep) {
        const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
        const clipsDir = path.join(__dirname, '..', 'clips');
        
        fs.readdir(clipsDir, (err, files) => {
            if (err) {
                console.error('Error reading clips directory:', err);
                return;
            }

            files.forEach(file => {
                const filePath = path.join(clipsDir, file);
                fs.stat(filePath, (err, stats) => {
                    if (err) {
                        console.error(`Error getting stats for ${file}:`, err);
                        return;
                    }

                    if (stats.mtimeMs < cutoffTime) {
                        fs.unlink(filePath, (err) => {
                            if (err) {
                                console.error(`Error deleting ${file}:`, err);
                            }
                        });
                    }
                });
            });
        });
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

    async getClips() {
        const clipsDir = path.join(__dirname, '..', 'clips');
        return new Promise((resolve, reject) => {
            fs.readdir(clipsDir, (err, files) => {
                if (err) reject(err);
                else resolve(files.map(file => path.join('/clips', file)));
            });
        });
    }
}
module.exports = BirdFeederCamera;