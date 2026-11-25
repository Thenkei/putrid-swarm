import { MAILBOX } from '../core/map';
import { project, type View } from './projection';

/** The exposed end of the envelope, measured from the painted mailbox post in each view. */
export function mailboxPaper(view: View) {
  const post = project(view, MAILBOX.x + .5, MAILBOX.y + .5);
  return {
    x: post.x + (view.rot ? 5 : -20) * view.zoom,
    y: post.y - 37 * view.zoom,
    width: 21 * view.zoom,
    height: 13 * view.zoom,
  };
}

export function drawMailboxPaper(ctx: CanvasRenderingContext2D, view: View): void {
  const paper = mailboxPaper(view);
  ctx.save();
  ctx.translate(paper.x + (view.rot ? paper.width : 0), paper.y);
  ctx.scale(view.rot ? -view.zoom : view.zoom, view.zoom);
  ctx.beginPath();
  ctx.moveTo(9, 0);
  ctx.lineTo(21, 2.5);
  ctx.lineTo(13, 13);
  ctx.lineTo(0, 9);
  ctx.closePath();
  ctx.fillStyle = '#f4e5b9';
  ctx.fill();
  ctx.lineWidth = .85;
  ctx.strokeStyle = '#68543c';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, 9);
  ctx.lineTo(11, 6);
  ctx.lineTo(13, 13);
  ctx.strokeStyle = '#ad9168';
  ctx.stroke();
  ctx.fillStyle = '#963e32';
  ctx.fillRect(14, 4, 3, 2);
  ctx.restore();
}
