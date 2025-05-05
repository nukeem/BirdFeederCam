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
module.exports = MotionDetector;