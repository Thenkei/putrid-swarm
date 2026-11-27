import { el } from '../engine/dom';
import { S } from '../engine/i18n';

export class PauseMenu {
  private previousFocus: HTMLElement | null = null;
  private blocked: HTMLElement[] = [];

  constructor(private readonly overlay: HTMLElement, private readonly fallbackFocus?: HTMLElement) {}

  open(onResume: () => void, onLeave: () => void, auto: boolean, leaveLabel = S().night.leaveToTitle,
    choice?: { title: string; note: string; resume: string }): void {
    const s = S().night;
    const focused = document.activeElement;
    this.previousFocus = focused instanceof HTMLElement ? focused : null;
    this.blocked = Array.from(this.overlay.parentElement?.children ?? []).filter(
      (node): node is HTMLElement => node instanceof HTMLElement && node !== this.overlay && !node.inert,
    );
    for (const node of this.blocked) node.inert = true;

    const title = el('h1', { text: choice?.title ?? s.paused });
    title.id = 'pause-title';
    const resume = el('button', { class: 'btn btn-primary', text: choice?.resume ?? s.resume, onClick: onResume });
    const leave = el('button', { class: 'btn', text: leaveLabel, onClick: onLeave });
    const note = auto || choice ? el('p', { class: 'pause-reason', text: choice?.note ?? s.away }) : null;
    const dialog = el('div', { class: 'modal pause' }, [title, note, resume, leave]);
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', title.id);
    if (note) {
      note.id = 'pause-description';
      dialog.setAttribute('aria-describedby', note.id);
    }
    dialog.addEventListener('keydown', event => {
      if (event.code !== 'Tab') return;
      event.preventDefault();
      (document.activeElement === resume ? leave : resume).focus();
    });
    this.overlay.replaceChildren(dialog);
    resume.focus();
  }

  close(): void {
    this.overlay.replaceChildren();
    for (const node of this.blocked) node.inert = false;
    this.blocked = [];
    const previous = this.previousFocus;
    (previous?.isConnected && previous !== document.body ? previous : this.fallbackFocus)?.focus();
    this.previousFocus = null;
  }
}
