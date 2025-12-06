import { useState, useEffect, useCallback } from 'react';
import { loadSettings, saveSettings, UserSettings } from '@/lib/local-storage';

// Custom event for settings updates
const SETTINGS_UPDATED_EVENT = 'brand-settings-updated';

export function useBrandSettings() {
  const [settings, setSettings] = useState<UserSettings>(() => loadSettings());
  const [isLoading, setIsLoading] = useState(true);

  const refreshSettings = useCallback(() => {
    const newSettings = loadSettings();
    setSettings(newSettings);
  }, []);

  useEffect(() => {
    // Load initial settings
    refreshSettings();
    setIsLoading(false);

    // Listen for settings updates from other components
    const handleSettingsUpdate = () => {
      refreshSettings();
    };

    window.addEventListener(SETTINGS_UPDATED_EVENT, handleSettingsUpdate);
    window.addEventListener('storage', handleSettingsUpdate);

    return () => {
      window.removeEventListener(SETTINGS_UPDATED_EVENT, handleSettingsUpdate);
      window.removeEventListener('storage', handleSettingsUpdate);
    };
  }, [refreshSettings]);

  const updateSettings = useCallback((newSettings: Partial<UserSettings>) => {
    saveSettings(newSettings);
    setSettings(prev => ({ ...prev, ...newSettings }));
    
    // Dispatch custom event to notify other components
    window.dispatchEvent(new CustomEvent(SETTINGS_UPDATED_EVENT));
  }, []);

  return {
    settings,
    isLoading,
    updateSettings,
    refreshSettings,
  };
}
