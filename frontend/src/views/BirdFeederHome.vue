<template>
  <div class="home">
    <div class="camera-container">
      <h2>Live Feed</h2>
      <video
        ref="videoPlayer"
        autoplay
        playsinline
        class="live-stream"
      ></video>
      <div class="status-indicator">
        <p v-if="store.isRecording">Recording in progress...</p>
        <p v-else>Motion detection active</p>
      </div>
    </div>

    <div class="stats-container">
      <h3>Recent Activity</h3>
      <div class="clips-grid">
        <div
          v-for="clip in store.clips"
          :key="clip.filename"
          class="clip-card"
        >
          <video
            :src="`/api/clips/${clip.filename}`"
            controls
            class="clip-video"
          ></video>
          <p>{{ clip.timestamp }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { useCameraStore } from '../store'
import { API_BASE_URL } from '../config/api'

const store = useCameraStore()
const videoPlayer = ref(null)

onMounted(async () => {
  await store.fetchClips()
  
  // Set up interval to refresh clips
  const interval = setInterval(() => {
    store.fetchClips()
  }, 60000) // Refresh every minute

  // Start video stream
  if (videoPlayer.value) {
    videoPlayer.value.src = `${API_BASE_URL}/api/stream`;
  }

  onUnmounted(() => {
    clearInterval(interval)
    if (videoPlayer.value) {
      videoPlayer.value.src = '';
    }
  })
})
</script>

<style scoped>
.camera-container {
  position: relative;
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.live-stream {
  width: 100%;
  height: 720px;
  object-fit: cover;
  background: #000;
}

.status-indicator {
  position: absolute;
  bottom: 20px;
  left: 20px;
  right: 20px;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  padding: 10px;
  border-radius: 4px;
  text-align: center;
  font-weight: bold;
}

.home {
  padding: 20px;
}

.camera-container {
  background: #f5f5f5;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 30px;
}

.video-placeholder {
  background: #e0e0e0;
  border-radius: 4px;
  padding: 40px;
  text-align: center;
  height: 400px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 10px;
}

.stats-container {
  background: #f5f5f5;
  border-radius: 8px;
  padding: 20px;
}

.clips-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
  margin-top: 20px;
}

.clip-card {
  background: white;
  border-radius: 4px;
  padding: 10px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.clip-video {
  width: 100%;
  height: 200px;
  object-fit: cover;
  border-radius: 4px;
}
</style>
