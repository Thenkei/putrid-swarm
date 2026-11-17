// Minimal DOM builder for the HUD. Scenes own a root element and drop it on exit.

type Child = Node | string | null | undefined | false;

export interface ElProps {
  class?: string;
  text?: string;
  html?: string;
  title?: string;
  style?: Partial<CSSStyleDeclaration>;
  disabled?: boolean;
  onClick?: (event: MouseEvent) => void;
  onEnter?: (event: MouseEvent) => void;
  onLeave?: (event: MouseEvent) => void;
  data?: Readonly<Record<string, string>>;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: ElProps = {}, children: readonly Child[] = []): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.html !== undefined) node.innerHTML = props.html;
  if (props.title) node.title = props.title;
  if (props.style) Object.assign(node.style, props.style);
  if (props.disabled && 'disabled' in node) (node as HTMLButtonElement).disabled = true;
  const target: HTMLElement = node;
  if (props.onClick) target.addEventListener('click', props.onClick);
  if (props.onEnter) target.addEventListener('mouseenter', props.onEnter);
  if (props.onLeave) target.addEventListener('mouseleave', props.onLeave);
  if (props.data) for (const [key, value] of Object.entries(props.data)) node.dataset[key] = value;
  for (const child of children) if (child) node.append(child);
  return node;
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}
