// src/context/ThemeContext.jsx
import React, { createContext, useState, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';

export const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme);
    document.body.classList.toggle('dark-mode', savedTheme === 'dark');
  }, []);

  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.body.classList.toggle('dark-mode', theme === 'dark');
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  const contextValue = useMemo(() => ({
    theme,
    toggleTheme,
  }), [theme]);

  return (
    <>
      <div className="theme-variables" />
      <ThemeContext.Provider value={contextValue}>
        {children}
      </ThemeContext.Provider>
    </>
  );
};

ThemeProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
