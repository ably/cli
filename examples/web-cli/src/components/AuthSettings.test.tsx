import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthSettings } from './AuthSettings';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  X: () => <div data-testid="x-icon">X</div>,
  Key: () => <div data-testid="key-icon">Key</div>,
  Lock: () => <div data-testid="lock-icon">Lock</div>,
  AlertCircle: () => <div data-testid="alert-icon">Alert</div>,
  CheckCircle: () => <div data-testid="check-icon">Check</div>,
  Shield: () => <div data-testid="shield-icon">Shield</div>,
}));

// Mock import.meta.env
const mockEnv = {
  VITE_ABLY_API_KEY: 'test-app.test-key:test-secret',
  VITE_ABLY_ACCESS_TOKEN: 'test-access-token-123456789',
};

vi.stubGlobal('import', {
  meta: {
    env: mockEnv,
  },
});

describe('AuthSettings', () => {
  const mockOnClose = vi.fn();
  const mockOnSave = vi.fn();

  beforeEach(() => {
    mockOnClose.mockClear();
    mockOnSave.mockClear();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <AuthSettings
        isOpen={false}
        onClose={mockOnClose}
        onSave={mockOnSave}
        hasEnvDefaults={true}
        isUsingCustomAuth={false}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders modal when isOpen is true', () => {
    render(
      <AuthSettings
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        hasEnvDefaults={true}
        isUsingCustomAuth={false}
      />
    );
    expect(screen.getByText('Authentication Settings')).toBeInTheDocument();
  });

  it('shows default credentials option when hasEnvDefaults is true', () => {
    render(
      <AuthSettings
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        hasEnvDefaults={true}
        isUsingCustomAuth={false}
      />
    );
    expect(screen.getByText('Use Default Credentials')).toBeInTheDocument();
    expect(screen.getByText('Use Custom Credentials')).toBeInTheDocument();
  });

  it('redacts environment variable credentials correctly', () => {
    render(
      <AuthSettings
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        hasEnvDefaults={true}
        isUsingCustomAuth={false}
      />
    );
    
    // Check API key redaction (shows app ID and key ID, hides secret)
    expect(screen.getByText('test-app.test-key:.....')).toBeInTheDocument();
    
    // Check access token redaction (shows first 6 and last 4 chars)
    expect(screen.getByText('test-a.....6789')).toBeInTheDocument();
  });

  it('shows custom credential form when no env defaults', () => {
    render(
      <AuthSettings
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        hasEnvDefaults={false}
        isUsingCustomAuth={true}
      />
    );
    
    expect(screen.getByLabelText(/API Key/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Access Token/)).toBeInTheDocument();
  });

  it('validates API key format', async () => {
    render(
      <AuthSettings
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        hasEnvDefaults={false}
        isUsingCustomAuth={true}
      />
    );

    const apiKeyInput = screen.getByPlaceholderText('your_app.key_name:key_secret');
    const saveButton = screen.getByText('Save & Connect');

    // Try to save without API key
    fireEvent.click(saveButton);
    await waitFor(() => {
      expect(screen.getByText('API Key is required')).toBeInTheDocument();
    });

    // Try to save with invalid format
    fireEvent.change(apiKeyInput, { target: { value: 'invalid-key' } });
    fireEvent.click(saveButton);
    await waitFor(() => {
      expect(screen.getByText('API Key should be in the format: app_name.key_name:key_secret')).toBeInTheDocument();
    });

    // Save with valid format
    fireEvent.change(apiKeyInput, { target: { value: 'valid-app.key:secret' } });
    fireEvent.click(saveButton);
    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith('valid-app.key:secret', '', false);
    });
  });

  it('switches between default and custom auth', () => {
    render(
      <AuthSettings
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        hasEnvDefaults={true}
        isUsingCustomAuth={false}
        currentApiKey="custom-key:secret"
        currentAccessToken="custom-token"
      />
    );

    const defaultRadio = screen.getByRole('radio', { name: /Use Default Credentials/ });
    const customRadio = screen.getByRole('radio', { name: /Use Custom Credentials/ });

    expect(defaultRadio).toBeChecked();
    expect(customRadio).not.toBeChecked();

    // Switch to custom
    fireEvent.click(customRadio);
    expect(customRadio).toBeChecked();
    expect(defaultRadio).not.toBeChecked();

    // Should show input fields
    expect(screen.getByPlaceholderText('your_app.key_name:key_secret')).toBeInTheDocument();
  });

  it('saves default credentials when selected', () => {
    render(
      <AuthSettings
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        hasEnvDefaults={true}
        isUsingCustomAuth={true}
      />
    );

    const defaultRadio = screen.getByRole('radio', { name: /Use Default Credentials/ });
    fireEvent.click(defaultRadio);

    const saveButton = screen.getByText('Save & Connect');
    fireEvent.click(saveButton);

    expect(mockOnSave).toHaveBeenCalledWith('', '', true);
  });

  it('closes modal on cancel', () => {
    render(
      <AuthSettings
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        hasEnvDefaults={true}
        isUsingCustomAuth={false}
      />
    );

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('closes modal on X button click', () => {
    render(
      <AuthSettings
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        hasEnvDefaults={true}
        isUsingCustomAuth={false}
      />
    );

    const closeButton = screen.getByLabelText('Close');
    fireEvent.click(closeButton);
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('preserves custom credentials when switching auth methods', () => {
    render(
      <AuthSettings
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        hasEnvDefaults={true}
        isUsingCustomAuth={true}
        currentApiKey="my-app.key:secret"
        currentAccessToken="my-token"
      />
    );

    // Check that custom credentials are populated
    const apiKeyInput = screen.getByPlaceholderText('your_app.key_name:key_secret') as HTMLInputElement;
    const accessTokenInput = screen.getByPlaceholderText('Your JWT access token') as HTMLInputElement;
    
    expect(apiKeyInput.value).toBe('my-app.key:secret');
    expect(accessTokenInput.value).toBe('my-token');
  });
});