import { useState } from 'react';
import { LogIn, ShieldCheck, UserCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import type { AuthUser } from '../types';

type LoginPageProps = {
  onLogin: (user: AuthUser) => void;
};

export default function LoginPage({ onLogin }: LoginPageProps) {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!username.trim() || !password.trim()) {
      setMessage('请输入账号和密码后再登录。');
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const result = await api.auth.login({ username, password });
      if (!result.success || !result.user) {
        setMessage(result.error || '登录失败，请稍后重试。');
        return;
      }

      onLogin(result.user);
      navigate('/', { replace: true });
    } catch (error) {
      setMessage(`登录失败：${(error as Error).message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-md border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center bg-blue-600 text-white">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">登录系统</h1>
            <p className="mt-1 text-sm text-slate-500">管理员可进入首页与管理页，普通用户仅可使用首页。</p>
          </div>
        </div>

        <div className="space-y-4">
          <label className="block space-y-2">
            <span className="text-sm font-semibold text-slate-700">账号</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="请输入账号" className="w-full border border-slate-200 px-3 py-3 text-sm outline-none transition focus:border-blue-500" />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-semibold text-slate-700">密码</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="请输入密码" className="w-full border border-slate-200 px-3 py-3 text-sm outline-none transition focus:border-blue-500" />
          </label>

          <button type="button" onClick={handleSubmit} disabled={isSubmitting} className="inline-flex w-full items-center justify-center gap-2 bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
            <LogIn className="h-4 w-4" />
            {isSubmitting ? '登录中...' : '登录'}
          </button>

          {message && <div className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{message}</div>}
        </div>

        <div className="mt-6 space-y-3 border-t border-slate-200 pt-5 text-sm text-slate-600">
          <div className="flex items-center gap-2 font-semibold text-slate-800"><UserCircle2 className="h-4 w-4" /> 预置测试账号</div>
          <div>管理员：<span className="font-mono">admin / Admin@123</span></div>
          <div>普通用户：<span className="font-mono">user / User@123</span></div>
        </div>
      </div>
    </div>
  );
}