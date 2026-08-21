import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('auth_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('auth_token');
  });

  const [organization, setOrganization] = useState<Organization | null>(() => {
    const saved = localStorage.getItem('auth_org');
    return saved ? JSON.parse(saved) : null;
  });

  const [project, setProject] = useState<Project | null>(() => {
    const saved = localStorage.getItem('auth_project');
    return saved ? JSON.parse(saved) : null;
  });

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
      setToken(null);
      setOrganization(null);
      setProject(null);
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      localStorage.removeItem('auth_org');
      localStorage.removeItem('auth_project');
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  const bootstrapDefaultOrgAndProject = useCallback(
    async (overrideOrg?: Organization | null, overrideUser?: User | null) => {
      try {
        const currentUser = overrideUser || user;
        const currentOrg = overrideOrg || organization;
        const orgId = currentOrg?.id || currentUser?.organizationId;

        if (!orgId) return;

        // 1. Fetch existing Projects for Organization
        let proj = project;
        if (!proj) {
          const res = await api.getProjectsForOrg(orgId);
          const projectList = Array.isArray(res) ? res : res.data || [];
          if (projectList.length > 0) {
            proj = projectList[0];
          } else {
            proj = await api.createProject(orgId, 'Production Core', `prod-core-${Date.now().toString().slice(-4)}`);
          }
          setProject(proj);
          localStorage.setItem('auth_project', JSON.stringify(proj));
        }

        // 2. Ensure default Queues exist under this Project
        if (proj) {
          const queues = await api.getQueues(proj.id);
          if (!queues || queues.length === 0) {
            await api.createQueue(proj.id, {
              name: 'email-notifications',
              priority: 10,
              concurrencyLimit: 25,
            });
            await api.createQueue(proj.id, {
              name: 'payment-reconciliation',
              priority: 50,
              concurrencyLimit: 5,
            });
          }
        }
      } catch (err) {
        console.error('Failed to bootstrap default org/project:', err);
      }
    },
    [user, organization, project]
  );

  // Auto-bootstrap project if user is logged in but project is missing
  useEffect(() => {
    if (user && token && !project) {
      bootstrapDefaultOrgAndProject();
    }
  }, [user, token, project, bootstrapDefaultOrgAndProject]);

  const login = async (email: string, password = 'password123') => {
    setIsLoading(true);
    try {
      let res: AuthResponse;
      try {
        res = await api.login(email, password);
      } catch (err: any) {
        if (err.message && err.message.includes('Invalid credentials')) {
          // Auto-provision new user and default organization on first login
          const defaultOrgName = 'Acme Operations Corp';
          res = await api.register(email, defaultOrgName, password);
        } else {
          throw err;
        }
      }

      const jwt = res.accessToken || res.token || '';
      setUser(res.user);
      setToken(jwt);
      localStorage.setItem('auth_user', JSON.stringify(res.user));
      localStorage.setItem('auth_token', jwt);

      if (res.organization) {
        setOrganization(res.organization);
        localStorage.setItem('auth_org', JSON.stringify(res.organization));
      }

      await bootstrapDefaultOrgAndProject(res.organization, res.user);
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (
    email: string,
    organizationName: string,
    password = 'password123'
  ) => {
    setIsLoading(true);
    try {
      const res = await api.register(email, organizationName, password);
      const jwt = res.accessToken || res.token || '';

      setUser(res.user);
      setToken(jwt);
      localStorage.setItem('auth_user', JSON.stringify(res.user));
      localStorage.setItem('auth_token', jwt);

      if (res.organization) {
        setOrganization(res.organization);
        localStorage.setItem('auth_org', JSON.stringify(res.organization));
      }

      await bootstrapDefaultOrgAndProject(res.organization, res.user);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setOrganization(null);
    setProject(null);
    localStorage.clear();
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
        setOrganization,
        setProject,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
