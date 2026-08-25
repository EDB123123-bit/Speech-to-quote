import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { SupplierOrderPdfModel } from './supplier-order-view-model';

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 22 },
  title: { fontSize: 17, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  sectionTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  muted: { color: '#555' },
  block: { marginBottom: 16 },
  parties: { flexDirection: 'row', gap: 28, marginBottom: 18 },
  party: { flex: 1 },
  row: { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: '#ddd' },
  description: { flex: 3.4 },
  quantity: { flex: 1.1, textAlign: 'right' },
  unit: { flex: 0.9, textAlign: 'right' },
  price: { flex: 1.5, textAlign: 'right' },
  total: { flex: 1.5, textAlign: 'right' },
  notice: { marginTop: 18, color: '#555', fontSize: 9 },
});

export default function SupplierOrderDocument({ model }: { model: SupplierOrderPdfModel }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Bestelling {model.orderNumber}</Text>
            <Text style={styles.muted}>Datum: {model.date}</Text>
          </View>
          <View>
            <Text style={styles.sectionTitle}>{model.contractor.name}</Text>
            {!!model.contractor.address && <Text style={styles.muted}>{model.contractor.address}</Text>}
            {!!model.contractor.vatNumber && <Text style={styles.muted}>BTW {model.contractor.vatNumber}</Text>}
            {!!model.contractor.email && <Text style={styles.muted}>{model.contractor.email}</Text>}
            {!!model.contractor.phone && <Text style={styles.muted}>{model.contractor.phone}</Text>}
          </View>
        </View>

        <View style={styles.parties}>
          <View style={styles.party}>
            <Text style={styles.sectionTitle}>Leverancier</Text>
            <Text>{model.supplier.name}</Text>
            {!!model.supplier.address && <Text style={styles.muted}>{model.supplier.address}</Text>}
            {!!model.supplier.vatNumber && <Text style={styles.muted}>BTW {model.supplier.vatNumber}</Text>}
            {!!model.supplier.contactPerson && <Text style={styles.muted}>{model.supplier.contactPerson}</Text>}
            {!!model.supplier.email && <Text style={styles.muted}>{model.supplier.email}</Text>}
            {!!model.supplier.phone && <Text style={styles.muted}>{model.supplier.phone}</Text>}
          </View>
          <View style={styles.party}>
            <Text style={styles.sectionTitle}>Klant / werfreferentie</Text>
            <Text>{model.customer.name}</Text>
            <Text style={styles.muted}>Offerte {model.quote.number} · {model.quote.kindLabel}</Text>
            {!!model.customer.deliveryAddress && <Text style={styles.muted}>Levering: {model.customer.deliveryAddress}</Text>}
          </View>
        </View>

        <View style={styles.row}>
          <Text style={styles.description}>Omschrijving</Text>
          <Text style={styles.quantity}>Aantal</Text>
          <Text style={styles.unit}>Eenheid</Text>
          <Text style={styles.price}>Inkoopprijs</Text>
          <Text style={styles.total}>Totaal</Text>
        </View>
        {model.lines.map((line, index) => (
          <View key={`${line.description}-${index}`} style={styles.row}>
            <Text style={styles.description}>{line.description}</Text>
            <Text style={styles.quantity}>{line.quantity}</Text>
            <Text style={styles.unit}>{line.unit}</Text>
            <Text style={styles.price}>{line.purchaseUnitPrice}</Text>
            <Text style={styles.total}>{line.lineTotal}</Text>
          </View>
        ))}

        <Text style={styles.notice}>Deze bestelling bevat uitsluitend leveranciersprijzen. Klantprijzen en marges zijn niet opgenomen.</Text>
      </Page>
    </Document>
  );
}
