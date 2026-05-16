import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth, type Role } from '../../../contexts/AuthContext';

interface Props {
  allowed: Role[];
  children: ReactNode;
}

export function RoleRoute({ allowed, children }: Props) {
  const { user } = useAuth();
  if (!user || !allowed.includes(user.role)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
