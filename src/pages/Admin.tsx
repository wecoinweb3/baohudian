import React, { useState, useEffect } from 'react';
import { Bot, Package } from 'lucide-react';
import AISettingsManager from '../components/AISettingsManager';
import { api } from '../utils/api';
import type { AISettings } from '../types';

type TabType = 'ai-settings';

const Admin: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('ai-settings');
  const [settings, setSettings] = useState<AISettings | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await api.settings.get();
      setSettings(data.settings);
    } catch (error) {
      console.error('Failed to load AI settings:', error);
    }
  };

  const tabs = [
    { id: 'ai-settings' as TabType, label: 'AI 配置', icon: Bot },
  ];

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto">
          <div className="bg-white rounded-xl border border-gray-200 p-6 overflow-hidden">
            {activeTab === 'ai-settings' && (
              <AISettingsManager settings={settings} onSettingsChange={loadSettings} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Admin;