<template>
  <div class="stats">
    <h2>Bird Visit Statistics</h2>
    
    <div v-if="!store.stats" class="loading">
      <p>Loading statistics...</p>
    </div>

    <div v-else class="stats-grid">
      <div v-for="stat in store.stats" :key="stat.species" class="stat-card">
        <h3>{{ stat.species }}</h3>
        <div class="stat-value">
          <span class="count">{{ stat.total }}</span>
          <span class="confidence">{{ stat.confidence }}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress" :style="{ width: `${(stat.total / totalVisits * 100).toFixed(1)}%` }"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useCameraStore } from '../store'

const store = useCameraStore()

onMounted(async () => {
  await store.fetchStats()
})

const totalVisits = computed(() => {
  if (!store.stats) return 0
  return store.stats.reduce((sum, stat) => sum + stat.total, 0)
})
</script>

<style scoped>
.stats {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
  margin-top: 20px;
}

.stat-card {
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.stat-value {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 10px 0;
  font-size: 24px;
  font-weight: bold;
}

.progress-bar {
  height: 10px;
  background: #f5f5f5;
  border-radius: 5px;
  margin-top: 10px;
}

.progress {
  height: 100%;
  background: #4CAF50;
  border-radius: 5px;
  transition: width 0.3s ease;
}

.loading {
  text-align: center;
  padding: 20px;
  color: #666;
}
</style>
