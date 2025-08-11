import React, { type ReactNode } from 'react';
import Header from './Header';
import Footer from './Footer';

type AppLayoutProps = {
  userId: string;
  role: string;
  onLogout: () => void;
  children: ReactNode;
};

const AppLayout: React.FC<AppLayoutProps> = ({ userId, role, onLogout, children }) => (
  <div className="min-h-screen bg-gradient-to-br from-black via-golfgreen to-yellow-400 flex flex-col">
    <Header userId={userId} role={role} onLogout={onLogout} />
    <main className="flex-1 max-w-5xl mx-auto p-4 w-full">{children}</main>
    <Footer />
  </div>
);

export default AppLayout; 