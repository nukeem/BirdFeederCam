# Bird Feeder Camera

A Raspberry Pi-based bird feeder camera system that captures video clips when birds are detected and identifies the species using AI.

## Features

- Motion detection with configurable sensitivity
- Automatic video recording when motion is detected
- Bird species identification using Roboflow AI
- Telegram notifications for bird detections
- Web interface for viewing clips and statistics
- Automatic cleanup of old clips
- Configurable settings for all parameters

## System Requirements

- Raspberry Pi 4 or newer
- Raspberry Pi Camera Module
- Node.js 16 or newer
- Python 3.9 or newer
- OpenCV
- SQLite

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/bird-feeder-camera.git
cd bird-feeder-camera
```

2. Install Node.js dependencies:
```bash
npm install
```

3. Install Python dependencies:
```bash
pip install -r requirements.txt
```

4. Copy the example environment file and configure your settings:
```bash
cp .env.example .env
```

Edit the `.env` file with your configuration:
- Roboflow API credentials
- Telegram bot token and chat ID
- Camera settings
- Cleanup settings

## Running the Application

1. Start the backend server:
```bash
npm run dev
```

2. In a new terminal, start the frontend development server:
```bash
cd frontend
npm run serve
```

The application will be available at `http://localhost:8080`.

## Setting Up Auto Start on Raspberry Pi

1. Create a systemd service file:
```bash
sudo nano /etc/systemd/system/bird-feeder-camera.service
```

Add the following content:
```ini
[Unit]
Description=Bird Feeder Camera
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/pi/bird-feeder-camera
ExecStart=/usr/bin/node /home/pi/bird-feeder-camera/server.js
Restart=always
RestartSec=10
User=pi

[Install]
WantedBy=multi-user.target
```

2. Reload systemd and enable the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable bird-feeder-camera
```

3. Start the service:
```bash
sudo systemctl start bird-feeder-camera
```

To check the service status:
```bash
sudo systemctl status bird-feeder-camera
```

## Configuration

All configuration options are stored in the `.env` file. The available options are:

### Camera Settings
- `MOTION_SENSITIVITY`: Sensitivity of motion detection (10-100)
- `CAPTURE_DELAY`: Delay after motion detection before capturing (1-10 seconds)
- `CLIP_DURATION`: Duration of video clips (10-120 seconds)
- `CLEANUP_DAYS`: Number of days to keep clips before cleanup (1-30 days)

### AI Settings
- `ROBOFLOW_API_KEY`: Your Roboflow API key
- `ROBOFLOW_WORKSPACE`: Your Roboflow workspace name
- `ROBOFLOW_PROJECT`: Your Roboflow project name
- `ROBOFLOW_VERSION`: Version of your Roboflow model

### Notification Settings
- `TELEGRAM_ENABLED`: Enable/disable Telegram notifications (true/false)
- `TELEGRAM_BOT_TOKEN`: Your Telegram bot token
- `TELEGRAM_CHAT_ID`: Your Telegram chat ID

## Web Interface

The web interface provides:
- Live feed view (placeholder - actual feed requires camera module)
- Recent clips viewer
- Bird visit statistics
- Configuration settings
- Clip cleanup management

## Troubleshooting

1. If the camera isn't working:
   - Check that the camera module is properly connected
   - Verify that the camera is enabled in raspi-config
   - Check the camera permissions

2. If motion detection isn't working:
   - Adjust the MOTION_SENSITIVITY in .env
   - Check the camera angle and lighting
   - Verify that the camera is properly focused

3. If notifications aren't working:
   - Verify your Telegram bot token
   - Check your Telegram chat ID
   - Ensure the Telegram bot has the correct permissions

## License

MIT License - feel free to use this project for personal or commercial purposes.
