import type { PeppolConnector } from './types';

// Deliberately empty in release 1. A certified provider adapter must be added
// in a separate, reviewed change before API delivery can be enabled.
const productionConnectors = new Map<string, PeppolConnector>();

export function peppolApiEnabled(): boolean {
  return process.env.PEPPOL_API_ENABLED === 'true';
}

export function getPeppolConnector(providerKey: string): PeppolConnector {
  if (!peppolApiEnabled()) throw new Error('Peppol API delivery is disabled. Use manual XML export.');
  const connector = productionConnectors.get(providerKey);
  if (!connector) throw new Error(`No certified Peppol connector is registered for ${providerKey}.`);
  return connector;
}
