import React, { useState } from "react";
import { Eye, EyeOff, Loader2, ArrowRight } from "lucide-react";

export function DarkEditorial() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  // Validation state
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!email) {
      newErrors.email = "Email is required";
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = "Please enter a valid email address";
    }
    
    if (!password) {
      newErrors.password = "Password is required";
    } else if (password.length < 8) {
      newErrors.password = "Password must be at least 8 characters";
    }
    
    if (mode === "signup" && password !== confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      setIsLoading(true);
      // Simulate API call
      setTimeout(() => {
        setIsLoading(false);
      }, 1500);
    }
  };

  const toggleMode = () => {
    setMode(mode === "login" ? "signup" : "login");
    setErrors({});
    setIsLoading(false);
  };

  const GoogleIcon = () => (
    <svg className="w-5 h-5" viewBox="0 0 24 24">
      <path
        fill="currentColor"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="currentColor"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="currentColor"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="currentColor"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );

  const AppleIcon = () => (
    <svg className="w-5 h-5" viewBox="0 0 24 24">
      <path
        fill="currentColor"
        d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.19 2.31-.88 3.5-.8 1.5.09 2.58.55 3.34 1.35-2.91 1.76-2.45 5.56.36 6.78-1.12 2.11-2.4 4.09-3.28 4.84zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
      />
    </svg>
  );

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4 selection:bg-[#c9a96e] selection:text-[#1a1510] font-sans"
      style={{ backgroundColor: "#1a1510", color: "#f4f0e6" }}
    >
      <div className="w-full max-w-md">
        
        {/* Header Section */}
        <div className="text-center mb-10 space-y-3">
          <h1 
            className="text-5xl font-['Playfair_Display'] tracking-wider italic"
            style={{ 
              color: "#f4f0e6",
              textShadow: "0 0 20px rgba(244, 240, 230, 0.15)" 
            }}
          >
            Margin
          </h1>
          <p className="text-[#a09a8f] text-sm tracking-wide font-light">
            Turn handwritten pages into a searchable archive.
          </p>
        </div>

        {/* Card */}
        <div 
          className="rounded-2xl p-8 sm:p-10 shadow-2xl relative overflow-hidden"
          style={{ 
            backgroundColor: "#201a14",
            border: "1px solid rgba(201, 169, 110, 0.15)"
          }}
        >
          {/* Subtle noise texture overlay */}
          <div 
            className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}
          />

          <form onSubmit={handleSubmit} className="space-y-5 relative z-10">
            {mode === "signup" && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-[#c9a96e] uppercase tracking-wider">
                  Name <span className="text-[#8c8477]">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#16120e] border border-[#302820] rounded-lg px-4 py-3 text-[#f4f0e6] placeholder-[#5a5247] focus:outline-none focus:border-[#c9a96e] transition-colors"
                  placeholder="How should we address you?"
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-medium text-[#c9a96e] uppercase tracking-wider">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email) setErrors({ ...errors, email: "" });
                }}
                className={`w-full bg-[#16120e] border ${errors.email ? 'border-red-900 focus:border-red-500' : 'border-[#302820] focus:border-[#c9a96e]'} rounded-lg px-4 py-3 text-[#f4f0e6] placeholder-[#5a5247] focus:outline-none transition-colors`}
                placeholder="reader@example.com"
              />
              {errors.email && (
                <p className="text-red-400 text-xs mt-1 font-light">{errors.email}</p>
              )}
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-xs font-medium text-[#c9a96e] uppercase tracking-wider">
                  Password
                </label>
                {mode === "login" && (
                  <button type="button" className="text-xs text-[#8c8477] hover:text-[#c9a96e] transition-colors">
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors({ ...errors, password: "" });
                  }}
                  className={`w-full bg-[#16120e] border ${errors.password ? 'border-red-900 focus:border-red-500' : 'border-[#302820] focus:border-[#c9a96e]'} rounded-lg px-4 py-3 pr-10 text-[#f4f0e6] placeholder-[#5a5247] focus:outline-none transition-colors`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5a5247] hover:text-[#c9a96e] transition-colors p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password ? (
                <p className="text-red-400 text-xs mt-1 font-light">{errors.password}</p>
              ) : (
                mode === "signup" && <p className="text-[#5a5247] text-xs mt-1 font-light">At least 8 characters.</p>
              )}
            </div>

            {mode === "signup" && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-[#c9a96e] uppercase tracking-wider">
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (errors.confirmPassword) setErrors({ ...errors, confirmPassword: "" });
                    }}
                    className={`w-full bg-[#16120e] border ${errors.confirmPassword ? 'border-red-900 focus:border-red-500' : 'border-[#302820] focus:border-[#c9a96e]'} rounded-lg px-4 py-3 text-[#f4f0e6] placeholder-[#5a5247] focus:outline-none transition-colors`}
                    placeholder="••••••••"
                  />
                </div>
                {errors.confirmPassword && (
                  <p className="text-red-400 text-xs mt-1 font-light">{errors.confirmPassword}</p>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-6 flex items-center justify-center py-3.5 px-4 rounded-lg font-medium transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed group relative overflow-hidden"
              style={{
                backgroundColor: "#c9a96e",
                color: "#1a1510",
                boxShadow: "0 4px 14px rgba(201, 169, 110, 0.2)"
              }}
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <span className="font-['Playfair_Display'] text-lg font-bold tracking-wide italic">
                    {mode === "login" ? "Log In" : "Create Account"}
                  </span>
                  <ArrowRight className="w-4 h-4 ml-2 opacity-70 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 relative z-10">
            <div className="relative flex items-center py-4">
              <div className="flex-grow border-t border-[#302820]"></div>
              <span className="flex-shrink-0 mx-4 text-[#5a5247] text-sm font-['Playfair_Display'] italic">or</span>
              <div className="flex-grow border-t border-[#302820]"></div>
            </div>

            <div className="space-y-3 mt-4">
              <button
                type="button"
                className="w-full flex items-center justify-center py-3 px-4 rounded-lg border border-[#302820] hover:bg-[#16120e] hover:border-[#c9a96e]/50 transition-colors text-[#a09a8f] font-medium text-sm"
              >
                <GoogleIcon />
                <span className="ml-3">Continue with Google</span>
              </button>
              
              <button
                type="button"
                className="w-full flex items-center justify-center py-3 px-4 rounded-lg border border-[#302820] hover:bg-[#16120e] hover:border-[#c9a96e]/50 transition-colors text-[#a09a8f] font-medium text-sm"
              >
                <AppleIcon />
                <span className="ml-3">Continue with Apple</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer Link */}
        <div className="mt-8 text-center text-sm text-[#8c8477]">
          {mode === "login" ? (
            <p>
              New to Margin?{" "}
              <button
                onClick={toggleMode}
                className="text-[#c9a96e] hover:text-[#dcc291] font-medium underline underline-offset-4 decoration-[#c9a96e]/30 hover:decoration-[#c9a96e] transition-all"
              >
                Create an account
              </button>
            </p>
          ) : (
            <p>
              Already have an account?{" "}
              <button
                onClick={toggleMode}
                className="text-[#c9a96e] hover:text-[#dcc291] font-medium underline underline-offset-4 decoration-[#c9a96e]/30 hover:decoration-[#c9a96e] transition-all"
              >
                Log in instead
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
