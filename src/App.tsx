import { useEffect, useState } from 'react';
import { ChevronsLeft, ChevronsRight, LayoutDashboard, Plus, Settings } from 'lucide-react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import ChatSetupPage from './pages/ChatSetupPage';
import Workbench from './pages/Workbench';
import Admin from './pages/Admin';

type DesignerTab = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
};

const designerTabs: DesignerTab[] = [
  { to: '/workbench', label: '工作台', icon: LayoutDashboard },
  { to: '/admin', label: '管理端', icon: Settings },
];

function DesignerLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();

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
            {designerTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = location.pathname.startsWith(tab.to);
              return (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all ${
                    isActive ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </NavLink>
              );
            })}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto lg:overflow-hidden">{children}</main>
    </div>
  );
}

function ChatEntryLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [newChatSignal, setNewChatSignal] = useState(0);

  useEffect(() => {
    const updateViewportHeight = () => {
      const height = window.visualViewport?.height || window.innerHeight;
      document.documentElement.style.setProperty('--app-viewport-height', `${height}px`);
    };

    updateViewportHeight();
    window.visualViewport?.addEventListener('resize', updateViewportHeight);
    window.visualViewport?.addEventListener('scroll', updateViewportHeight);
    window.addEventListener('resize', updateViewportHeight);

    return () => {
      window.visualViewport?.removeEventListener('resize', updateViewportHeight);
      window.visualViewport?.removeEventListener('scroll', updateViewportHeight);
      window.removeEventListener('resize', updateViewportHeight);
    };
  }, []);

  return (
    <div className="flex h-[var(--app-viewport-height,100dvh)] flex-col overflow-hidden bg-slate-50">
      <header className="shrink-0 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarCollapsed((value) => !value)}
              className="flex h-11 w-11 items-center justify-center border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
              title={sidebarCollapsed ? '展开历史对话' : '收起历史对话'}
              aria-label={sidebarCollapsed ? '展开历史对话' : '收起历史对话'}
            >
              {sidebarCollapsed ? <ChevronsRight className="h-5 w-5" /> : <ChevronsLeft className="h-5 w-5" />}
            </button>
            <div>
              <h1 className="text-lg font-semibold text-slate-900 sm:text-xl">保护垫智能设计助手</h1>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setNewChatSignal((value) => value + 1)}
            className="inline-flex h-11 items-center justify-center gap-2 border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
          >
            <Plus className="h-4 w-4" />
            新建
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden">
        <ChatSetupPage
          sidebarCollapsed={sidebarCollapsed}
          setSidebarCollapsed={setSidebarCollapsed}
          newChatSignal={newChatSignal}
        />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ChatEntryLayout />} />
      <Route path="/workbench" element={<DesignerLayout><Workbench /></DesignerLayout>} />
      <Route path="/admin" element={<DesignerLayout><Admin /></DesignerLayout>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}