import { useId, useState } from 'react';
import { Preview } from '../components/Preview';
import { POPOVER_QUERY, useMediaQuery } from '../hooks/useMediaQuery';

const explanations: Readonly<Record<string, string>> = {
  Range:
    'The first number is normal range in feet. Attacks beyond it have disadvantage. The second number is the maximum range.',
  Thrown:
    'You can throw this weapon for a ranged attack. If it is a melee weapon, use the same ability modifier you would use in melee.',
  Versatile:
    'You can use this weapon in one or two hands. Use the two-handed damage die when you make a melee attack with both hands.',
  Ammunition:
    'Each ranged attack uses a piece of ammunition. Loading a one-handed weapon requires a free hand.',
  Finesse: 'Pick Strength or Dexterity. Use the same modifier for the attack and damage rolls.',
  Heavy: 'Small creatures have disadvantage on attack rolls with this weapon.',
  Light: 'Two light melee weapons can be used for two-weapon fighting.',
  Loading:
    'You can fire only one piece of ammunition each time you use an action, bonus action or reaction to fire it.',
  Reach:
    'Add 5 feet to your reach when attacking with this weapon or making an opportunity attack with it.',
  Special: 'Check the weapon description for its individual rules.',
  'Two-handed': 'You need both hands to attack with this weapon.',
};

const buttonClass =
  'inline-flex min-h-11 items-center rounded-btn border border-border bg-surface px-2.5 text-sm hover:border-accent';

export function WeaponProperties({ properties }: { properties: readonly string[] }) {
  const hover = useMediaQuery(POPOVER_QUERY);
  const id = useId();
  const [open, setOpen] = useState<string>();
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {properties.map((property) =>
          hover ? (
            <Preview
              key={property}
              title={property}
              content={<p className="text-sm text-text">{explanations[property]}</p>}
            >
              {({ ref, props }) => (
                <button type="button" className={buttonClass} ref={ref} {...props}>
                  {property}
                </button>
              )}
            </Preview>
          ) : (
            <button
              key={property}
              type="button"
              className={buttonClass}
              aria-expanded={open === property}
              aria-controls={open === property ? id : undefined}
              onClick={() => setOpen(open === property ? undefined : property)}
            >
              {property}
            </button>
          ),
        )}
      </div>
      {!hover && open && properties.includes(open) && (
        <p
          id={id}
          role="status"
          className="mt-2 rounded-btn border border-border bg-surface px-3 py-2"
        >
          {explanations[open]}
        </p>
      )}
    </>
  );
}
