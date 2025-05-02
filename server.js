const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const { MotionDetector, BirdFeederCamera } = require('./lib/camera');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend', 'dist')));

// Initialize camera instance
let camera = null;

// API Routes
app.get('/api/stream', (req, res) => {
    res.setHeader('Content-Type', 'multipart/x-mixed-replace; boundary=frame');
    
    // Start video stream
    const stream = raspivid({
        output: res,
        width: 1280,
        height: 720,
        format: 'mjpeg',
        timeout: 0 // Continuous stream
    });

    // Handle client disconnect
    req.on('close', () => {
        stream.kill();
    });
});

app.get('/api/stats', async (req, res) => {

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
    
    if (camera) {
        camera.motionDetector.sensitivity = motionSensitivity;
        // Other settings can be updated similarly
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
        // Initialize the camera
        camera = new BirdFeederCamera();
        await camera.initialize();

        // Start the server
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error('Error starting server:', error);
        process.exit(1);
    }
};

startServer();
