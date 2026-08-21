import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Zap, ShieldCheck, ArrowRight, Building2, Mail, Lock, User } from 'lucide-react';

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
  organizationName?: string;
}

export const AuthView: React.FC = () => {
  const { login, register } = useAuth();
  const [email, setEmail] = useState('admin@acme.com');
  const [name, setName] = useState('John Doe');
  const [organizationName, setOrganizationName] = useState('Acme Operations Corp');
  const [password, setPassword] = useState('password123');
  const [isRegistering, setIsRegistering] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Global & Field-Specific Error States
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // Clear all errors when switching between Sign In and Register screens
  const handleToggleMode = (newMode: boolean) => {
    setIsRegistering(newMode);
    setGlobalError(null);
    setFieldErrors({});
  };

  // Clear specific field error and global banner whenever user edits an input
  const clearFieldError = (fieldName: keyof FieldErrors) => {
    if (globalError) setGlobalError(null);
    if (fieldErrors[fieldName]) {
      setFieldErrors((prev) => ({ ...prev, [fieldName]: undefined }));
    }
  };

  const validateForm = (): boolean => {
    const errors: FieldErrors = {};

    if (!email.trim()) {
      errors.email = 'Business email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = 'Please enter a valid email address';
    }

    if (!password) {
      errors.password = 'Password is required';
    } else if (password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }

    if (isRegistering) {
      if (!name.trim()) {
        errors.name = 'Full name is required';
      }
      if (!organizationName.trim()) {
        errors.organizationName = 'Organization Name is required and cannot be empty';
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError(null);

    // Client-side validation: Prevent API call if validation fails
    if (!validateForm()) {
      return;
    }

    setSubmitting(true);

    try {
      if (isRegistering) {
        await register(email.trim(), organizationName.trim(), password);
      } else {
        await login(email.trim(), password);
      }
    } catch (err: any) {
      setGlobalError(err.message || 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-gray-200 flex items-center justify-center p-6 relative overflow-hidden font-sans">
      {/* Aurora Ambient Background */}
      <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-gradient-to-br from-[#4F6EF7]/20 via-[#00C48C]/15 to-transparent rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] bg-gradient-to-tr from-[#00C48C]/15 via-[#4F6EF7]/20 to-transparent rounded-full blur-3xl pointer-events-none" />

      {/* Main Centered Auth Card */}
      <div className="max-w-md w-full bg-[#141414] border border-white/10 rounded-3xl p-8 space-y-6 shadow-2xl relative z-10">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#4F6EF7] to-[#00C48C] mx-auto flex items-center justify-center shadow-xl shadow-[#4F6EF7]/25">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">Your AI Business Manager</h1>
            <p className="text-xs text-gray-400 font-mono mt-1">Distributed Job Scheduling & Operations Engine</p>
          </div>
        </div>

        {/* Global Error Banner */}
        {globalError && (
          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-mono text-center animate-in fade-in duration-200">
            ⚠️ {globalError}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs" noValidate>
          {isRegistering && (
            <>
              {/* Full Name */}
              <div>
                <label className="block text-gray-400 font-mono text-[11px] uppercase mb-1 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-gray-500" /> Full Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. John Doe"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    clearFieldError('name');
                  }}
                  className={`w-full px-4 py-2.5 rounded-2xl bg-[#0A0A0A] border text-white font-medium outline-none transition-colors ${
                    fieldErrors.name
                      ? 'border-rose-500/80 focus:border-rose-500'
                      : 'border-white/10 focus:border-[#4F6EF7]'
                  }`}
                />
                {fieldErrors.name && (
                  <p className="text-rose-400 text-[11px] font-mono mt-1">⚠️ {fieldErrors.name}</p>
                )}
              </div>

              {/* Organization Name (Bug 1 Fix) */}
              <div>
                <label className="block text-gray-400 font-mono text-[11px] uppercase mb-1 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-gray-500" /> Organization Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Acme Operations Corp"
                  value={organizationName}
                  onChange={(e) => {
                    setOrganizationName(e.target.value);
                    clearFieldError('organizationName');
                  }}
                  className={`w-full px-4 py-2.5 rounded-2xl bg-[#0A0A0A] border text-white font-medium outline-none transition-colors ${
                    fieldErrors.organizationName
                      ? 'border-rose-500/80 focus:border-rose-500'
                      : 'border-white/10 focus:border-[#4F6EF7]'
                  }`}
                />
                {fieldErrors.organizationName && (
                  <p className="text-rose-400 text-[11px] font-mono mt-1">⚠️ {fieldErrors.organizationName}</p>
                )}
              </div>
            </>
          )}

          {/* Business Email */}
          <div>
            <label className="block text-gray-400 font-mono text-[11px] uppercase mb-1 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-gray-500" /> Business Email
            </label>
            <input
              type="email"
              placeholder="e.g. admin@acme.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clearFieldError('email');
              }}
              className={`w-full px-4 py-2.5 rounded-2xl bg-[#0A0A0A] border text-white font-medium font-mono outline-none transition-colors ${
                fieldErrors.email
                  ? 'border-rose-500/80 focus:border-rose-500'
                  : 'border-white/10 focus:border-[#4F6EF7]'
              }`}
            />
            {fieldErrors.email && (
              <p className="text-rose-400 text-[11px] font-mono mt-1">⚠️ {fieldErrors.email}</p>
            )}
          </div>

          {/* Password */}
          <div>
            <label className="block text-gray-400 font-mono text-[11px] uppercase mb-1 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-gray-500" /> Password
            </label>
            <input
              type="password"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearFieldError('password');
              }}
              className={`w-full px-4 py-2.5 rounded-2xl bg-[#0A0A0A] border text-white font-medium font-mono outline-none transition-colors ${
                fieldErrors.password
                  ? 'border-rose-500/80 focus:border-rose-500'
                  : 'border-white/10 focus:border-[#4F6EF7]'
              }`}
            />
            {fieldErrors.password && (
              <p className="text-rose-400 text-[11px] font-mono mt-1">⚠️ {fieldErrors.password}</p>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 rounded-full bg-[#4F6EF7] hover:bg-[#4F6EF7]/90 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xl shadow-[#4F6EF7]/25 transition-all mt-2"
          >
            {submitting ? 'Authenticating...' : isRegistering ? 'Create Account' : 'Continue to Dashboard'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* View Toggle & Security Badge */}
        <div className="pt-4 border-t border-white/10 flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={() => handleToggleMode(!isRegistering)}
            className="text-gray-400 hover:text-white font-medium transition-colors"
          >
            {isRegistering ? 'Already registered? Sign in' : 'New tenant? Create account'}
          </button>
          <span className="text-[10px] text-gray-500 font-mono flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-[#00C48C]" /> JWT Auth
          </span>
        </div>
      </div>
    </div>
  );
};
