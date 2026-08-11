/**
 * The example briefs behind the composer's preset chips.
 *
 * These live here rather than inside the client component for one reason: the
 * README quotes a figure produced by the first of them, and `docs.test.ts`
 * asserts that figure still matches what the engine returns. A test comparing
 * the README against a *copy* of the preset would pass while the button on the
 * page did something else. It has to be the same object.
 *
 * Written as generic product categories rather than real brands, for the same
 * reason the index is synthetic: putting a real company's name on an invented
 * media plan misrepresents them.
 */

export interface Preset {
  label: string;
  text: string;
  /** Typed form fields, which is the only path budget and flight ever travel. */
  city: string;
  audience: string;
  budget: number;
  weeks: number;
}

export const PRESETS: readonly Preset[] = [
  {
    label: 'Running shoe launch',
    city: 'brooklyn',
    audience: 'Women 25-34',
    budget: 18000,
    weeks: 6,
    text: 'We are launching a running shoe for women 25 to 34 and want to be in front of people who already run in the mornings. Ideally sampling at the run itself plus a co-host moment. Trial is the goal, not just reach. Nothing with alcohol.',
  },
  {
    label: 'Non-alcoholic drink',
    city: 'new york',
    audience: 'General urban adults 21-40',
    budget: 24000,
    weeks: 8,
    text: 'A non-alcoholic aperitif looking for rooms where people socialise without drinking. Dinners, sober socials, wellness-adjacent groups. We want product integration into the evening rather than a table of samples by the door. Awareness first, conversions second.',
  },
  {
    label: 'Skincare line',
    city: 'los angeles',
    audience: 'Women 24-38',
    budget: 12000,
    weeks: 4,
    text: 'Skincare brand targeting women 24 to 38 who care about recovery and wellness. Pilates, walking clubs, small group settings. Sampling and product integration both work. No run clubs, they are too sweaty for the product story.',
  },
];

/** The preset the README quotes. Named so the reference is not a magic index. */
export const README_PRESET = PRESETS[0];
