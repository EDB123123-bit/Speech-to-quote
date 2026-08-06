import { createAdminSupabase } from '@/lib/supabase/admin';
import type { PipelineStep } from '@/lib/supabase/types';

export function truncate(text: string, max = 2000): string {
  return text.length <= max ? text : `${text.slice(0, max)}… [afgekapt]`;
}

export function serialiseError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ? truncate(error.stack, 4000) : undefined,
    };
  }
  return { message: String(error) };
}

export async function logPipelineEvent(args: {
  quoteId: string | null;
  contractorId: string;
  step: PipelineStep;
  status: 'success' | 'error';
  detail?: Record<string, unknown>;
}): Promise<void> {
  try {
    const supabase = createAdminSupabase();
    await supabase.from('pipeline_events').insert({
      quote_id: args.quoteId,
      contractor_id: args.contractorId,
      step: args.step,
      status: args.status,
      detail: args.detail ?? {},
    });
  } catch {
    // Observability must never take down the thing it observes.
    // Vercel's platform logs still capture the surrounding request.
  }
}
