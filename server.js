const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const { initializeCameraImpl } = require('./lib/camera');
const BirdFeederCamera = require('./lib/bird_feed_camera');
let cameraImpl = null;

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend', 'dist')));

// Initialize camera instance
let camera = null;

// Initialize both camera implementations
async function initializeCamera() {
    try {
        // Initialize camera implementation
        cameraImpl = await initializeCameraImpl();
        console.log('Camera implementation initialized successfully');

        // Initialize bird feeder camera
        camera = new BirdFeederCamera();
        await camera.initialize();
        console.log('Camera initialized successfully');
        return true;
    } catch (error) {
        console.error('Error initializing camera:', error);
        throw error;
    }
}

// Initialize camera before starting server
async function startApplication() {
    try {
        await initializeCamera();
        startServer();
    } catch (error) {
        console.error('Error starting application:', error);
        process.exit(1);
    }
}

startApplication();

// API Routes
app.get('/api/stream', async (req, res) => {
    try {
        if (!cameraImpl) {
            throw new Error('Camera not initialized');
        }
        await cameraImpl.startStream(req, res);
    } catch (error) {
        console.error('Error starting video stream:', error);
        res.status(500).send('Error starting video stream');
    }
});

app.get('/api/stats', async (req, res) => {
    try {
        const stats = await BirdFeederCamera.getStats();
        res.json(stats);
    } catch (error) {
        console.error('Error getting stats:', error);
        res.status(500).json({ error: 'Failed to get stats' });
    }
});

app.get('/api/clips', async (req, res) => {
    try {
        const clips = await BirdFeederCamera.getClips();
        res.json(clips);
    } catch (error) {
        console.error('Error getting clips:', error);
        res.status(500).json({ error: 'Failed to get clips' });
    }
});

app.get('/api/clips/:filename', async (req, res) => {
    try {
        const clipPath = path.join(__dirname, 'clips', req.params.filename);
        res.sendFile(clipPath);
    } catch (error) {
        console.error('Error getting clip:', error);
        res.status(404).json({ error: 'Clip not found' });
    }
});

// Clip cleanup endpoints
app.get('/api/config', (req, res) => {
    res.json({
        cleanupDays: parseInt(process.env.CLEANUP_DAYS) || 7,
        motionSensitivity: parseInt(process.env.MOTION_SENSITIVITY) || 20,
        captureDelay: parseInt(process.env.CAPTURE_DELAY) || 2,
        clipDuration: parseInt(process.env.CLIP_DURATION) || 60
    });
});

app.post('/api/config', (req, res) => {
    const { cleanupDays, motionSensitivity, captureDelay, clipDuration } = req.body;
    
    try {
        // Update environment variables
        process.env.CLEANUP_DAYS = cleanupDays;
        process.env.MOTION_SENSITIVITY = motionSensitivity;
        process.env.CAPTURE_DELAY = captureDelay;
        process.env.CLIP_DURATION = clipDuration;
        
        // Update camera configuration if it exists
        if (camera) {
            camera.motionDetector.threshold = motionSensitivity / 100;
            camera.CAPTURE_DELAY = captureDelay;
            camera.CLIP_DURATION = clipDuration;
        }
        
        res.json({
            message: 'Settings updated successfully',
            settings: {
                cleanupDays,
                motionSensitivity,
                captureDelay,
                clipDuration
            }
        });
    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

app.post('/api/cleanup', async (req, res) => {
    try {
        const { days } = req.body;
        await camera.cleanupOldClips(days);
        res.json({ message: `Clips older than ${days} days have been cleaned up` });
    } catch (error) {
        console.error('Error cleaning up clips:', error);
        res.status(500).json({ error: 'Failed to clean up clips' });
    }
});

// Start the server
const startServer = async () => {
    try {
        // Start the server
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error('Error starting server:', error);
        process.exit(1);
    }
};

