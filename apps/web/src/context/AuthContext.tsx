import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { User, Organization, Project, AuthResponse } from '../api/types';
import { api } from '../api/client';

interface AuthContextType {
  user: User | null;
  token: string | null;
  organization: Organization | null;
  project: Project | null;
  isLoading: boolean;
  login: (email: string, password?: string) => Promise<void>;
  register: (email: string, organizationName: string, password?: string) => Promise<void>;
  logout: () => void;
  setOrganization: (org: Organization) => void;
  setProject: (proj: Project) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function readJson<T>(key: string): T | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

function projectBelongsToOrg(project: Project | null, orgId: string | undefined): project is Project {
  return Boolean(project && orgId && project.organizationId === orgId);
}

const AuthProviderInner: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUserState] = useState<User | null>(() => readJson<User>('auth_user'));
  const [token, setTokenState] = useState<string | null>(() => localStorage.getItem('auth_token'));
  const [organization, setOrganizationState] = useState<Organization | null>(() =>
    readJson<Organization>('auth_org')
  );
  const [project, setProjectState] = useState<Project | null>(() => {
    const org = readJson<Organization>('auth_org');
    const saved = readJson<Project>('auth_project');
    if (projectBelongsToOrg(saved, org?.id)) {
      return saved;
    }
    localStorage.removeItem('auth_project');
    return null;
  });
  const [isLoading, setIsLoading] = useState(false);
  const bootstrapLock = useRef(false);

  const persistUser = (next: User | null) => {
    setUserState(next);
    if (next) localStorage.setItem('auth_user', JSON.stringify(next));
    else localStorage.removeItem('auth_user');
  };

  const persistToken = (next: string | null) => {
    setTokenState(next);
    if (next) localStorage.setItem('auth_token', next);
    else localStorage.removeItem('auth_token');
  };

  const persistOrganization = (next: Organization | null) => {
    setOrganizationState(next);
    if (next) localStorage.setItem('auth_org', JSON.stringify(next));
    else localStorage.removeItem('auth_org');
  };

  const persistProject = (next: Project | null) => {
    setProjectState(next);
    if (next) localStorage.setItem('auth_project', JSON.stringify(next));
    else localStorage.removeItem('auth_project');
  };

  const clearTenantScope = () => {
    persistProject(null);
    persistOrganization(null);
  };

  const clearSession = () => {
    persistUser(null);
    persistToken(null);
    persistOrganization(null);
    persistProject(null);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('auth_org');
    localStorage.removeItem('auth_project');
  };

  useEffect(() => {
    const handleUnauthorized = () => clearSession();
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  const bootstrapWorkspace = useCallback(async (org: Organization) => {
    if (!org?.id || bootstrapLock.current) return;
    bootstrapLock.current = true;

    try {
      const res = await api.getProjectsForOrg(org.id);
      const projectList: Project[] = Array.isArray(res) ? res : res.data || [];
      const owned = projectList.filter((p) => p.organizationId === org.id);

      let nextProject: Project | null = owned[0] ?? null;

      if (!nextProject) {
        try {
          nextProject = await api.createProject(org.id, 'Default', 'default');
        } catch {
          const retry = await api.getProjectsForOrg(org.id);
          const retryList: Project[] = Array.isArray(retry) ? retry : retry.data || [];
          nextProject = retryList.find((p) => p.organizationId === org.id) || null;
        }
      }

      persistProject(nextProject);
    } catch (err) {
      console.error('Failed to bootstrap tenant workspace:', err);
      persistProject(null);
    } finally {
      bootstrapLock.current = false;
    }
  }, []);

  useEffect(() => {
    if (!user || !token || !organization?.id) return;
    if (projectBelongsToOrg(project, organization.id)) return;
    if (project) {
      persistProject(null);
    }
    void bootstrapWorkspace(organization);
  }, [user, token, organization, project, bootstrapWorkspace]);

  const applyAuthResponse = async (res: AuthResponse) => {
    const jwt = res.accessToken || res.token || '';
    persistProject(null);
    persistUser(res.user);
    persistToken(jwt);
    persistOrganization(res.organization || null);
    if (res.organization) {
      await bootstrapWorkspace(res.organization);
    }
  };

  const login = async (email: string, password = 'password123') => {
    setIsLoading(true);
    try {
      clearTenantScope();
      const res = await api.login(email, password);
      await applyAuthResponse(res);
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, organizationName: string, password = 'password123') => {
    setIsLoading(true);
    try {
      clearTenantScope();
      const res = await api.register(email, organizationName, password);
      await applyAuthResponse(res);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    clearSession();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        organization,
        project,
        isLoading,
        login,
        register,
        logout,
        setOrganization: persistOrganization,
        setProject: persistProject,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <AuthProviderInner>{children}</AuthProviderInner>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
