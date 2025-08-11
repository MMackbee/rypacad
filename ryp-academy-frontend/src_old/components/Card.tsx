import React, { type ReactNode } from 'react';

type CardProps = {
  children: ReactNode;
  className?: string;
};

const Card: React.FC<CardProps> = ({ children, className = '' }) => (
  <div className={`bg-white rounded-lg shadow p-4 mb-4 ${className} hover:shadow-lg transition-shadow`}>
    {children}
  </div>
);

export default Card; 