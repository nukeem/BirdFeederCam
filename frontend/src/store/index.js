import { defineStore } from 'pinia'
import axios from 'axios'
import { API_BASE_URL } from '../config/api'

export const useCameraStore = defineStore('camera', {
  state: () => ({
    stats: null,
    clips: [],
    config: {
      cleanupDays: 7,
      motionSensitivity: 20,
      captureDelay: 2,
      clipDuration: 60
    },
    isRecording: false,
    lastMotion: null
  }),

  actions: {
    async fetchStats() {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/stats`);
        this.stats = response.data;
      } catch (error) {
        console.error('Error fetching stats:', error);
      }
    },

    async fetchClips() {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/clips`);
        this.clips = response.data;
      } catch (error) {
        console.error('Error fetching clips:', error);
      }
    },

    async fetchConfig() {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/config`);
        this.config = response.data;
      } catch (error) {
        console.error('Error fetching config:', error);
      }
    },

    async updateConfig(config) {
      try {
        const response = await axios.post(`${API_BASE_URL}/api/config`, config);
        this.config = response.data;
      } catch (error) {
        console.error('Error updating config:', error);
      }
    },

    async cleanupClips(days) {
      try {
        await axios.post(`${API_BASE_URL}/api/cleanup`, { days });
        this.fetchClips();
      } catch (error) {
        console.error('Error cleaning up clips:', error);
      }
    }
  }
})
