import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react';
import { apiRequest } from '../lib/api-client';
import {
  clearAuthStorage,
  getAccessToken,
  getStoredUser,
  setAccessToken,
  setStoredUser
} from '../lib/auth-storage';
import { endpoints } from '../lib/endpoints';
import type { AuthResponse, PublicUser } from '../types/api';

type AuthSelectableRole = 'STUDENT' | 'FACULTY' | 'ADMIN';

type RegisterInput = {
  role: AuthSelectableRole;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
};

type LoginInput = {
  role: AuthSelectableRole;
  email: string;
  password: string;
};

type AuthContextValue = {
  user: PublicUser | null;
  token: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function applyAuthResponse(response: AuthResponse) {
  setAccessToken(response.accessToken);
  setStoredUser(response.user);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(() => getStoredUser());
  const [token, setToken] = useState<string | null>(() => getAccessToken());
  const [loading, setLoading] = useState(true);

  const syncStateFromStorage = useCallback(() => {
    setUser(getStoredUser());
    setToken(getAccessToken());
  }, []);

  const refreshUser = useCallback(async () => {
    const accessToken = getAccessToken();
    if (!accessToken) {
      setUser(null);
      setToken(null);
      return;
    }

    const me = await apiRequest<PublicUser>(endpoints.auth.me);
    setStoredUser(me);
    setUser(me);
    setToken(accessToken);
  }, []);

  const login = useCallback(
    async (input: LoginInput) => {
      const response = await apiRequest<AuthResponse>(endpoints.auth.login, {
        method: 'POST',
        body: {
          email: input.email,
          password: input.password
        }
      });

      if (response.user.role !== input.role) {
        throw new Error(
          `Selected role does not match this account. This account belongs to ${response.user.role}.`
        );
      }

      applyAuthResponse(response);
      syncStateFromStorage();
    },
    [syncStateFromStorage]
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      if (input.role !== 'STUDENT') {
        throw new Error(
          'Self-registration is available only for STUDENT role. Faculty/Admin accounts are created by authorized users.'
        );
      }

      const response = await apiRequest<AuthResponse>(endpoints.auth.register, {
        method: 'POST',
        body: {
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          password: input.password,
          phone: input.phone
        }
      });
      applyAuthResponse(response);
      syncStateFromStorage();
    },
    [syncStateFromStorage]
  );

  const logout = useCallback(() => {
    clearAuthStorage();
    setUser(null);
    setToken(null);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      const existingToken = getAccessToken();
      if (!existingToken) {
        if (mounted) {
          setLoading(false);
        }
        return;
      }

      try {
        await refreshUser();
      } catch {
        clearAuthStorage();
        if (mounted) {
          setUser(null);
          setToken(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void bootstrap();

    return () => {
      mounted = false;
    };
  }, [refreshUser]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      loading,
      isAuthenticated: Boolean(user && token),
      login,
      register,
      logout,
      refreshUser
    }),
    [user, token, loading, login, register, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
