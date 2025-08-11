import React from 'react';

const Footer: React.FC = () => (
  <footer className="text-center text-xs text-yellow-100 py-4">
    &copy; {new Date().getFullYear()} RYP Academy. All rights reserved.
  </footer>
);

export default Footer; 