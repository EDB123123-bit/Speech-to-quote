'use client';

import { ONBOARDING_RESTART_EVENT } from './events';

type Props = {
  className?: string;
  label?: string;
};

export default function OnboardingHelpButton({
  className = 'rail-help-button',
  label = 'Uitleg bekijken',
}: Props) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => window.dispatchEvent(new Event(ONBOARDING_RESTART_EVENT))}
    >
      <span className="onboarding-help-icon" aria-hidden>?</span>
      {label}
    </button>
  );
}
