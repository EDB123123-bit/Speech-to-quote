'use client';

import { useActionState } from 'react';
import { issueInvoiceFormAction, type InvoiceActionState } from '../actions';

const initialState: InvoiceActionState = { message: '' };

export default function InvoiceIssueButton() {
  const [state, formAction, pending] = useActionState(issueInvoiceFormAction, initialState);

  return (
    <>
      <button
        type="submit"
        formAction={formAction}
        disabled={pending}
        className="btn btn-primary"
      >
        {pending ? 'Factuur wordt uitgegeven…' : 'Factuur uitgeven'}
      </button>
      {state.message && (
        <p role="alert" className="alert alert-critical basis-full">
          {state.message}{' '}
          <a href="/instellingen#bedrijf" className="font-bold underline">
            Facturatieprofiel openen
          </a>
        </p>
      )}
    </>
  );
}
