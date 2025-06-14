import React, { useState, useEffect } from 'react';
import { X, Key, Lock, AlertCircle, CheckCircle, Shield } from 'lucide-react';

interface AuthSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (apiKey: string, accessToken: string, useDefaults: boolean) => void;
  currentApiKey?: string;
  currentAccessToken?: string;
  hasEnvDefaults: boolean;
  isUsingCustomAuth: boolean;
}

// Helper function to redact sensitive credentials
const redactCredential = (credential: string | undefined): string => {
  if (!credential) return '';
  
  // For API keys in format "appId.keyId:secret"
  if (credential.includes(':')) {
    const [keyName, secret] = credential.split(':');
    // Show full app ID and key ID, but redact the secret
    return `${keyName}:.....`;
  }
  
  // For tokens, show first few and last few characters
  if (credential.length > 20) {
    return `${credential.substring(0, 6)}.....${credential.substring(credential.length - 4)}`;
  }
  
  return credential.substring(0, 4) + '.....';
};

export const AuthSettings: React.FC<AuthSettingsProps> = ({
  isOpen,
  onClose,
  onSave,
  currentApiKey = '',
  currentAccessToken = '',
  hasEnvDefaults,
  isUsingCustomAuth
}) => {
  const [useCustomAuth, setUseCustomAuth] = useState(isUsingCustomAuth);
  const [apiKey, setApiKey] = useState(isUsingCustomAuth ? currentApiKey : '');
  const [accessToken, setAccessToken] = useState(isUsingCustomAuth ? currentAccessToken : '');
  const [error, setError] = useState('');

  useEffect(() => {
    setUseCustomAuth(isUsingCustomAuth);
    if (isUsingCustomAuth) {
      setApiKey(currentApiKey);
      setAccessToken(currentAccessToken);
    }
  }, [currentApiKey, currentAccessToken, isUsingCustomAuth]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (useCustomAuth) {
      if (!apiKey.trim()) {
        setError('API Key is required');
        return;
      }

      // Basic validation for API key format
      if (!apiKey.includes(':')) {
        setError('API Key should be in the format: app_name.key_name:key_secret');
        return;
      }

      onSave(apiKey.trim(), accessToken.trim(), false);
    } else {
      // Use environment defaults
      onSave('', '', true);
    }
  };

  const handleAuthMethodChange = (useCustom: boolean) => {
    setUseCustomAuth(useCustom);
    setError('');
    if (!useCustom) {
      setApiKey('');
      setAccessToken('');
    }
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
          {hasEnvDefaults && (
            <div className="space-y-4 mb-6">
              <label className="text-sm font-medium text-gray-300">Authentication Method</label>
              <div className="space-y-3">
                <label className="flex items-start space-x-3 p-4 bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-750 transition-colors">
                  <input
                    type="radio"
                    name="authMethod"
                    checked={!useCustomAuth}
                    onChange={() => handleAuthMethodChange(false)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 text-white font-medium">
                      <Shield size={16} />
                      <span>Use Default Credentials</span>
                    </div>
                    <p className="text-sm text-gray-400 mt-1">
                      Secure credentials configured by your administrator
                    </p>
                    <div className="mt-2 space-y-1">
                      <p className="text-xs text-gray-500">
                        API Key: <span className="font-mono text-gray-400">{redactCredential(import.meta.env.VITE_ABLY_API_KEY)}</span>
                      </p>
                      {import.meta.env.VITE_ABLY_ACCESS_TOKEN && (
                        <p className="text-xs text-gray-500">
                          Access Token: <span className="font-mono text-gray-400">{redactCredential(import.meta.env.VITE_ABLY_ACCESS_TOKEN)}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </label>

                <label className="flex items-start space-x-3 p-4 bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-750 transition-colors">
                  <input
                    type="radio"
                    name="authMethod"
                    checked={useCustomAuth}
                    onChange={() => handleAuthMethodChange(true)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 text-white font-medium">
                      <Key size={16} />
                      <span>Use Custom Credentials</span>
                    </div>
                    <p className="text-sm text-gray-400 mt-1">
                      Enter your own API key and optional access token
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}

          {(!hasEnvDefaults || useCustomAuth) && (
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
                  disabled={hasEnvDefaults && !useCustomAuth}
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
                  disabled={hasEnvDefaults && !useCustomAuth}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Optional: Use if you have a JWT token for authentication
                </p>
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