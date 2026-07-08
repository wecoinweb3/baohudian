import { useState } from 'react';
import { LayoutDashboard, Settings } from 'lucide-react';
import Workbench from './pages/Workbench';
import Admin from './pages/Admin';

type TabType = 'workbench' | 'admin';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('workbench');

  const tabs = [
    { id: 'workbench' as TabType, label: '工作台', icon: LayoutDashboard },
    // 管理端入口暂时隐藏，后续可替换为其他功能页签。
    // { id: 'admin' as TabType, label: '管理端', icon: Settings },
  ];

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      <header className="bg-white border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-800 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-lg">P</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-800 sm:text-xl">保护垫在线设计器</h1>
            </div>
          </div>

          <div className="flex w-full items-center overflow-x-auto rounded-lg bg-gray-100 p-1 sm:w-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all ${
                    activeTab === tab.id
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto lg:overflow-hidden">
        {activeTab === 'workbench' && <Workbench />}
        {activeTab === 'admin' && <Admin />}
      </main>
    </div>
  );
}