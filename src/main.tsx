import { createRoot } from "react-dom/client";
import { registerSW } from 'virtual:pwa-register';
import App from "./App.tsx";
import "./index.css";

// Register service worker with auto-update
const updateSW = registerSW({
  onNeedRefresh() {
    // New content available, will auto-update
    console.log('New content available, updating...');
  },
  onOfflineReady() {
    console.log('App ready to work offline');
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
  // Check system preference if no saved preference
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.classList.add('dark');
  }
}

createRoot(document.getElementById("root")!).render(<App />);