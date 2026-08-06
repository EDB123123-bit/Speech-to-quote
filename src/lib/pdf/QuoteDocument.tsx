import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { formatEuros } from '@/lib/money/totals';
import type { QuoteViewModel } from '@/lib/pdf/quote-view-model';

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  companyName: { fontSize: 16, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  muted: { color: '#555' },
  sectionTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  groupTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 12, marginBottom: 4 },
  row: { flexDirection: 'row', paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: '#ddd' },
  cellDesc: { flex: 3 },
  cellQty: { flex: 1.2, textAlign: 'right' },
  cellPrice: { flex: 1.5, textAlign: 'right' },
  cellVat: { flex: 0.8, textAlign: 'right' },
  cellTotal: { flex: 1.5, textAlign: 'right' },
  totals: { marginTop: 16, alignSelf: 'flex-end', width: 260 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  grandTotal: {
    flexDirection: 'row', justifyContent: 'space-between', paddingTop: 6, marginTop: 6,
    borderTopWidth: 1, borderTopColor: '#000', fontFamily: 'Helvetica-Bold',
  },
  notice: { marginTop: 24, fontSize: 8, color: '#555' },
});

export default function QuoteDocument({ model }: { model: QuoteViewModel }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.companyName}>{model.contractor.companyName}</Text>
            {!!model.contractor.address && <Text style={styles.muted}>{model.contractor.address}</Text>}
            {!!model.contractor.vatNumber && <Text style={styles.muted}>BTW {model.contractor.vatNumber}</Text>}
            {!!model.contractor.phone && <Text style={styles.muted}>Tel. {model.contractor.phone}</Text>}
          </View>
          <View>
            <Text style={styles.sectionTitle}>Offerte {model.quoteNumber}</Text>
            <Text style={styles.muted}>Datum: {model.dateNl}</Text>
          </View>
        </View>

        <View style={{ marginBottom: 16 }}>
          <Text style={styles.sectionTitle}>Klant</Text>
          <Text>{model.customer.name}</Text>
          <Text style={styles.muted}>{model.customer.address}</Text>
          {!!model.customer.email && <Text style={styles.muted}>{model.customer.email}</Text>}
          {!!model.customer.phone && <Text style={styles.muted}>{model.customer.phone}</Text>}
        </View>

        <View style={styles.row}>
          <Text style={styles.cellDesc}>Omschrijving</Text>
          <Text style={styles.cellQty}>Aantal</Text>
          <Text style={styles.cellPrice}>Prijs/eenheid</Text>
          <Text style={styles.cellVat}>Btw</Text>
          <Text style={styles.cellTotal}>Totaal</Text>
        </View>

        {model.groups.map((group) => (
          <View key={group.title} wrap={false}>
            <Text style={styles.groupTitle}>{group.title}</Text>
            {group.rows.map((row, index) => (
              <View key={`${group.title}-${index}`} style={styles.row}>
                <Text style={styles.cellDesc}>{row.description}</Text>
                <Text style={styles.cellQty}>{`${row.quantity} ${row.unit}`}</Text>
                <Text style={styles.cellPrice}>{row.unitPrice}</Text>
                <Text style={styles.cellVat}>{row.vatLabel}</Text>
                <Text style={styles.cellTotal}>{row.lineTotal}</Text>
              </View>
            ))}
          </View>
        ))}

        <View style={styles.totals}>
          {model.totals.vatGroups.map((group) => (
            <View key={group.vatRate}>
              <View style={styles.totalRow}>
                <Text>Subtotaal ({group.vatRate === 0.06 ? '6%' : '21%'})</Text>
                <Text>{formatEuros(group.subtotalCents)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text>Btw {group.vatRate === 0.06 ? '6%' : '21%'}</Text>
                <Text>{formatEuros(group.vatAmountCents)}</Text>
              </View>
            </View>
          ))}
          <View style={styles.grandTotal}>
            <Text>Totaal incl. btw</Text>
            <Text>{formatEuros(model.totals.grandTotalCents)}</Text>
          </View>
        </View>

        {model.showsReducedVatNotice && (
          <Text style={styles.notice}>
            Het verlaagde btw-tarief van 6% is van toepassing op renovatiewerken aan woningen ouder
            dan 10 jaar, mits de klant het vereiste attest ondertekent.
          </Text>
        )}
      </Page>
    </Document>
  );
}
