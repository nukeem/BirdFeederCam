import { createRouter, createWebHistory } from 'vue-router'
import BirdFeederHome from '../views/BirdFeederHome.vue'
import BirdFeederSettings from '../views/BirdFeederSettings.vue'
import BirdFeederStats from '../views/BirdFeederStats.vue'

const routes = [
  {
    path: '/',
    name: 'BirdFeederHome',
    component: BirdFeederHome
  },
  {
    path: '/settings',
    name: 'BirdFeederSettings',
    component: BirdFeederSettings
  },
  {
    path: '/stats',
    name: 'BirdFeederStats',
    component: BirdFeederStats
  }
]

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes
})

export default router
