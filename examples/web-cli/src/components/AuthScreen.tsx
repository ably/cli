import React, { useState } from 'react';
import { Key, Lock, Terminal, AlertCircle, ArrowRight } from 'lucide-react';

interface AuthScreenProps {
  onAuthenticate: (apiKey: string, accessToken: string) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticate }) => {
  const [apiKey, setApiKey] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!apiKey.trim()) {
      setError('API Key is required to connect to Ably');
      return;
    }

    // Basic validation for API key format
    if (!apiKey.includes(':')) {
      setError('API Key should be in the format: app_name.key_name:key_secret');
      return;
    }

    onAuthenticate(apiKey.trim(), accessToken.trim());
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-full mb-4">
            <Terminal className="text-white" size={32} />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Ably Web CLI Terminal</h1>
          <p className="text-gray-400">Enter your credentials to start a terminal session</p>
        </div>

        <div className="bg-gray-900 rounded-lg shadow-xl p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="apiKey" className="flex items-center space-x-2 text-sm font-medium text-gray-300 mb-2">
                <Key size={16} />
                <span>API Key *</span>
              </label>
              <input
                id="apiKey"
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="your_app.key_name:key_secret"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                autoFocus
              />
              <p className="mt-2 text-xs text-gray-500">
                You can find your API key in the Ably dashboard under your app settings
              </p>
            </div>

            <div>
              <label htmlFor="accessToken" className="flex items-center space-x-2 text-sm font-medium text-gray-300 mb-2">
                <Lock size={16} />
                <span>Access Token (Optional)</span>
              </label>
              <input
                id="accessToken"
                type="text"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="Your JWT access token"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
              <p className="mt-2 text-xs text-gray-500">
                Only required if you're using token authentication instead of an API key
              </p>
            </div>

            {error && (
              <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 flex items-start space-x-3">
                <AlertCircle className="text-red-400 mt-0.5" size={20} />
                <span className="text-sm text-red-300">{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2 font-medium"
            >
              <span>Connect to Terminal</span>
              <ArrowRight size={20} />
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-800">
            <p className="text-xs text-gray-500 text-center">
              Don't have an Ably account?{' '}
              <a 
                href="https://ably.com/sign-up" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline"
              >
                Sign up for free
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};