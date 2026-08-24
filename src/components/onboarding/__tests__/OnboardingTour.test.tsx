// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OnboardingTour from '../OnboardingTour';
import OnboardingHelpButton from '../OnboardingHelpButton';
import { ONBOARDING_RESTART_EVENT } from '../events';

const mocks = vi.hoisted(() => ({
  pathname: '/offertes',
  completeOnboarding: vi.fn(),
  getOnboardingStatus: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
}));

vi.mock('@/app/onboarding-actions', () => ({
  completeOnboarding: mocks.completeOnboarding,
  getOnboardingStatus: mocks.getOnboardingStatus,
}));

describe('OnboardingTour', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = '/offertes';
    window.history.replaceState({}, '', '/offertes');
    mocks.getOnboardingStatus.mockResolvedValue({ show: true });
    mocks.completeOnboarding.mockResolvedValue(undefined);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  it('explains the complete V1 flow in short, plain-language steps', async () => {
    const user = userEvent.setup();
    render(<OnboardingTour />);

    expect(await screen.findByRole('dialog', { name: 'Van aanvraag tot factuur' })).toBeInTheDocument();
    expect(screen.getByText('1 van 6')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Van aanvraag tot factuur' })).toHaveTextContent(
      /Aanvraag.*Offerte.*Aanvaard.*Werk.*Factuur/,
    );

    await user.click(screen.getByRole('button', { name: 'Start uitleg' }));
    expect(screen.getByRole('dialog', { name: 'Vul je bedrijf en mailbox in' })).toBeInTheDocument();
    expect(screen.getByText(/geen vaste prijslijst klaar te hebben/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Volgende' }));
    expect(screen.getByRole('dialog', { name: 'Maak een nieuwe offerte' })).toHaveTextContent(
      /spreek de klus in, start handmatig of haal een aanvraag uit Gmail/i,
    );

    await user.click(screen.getByRole('button', { name: 'Volgende' }));
    expect(screen.getByRole('dialog', { name: 'Controleer het concept' })).toHaveTextContent(
      /ontbrekende prijs blijft onbekend/i,
    );
    expect(screen.getByRole('dialog', { name: 'Controleer het concept' })).toHaveTextContent(
      /hoeft geen account te maken/i,
    );

    await user.click(screen.getByRole('button', { name: 'Volgende' }));
    expect(screen.getByRole('dialog', { name: 'Taken en materiaal komen vrij' })).toHaveTextContent(
      /aparte meerwerkofferte/i,
    );

    await user.click(screen.getByRole('button', { name: 'Volgende' }));
    expect(screen.getByRole('dialog', { name: 'Maak de factuur' })).toHaveTextContent(
      /aanvaarde standaard- of meerwerkofferte/i,
    );

    await user.click(screen.getByRole('button', { name: 'Begrepen' }));
    await waitFor(() => expect(mocks.completeOnboarding).toHaveBeenCalledOnce());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('saves a skip and lets the user reopen the explanation later', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<OnboardingTour />);

    await user.click(await screen.findByRole('button', { name: 'Nu niet' }));
    await waitFor(() => expect(mocks.completeOnboarding).toHaveBeenCalledOnce());

    mocks.getOnboardingStatus.mockResolvedValue({ show: false });
    rerender(
      <>
        <OnboardingTour />
        <OnboardingHelpButton />
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'Uitleg bekijken' }));
    expect(await screen.findByRole('dialog', { name: 'Van aanvraag tot factuur' })).toBeInTheDocument();
  });

  it('does not query or show contractor onboarding on a public customer quote', async () => {
    mocks.pathname = '/offerte/customer-token';
    window.history.replaceState({}, '', '/offerte/customer-token');

    render(<OnboardingTour />);
    await act(async () => Promise.resolve());

    expect(mocks.getOnboardingStatus).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('responds to the shared restart event', async () => {
    mocks.getOnboardingStatus.mockResolvedValue({ show: false });
    render(<OnboardingTour />);
    await waitFor(() => expect(mocks.getOnboardingStatus).toHaveBeenCalledOnce());

    act(() => window.dispatchEvent(new Event(ONBOARDING_RESTART_EVENT)));
    expect(await screen.findByRole('dialog', { name: 'Van aanvraag tot factuur' })).toBeInTheDocument();
  });
});
