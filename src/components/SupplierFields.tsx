export default function SupplierFields({ supplier }: { supplier?: Record<string, unknown> }) {
  return <>
    <label className="label flex flex-col gap-1">Bedrijfsnaam<input className="field" name="company_name" required defaultValue={String(supplier?.company_name ?? '')} /></label>
    <label className="label flex flex-col gap-1">Contactpersoon<input className="field" name="contact_person" defaultValue={String(supplier?.contact_person ?? '')} /></label>
    <label className="label flex flex-col gap-1">E-mail<input className="field" name="email" type="email" defaultValue={String(supplier?.email ?? '')} /></label>
    <label className="label flex flex-col gap-1">Telefoon<input className="field" name="phone" defaultValue={String(supplier?.phone ?? '')} /></label>
    <label className="label flex flex-col gap-1 md:col-span-2">Adres<input className="field" name="address" defaultValue={String(supplier?.address ?? '')} /></label>
    <label className="label flex flex-col gap-1">BTW-nummer<input className="field" name="vat_number" defaultValue={String(supplier?.vat_number ?? '')} /></label>
    <label className="label flex flex-col gap-1 md:col-span-2">Notities<textarea className="field min-h-24" name="notes" defaultValue={String(supplier?.notes ?? '')} /></label>
  </>;
}
