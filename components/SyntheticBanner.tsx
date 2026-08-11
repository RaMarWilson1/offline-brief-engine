/**
 * The synthetic-data label.
 *
 * Not dismissible, no close affordance, no prop to hide it. Every surface that
 * shows the index carries it, above the fold.
 *
 * The reason is not legal caution. The community index is invented, and invented
 * reach and pricing presented without a label is a claim about real rooms that
 * nobody made. The moment this becomes hideable, someone screenshots a plan
 * without it.
 */
export default function SyntheticBanner() {
  return (
    <div className="synthetic-note" role="note">
      <span aria-hidden="true">◆</span>
      <span>
        Synthetic index. Communities, reach, and pricing are invented for this
        concept build. Figures are projected, not measured.
      </span>
    </div>
  );
}
