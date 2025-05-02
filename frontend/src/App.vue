<template>
  <div id="app">
    <nav class="navbar">
      <router-link to="/" class="nav-link">Home</router-link>
      <router-link to="/stats" class="nav-link">Statistics</router-link>
      <router-link to="/settings" class="nav-link">Settings</router-link>
    </nav>
    <router-view></router-view>
  </div>
</template>

<script>
import { createPinia } from 'pinia'
import { useCameraStore } from './store'

export default {
  name: 'App',
  setup() {
    const pinia = createPinia()
    const store = useCameraStore(pinia)
    
    return {
      store
    }
  }
}
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #2c3e50;
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px;
}

.navbar {
  display: flex;
  gap: 20px;
  padding: 10px 0;
  border-bottom: 1px solid #eee;
  margin-bottom: 30px;
}

.nav-link {
  text-decoration: none;
  color: #2c3e50;
  font-weight: bold;
  padding: 5px 10px;
  border-radius: 4px;
  transition: all 0.3s ease;
}

.nav-link:hover {
  background: #f5f5f5;
}

.nav-link.router-link-active {
  color: #4CAF50;
  background: #f5f5f5;
}
</style>
