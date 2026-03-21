import { createRouter, createWebHistory } from 'vue-router'
import RegexTester from '../components/RegexTester.vue'

const routes = [
  { path: '/',                              component: RegexTester },
  { path: '/:pattern',                      component: RegexTester },
  { path: '/:pattern/:text',                component: RegexTester },
  { path: '/:pattern/:text/:options',       component: RegexTester },
]

export default createRouter({
  history: createWebHistory('/'),
  routes
})
