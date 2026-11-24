import type { pinnedInvoice } from '../core/mechanic-invoice';
import { audio } from '../engine/audio';
import { el } from '../engine/dom';
import { fmt, line, S } from '../engine/i18n';
import './mechanic-invoice.css';

/** The carbon copy can be read at dawn and is still nailed up when the shed opens onto day five. */
export function invoiceDetail(invoice: NonNullable<ReturnType<typeof pinnedInvoice>>, onInspect?: () => void) {
  const label = line('Papier cloué', 'A nailed-up slip') + ' · ' + S().sector[invoice.sector];
  const row = (name: string, quantity: number) => el('tr', {}, [el('td', { text: name }), el('td', { text: String(quantity) })]);
  const table = el('table', {}, [
    el('thead', {}, [el('tr', {}, [el('th', { text: line('Pièces fournies', 'Parts supplied') }), el('th', { text: line('Qté', 'Qty') })])]),
    el('tbody', {}, [
      invoice.springs ? row(invoice.springs === 1 ? line('Ressort', 'Spring') : S().res.springs, invoice.springs) : null,
      invoice.scrap ? row(S().res.scrap, invoice.scrap) : null,
    ]),
  ]);
  const illegible = fmt(line('{n} {n:ancien feuillet illisible|anciens feuillets illisibles}.',
    '{n} {n:illegible old slip|illegible old slips}.'), { n: invoice.unitemized });
  const detail = el('details', { class: 'mechanic-invoice' }, [
    el('summary', { text: label }),
    el('div', { class: 'mechanic-invoice-sheet' }, [
      el('span', { class: 'mechanic-invoice-stamp', text: line('Le Dépanneur', 'The Mechanic') }),
      el('h3', { text: line('Facture', 'Invoice') }),
      table,
      invoice.unitemized ? el('p', { text: illegible }) : null,
      el('p', { class: 'mechanic-callout', text: line('Déplacement compris.', 'Call-out included.') }),
    ]),
  ]);
  detail.name = 'refuge-curiosity';
  void audio.prepareSample('letter_fold');
  detail.addEventListener('toggle', () => {
    if (!detail.open || !detail.isConnected) return;
    onInspect?.();
    audio.play('letter_fold', .72);
  });
  return { detail, label, sector: invoice.sector };
}
