// ============================================================
// Shared styles for the Attendance feature.
// Kept in one file so all sub-views look consistent and we don't
// duplicate the same StyleSheet block four times.
// ============================================================
import { StyleSheet, Platform } from 'react-native';
import { COLORS } from '../../config/constants';

export default StyleSheet.create({
  // Layout
  root:       { flex: 1, backgroundColor: COLORS.background },
  centered:   { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  scroll:     { flex: 1 },
  scrollPad:  { paddingHorizontal: 16, paddingBottom: 32 },

  // Headings
  pageTitle:  { fontSize: 28, fontWeight: '700', color: '#FFF', marginTop: 16, marginBottom: 6, marginHorizontal: 16 },
  pageSub:    { fontSize: 13, color: COLORS.textMuted, marginHorizontal: 16, marginBottom: 16 },
  sectionHdr: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginTop: 16, marginBottom: 8, marginHorizontal: 4 },

  // Cards
  card: {
    backgroundColor: COLORS.card, borderRadius: 14, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: COLORS.border,
  },
  cardRow:    { flexDirection: 'row', alignItems: 'center' },
  cardTitle:  { fontSize: 17, fontWeight: '600', color: '#FFF' },
  cardSub:    { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },

  // Inputs
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: 12, paddingHorizontal: 14,
    marginBottom: 12, borderWidth: 1, borderColor: COLORS.border,
  },
  input: { flex: 1, color: '#FFF', fontSize: 15, paddingVertical: Platform.OS === 'ios' ? 14 : 12 },

  // Buttons
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 12,
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, paddingHorizontal: 18, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card,
  },
  secondaryBtnText: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '600' },

  ghostBtn: { paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  ghostBtnText: { color: COLORS.textMuted, fontSize: 14, fontWeight: '500' },

  // Status / pills
  pill: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
  },
  pillText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600', marginLeft: 6 },

  // Errors
  errText: { color: COLORS.danger, fontSize: 13, marginBottom: 12, marginHorizontal: 4 },

  // Hints
  hint: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center', marginTop: 16, lineHeight: 18, paddingHorizontal: 16 },

  // Empty / loading
  emptyText: { color: COLORS.textSecondary, fontSize: 15, textAlign: 'center', marginTop: 12 },
  loadingLabel: { color: COLORS.textSecondary, fontSize: 14, marginTop: 12 },

  // Roster row
  studentRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 14,
    marginBottom: 8, borderWidth: 1, borderColor: COLORS.border,
  },
  studentRoll: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600', width: 40 },
  studentName: { flex: 1, color: '#FFF', fontSize: 15, fontWeight: '500' },

  // Status segment buttons inside a roster row
  segGroup: { flexDirection: 'row' },
  segBtn: {
    paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8,
    borderWidth: 1, borderColor: COLORS.border, marginLeft: 6,
    backgroundColor: 'transparent',
  },
  segBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 0.5 },
});
