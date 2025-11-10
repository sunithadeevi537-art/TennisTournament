import React from 'react';
import Button from './Button';

interface HeaderProps {
  title: string;
  currentMode: 'admin' | 'user';
  onModeChange: (mode: 'admin' | 'user') => void;
  isLoggedIn: boolean;
  onLogout: () => void;
}

const Header: React.FC<HeaderProps> = ({ title, currentMode, onModeChange, isLoggedIn, onLogout }) => {
  const adminButtonClasses = `transition-colors duration-200 ${
    currentMode === 'admin' ? 'bg-indigo-800' : 'bg-transparent hover:bg-indigo-700'
  }`;
  const playerButtonClasses = `transition-colors duration-200 ${
    currentMode === 'user' ? 'bg-indigo-800' : 'bg-transparent hover:bg-indigo-700'
  }`;

  return (
    <header className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-4 shadow-md sticky top-0 z-10">
      <div className="container mx-auto flex flex-col md:flex-row justify-between items-center">
        <h1 className="text-3xl font-bold mb-2 md:mb-0">{title}</h1>
        <div className="flex space-x-2">
          <Button
            variant="secondary"
            className={`${adminButtonClasses} text-white border border-white`}
            onClick={() => onModeChange('admin')}
          >
            Admin Portal
          </Button>
          <Button
            variant="secondary"
            className={`${playerButtonClasses} text-white border border-white`}
            onClick={() => onModeChange('user')}
          >
            Player Portal
          </Button>
          {isLoggedIn && currentMode === 'admin' && (
            <Button variant="danger" onClick={onLogout} className="ml-4">
              Logout
            </Button>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;