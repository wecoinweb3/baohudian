import { useEffect, useState } from 'react';
import { ChevronsLeft, ChevronsRight, Plus } from 'lucide-react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import ChatSetupPage from './pages/ChatSetupPage';
import V2Workbench from './pages/V2Workbench';
import Admin from './pages/Admin';

function DesignerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen flex flex-col bg-gray-100">
      <header className="bg-white border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link to="/" className="text-lg font-bold text-gray-800 transition hover:text-blue-600 sm:text-xl">保护垫设计智能体</Link>
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
        <div className="flex w-full items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
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
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setNewChatSignal((value) => value + 1)}
              className="inline-flex h-11 items-center justify-center gap-2 border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
            >
              <Plus className="h-4 w-4" />
              新建
            </button>
          </div>
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
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/" element={<ChatEntryLayout />} />
      <Route path="/v2" element={<DesignerLayout><V2Workbench /></DesignerLayout>} />
      <Route path="/admin" element={<DesignerLayout><Admin /></DesignerLayout>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}