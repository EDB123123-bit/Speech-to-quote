// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginForm from '../LoginForm';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

vi.mock('@/lib/supabase/client', () => ({
  createBrowserSupabase: () => ({
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signUp: mocks.signUp,
    },
  }),
}));

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signInWithPassword.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } }, error: null });
    mocks.signUp.mockResolvedValue({ data: { session: null }, error: null });
  });

  it('confirms account creation when email confirmation is required', async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.click(screen.getByRole('button', { name: /registreer je hier/i }));
    await user.type(screen.getByLabelText('Bedrijfsnaam'), 'Luminus');
    await user.type(screen.getByLabelText('E-mailadres'), 'br.uit@example.com');
    await user.type(screen.getByLabelText('Wachtwoord'), 'veiligwachtwoord');
    await user.click(screen.getByRole('button', { name: 'Account aanmaken' }));

    expect(await screen.findByRole('heading', { name: 'Account aangemaakt' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('bevestigingslink');
    expect(screen.getByRole('status')).toHaveTextContent('br.uit@example.com');
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('lets an immediately authenticated signup continue to the quotes page', async () => {
    mocks.signUp.mockResolvedValueOnce({ data: { session: { user: { id: 'user-1' } } }, error: null });
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.click(screen.getByRole('button', { name: /registreer je hier/i }));
    await user.type(screen.getByLabelText('Bedrijfsnaam'), 'Luminus');
    await user.type(screen.getByLabelText('E-mailadres'), 'br.uit@example.com');
    await user.type(screen.getByLabelText('Wachtwoord'), 'veiligwachtwoord');
    await user.click(screen.getByRole('button', { name: 'Account aanmaken' }));
    await user.click(await screen.findByRole('button', { name: 'Naar mijn offertes' }));

    expect(mocks.push).toHaveBeenCalledWith('/offertes');
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});
