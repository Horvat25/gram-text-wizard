import { createRoot } from "react-dom/client";
import { registerSW } from 'virtual:pwa-register';
import App from "./App.tsx";
import "./index.css";

// Force clear old caches on load
if ('caches' in window) {
  caches.keys().then(names => {
    names.forEach(name => {
      // Clear all workbox precache and runtime caches
      if (name.includes('workbox') || name.includes('precache') || name.includes('runtime') || name.includes('google-fonts') || name.includes('gstatic')) {
        caches.delete(name);
        console.log(`[PWA] Cache cleared: ${name}`);
      }
    });
  });
}

// Register service worker with aggressive auto-update
const updateSW = registerSW({
  onNeedRefresh() {
    console.log('New content available, forcing update...');
    updateSW(true);
  },
  onOfflineReady() {
    console.log('App ready to work offline');
  },
  onRegistered(registration) {
    if (registration) {
      // Check for updates every 60 seconds
      setInterval(() => {
        registration.update();
      }, 60 * 1000);
    }
  },
  immediate: true,
});

// Load saved theme preference
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'dark') {
  document.documentElement.classList.add('dark');
} else if (savedTheme === 'light') {
  document.documentElement.classList.remove('dark');
} else {
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.classList.add('dark');
  }
}

createRoot(document.getElementById("root")!).render(<App />);