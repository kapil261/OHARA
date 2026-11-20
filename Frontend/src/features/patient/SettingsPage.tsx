import { Page, PageHeader } from '../../components/ui';
import { useT } from '../../i18n/strings';
import { SettingsPanel } from '../settings/SettingsPanel';

export const PatientSettingsPage = () => {
  const t = useT();
  return (
    <Page>
      <PageHeader eyebrow={t.settings} title="Make OHARA yours" lead="Choose your language, how big the words are, and how the voice sounds." />
      <SettingsPanel />
    </Page>
  );
};
