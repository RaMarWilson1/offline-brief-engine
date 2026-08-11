/**
 * Render-edge formatting.
 *
 * Money is integer cents everywhere else in this codebase. It becomes a string
 * here and nowhere earlier, so no rounded display value can ever drift back into
 * a calculation.
 */

/** Whole dollars. Fees, budgets, payouts: figures a buyer reads in thousands. */
export function money(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

/**
 * Dollars and cents. Per-attendee and per-click figures land in the tens of
 * dollars, where rounding to the dollar throws away the digit being compared.
 */
export function moneyExact(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Whole people. Fractional attendees are an artifact of the projection. */
export function count(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function percent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}
