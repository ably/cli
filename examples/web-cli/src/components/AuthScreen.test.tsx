import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthScreen } from './AuthScreen';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Key: () => <div data-testid="key-icon">Key</div>,
  Lock: () => <div data-testid="lock-icon">Lock</div>,
  Terminal: () => <div data-testid="terminal-icon">Terminal</div>,
  AlertCircle: () => <div data-testid="alert-icon">Alert</div>,
  ArrowRight: () => <div data-testid="arrow-icon">Arrow</div>,
}));

describe('AuthScreen', () => {
  const mockOnAuthenticate = vi.fn();

  beforeEach(() => {
    mockOnAuthenticate.mockClear();
  });

  it('renders authentication form', () => {
    render(<AuthScreen onAuthenticate={mockOnAuthenticate} />);
    
    expect(screen.getByText('Ably Web CLI Terminal')).toBeInTheDocument();
    expect(screen.getByText('Enter your credentials to start a terminal session')).toBeInTheDocument();
    expect(screen.getByLabelText(/API Key/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Access Token/)).toBeInTheDocument();
    expect(screen.getByText('Connect to Terminal')).toBeInTheDocument();
  });

  it('validates API key is required', async () => {
    render(<AuthScreen onAuthenticate={mockOnAuthenticate} />);

    const submitButton = screen.getByText('Connect to Terminal');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('API Key is required to connect to Ably')).toBeInTheDocument();
    });
    expect(mockOnAuthenticate).not.toHaveBeenCalled();
  });

  it('validates API key format', async () => {
    render(<AuthScreen onAuthenticate={mockOnAuthenticate} />);

    const apiKeyInput = screen.getByPlaceholderText('your_app.key_name:key_secret');
    const submitButton = screen.getByText('Connect to Terminal');

    fireEvent.change(apiKeyInput, { target: { value: 'invalid-format' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('API Key should be in the format: app_name.key_name:key_secret')).toBeInTheDocument();
    });
    expect(mockOnAuthenticate).not.toHaveBeenCalled();
  });

  it('calls onAuthenticate with valid credentials', async () => {
    render(<AuthScreen onAuthenticate={mockOnAuthenticate} />);

    const apiKeyInput = screen.getByPlaceholderText('your_app.key_name:key_secret');
    const accessTokenInput = screen.getByPlaceholderText('Your JWT access token');
    const submitButton = screen.getByText('Connect to Terminal');

    fireEvent.change(apiKeyInput, { target: { value: 'test-app.key:secret' } });
    fireEvent.change(accessTokenInput, { target: { value: 'test-token' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockOnAuthenticate).toHaveBeenCalledWith('test-app.key:secret', 'test-token');
    });
  });

  it('trims whitespace from credentials', async () => {
    render(<AuthScreen onAuthenticate={mockOnAuthenticate} />);

    const apiKeyInput = screen.getByPlaceholderText('your_app.key_name:key_secret');
    const accessTokenInput = screen.getByPlaceholderText('Your JWT access token');
    const submitButton = screen.getByText('Connect to Terminal');

    fireEvent.change(apiKeyInput, { target: { value: '  test-app.key:secret  ' } });
    fireEvent.change(accessTokenInput, { target: { value: '  test-token  ' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockOnAuthenticate).toHaveBeenCalledWith('test-app.key:secret', 'test-token');
    });
  });

  it('allows connection with only API key (no access token)', async () => {
    render(<AuthScreen onAuthenticate={mockOnAuthenticate} />);

    const apiKeyInput = screen.getByPlaceholderText('your_app.key_name:key_secret');
    const submitButton = screen.getByText('Connect to Terminal');

    fireEvent.change(apiKeyInput, { target: { value: 'test-app.key:secret' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockOnAuthenticate).toHaveBeenCalledWith('test-app.key:secret', '');
    });
  });

  it('shows help text for API key', () => {
    render(<AuthScreen onAuthenticate={mockOnAuthenticate} />);
    
    expect(screen.getByText('You can find your API key in the Ably dashboard under your app settings')).toBeInTheDocument();
  });

  it('shows help text for access token', () => {
    render(<AuthScreen onAuthenticate={mockOnAuthenticate} />);
    
    expect(screen.getByText("Only required if you're using token authentication instead of an API key")).toBeInTheDocument();
  });

  it('renders sign up link', () => {
    render(<AuthScreen onAuthenticate={mockOnAuthenticate} />);
    
    const signUpLink = screen.getByText('Sign up for free');
    expect(signUpLink).toBeInTheDocument();
    expect(signUpLink).toHaveAttribute('href', 'https://ably.com/sign-up');
    expect(signUpLink).toHaveAttribute('target', '_blank');
    expect(signUpLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('clears error when user types', async () => {
    render(<AuthScreen onAuthenticate={mockOnAuthenticate} />);

    const apiKeyInput = screen.getByPlaceholderText('your_app.key_name:key_secret');
    const submitButton = screen.getByText('Connect to Terminal');

    // Trigger error
    fireEvent.click(submitButton);
    await waitFor(() => {
      expect(screen.getByText('API Key is required to connect to Ably')).toBeInTheDocument();
    });

    // Type in the field - error should clear
    fireEvent.change(apiKeyInput, { target: { value: 'a' } });
    
    // Submit again with invalid format to get a different error
    fireEvent.click(submitButton);
    await waitFor(() => {
      expect(screen.queryByText('API Key is required to connect to Ably')).not.toBeInTheDocument();
    });
  });

  it('focuses on API key input on mount', () => {
    render(<AuthScreen onAuthenticate={mockOnAuthenticate} />);
    
    const apiKeyInput = screen.getByPlaceholderText('your_app.key_name:key_secret');
    expect(document.activeElement).toBe(apiKeyInput);
  });
});