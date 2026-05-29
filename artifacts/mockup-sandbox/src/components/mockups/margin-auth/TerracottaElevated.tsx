import React, { useState } from 'react';
import { Eye, EyeOff, Loader2, Apple } from 'lucide-react';

export function TerracottaElevated() {
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Focus states for label accents
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // Validation errors
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirmPassword?: string }>({});

  const validate = () => {
    const newErrors: { email?: string; password?: string; confirmPassword?: string } = {};
    if (!email.includes('@')) {
      newErrors.email = 'Please enter a valid email address.';
    }
    if (password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters.';
    }
    if (!isLogin && password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match.';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
    }, 1500);
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4 relative"
      style={{ background: 'radial-gradient(circle at top center, #F2EAD9 0%, #F9F6F0 100%)', color: '#4A3B32' }}
    >
      {/* Noise Texture */}
      <div 
        className="absolute inset-0 opacity-[0.04] pointer-events-none" 
        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }}
      />

      <div 
        className="w-full max-w-md p-8 sm:p-10 rounded-2xl relative z-10"
        style={{ 
          backgroundColor: '#FFFBF5', 
          border: '1px solid #EBE3D5',
          boxShadow: '0 20px 40px -10px rgba(194, 113, 79, 0.12), 0 4px 6px -1px rgba(0,0,0,0.06)'
        }}
      >
        <div className="pt-8 pb-10 text-center">
          <div className="flex justify-center items-center gap-3 mb-6 text-[#C2714F]">
            <div className="h-[1px] w-12 bg-[#C2714F]/30"></div>
            <span className="text-[10px]">✦</span>
            <div className="h-[1px] w-12 bg-[#C2714F]/30"></div>
          </div>
          <h1 className="text-[2.75rem] font-['Playfair_Display'] font-bold text-[#3D2C23] tracking-tight mb-3">
            Margin
          </h1>
          <p className="text-[15px] font-medium" style={{ color: '#A67C68' }}>
            Every page you've ever filled, gathered.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {!isLogin && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium flex items-center gap-1.5 transition-all" style={{ color: '#8A7366' }}>
                <span className={`w-1.5 h-1.5 rounded-full transition-opacity ${focusedField === 'name' ? 'opacity-100' : 'opacity-0'}`} style={{ backgroundColor: '#C2714F' }}></span>
                <span className={focusedField === 'name' ? '' : '-ml-3 transition-all'}>Name (Optional)</span>
              </label>
              <input
                type="text"
                placeholder="Jane Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 rounded-lg outline-none transition-all placeholder:text-[#C4B5A8]"
                style={{ 
                  backgroundColor: '#FAF7F2', 
                  border: '1.5px solid #E3D5CA',
                  color: '#3D2C23'
                }}
                onFocus={(e) => { e.target.style.borderColor = '#C2714F'; setFocusedField('name'); }}
                onBlur={(e) => { e.target.style.borderColor = '#E3D5CA'; setFocusedField(null); }}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium flex items-center gap-1.5 transition-all" style={{ color: '#8A7366' }}>
              <span className={`w-1.5 h-1.5 rounded-full transition-opacity ${focusedField === 'email' ? 'opacity-100' : 'opacity-0'}`} style={{ backgroundColor: '#C2714F' }}></span>
              <span className={focusedField === 'email' ? '' : '-ml-3 transition-all'}>Email</span>
            </label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email) setErrors({ ...errors, email: undefined });
              }}
              className="w-full px-4 py-3 rounded-lg outline-none transition-all placeholder:text-[#C4B5A8]"
              style={{ 
                backgroundColor: '#FAF7F2', 
                border: `1.5px solid ${errors.email ? '#D9534F' : '#E3D5CA'}`,
                color: '#3D2C23'
              }}
              onFocus={(e) => { if (!errors.email) e.target.style.borderColor = '#C2714F'; setFocusedField('email'); }}
              onBlur={(e) => { if (!errors.email) e.target.style.borderColor = '#E3D5CA'; setFocusedField(null); }}
            />
            {errors.email && <p className="text-xs text-[#D9534F] mt-1">{errors.email}</p>}
          </div>

          <div className="space-y-1.5 relative">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium flex items-center gap-1.5 transition-all" style={{ color: '#8A7366' }}>
                <span className={`w-1.5 h-1.5 rounded-full transition-opacity ${focusedField === 'password' ? 'opacity-100' : 'opacity-0'}`} style={{ backgroundColor: '#C2714F' }}></span>
                <span className={focusedField === 'password' ? '' : '-ml-3 transition-all'}>Password</span>
              </label>
              {isLogin && (
                <button type="button" className="text-sm font-medium hover:underline transition-colors" style={{ color: '#C2714F' }}>
                  Forgot password?
                </button>
              )}
            </div>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errors.password) setErrors({ ...errors, password: undefined });
                }}
                className="w-full px-4 py-3 rounded-lg outline-none transition-all pr-12 placeholder:text-[#C4B5A8]"
                style={{ 
                  backgroundColor: '#FAF7F2', 
                  border: `1.5px solid ${errors.password ? '#D9534F' : '#E3D5CA'}`,
                  color: '#3D2C23'
                }}
                onFocus={(e) => { if (!errors.password) e.target.style.borderColor = '#C2714F'; setFocusedField('password'); }}
                onBlur={(e) => { if (!errors.password) e.target.style.borderColor = '#E3D5CA'; setFocusedField(null); }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8A7366] hover:text-[#C2714F] transition-colors"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {!isLogin && !errors.password && (
              <p className="text-xs" style={{ color: '#A67C68' }}>Must be at least 8 characters</p>
            )}
            {errors.password && <p className="text-xs text-[#D9534F]">{errors.password}</p>}
          </div>

          {!isLogin && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium flex items-center gap-1.5 transition-all" style={{ color: '#8A7366' }}>
                <span className={`w-1.5 h-1.5 rounded-full transition-opacity ${focusedField === 'confirmPassword' ? 'opacity-100' : 'opacity-0'}`} style={{ backgroundColor: '#C2714F' }}></span>
                <span className={focusedField === 'confirmPassword' ? '' : '-ml-3 transition-all'}>Confirm password</span>
              </label>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (errors.confirmPassword) setErrors({ ...errors, confirmPassword: undefined });
                }}
                className="w-full px-4 py-3 rounded-lg outline-none transition-all placeholder:text-[#C4B5A8]"
                style={{ 
                  backgroundColor: '#FAF7F2', 
                  border: `1.5px solid ${errors.confirmPassword ? '#D9534F' : '#E3D5CA'}`,
                  color: '#3D2C23'
                }}
                onFocus={(e) => { if (!errors.confirmPassword) e.target.style.borderColor = '#C2714F'; setFocusedField('confirmPassword'); }}
                onBlur={(e) => { if (!errors.confirmPassword) e.target.style.borderColor = '#E3D5CA'; setFocusedField(null); }}
              />
              {errors.confirmPassword && <p className="text-xs text-[#D9534F] mt-1">{errors.confirmPassword}</p>}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 rounded-xl font-semibold text-white flex justify-center items-center transition-all mt-6 shadow-sm disabled:opacity-70 active:scale-[0.98]"
            style={{ backgroundColor: '#C2714F' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#A95E40'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#C2714F'}
          >
            {isLoading ? <Loader2 size={20} className="animate-spin" /> : (isLogin ? 'Log in' : 'Create account')}
          </button>
        </form>

        <div className="flex items-center gap-4 my-8">
          <div className="h-[1px] flex-1" style={{ backgroundColor: '#E3D5CA' }}></div>
          <span className="text-sm font-serif italic text-[#A67C68]">or</span>
          <div className="h-[1px] flex-1" style={{ backgroundColor: '#E3D5CA' }}></div>
        </div>

        <div className="space-y-3">
          <button className="w-full py-3.5 px-4 rounded-xl font-medium flex items-center justify-center gap-3 transition-colors active:scale-[0.98]"
            style={{ backgroundColor: '#FAF7F2', color: '#3D2C23', border: '1px solid #E3D5CA' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F0EBE1'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#FAF7F2'}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>
          <button className="w-full py-3.5 px-4 rounded-xl font-medium flex items-center justify-center gap-3 transition-colors active:scale-[0.98]"
            style={{ backgroundColor: '#FAF7F2', color: '#3D2C23', border: '1px solid #E3D5CA' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F0EBE1'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#FAF7F2'}
          >
            <Apple size={20} className="fill-current" />
            Continue with Apple
          </button>
        </div>

        <div className="mt-10 text-center flex items-center justify-center gap-2 whitespace-nowrap">
          <span className="text-sm" style={{ color: '#8A7366' }}>
            {isLogin ? "Don't have an account?" : "Already have an account?"}
          </span>
          <span className="text-[#8A7366] text-xs">·</span>
          <button 
            onClick={() => {
              setIsLogin(!isLogin);
              setErrors({});
            }}
            className="text-sm font-semibold hover:underline transition-colors"
            style={{ color: '#C2714F' }}
          >
            {isLogin ? 'Sign up' : 'Log in'}
          </button>
        </div>
      </div>
    </div>
  );
}
