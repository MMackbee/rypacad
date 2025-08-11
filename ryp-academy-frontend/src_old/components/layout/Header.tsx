import React from 'react';

type HeaderProps = {
  userId: string;
  role: string;
  onLogout: () => void;
};

const Header: React.FC<HeaderProps> = ({ userId, role, onLogout }) => (
  <header className="flex flex-col md:flex-row items-center justify-between p-4 bg-black/80 text-yellow-400">
    <div className="text-2xl font-bold tracking-tight">RYP Academy</div>
    <div className="flex items-center space-x-4 mt-2 md:mt-0">
      <span className="text-xs md:text-sm">
        User ID: <span className="font-mono bg-yellow-100 text-black px-2 py-1 rounded">{userId}</span>
      </span>
      <span className="text-xs md:text-sm">
        Role: <span className="font-bold uppercase">{role}</span>
      </span>
      <button
        className="px-3 py-1 bg-yellow-400 text-black rounded font-bold hover:bg-yellow-500"
        onClick={onLogout}
      >
        Logout
      </button>
    </div>
  </header>
);

export default Header; 