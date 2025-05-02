<template>
  <div class="settings">
    <h2>Camera Settings</h2>
    
    <div class="settings-grid">
      <div class="setting-item">
        <label>Motion Sensitivity</label>
        <input
          v-model.number="store.config.motionSensitivity"
          type="range"
          min="10"
          max="100"
          step="1"
        >
        <span>{{ store.config.motionSensitivity }}</span>
      </div>

      <div class="setting-item">
        <label>Capture Delay (seconds)</label>
        <input
          v-model.number="store.config.captureDelay"
          type="range"
          min="1"
          max="10"
          step="1"
        >
        <span>{{ store.config.captureDelay }}</span>
      </div>

      <div class="setting-item">
        <label>Clip Duration (seconds)</label>
        <input
          v-model.number="store.config.clipDuration"
          type="range"
          min="10"
          max="120"
          step="5"
        >
        <span>{{ store.config.clipDuration }}</span>
      </div>

      <div class="setting-item">
        <label>Days to Keep Clips</label>
        <input
          v-model.number="store.config.cleanupDays"
          type="range"
          min="1"
          max="30"
          step="1"
        >
        <span>{{ store.config.cleanupDays }}</span>
      </div>
    </div>

    <div class="action-buttons">
      <button @click="saveSettings">Save Settings</button>
      <button @click="cleanupClips" class="danger">Cleanup Old Clips</button>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useCameraStore } from '../store'

const store = useCameraStore()

onMounted(async () => {
  await store.fetchConfig()
})

const saveSettings = async () => {
  await store.updateConfig(store.config)
}

const cleanupClips = async () => {
  if (confirm(`Delete clips older than ${store.config.cleanupDays} days?`)) {
    await store.cleanupClips(store.config.cleanupDays)
  }
}
</script>

<style scoped>
.settings {
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
  margin: 20px 0;
}

.setting-item {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

label {
  font-weight: bold;
}

input[type="range"] {
  width: 100%;
}

span {
  text-align: center;
  font-weight: bold;
}

.action-buttons {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}

button {
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
}

button:not(.danger) {
  background: #4CAF50;
  color: white;
}

button.danger {
  background: #f44336;
  color: white;
}

button:hover {
  opacity: 0.9;
}
</style>
