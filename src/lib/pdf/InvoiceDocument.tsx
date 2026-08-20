import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { buildInvoiceViewModel } from './invoice-view-model';

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 9, fontFamily: 'Helvetica' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  companyName: { fontSize: 16, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  muted: { color: '#555' },
  heading: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  row: { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: '#ddd' },
  desc: { flex: 3 }, qty: { flex: 1.1, textAlign: 'right' }, price: { flex: 1.4, textAlign: 'right' }, vat: { flex: 1, textAlign: 'right' }, total: { flex: 1.5, textAlign: 'right' },
  totals: { marginTop: 16, alignSelf: 'flex-end', width: 260 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  grand: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 7, marginTop: 6, borderTopWidth: 1, borderTopColor: '#000', fontFamily: 'Helvetica-Bold' },
  note: { marginTop: 22, fontSize: 8, color: '#555' },
});

export default function InvoiceDocument({ model }: { model: Parameters<typeof buildInvoiceViewModel>[0] }) {
  const view = buildInvoiceViewModel(model);
  return <Document><Page size="A4" style={styles.page}>
    <View style={styles.header}><View>
      <Text style={styles.companyName}>{view.seller.name}</Text>
      <Text style={styles.muted}>{view.seller.street}</Text>
      <Text style={styles.muted}>{view.seller.postalCode} {view.seller.city}</Text>
      {!!view.seller.vatNumber && <Text style={styles.muted}>BTW {view.seller.vatNumber}</Text>}
      {!!view.seller.enterpriseNumber && <Text style={styles.muted}>KBO {view.seller.enterpriseNumber}</Text>}
      {!!view.seller.rpr && <Text style={styles.muted}>{view.seller.rpr}</Text>}
      {!!view.seller.email && <Text style={styles.muted}>{view.seller.email}</Text>}
      {!!view.seller.phone && <Text style={styles.muted}>Tel. {view.seller.phone}</Text>}
    </View><View>
      <Text style={styles.heading}>{view.title} {view.number}</Text>
      <Text style={styles.muted}>Datum: {view.issueDate}</Text>
      {!!view.deliveryDate && <Text style={styles.muted}>Prestatiedatum: {view.deliveryDate}</Text>}
      {!!view.dueDate && <Text style={styles.muted}>Vervaldag: {view.dueDate}</Text>}
      {!!view.buyerReference && <Text style={styles.muted}>Referentie: {view.buyerReference}</Text>}
    </View></View>
    <View style={{ marginBottom: 16 }}><Text style={styles.heading}>Klant</Text><Text>{view.buyer.name}</Text><Text style={styles.muted}>{view.buyer.street}</Text><Text style={styles.muted}>{view.buyer.postalCode} {view.buyer.city}</Text>{!!view.buyer.vatNumber && <Text style={styles.muted}>BTW {view.buyer.vatNumber}</Text>}</View>
    <View style={styles.row}><Text style={styles.desc}>Omschrijving</Text><Text style={styles.qty}>Aantal</Text><Text style={styles.price}>Prijs/eenheid</Text><Text style={styles.vat}>Btw</Text><Text style={styles.total}>Totaal</Text></View>
    {view.lines.map((line, index) => <View key={`${line.description}-${index}`} style={styles.row}><Text style={styles.desc}>{line.description}</Text><Text style={styles.qty}>{line.quantity} {line.unit}</Text><Text style={styles.price}>{line.unitPrice}</Text><Text style={styles.vat}>{line.vat}</Text><Text style={styles.total}>{line.total}</Text></View>)}
    <View style={styles.totals}>{view.groups.map((group) => <View key={group.label}><View style={styles.totalRow}><Text>{group.label}</Text><Text>{group.subtotal}</Text></View><View style={styles.totalRow}><Text>Btw</Text><Text>{group.vat}</Text></View></View>)}<View style={styles.grand}><Text>{view.title === 'Creditnota' ? 'Gecrediteerd bedrag' : 'Te betalen'}</Text><Text>{view.total}</Text></View></View>
    {!!view.paymentIban && <Text style={styles.note}>Betaling op IBAN {view.paymentIban} · Referentie {view.number}</Text>}
    {!!view.note && <Text style={styles.note}>{view.note}</Text>}
  </Page></Document>;
}
