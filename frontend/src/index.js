import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css'; // Import global styles
import App from './App'; // Import our main App component

// This line finds the <div id="root"> in your index.html
const root = ReactDOM.createRoot(document.getElementById('root'));

// This line tells React to render our <App> component inside that div
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);