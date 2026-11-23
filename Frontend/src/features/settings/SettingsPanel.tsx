import type { ReactNode } from 'react';
import { Icon, Section } from '../../components/ui';
import { LANG_LABEL } from '../../i18n/strings';
import { canSpeak, speak } from '../../lib/voice';
import { useDemoStore, type Lang, type Settings } from '../../store/demoStore';

/** A row of big pill choices — one tap, no dropdowns (easier for elders). */
const Choice = <T extends string>({ value, options, onChange, label }: { value: T; options: [T, ReactNode][]; onChange: (v: T) => void; label: string }) => (
  <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
    {options.map(([v, text]) => (
      <button
        key={v}
        type="button"
        role="radio"
        aria-checked={value === v}
        onClick={() => onChange(v)}
        className={`btn ${value === v ? 'bg-ohara-ind text-white' : 'border border-ohara-line-strong bg-ohara-surface text-ohara-ink hover:bg-ohara-sunken'}`}
      >
        {value === v && <Icon.Check className="h-5 w-5" />}
        {text}
      </button>
    ))}
  </div>
);

const Row = ({ title, hint, children }: { title: string; hint: string; children: ReactNode }) => (
  <div className="flex flex-col gap-3 border-t border-ohara-line py-5 first:border-t-0 first:pt-0 last:pb-0">
    <div>
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="text-base text-ohara-muted">{hint}</p>
    </div>
    {children}
  </div>
);

/** Language, text size and voice — used by the patient and by the caregiver on the patient's behalf. */
export const SettingsPanel = ({ forName }: { forName?: string }) => {
  const settings = useDemoStore((s) => s.settings);
  const set = useDemoStore((s) => s.setSettings);
  const update = (p: Partial<Settings>) => set(p);

  return (
    <Section>
      <Row title="Language" hint={`The words on ${forName ? `${forName}'s` : 'your'} home screen and menu, and the voice.`}>
        <Choice<Lang> label="Language" value={settings.lang} onChange={(lang) => update({ lang })} options={(Object.keys(LANG_LABEL) as Lang[]).map((l) => [l, LANG_LABEL[l]])} />
      </Row>
      <Row title="Text size" hint="Make everything bigger and easier to read.">
        <Choice
          label="Text size"
          value={settings.textSize}
          onChange={(textSize) => update({ textSize })}
          options={[
            ['large', 'Large'],
            ['xl', <span key="xl" className="text-[1.15em]">Extra large</span>],
          ]}
        />
      </Row>
      <Row title="Voice" hint={canSpeak() ? 'OHARA reads reminders, games and family greetings aloud.' : 'This browser cannot speak aloud.'}>
        <Choice
          label="Voice on or off"
          value={settings.voiceOn ? 'on' : 'off'}
          onChange={(v) => update({ voiceOn: v === 'on' })}
          options={[
            ['on', 'On'],
            ['off', 'Off'],
          ]}
        />
        <Choice
          label="Voice speed"
          value={settings.voiceRate}
          onChange={(voiceRate) => update({ voiceRate })}
          options={[
            ['slow', 'Slow'],
            ['normal', 'Normal'],
          ]}
        />
        <div>
          <button type="button" className="btn-ghost !px-0" onClick={() => speak('Hello. This is how I will sound.', { force: true })}>
            <Icon.Speaker className="h-6 w-6" /> Try the voice
          </button>
        </div>
      </Row>
    </Section>
  );
};
