import { useEffect, useState } from 'react';
import { ChevronsLeft, ChevronsRight, LogOut, Plus, Settings } from 'lucide-react';
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import ChatSetupPage from './pages/ChatSetupPage';
import Admin from './pages/Admin';
import LoginPage from './pages/LoginPage';
import { api } from './utils/api';
import type { AuthUser } from './types';

function DesignerLayout({ children, currentUser, onLogout }: { children: React.ReactNode; currentUser: AuthUser; onLogout: () => void }) {
  return (
    <div className="h-screen flex flex-col bg-gray-100">
      <header className="bg-white border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link to="/" className="text-lg font-bold text-gray-800 transition hover:text-blue-600 sm:text-xl">保护垫在线设计器</Link>

          <div className="flex w-full items-center justify-end gap-3 sm:w-auto">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-semibold text-slate-800">{currentUser.displayName}</div>
              <div className="text-xs text-slate-500">{currentUser.role === 'admin' ? '管理员' : '普通用户'}</div>
            </div>
            <button type="button" onClick={onLogout} className="inline-flex items-center gap-2 border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900">
              <LogOut className="h-4 w-4" />退出登录
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto lg:overflow-hidden">{children}</main>
    </div>
  );
}

function ChatEntryLayout({ currentUser, onLogout }: { currentUser: AuthUser; onLogout: () => void }) {
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
            {currentUser.role === 'admin' && (
              <NavLink to="/admin" className="inline-flex h-11 items-center justify-center gap-2 border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900">
                <Settings className="h-4 w-4" />管理端
              </NavLink>
            )}
            <button
              type="button"
              onClick={() => setNewChatSignal((value) => value + 1)}
              className="inline-flex h-11 items-center justify-center gap-2 border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
            >
              <Plus className="h-4 w-4" />
              新建
            </button>
            <button type="button" onClick={onLogout} className="inline-flex h-11 items-center justify-center gap-2 border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900">
              <LogOut className="h-4 w-4" />退出
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

function ProtectedRoute({ currentUser, allowRoles, children }: { currentUser: AuthUser | null; allowRoles: Array<'admin' | 'user'>; children: JSX.Element }) {
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (!allowRoles.includes(currentUser.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => {
    const savedUser = localStorage.getItem('auth_user');
    return savedUser ? JSON.parse(savedUser) as AuthUser : null;
  });

  const handleLogin = (user: AuthUser) => {
    localStorage.setItem('auth_user', JSON.stringify(user));
    setCurrentUser(user);
  };

  const handleLogout = async () => {
    await api.auth.logout();
    localStorage.removeItem('auth_user');
    setCurrentUser(null);
  };

  return (
    <Routes>
      <Route path="/login" element={currentUser ? <Navigate to="/" replace /> : <LoginPage onLogin={handleLogin} />} />
      <Route path="/" element={<ProtectedRoute currentUser={currentUser} allowRoles={['admin', 'user']}><ChatEntryLayout currentUser={currentUser as AuthUser} onLogout={handleLogout} /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute currentUser={currentUser} allowRoles={['admin']}><DesignerLayout currentUser={currentUser as AuthUser} onLogout={handleLogout}><Admin /></DesignerLayout></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}