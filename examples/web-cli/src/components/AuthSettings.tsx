import React, { useState, useEffect } from 'react';
import { X, Key, Lock, AlertCircle, CheckCircle, Save } from 'lucide-react';

interface AuthSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (apiKey: string, accessToken: string, remember: boolean) => void;
  currentApiKey?: string;
  currentAccessToken?: string;
  rememberCredentials: boolean;
}

// Helper function to redact sensitive credentials
const redactCredential = (credential: string | undefined): string => {
  if (!credential) return '';
  
  // For API keys in format "appId.keyId:secret"
  if (credential.includes(':')) {
    const [keyName, secret] = credential.split(':');
    // Show full app ID and key ID, but redact the secret
    return `${keyName}:****`;
  }
  
  // For tokens, show first few and last few characters
  if (credential.length > 20) {
    return `${credential.substring(0, 6)}...${credential.substring(credential.length - 4)}`;
  }
  
  return credential.substring(0, 4) + '...';
};

export const AuthSettings: React.FC<AuthSettingsProps> = ({
  isOpen,
  onClose,
  onSave,
  currentApiKey = '',
  currentAccessToken = '',
  rememberCredentials
}) => {
  const [apiKey, setApiKey] = useState(currentApiKey);
  const [accessToken, setAccessToken] = useState(currentAccessToken);
  const [remember, setRemember] = useState(rememberCredentials);
  const [error, setError] = useState('');

  useEffect(() => {
    setApiKey(currentApiKey);
    setAccessToken(currentAccessToken);
    setRemember(rememberCredentials);
  }, [currentApiKey, currentAccessToken, rememberCredentials, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!apiKey.trim()) {
      setError('API Key is required');
      return;
    }

    // Basic validation for API key format
    if (!apiKey.includes(':')) {
      setError('API Key should be in the format: app_name.key_name:key_secret');
      return;
    }

    onSave(apiKey.trim(), accessToken.trim(), remember);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <h2 className="text-xl font-semibold text-white">Authentication Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {currentApiKey && (
            <div className="mb-6 p-4 bg-gray-800 rounded-lg">
              <p className="text-sm font-medium text-gray-300 mb-2">Current Credentials</p>
              <div className="space-y-1">
                <p className="text-xs text-gray-500">
                  API Key: <span className="font-mono text-gray-400">{redactCredential(currentApiKey)}</span>
                </p>
                {currentAccessToken && (
                  <p className="text-xs text-gray-500">
                    Access Token: <span className="font-mono text-gray-400">{redactCredential(currentAccessToken)}</span>
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onSave('', '', false)}
                className="mt-3 text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                Clear Credentials
              </button>
            </div>
          )}

          {(
            <div className="space-y-6">
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
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Find your API key in your Ably dashboard
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
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Optional: Use if you have a JWT token for authentication
                </p>
              </div>
              
              <div className="flex items-center space-x-3">
                <input
                  id="rememberCredentialsSettings"
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-gray-800 border-gray-700 rounded focus:ring-blue-500"
                />
                <label htmlFor="rememberCredentialsSettings" className="flex items-center space-x-2 text-sm text-gray-300 cursor-pointer">
                  <Save size={16} />
                  <span>Remember credentials for future sessions</span>
                </label>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-900/50 border border-red-700 rounded-lg p-3 flex items-center space-x-2 mt-6">
              <AlertCircle className="text-red-400" size={16} />
              <span className="text-sm text-red-300">{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end space-x-3 mt-6 pt-6 border-t border-gray-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center space-x-2"
            >
              <CheckCircle size={16} />
              <span>Save & Connect</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};