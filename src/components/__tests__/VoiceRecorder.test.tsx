// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VoiceRecorder from '@/components/VoiceRecorder';

class MockMediaRecorder {
  static instances: MockMediaRecorder[] = [];
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  state = 'inactive';

  constructor(public stream: MediaStream) {
    MockMediaRecorder.instances.push(this);
  }
  start() { this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) });
    this.onstop?.();
  }
}

function mockMicPermission(granted: boolean) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: granted
        ? vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] })
        : vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError')),
    },
  });
}

beforeEach(() => {
  MockMediaRecorder.instances = [];
  vi.stubGlobal('MediaRecorder', MockMediaRecorder);
});

describe('VoiceRecorder', () => {
  it('renders a record button with the given label', () => {
    mockMicPermission(true);
    render(<VoiceRecorder onRecorded={vi.fn()} label="Beschrijf de klus" />);
    expect(screen.getByRole('button', { name: /beschrijf de klus/i })).toBeInTheDocument();
  });

  it('starts recording and shows a stop button', async () => {
    mockMicPermission(true);
    render(<VoiceRecorder onRecorded={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /opnemen/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /stoppen/i })).toBeInTheDocument());
  });

  it('calls onRecorded with the audio blob when stopped', async () => {
    mockMicPermission(true);
    const onRecorded = vi.fn();
    render(<VoiceRecorder onRecorded={onRecorded} />);

    await userEvent.click(screen.getByRole('button', { name: /opnemen/i }));
    await waitFor(() => expect(MockMediaRecorder.instances).toHaveLength(1));
    await userEvent.click(screen.getByRole('button', { name: /stoppen/i }));

    await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1));
    expect(onRecorded.mock.calls[0][0]).toBeInstanceOf(Blob);
  });

  it('shows a Dutch error when mic permission is denied', async () => {
    mockMicPermission(false);
    render(<VoiceRecorder onRecorded={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /opnemen/i }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/microfoon/i),
    );
  });

  it('does not start recording when disabled', async () => {
    mockMicPermission(true);
    render(<VoiceRecorder onRecorded={vi.fn()} disabled />);
    expect(screen.getByRole('button', { name: /opnemen/i })).toBeDisabled();
  });
});
